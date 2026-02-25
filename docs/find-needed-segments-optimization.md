---
layout: page
title: Optimizing find_needed_segments
permalink: "/find-needed-segments-optimization/"
---

# Optimizing find_needed_segments

## Overview

The `find_needed_segments()` function in `responder.rs` determines which segments to send during sync. This document describes a performance optimization that eliminates all `is_ancestor()` calls by propagating coverage information during a single backward traversal, reducing complexity from O(n × m × k) to O(n × CAP).

## Problem

The current implementation calls `is_ancestor()` — itself a BFS graph traversal — in two places:

1. **Filtering redundant have_locations (O(m² × k)):** For each pair of have_locations, call `is_ancestor()` to remove ancestors.
2. **Main traversal (O(n × m × k)):** For each segment from head, call `is_ancestor()` against every have_location to check if the peer already has it.

```rust
// Phase 1: Filter redundant have_locations
for each pair (A, B) in have_locations:
    if is_ancestor(A, B):       // Expensive BFS
        remove A

// Phase 2: Main traversal
for each segment S traversed from head:
    for each have_location H:
        if is_ancestor(S, H):   // Expensive BFS
            skip S (peer has it)
    if not skipped:
        add S to result
```

In one test case this produces ~62,000+ `is_ancestor()` calls in 7 seconds, each doing BFS with file I/O.

## Key Insight

Process segments in descending `longest_max_cut` order. Since a have_location's ancestors always have lower max_cut, we encounter every have_location before processing any of its ancestors. When we find a have_location, we push its priors as "covered" — the peer has them and they don't need to be sent. This propagates through the graph as each covered segment's priors are themselves pushed as covered, without any `is_ancestor()` calls.

This also eliminates the need to filter redundant have_locations: if A is an ancestor of B, both independently mark their priors as covered. Duplicate marks are harmless.

A segment can't be immediately committed to the result when first encountered — a have_location discovered later (at a lower max_cut) could mark it as covered. Instead, segments are held tentatively and finalized only once all segments with higher max_cut have been processed, guaranteeing no future have_location can reach them.

Finally, if every remaining unprocessed segment is marked covered, we can stop early. All remaining paths lead to segments the peer already has, so no tentatively-held segment can be retroactively covered. Everything held can be finalized at once.

### Example

Consider a DAG with 6 single-command segments, where the peer reports having commands at H1 and H2:

```
          F [mc 10]    ← head
         / \
   D [mc 8]  E [mc 7]
        |       |
   C [mc 5]    |      ← H1 (peer has this)
        \     /
         \   /
       B [mc 3]        ← H2 (peer has this)
           |
       A [mc 0]        ← init
```

The correct result is {F, D, E} — the segments the peer doesn't have.

**Old algorithm — 8 `is_ancestor()` calls, each a BFS traversal:**

Phase 1 filters redundant have_locations by checking all pairs (2 calls):

| Call | Check | Result | Action |
|------|-------|--------|--------|
| 1 | is_ancestor(B, C)? | Yes | Remove H2 |
| 2 | is_ancestor(C, B)? | No | Keep H1 |

Phase 2 traverses from head, checking each segment against the remaining H1 (6 calls):

| Call | Segment | is_ancestor of H1? | Action |
|------|---------|---------------------|--------|
| 3 | F | No | Add to result |
| 4 | D | No | Add to result |
| 5 | E | No | Add to result |
| 6 | C | Yes | Skip |
| 7 | B | Yes | Skip |
| 8 | A | Yes | Skip |

**New algorithm — 5 queue pops, 0 `is_ancestor()` calls:**

have_locations sorted descending: H1 (mc 5), H2 (mc 3).

| Step | Pop | Covered? | Action |
|------|-----|----------|--------|
| 1 | F (mc 10) | no | No have match. Add to pending, push D and E uncovered. |
| 2 | D (mc 8) | no | No have match. Add to pending, push C uncovered. |
| 3 | E (mc 7) | no | No have match. Add to pending, push B uncovered. |
| 4 | C (mc 5) | no | H1 matches! Push prior B as **covered** (updates B in queue). |
| 5 | B (mc 3) | **yes** | Already covered. Push prior A as covered. |
| — | | | All remaining heads covered — **early termination**. |

Flush pending to result: **{F, D, E}**. Segment A is never even visited. With more have_locations and larger graphs, the gap grows from 8 vs 5 to tens of thousands of BFS traversals vs a single linear pass.

## Changes to TraversalQueue

`TraversalQueue` entries become `(Location, bool)` to carry a covered flag, and gain new methods to support both the heads queue (pop by highest `max_cut`, with coverage) and pending queue (drain by predicate, with removal) roles:

