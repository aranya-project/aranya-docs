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

Skip lists compound this by adding additional edges that create more paths to the same segments.

### Affected Operations

1. **`get_location_from`**: Finds a command by address starting from a given location
2. **`is_ancestor`**: Determines if a location is an ancestor of a segment

Both are called frequently during braiding, where `is_ancestor` is invoked O(B * S) times (B = braid size, S = active strands).

## Design Constraints

Target environments include:
- **No-alloc embedded systems**: Cannot use dynamic allocation
- **Large peer counts**: Thousands of peers (satellite constellations, drone swarms)

Key observations:
1. Branch width at any point is bounded by peer count (P)
2. Traversal proceeds backward (high max_cut to low max_cut), so evicting high max_cut entries is safe

## Specification

### Capped Visited Set

A fixed-size data structure tracking visited segments during traversal.

```rust
struct CappedVisited<const CAP: usize> {
    entries: [(usize, MaxCut); CAP],  // (segment_id, max_cut)
    len: usize,
}
```

### Operations

#### `insert(segment: usize, max_cut: MaxCut) -> bool`

Inserts a segment into the visited set. Returns true if the segment was not already present.

When the set is full, evicts the entry with the highest max_cut (least likely to be encountered again during backward traversal).

```rust
fn insert(&mut self, segment: usize, max_cut: MaxCut) -> bool {
    if self.entries[..self.len].iter().any(|(s, _)| *s == segment) {
        return false;
    }

    if self.len < CAP {
        self.entries[self.len] = (segment, max_cut);
        self.len += 1;
    } else {
        // Evict entry with highest max_cut
        let evict_idx = self.entries[..self.len]
            .iter()
            .enumerate()
            .max_by_key(|(_, (_, mc))| mc)
            .map(|(i, _)| i)
            .unwrap();
        self.entries[evict_idx] = (segment, max_cut);
    }
    true
}
```

### Integration with Traversal

```rust
let mut visited = CappedVisited::<256>::new();
let mut queue = Vec::new();
queue.push(start);

while let Some(loc) = queue.pop() {
    if !visited.insert(loc.segment, segment.max_cut()) {
        continue;  // Already visited
    }

    // Process segment...
    // Add prior locations to queue
}
```

### Capacity Sizing

The "active frontier" during traversal is bounded by concurrent branches, which is bounded by peer count. The lazy eviction strategy (evicting highest max_cut on overflow) keeps low max_cut entries that are more likely to be revisited during backward traversal.

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
