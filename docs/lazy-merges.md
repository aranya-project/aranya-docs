---
layout: page
title: Lazy Merges
permalink: "/lazy-merges/"
---

# Lazy Merges

## Overview

Lazy merging defers writing merge commands until a local action requires a single parent. A graph carries a set of concurrent heads; sync extends the set without authoring merges. The merged fact perspective is held in a **fact cache** that is rebuilt lazily: sync updates the head set without folding policy, and the cache is rebuilt only when a query, session, or local author needs it. Sync bursts that aren't followed by a consumer event collapse into a single rebuild. Peers that have received the same authored commands have equal head sets regardless of arrival order, so cross-peer convergence completes in the rounds needed to propagate authored commands alone — no merge-of-merges cascade.

## Problem

`Transaction::commit` collapses every divergent head into a single graph head before returning, even in sync-only transactions. Each merge runs the braid algorithm over the divergent region between the existing graph head and the new commands.

When P peers converge on N total commands, each peer ingests roughly N commands in batches from the other peers. Every batch triggers a braid whose region grows toward N as convergence progresses, and every braid writes a merge segment that subsequent syncs must walk through. Total work is O(P·N²).

Profile of `generate_graph_hello_sync.test` (9 clients, 450 commands, no sync during generation, full convergence at end): ~2.5 million segment reads in the sync phase, close to the 9·450² = 1.82M lower bound.

A related issue: peers that ingest the same authored commands in different orders produce structurally distinct merge commands. These merges then propagate, cascading into further merges before peers converge on the same state.

Lazy merging targets both. Deferring the braid to consumer events and writing no merge segments during sync drops the work to O(P·N) — O(P·N) sync ingestion plus O(N) per-peer rebuild. On the profiled workload that's roughly 4,000 reads instead of 2.5M.

## Key Insight

The multi-head state has two persisted parts:

- **Head set.** Concurrent locations representing the current state, replacing the single `head: Location`.
- **Fact cache.** The merged fact perspective for some head set, persisted independently of any merge segment. The cache is *fresh* when its fingerprint matches the current head set; otherwise *stale*.

Sync ingestion updates the head set and lets the cache go stale. The cache is rebuilt on demand when a query, session, or author event needs it.

Local authoring rebuilds the cache if stale, collapses the head set pairwise into a single head, writes the merge segments with their own fact indexes, and writes the authored command on top. The cache seeds the final merge's fact index.

## Head Set

### Storage model

The persisted graph state changes from `head: Location` to `heads: HeadSet`, where `HeadSet` is a small bounded vector of locations. The single-head case is a one-element head set.

`Writer::head() -> Location` becomes `Writer::heads() -> HeadSet`. `Writer::commit(head: Location)` becomes `Writer::commit(heads: HeadSet, fact_cache: FactCacheRef)`.

## Transaction Lifecycle

`Transaction` carries `self.heads: BTreeMap<CmdId, Location>`. Today it tracks only commands written during the transaction and is pairwise-merged at commit. Under lazy merging, `self.heads` is seeded with the graph's head set at transaction start and mutated as commands arrive. The single `original_head` snapshot becomes `original_heads`, used only for concurrency detection.

Ingestion updates `self.heads` in place:

- `Single(parent)`: replace `parent` if it was a head, otherwise add the new command.
- `Merge(left, right)`: add the merge; remove whichever of `left` and `right` were heads.

### Commit

Commit persists `self.heads` and the updated fact cache. If the transaction authors a local `Single(parent)` action — which needs a single parent — `self.heads` must first be collapsed to a single head:

1. Write any in-flight perspective to storage, registering its head in `self.heads`.
2. If `self.heads` has more than one member, run the existing pairwise merge loop in `Transaction::commit`. Each merge writes a segment with its own fact index.
3. Write the authored command on top of the single resulting head; `self.heads` becomes `{authored command}`.

The final merge's fact index is the cached perspective for the pre-collapse head set. Intermediate merges compute their fact indexes via `make_braid_segment` as today.

Init creates the graph and seeds `self.heads` with the init command directly; it bypasses this lifecycle.

## Fact Cache

The fact cache is a persisted record holding the merged fact perspective for some head set, separate from any merge segment. It contains:

- A reference to the cached `FactIndex`.
- The head set fingerprint at cache build time.

The cache is *fresh* when its fingerprint matches the current head set and *stale* otherwise.

### Update strategy

Sync ingestion does not fold policy. It updates the head set and the fact cache is left untouched — it becomes stale. Sync bursts pay only O(1) per command plus the per-segment storage writes.

The cache is rebuilt when one of these events needs the merged perspective:

- An explicit `refresh_cache` call from the application. This is the expected mechanism for downstream effect listeners: the application schedules `refresh_cache` on its own cadence, and the rebuild's `call_rule` invocations emit braid-fold effects to the sink.
- A fact query.
- `Session::new` reading the perspective.
- A local author, which needs the cache to seed the final merge's fact index.

Multiple sync events that arrive between consumer events collapse into a single rebuild.

## Algorithm

### Sync ingestion

