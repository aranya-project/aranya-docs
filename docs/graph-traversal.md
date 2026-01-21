---
layout: page
title: Graph Traversal Optimization
permalink: "/graph-traversal/"
---

# Graph Traversal Optimization

## Overview

Graph traversal in Aranya can exhibit exponential time complexity when visiting ancestor segments during operations like `is_ancestor` and `get_location_from`. This document specifies a bounded-memory solution using a capped visited set with max_cut-based eviction, suitable for no-alloc embedded environments.

## Problem Statement

### Graph Structure

Commands in Aranya are organized into segments within a DAG. Each segment contains:
- A sequence of commands
- A `prior` field: `Prior::None`, `Prior::Single(Location)`, or `Prior::Merge(Location, Location)`
- A skip list for fast backward traversal: `Vec<(Location, MaxCut)>`

A `Location` identifies a command by segment index and command index within that segment.

### Exponential Blowup

When multiple clients make concurrent changes, the graph develops merge points. Each merge acts as a "multiplication point" for traversal paths. Without tracking visited segments, the same segment can be queued multiple times through different paths.

Consider a sequence of merges forming a ladder pattern:

```
    [S0]                   (init)
   /    \
[S1]    [S2]               (branch)
   \    /
    [M1]                   (merge 1)
   /    \
[S3]    [S4]               (branch)
   \    /
    [M2]                   (merge 2)
    ...
```

When traversing backward from the head:
- M2 has 2 parents (S3, S4)
- Both S3 and S4 lead back to M1
- M1 is now queued twice
- Each instance of M1 adds its parents to the queue
- Pattern continues exponentially

For `n` merge levels, this produces up to `2^n` segment visits:

| Merge Levels | Without Tracking | With Tracking |
|:------------:|:----------------:|:-------------:|
| 10           | 1,024            | ~20           |
| 20           | 1,048,576        | ~40           |

Skip lists help mitigate this by allowing larger backward jumps. When a valid skip list entry exists, it is used *instead of* the prior locations, reducing the number of segments visited.

### Affected Operations

#### `get_location_from(start: Location, address: Address) -> Option<Location>`

Finds a command by its address, searching backward from a starting location. The algorithm:

1. Initialize a queue with `start`
2. Pop a location from the queue
3. Scan commands in the current segment for matching address
4. If not found, add either a skip list target or the prior location(s) to the queue
5. Repeat until found or queue exhausted

The exponential blowup occurs at step 4: each merge segment adds two parents to the queue. Without visited tracking, the same segment can be reached and queued through multiple paths.

#### `is_ancestor(candidate: Location, head: Segment) -> bool`

Determines if a location is an ancestor of a given segment head. The algorithm:

