---
layout: page
title: Optimizing the braid algorithm
permalink: "/braid-optimization/"
---

# Optimizing the braid algorithm

## Overview

The `braid()` function in `braiding.rs` produces a deterministic ordering of commands from two branches being merged. This document describes a performance optimization that eliminates all `is_ancestor()` calls by pre-computing convergence points in a single BFS pass, reducing per-check complexity from O(k) (graph traversal) to O(1) amortized (map lookup, with occasional chunk loads from disk).

## Problem

The current implementation calls `is_ancestor()` — itself a BFS graph traversal — for each prior location against every other active strand in the heap:

```rust
'location: for location in prior {
    for other in strands.iter() {
        // O(1) — cheap, but only catches intra-segment cases
        if location.same_segment(other.next) && location.max_cut <= other.next.max_cut {
            continue 'location;
        }

        // O(k) — expensive BFS through the graph
        if storage.is_ancestor(location, &other.segment, buffers)? {
            continue 'location;
        }
    }
    strands.push(Strand::new(storage, location, ...)?)?;
}
```

For each command popped from the strand heap, each of its priors (1 for `Single`, 2 for `Merge`) is checked against every other active strand via `is_ancestor()`. Each `is_ancestor()` call does a BFS backward through segments, loading each from storage with potential I/O. The BFS is unbounded — it can traverse the entire graph history below the current strand position, not just the diamond being braided.

| Variable | Meaning |
|:---------|:--------|
| n | Commands visited in the diamond |
| s | Active strands in the heap (typically 2, grows at nested merges) |
| k | Cost of one `is_ancestor()` call (BFS traversal, up to entire graph depth) |

**Current total cost: O(n × s × k)**, where k can be O(G) with G being the full graph size.

The `same_segment` check is a fast O(1) short-circuit for the common case where two strands are in the same segment. But at every segment boundary — which is precisely where merges create branches — it does not help, and the full `is_ancestor()` BFS runs.

## Key Insight

When the braid expands merge commands, strands multiply. Some of these strands eventually reach the same node — a **convergence point**. The current algorithm discovers this at runtime via `is_ancestor()`, a BFS that can traverse the entire graph history.

Instead, we identify all convergence points in a single BFS pre-pass before braiding begins. Starting from both merge parents, we traverse backward toward the LCA. Any node visited more than once is a convergence point, and the visit count tells us exactly how many strands will arrive there during braiding.

The pre-pass uses the existing `TraversalQueue` (via `TraversalBuffer`), which pops the entry with the highest `max_cut` first. Two new methods are added:

- **`push_duplicate(location)`**: Enqueues a location without deduplication (the existing `push` merges entries with the same segment). Multiple entries for the same location are kept separately in the queue.
- **`pop_duplicates()`**: Finds the entry with the highest `max_cut`, removes all entries matching that location, and returns `(location, count)`.

If the count is ≥ 2, the location is a convergence point and is written to the convergence map. Priors are expanded exactly once per location regardless of count. This enforces the **visit-once rule** automatically: the BFS never re-visits a location because all duplicates are consumed in a single pop.

The frontier is bounded by O(w) where w is the graph width. Since `max_cut` is strictly increasing toward the heads (a child always has `max_cut` > parent), all paths to a given location pass through nodes with higher `max_cut`. Those nodes are popped first, so all paths to a location enqueue it before it is popped. At any level, the queue holds at most the width of the graph at that level, with each merge adding at most 2 priors, so the frontier never exceeds 2w entries.

During the braid loop, each prior location is checked against the convergence map via a `ConvergenceMap` struct. If the location is a convergence point with count > 1, the count is decremented and the strand is dropped. When the count reaches 1, the entry is removed from the map and the strand continues.

### Why convergence covers every `is_ancestor` case

Every case where `is_ancestor(X, Y)` would return true corresponds to X being a convergence point:

- **Cross-path**: X and Y come from different merge heads. Both BFS paths visit X. Count ≥ 2.
- **Same-head, different branches**: X and Y are from the same head but were separated by a merge expansion. Both branches of that inner merge reach X. Count ≥ 2.

