---
layout: page
title: Lazy Merges
permalink: "/lazy-merges/"
---

# Lazy Merges

## Overview

Lazy merging changes two things:

1. **Storage holds a head set and a fact cache** instead of a single head. The persisted `head: Location` becomes `heads: HeadSet`. A separate `FactCache` record holds the merged perspective for that head set so queries and sessions can read multi-head state at O(1).
2. **`Transaction::commit` no longer collapses heads.** It writes `self.heads` to storage as-is, with a rebuilt fact cache. The pairwise-merge collapse moves to `action()`, where a new command actually needs a single parent.

Everything else stays the same. `Transaction::add_commands` already accumulates a multi-head `self.heads` across multiple calls; the lifecycle API is unchanged. Orchestrators that hold a transaction open across multiple sync exchanges before committing get the most benefit, but the existing per-sync commit pattern still works.

## Problem

`Transaction::commit` collapses every divergent head into a single graph head before returning, even in sync-only transactions. Every batch produces a merge segment that subsequent syncs walk through, and peers that ingest the same authored commands in different orders produce structurally distinct merge commands that themselves propagate — cascading into further merges before peers converge on the same state.

## Head Set

The persisted graph state changes from `head: Location` to `heads: HeadSet`, where `HeadSet` is a bounded vector of locations. The cap matches the braid's max-cut limit (256 concurrent authors); sync ingestion that would push the head set past capacity returns an error rather than forcing an inline merge — the same posture the braid takes today. The single-head case is a one-element head set.

`Writer::head() -> Location` becomes `Writer::heads() -> HeadSet`. `Writer::commit(head: Location)` becomes `Writer::commit(heads: HeadSet, fact_cache: FactCacheRef)`; the fact cache is a separate persisted record (see [Fact Cache](#fact-cache)), and commit writes both atomically.

## Fact Cache

Today the merged perspective lives on the latest merge segment's fact index — every commit writes a merge, and that merge's `FactIndex` *is* the cache. Lazy merging removes the merge from the sync-only path, so the perspective has nowhere to live unless we give it a dedicated home.

The fact cache is that home: a persisted record holding the merged fact perspective for the current head set. It contains a reference to a `FactIndex`. The cache is always the merged perspective at the last committed head set, by invariant — commit is its only writer.

Commit is the only writer: every commit recomputes the merged perspective for the current head set (n-way braid + `call_rule` per command in braid order) and persists the result. Queries and sessions read the cache directly. Between commits, the cache reflects the last-committed state; in-flight transactional state is not visible — same isolation as today, just over whatever span the caller keeps the transaction open.

## Commit

Commit writes `self.heads` to storage and rebuilds the fact cache for that head set. The pairwise-merge collapse that today's commit performs is gone.

```
commit(sink):
    persist any in-flight perspective into self.heads
    perspective = braid_n_way(self.heads)
    for each command in braid_order(self.heads):
        call_rule(command, perspective, sink)  // emits braid-fold effects
    fact_cache = write_facts(perspective)
    storage.commit(self.heads, fact_cache)
```

The `call_rule` invocations during the cache rebuild are where the application sees effects for the accumulated sync work.

Init creates the graph and seeds storage with the init command directly; it bypasses this flow.

## Action

A new command needs a single parent. `action()` reads `storage.get_heads()`, runs the pairwise-merge loop to collapse the head set to a single head (writing merge segments along the way), gets a linear perspective at the resulting single head, calls the policy's action handler to generate and apply the new command, and commits. The post-action head set is a one-element set.

The pairwise-merge loop that lives in `Transaction::commit` today moves to `action()` — same logic, the path it belongs on.

## Complexity

Per-event costs:

| Event | Cost |
|:---|:---|
| Sync ingest one Single command | O(1) head-set update plus per-segment write (unchanged from today) |
| Sync ingest a peer-authored merge | O(1) head-set update plus one braid over the two parents (unchanged — see [note](#note-on-merge-ingestion)) |
| Commit (sync-only) | O(N + n) cache rebuild where N = head set size, n = commands since LCA |
| Action | (N-1) pairwise braids to collapse, plus the new command's write |
| Query | O(1) — reads the fact cache directly |

Compared to eager:

- **Cross-peer convergence.** Eager generates peer-specific merges during sync that must themselves propagate, cascading into further merges. Lazy authors no merges during sync, so peers with the same authored commands have equal head sets. Convergence completes in the rounds needed to propagate authored commands alone.
- **Many syncs per round.** Eager pays a full pairwise-merge collapse on every per-sync commit. A caller that holds the transaction open across multiple sync exchanges pays one cache rebuild at the eventual commit and writes no merge segments. The merge segments that subsequent syncs walked through under eager are gone.
- **One sync, immediate author.** Same braid work either way.

## Edge Cases

### Concurrency

Single-writer is a property of the runtime: `ClientState` requires `&mut self` for all graph operations, and the storage backend contractually requires a single writer per file. The lazy-merges design doesn't change that.

## Changes

### Storage layer

- `Writer::head() -> Location` becomes `Writer::heads() -> HeadSet`.
- `Writer::commit(head: Location)` becomes `Writer::commit(heads: HeadSet, fact_cache: FactCache)`.
- On-disk format extends to carry the head set and fact cache. Existing single-head graphs read as one-element head sets.
- `Storage::get_head()` becomes `Storage::get_heads()`.
- New `fact_cache` accessor returns the cached `FactIndex`.
- New persisted record: `FactCache { fact_index: FactIndexRef }`.

### Transaction

- `Transaction::commit` no longer collapses heads. It rebuilds the fact cache n-way (emitting effects to the caller's sink) and persists the head set and cache.

### Action

- `ClientState::action` reads `storage.get_heads()` instead of `storage.get_head()`.
- The pairwise-merge collapse loop moves from `Transaction::commit` to `action()`. It produces a single head before the policy's action handler runs.

### Sync

- `SyncRequester::get_commands` walks back from each head in the head set instead of `storage.get_head()`. Wire format unchanged.
- `SyncResponder` and `PeerCache` are unchanged.

### Braid

- `braid` takes a slice of heads.
- `last_common_ancestor` takes a slice and computes the N-way LCA.
- `ConvergenceMap::new` takes a slice of heads.

### Session

- `Session::new` seeds `base_facts` from the fact cache instead of the head segment.