1. Initialize a queue with the head segment's prior location(s)
2. Pop a location from the queue
3. If location matches candidate, return true
4. If location's max_cut < candidate's max_cut, skip (can't be ancestor)
5. If a valid skip list entry exists, add only that skip target to the queue; otherwise add prior location(s)
6. Repeat until found or queue exhausted

This operation is particularly expensive during braiding, where it is invoked O(B * S) times (B = braid size, S = active strands). Each call potentially traverses a significant portion of the graph.

#### Why These Operations Are Vulnerable

Both operations share a common pattern:
- Backward traversal from a starting point
- Queue-based exploration of prior segments
- Merge segments contribute two parent edges to the queue

Without visited tracking, the number of queue operations grows exponentially with merge depth rather than linearly with segment count.

## Design Constraints

Target environments include:
- **No-alloc embedded systems**: Cannot use dynamic allocation
- **Large peer counts**: Thousands of peers (satellite constellations, drone swarms)

Key observations:
1. Branch width at any point is bounded by peer count (P), assuming well-behaved devices. Each device can only create one new branch from any given command (either via action or merge, but not both). Misbehaving devices could violate this bound.
2. Traversal proceeds backward (high max_cut to low max_cut), so evicting high max_cut entries is safe

## Specification

### Capped Visited Set

A fixed-size data structure tracking visited segments during traversal, using `heapless::Vec` for no-alloc storage.

```rust
struct CappedVisited<const CAP: usize> {
    entries: heapless::Vec<(usize, MaxCut), CAP>,  // (segment_id, max_cut)
}
```

### Operations

#### `insert(segment: usize, max_cut: MaxCut) -> bool`

Inserts a segment into the visited set. Returns true if the segment was not already present.

When the set is full, evicts the entry with the highest max_cut (least likely to be encountered again during backward traversal).

The implementation combines the existence check with finding the eviction candidate in a single pass, avoiding redundant traversal when the set is full.

```rust
fn insert(&mut self, segment: usize, max_cut: MaxCut) -> bool {
    // Single pass: check for existing segment and track max_cut entry for potential eviction
    let mut max_cut_idx = 0;
    let mut max_cut_val = MaxCut::MIN;

    for (i, (s, mc)) in self.entries.iter().enumerate() {
        if *s == segment {
            return false;  // Already present
        }
        if *mc > max_cut_val {
            max_cut_val = *mc;
            max_cut_idx = i;
        }
    }

    if self.entries.len() < CAP {
        self.entries.push((segment, max_cut)).unwrap();
    } else {
        // Evict entry with highest max_cut (already found above)
        self.entries[max_cut_idx] = (segment, max_cut);
    }
    true
}
```

### Integration with Traversal

```rust
let mut visited = CappedVisited::<256> {
    entries: heapless::Vec::new(),
};
let mut queue = heapless::Deque::<_, MAX_QUEUE>::new();
queue.push_back(start).unwrap();

while let Some(loc) = queue.pop_front() {
    let segment = storage.get_segment(loc.segment);
    if !visited.insert(loc.segment, segment.max_cut()) {
        continue;  // Already visited
    }

    // Process segment...
    // Add prior locations to queue with push_back()
}
```

Using FIFO ordering (breadth-first) aligns with the eviction strategy: segments are processed from high to low max_cut, so low max_cut entries accumulate in the visited set. When eviction occurs, the highest max_cut entries are removed—precisely the ones least likely to be encountered again.

### Capacity Sizing

The "active frontier" during traversal is bounded by concurrent branches, which is bounded by peer count for well-behaved devices. The lazy eviction strategy (evicting highest max_cut on overflow) keeps low max_cut entries that are more likely to be revisited during backward traversal.

| Environment          | Suggested Capacity | Memory       |
|:---------------------|:------------------:|:------------:|
| Embedded (small)     | 64                 | ~1 KB        |
| Embedded (standard)  | 256                | ~4 KB        |
| Server               | 512                | ~8 KB        |

Capacity should be tuned based on profiling of real-world graph topologies.

### Correctness

The algorithm remains correct even when the set overflows:
- Eviction may cause a segment to be revisited
- Revisiting produces redundant work but not incorrect results
- The algorithm converges as long as progress is made toward the root

### Complexity

| Aspect               | Bound                             |
|:---------------------|:----------------------------------|
| Memory               | O(CAP) - constant                 |
| `insert`             | O(CAP)                            |
| Traversal (typical)  | O(S) where S = segment count      |
| Traversal (overflow) | O(S * R) where R = revisit factor |

## Trade-offs

**Advantages:**
- Fixed memory regardless of graph size
- No dynamic allocation
- Correct results guaranteed
- Graceful performance degradation under overflow

**Disadvantages:**
- May revisit segments if capacity exceeded
- O(CAP) lookup within set
- Requires capacity tuning for workloads

## Implementation Notes

### Sorted List Optimization

For larger CAP values, maintaining a sorted list by max_cut with binary search could reduce lookup time from O(CAP) to O(log CAP). However, this trades read performance for insert cost:

- **Unsorted (specified above):** O(CAP) lookup, O(1) insert (amortized)
- **Sorted:** O(log CAP) lookup, O(CAP) insert (due to shifting)

The optimal choice depends on the hit rate and target architecture. On systems where CAP fits in L1 cache, linear scan may outperform binary search due to cache locality. Benchmarking on target hardware is recommended for CAP values exceeding ~64 entries.