The only remaining ancestor relationship is **same-segment** (X and Y on the same linear segment, X earlier), which `same_segment_check` already handles in O(1) before `is_ancestor` is ever called.

Therefore, convergence counting completely replaces `is_ancestor`. The braid loop becomes four O(1) checks:

1. `max_cut` skip (existing) — prune at the LCA boundary
2. `same_segment` check (existing) — prune within a linear segment
3. Convergence count check (new) — prune at convergence points
4. Otherwise — create strand

### Simple example

```
          M                ← merge triggers braid(left=D, right=F)
         / \
   D [p3]   F [p2]
      |       |
   C [p3]   E [p2]
      |       |
   B [p3]     |
       \     /
        A              ← LCA
```

The pre-pass BFS from D and F visits each node once. A is skipped (`max_cut` ≤ LCA). Convergence map: **empty** — no node within the diamond was visited twice.

The old algorithm makes 2 `is_ancestor()` calls (each a BFS walking D→C→B→A). The new algorithm needs zero: E is not a convergence point and not same-segment with D, so it becomes a strand. A is pruned by the `max_cut` skip. Result: **[D, E, F]**. Convergence counting handles the harder cases shown below.

### Nested merge example

```
            M              ← outer merge, LCA = Z
           / \
          A    F
          |    |
   inner M2    |           ← inner merge
        / \    |
       B    C  |
        \  /   |
         W     |
         |     |
         D     E
          \   /
            Z              ← outer LCA
```

A's prior is `Merge(B, C)` via M2. W is the inner LCA. D and E are commands between the inner convergence and the outer LCA.

**Pre-pass BFS** from A and F, stopping at Z:

| Pop | Count | Action |
|:----|:------|:-------|
| A | 1 | Prior is `Merge(B, C)`. Enqueue B, C. |
| F | 1 | Enqueue prior E. |
| B | 1 | Enqueue prior W. |
| C | 1 | Enqueue prior W. (W now has 2 entries in queue.) |
| E | 1 | Enqueue prior Z. |
| W | **2** | All duplicates consumed. Convergence point → write to map. Enqueue prior D. |
| Z | — | `max_cut` ≤ LCA. Skip. |
| D | 1 | Enqueue prior Z. |
| Z | — | `max_cut` ≤ LCA. Skip. |

Convergence map: `{W: 2}`.

**Braiding** (assuming p2 < p3, with CmdId tiebreaking within same priority):

| Step | Pop | Braid | Prior | Action |
|:-----|:----|:------|:------|:-------|
| 1 | F (p2) | [F] | E | Not convergence, not same_segment. Push E. Strands: [A, E] |
| 2 | E (p2) | [F, E] | Z | `max_cut` skip. Strands: [A] |
| 3 | A (p3) | [F, E, A] | Merge(B,C) | Push B and C. Strands: [B, C] |
| 4 | B (p3) | [F, E, A, B] | W | `should_continue(W)`: count 2→1, returns false. **Drop**. Strands: [C] |
| — | | | | `lone()`! Add C. |
| — | | [F, E, A, B, C] | | Reverse → **[C, B, A, E, F]** |

`should_continue(W)` returned false for B's prior, preventing a redundant strand. The last strand to arrive at W would get true (count=1, entry removed), but `lone()` fires first since C is the only strand remaining.

### Three-strand convergence

Three or more strands can hit a single convergence point when a merge expands within a branch that shares an ancestor with the other branch:

```
      merge(a, merge(e, f))
           |            \
           |         merge(e, f)
           |           /     \
           |   e=merge(b,c)   f
           |    /   \        /
           |    b     c     /
           |      \  /     /
           a-------x      / 
                    \    /
                     lca
```

Braid: `a` vs `merge(e, f)`, LCA = `lca`.

**Pre-pass BFS** from `a` and `merge(e, f)`:

- `a`(1) → `x`(1) → `lca` (stop)
- `merge(e, f)` expands to `e=merge(b, c)` and `f`
  - `merge(b, c)` expands to `b` and `c`
    - `b`(1) → `x`(**2**, stop)
    - `c`(1) → `x`(**3**, stop)
  - `f`(1) → `lca` (stop)

Convergence map: `{x: 3}`

During braiding, strands `a`, `b`, `c`, and `f` are active after merge expansion. Three of them (`a`, `b`, `c`) have `x` as their prior. The first two arrivals call `should_continue(x)` which returns false (count 3→2→1). The third arrival gets true (count=1, entry removed) and pushes a strand at `x`, continuing the braid below.

### Nested convergence accuracy

When convergence points are nested (one below another), the visit-once rule keeps counts correct:

```
        y   ←── count=2
       / \
      a    b
       \  /
        x   ←── count=2, not 3
        |
       ...
```

`y` is visited twice (count=2) but only the first visit continues, reaching `x` once. If `x` is also reachable from an independent path, `x` gets count=2 — not 3, because the strand pruned at `y` never reaches `x`. In braiding: 2 strands arrive at `y`, one is dropped. The survivor plus one independent strand reach `x` — matching the count.

## Changes

### `braid` signature

`braid(storage, left, right, lca, buffer)` — the `TraversalBuffer` parameter is retained but now used for the convergence pre-pass instead of `is_ancestor()`. The `lca` parameter is the pre-computed LCA, used as the BFS boundary for the convergence pre-pass and the `max_cut` skip.

### Caller change in `make_braid_segment`

`last_common_ancestor()` is computed before `braid()` and passed as the `lca` parameter.

### `TraversalQueue` changes

Two new methods are added to `TraversalQueue`:

- **`push_duplicate(location)`**: Like `push`, but skips the existing same-segment deduplication logic. Each call adds a new entry to the queue, even if the location is already present.
- **`pop_duplicates()`**: Finds the entry with the highest `max_cut` (like `pop`), then removes all entries matching that location. Returns `(location, count)`.

The existing `push`/`pop` methods are unchanged — the new methods are used only by the convergence pre-pass.

### Pre-pass: compute convergence map

A BFS pre-pass computes the convergence map before the main braid loop, as described in Key Insight. The BFS uses the `TraversalBuffer` ordered by `max_cut` (highest first) — the reverse of the main braid heap's `(Priority, CmdId)` ordering — because the pre-pass is traversing backward through the graph, not braiding.

```
compute_convergence(left, right, lca):
    queue = traversal_buffer.get()
    queue.push_duplicate(left)
    queue.push_duplicate(right)

    while let Some((location, count)) = queue.pop_duplicates():
        if location.max_cut <= lca.max_cut:
            skip

        if count >= 2:
            add (location, count) to convergence map

        for prior in location.priors():
            queue.push_duplicate(prior)
```

Convergence points are written to chunked storage during computation (see Bounding convergence map memory). For small convergence regions, a single chunk covers everything and is never written to disk.

## Algorithm

### Pre-pass

Compute the convergence map via `compute_convergence(left, right, lca)`. This BFS is O(N) where N is the number of commands between the merge heads and the LCA — the same nodes the braid will visit. The result is a set of chunks stored on disk (or a single in-memory chunk for small maps).

### Main Loop

```
braid(left, right, lca):
    convergence = compute_convergence(left, right, lca)
    push left and right as strands into heap

    while heap has strands:
        pop strand with lowest (Priority, CmdId)
        determine prior of strand's command

        if prior is Merge:
            push both merge parents as new strands
        else:
            add command to braid
            for each prior location:
                if location.max_cut <= lca.max_cut:
                    skip (at or below LCA)
                else if location is in same segment as another strand:
                    skip (same-segment fast path)
                else if not convergence.should_continue(location):
                    skip (convergence point, strand dropped)
                else:
                    push as new strand

        if only one strand remains:
            add its location to braid and stop

    reverse braid
```

`convergence.should_continue(location)` loads the correct chunk if needed, looks up the location, and returns true if the strand should continue. If the location is a convergence point with count > 1, it decrements the count and returns false. When the count reaches 1, it removes the entry and returns true. If the location is not in the map, it returns true.