```
ingest(commands):
    for each command in commands:
        if command is already present in storage:
            continue
        write command to storage  // creates segment, updates per-segment fact index
        update_head_set(command)
    persist head_set
    // fact cache is left as-is; the next cache read rebuilds if stale

update_head_set(cmd):
    match cmd.parent():
        Single(parent):
            if parent in head_set:
                replace parent with cmd in head_set
            else:
                add cmd to head_set
                minimize head_set (remove ancestors)
        Merge(left, right):
            if {left, right} are both in head_set:
                replace {left, right} with cmd in head_set
            else:
                add cmd to head_set
                minimize head_set
        None:
            // init command; head set starts as {cmd}
```

### Cache read and rebuild

Every cache read goes through `read_cache`, which checks freshness and rebuilds if stale. Query, session, and author callers do not call a separate `ensure_cache_fresh`; they read the cache and the rebuild happens implicitly. Queries pass a `NullSink`; author and the public `refresh_cache` API thread the caller's sink so braid-fold effects flow out during rebuild.

```
read_cache(sink) -> FactPerspective:
    if fact_cache.fingerprint != fingerprint(head_set):
        rebuild_cache(sink)
    return fact_cache.perspective

rebuild_cache(sink):
    lca = n_way_lca(head_set)
    order = braid_n_way(head_set, lca)
    first = order.iter().next()
    perspective = storage.get_fact_perspective(first)
    for loc in order.iter().skip(1):
        cmd = command_at(loc)
        call_rule(cmd, &mut perspective, sink)
    fact_cache.perspective = write_facts(perspective)
    fact_cache.fingerprint = fingerprint(head_set)

refresh_cache(sink):
    // Public API. Forces rebuild if stale; emits braid-fold effects.
    read_cache(sink)
```

## Complexity

Per-event costs:

| Event | Cost |
|:---|:---|
| Sync ingest one command | O(1) head-set update plus per-segment write |
| Sync ingest a merge command from a peer (both parents heads) | O(1) head-set update; no braid work |
| Query, fresh cache | O(1) |
| Query, stale cache | O(N + n) rebuild where N = head set size, n = commands since LCA |
| Local author, fresh cache | (N-1) pairwise braids plus authored command write |
| Local author, stale cache | rebuild plus (N-1) pairwise braids plus authored command write |

Compared to eager:

- **Cross-peer convergence.** Eager generates peer-specific merges that must themselves propagate, cascading into further merges. Lazy authors no merges during sync, so peers with the same authored commands have equal head sets. Convergence completes in the rounds needed to propagate authored commands alone.
- **Many syncs, no local consumer in between.** Eager pays a full braid per sync event and writes a merge segment for each. Lazy pays O(1) per sync; a single rebuild at the next consumer event amortizes the braid work across the entire burst.
- **Many syncs, frequent queries.** Each query that finds the cache stale triggers a rebuild. In the worst case (one query per sync) lazy and eager do equivalent braid work; lazy still saves merge segment writes and convergence rounds.
- **One sync, immediate author.** Same braid work either way.

## Edge Cases

### Concurrent transactions

`Transaction::commit` errors with `ClientError::ConcurrentTransaction` when `original_head != storage.get_head()`. In the head-set model the check becomes: every member of `original_heads` must still be present in the current head set or covered by a descendant. Elements removed without a descendant subsuming them reject the transaction.

### Sessions

`Session::new` reads the fact cache (rebuilding if stale) to seed the session perspective instead of using `storage.get_head()`. Session commit follows the same author-time collapse rules as the main client.

## Changes

### Storage layer

- `Writer::head() -> Location` becomes `Writer::heads() -> HeadSet`.
- `Writer::commit(head: Location)` becomes `Writer::commit(heads: HeadSet, fact_cache: FactCache)`.
- On-disk format extends to carry the head set and fact cache. Existing single-head graphs read as one-element head sets.
- `Storage::get_head()` becomes `Storage::get_heads()`.
- New `fact_cache` accessor returns the cached `FactIndex`.

### Transaction

- `Transaction::original_head: Option<Location>` becomes `original_heads: Option<HeadSet>`.
- `self.heads` is seeded with `storage.get_heads()?` on first use instead of being empty.
- Ingestion mutates `self.heads` in place; commit persists it directly when no authoring occurred.
- The pairwise merge loop in `Transaction::commit` runs only on the authoring path and seeds the final merge's fact index from the cache.

### Sync

- `SyncRequester::get_commands` walks back from each head in the head set instead of `storage.get_head()`. Wire format unchanged.
- `SyncResponder` and `PeerCache` are unchanged.

### Braid

- `braid` takes a slice of heads.
- `last_common_ancestor` takes a slice and computes the N-way LCA.
- `ConvergenceMap::new` takes a slice of heads.

### Fact cache

- New persisted record: `FactCache { fact_index: FactIndexRef, fingerprint: Hash }`.
- New module for `read_cache`, `rebuild_cache`, `query`. Every cache read goes through `read_cache`, which rebuilds implicitly if stale.
- New public `ClientState::refresh_cache(graph_id, sink)` method. Callers use it to drive periodic rebuild and to receive braid-fold effects on their own schedule, decoupled from query and author paths.

### Session

- `Session::new` seeds from the fact cache.