```rust
pub struct TraversalQueue {
    entries: heapless::Vec<(Location, bool), QUEUE_CAPACITY>,
}
```

New and modified operations:

- **`push(loc)`**: Unchanged behavior. New entries get `covered = false`. Existing entries update `max_cut` to the max.
- **`push_covered(loc, covered)`**: Like `push`, but for new entries sets the given covered value, and for existing entries sets `covered |= covered` (once covered, always covered).
- **`pop()`**: Unchanged — removes and returns the `Location` with the highest `max_cut`, discarding the covered flag.
- **`pop_covered()`**: Like `pop`, but returns `Option<(Location, bool)>` including the covered flag.
Existing callers using `push`/`pop` are unaffected — `push` defaults covered to false, `pop` discards it.

### have_locations

A `heapless::Vec<Location, COMMAND_SAMPLE_MAX>` replacing the current heap-allocated `vec::Vec` (which has a `//BUG: not constant size` comment). `COMMAND_SAMPLE_MAX` is the existing constant for the maximum sample commands sent during sync (20 with `low-mem-usage`, 100 without).

Sorted descending by `max_cut` after resolution. Since heads are popped in descending max_cut order, have_locations with `max_cut` above the segment's `longest_max_cut()` have already been encountered or skipped and can be removed. Any have_location whose `max_cut` falls within the segment's range (`shortest_max_cut`..=`longest_max_cut`) is a candidate. Those below `shortest_max_cut` can't be in this segment. In most cases only one or two have_locations need to be checked per segment.

## Algorithm

The function uses two queues from the existing `TraversalBuffers`: a **heads** queue for segments to process (popped by highest `longest_max_cut`, each entry carrying a covered flag), and a **pending** queue for segments tentatively identified as needed.

### Setup

Resolve command addresses to Locations (using `buffers.primary` as scratch space for each `get_location()` call). Sort the resulting have_locations descending by `max_cut`. Clear both queues and push the graph head into heads as uncovered.

### Main Loop

Pop the highest `longest_max_cut` entry from heads. Before processing it, flush any pending segments whose `shortest_max_cut` is above the just-popped entry's `longest_max_cut` — those are safe because all segments that could have covered them have already been processed. Move them to the result.

Then handle the popped segment in one of three ways:

1. **Covered**: The peer already has this segment. Push its priors into heads as covered, and remove them from pending if present. This propagates coverage backward through the graph.

2. **Contains a have_location**: Check the have_locations list for any matching this segment (same `SegmentIndex` with `max_cut` within the segment's range). Since have_locations are sorted descending, first discard any with `max_cut` above the segment's `longest_max_cut` — those have already been passed. If a match is found, push priors as covered (same as case 1). If the peer doesn't have the entire segment (the highest matching have_location is not at the segment head), add a partial entry to pending starting from the command after the highest have_location. Remove consumed have_locations.

3. **Uncovered, no have_location**: Add the segment to pending (via `first_location()`) and push its priors into heads as uncovered to continue traversal.

If all remaining entries in heads are covered, terminate early — every remaining branch leads to segments the peer already has, so nothing in pending will be needed. Otherwise, when heads is exhausted, flush all remaining pending segments to the result.

## Complexity

All queue operations are O(CAP) due to linear scans on fixed-capacity arrays, matching the existing `TraversalQueue`. 

| Aspect      | Bound                              |
|:------------|:-----------------------------------|
| Memory      | O(CAP) — two queues in existing `TraversalBuffers` |
| Per segment | O(CAP) for queue operations        |
| Total       | O(n × CAP) where n = segments visited |

Since CAP is a compile-time constant (512), this is effectively O(n). This replaces O(n × m × k) where k was itself a graph traversal.

Each entry grows from 16 bytes (`Location`) to 24 bytes (`(Location, bool)` with alignment padding), so memory overhead vs the current `TraversalBuffers` is ~8 KB.

## Edge Cases

**Multiple have_locations on different branches**: Coverage propagates independently per branch. No pre-filtering needed.

**Segment max_cut ranges**: The `Segment` trait exposes `shortest_max_cut()` (first command) and `longest_max_cut()` (last command). Heads entries carry `longest_max_cut` (via prior Locations pointing to segment heads) and are popped highest first. Pending entries carry `shortest_max_cut` (via `first_location()`). The flush condition compares pending `shortest_max_cut` against the current head's `longest_max_cut`, ensuring correctness when ranges overlap.

**Result ordering**: The result may need a final sort to ensure causal order (parents before children).