## Complexity

| Aspect | Bound |
|:-------|:------|
| Pre-pass BFS | O(N) where N = commands in the diamond |
| Per command (main loop) | O(s) for heap operations and strand checks, all O(1) per check |
| Total | O(N + n × s) ≈ O(n × s) since N ≈ n |

The strand count s is bounded by the DAG width. In practice, each peer can contribute at most one concurrent branch, so s ≤ p (the number of peers) for typical graphs. (Pathological local merges from batch sync can exceed this — see Bounding convergence map memory.) This gives an effective cost of **O(n × p)**, replacing O(n × s × k) where k was O(G), a traversal of the full graph history.

## Edge Cases

**`same_segment` check**: Convergence subsumes the same-segment case, but the check is retained as a fast path to avoid a convergence map lookup.

**Empty convergence map**: When the diamond has no inner merges (the common case for simple merges), the convergence map is empty and all pruning is handled by the `max_cut` skip.

The optimization changes only how convergence is detected. Heap ordering, the `ParallelFinalize` constraint in `StrandHeap`, and result ordering are all unchanged.

## Bounding convergence map memory

### Problem

The convergence map size is unbounded. It is proportional to the number of merge commands between the LCA and the merge parents. In the common case (two peers syncing regularly), the map is small — typically under 10 entries. But pathological cases exist:

When a client that has been offline receives a large graph via sync, the sync protocol delivers commands in batches (limited by `COMMAND_RESPONSE_MAX`). Each batch commit creates a **local merge** to join the batch with the client's graph head. These local merges are unique to the receiving client — the sender has no knowledge of them. On the next batch, the LCA between the receiver's head (which sits atop a local merge) and the new batch falls back to the deepest shared ancestor, often near the root of the graph.

This causes the convergence map to grow with every batch. In testing with a 5,000-command graph and 3 clients, the convergence map reached 1,106 entries, with all large maps having their LCA at max_cut 64 (near the graph root). The convergence map must cover the entire region between the LCA and the merge parents — effectively the whole graph.

This is a problem for `no_alloc` targets where memory is constrained, and for any environment where holding the full map in memory is undesirable.

### Chunked convergence map

#### Writing during pre-pass

During `compute_convergence`, two in-memory chunks are used. Convergence points are accumulated into the primary chunk. When the primary chunk is full and a new entry arrives:

- **If the new entry's `max_cut` matches existing entries in the primary chunk**: move all entries at that `max_cut` from the primary to the secondary chunk, then add the new entry to the secondary chunk. This ensures all convergence points at a given `max_cut` stay in the same chunk.
- **If the new entry's `max_cut` does not match anything in the primary chunk**: flush the primary chunk to disk and start fresh with the new entry.

When the secondary chunk fills up, the primary chunk is flushed to disk and cleared. Since the BFS processes locations from highest to lowest `max_cut`, chunks are naturally ordered by descending `max_cut`.

For the common case (convergence map size < CHUNK_SIZE), the entire map fits in a single chunk and is never written to disk.

#### Reading during braiding: `ConvergenceMap`

A `ConvergenceMap` struct holds up to two chunks in memory and provides a single method:

**`should_continue(location) -> bool`**: Loads the correct chunk if needed (evicting the chunk covering the lowest `max_cut` range), then looks up the location. If found with count > 1, decrements the count and returns false (drop the strand). If found with count = 1, removes the entry and returns true (last arrival, continue). If not found, returns true (not a convergence point, continue).

Keeping two chunks avoids thrashing at boundaries: the strand heap processes commands by `(Priority, CmdId)`, not strictly by `max_cut`, so commands at slightly different depths can interleave. By the time a third chunk is needed, the highest chunk is no longer reachable — strands only move downward through the graph.

#### Storage format

Each chunk is a sorted array of `(Location, count)` pairs, enabling binary search for point lookups. The chunks are ephemeral — computed per-braid and discarded after the braid completes.
