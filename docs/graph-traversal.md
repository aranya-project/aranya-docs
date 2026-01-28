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
3. If location is in the candidate's segment AND `location.command >= candidate.command`, return true (the candidate is reachable)
4. If segment already visited at this entry point or higher, skip to step 2
5. Mark segment as visited with current entry point
6. If segment's max_cut < candidate's max_cut, skip (can't contain ancestor)
7. If a valid skip list entry exists, add only that skip target to the queue; otherwise add prior location(s)
8. Repeat until found or queue exhausted

The ordering of steps 3-5 is critical: the found check (step 3) executes before the visited check (step 4). This ensures that entering a segment at different commands works correctly. If we enter segment S at command 3 and later at command 5 while searching for command 4, the second entry still finds the target (5 >= 4) even though the segment was already marked visited.

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
2. Traversal proceeds backward (high max_cut to low max_cut), so evicting entries with high effective max_cut is safe

## Specification

### Capped Visited Set

A fixed-size data structure tracking visited segments during traversal, using `heapless::Vec` for no-alloc storage.

```rust
struct CappedVisited<const CAP: usize> {
    // (segment_id, min_max_cut, highest_command_visited)
    entries: heapless::Vec<(usize, MaxCut, CommandIndex), CAP>,
}
```

Each entry tracks:
- **segment_id**: The segment being tracked
- **min_max_cut**: The minimum max_cut in the segment (i.e., the max_cut of command 0)
- **highest_command_visited**: The highest command index we've entered this segment at

This allows calculating the max_cut of any entry point without loading the segment:
```rust
entry_point_max_cut = min_max_cut + command_index
```

### Operations

#### `clear()`

Resets the visited set for reuse.

```rust
fn clear(&mut self) {
    self.entries.clear();
}
```

#### `get(segment: usize) -> Option<(MaxCut, CommandIndex)>`

Returns the min_max_cut and highest_command_visited for a segment if it exists in the set.

```rust
fn get(&self, segment: usize) -> Option<(MaxCut, CommandIndex)> {
    self.entries
        .iter()
        .find(|(s, _, _)| *s == segment)
        .map(|(_, min_mc, highest)| (*min_mc, *highest))
}
```

#### `insert_or_update(segment: usize, min_max_cut: MaxCut, command: CommandIndex)`

Inserts a new segment or updates the highest_command_visited if the segment already exists.

When the set is full and a new segment needs to be inserted, evicts the entry with the highest effective max_cut (min_max_cut + highest_command), as this represents the newest point visited and is least likely to be encountered again during backward traversal.

```rust
fn insert_or_update(&mut self, segment: usize, min_max_cut: MaxCut, command: CommandIndex) {
    // Single pass: check for existing segment and track eviction candidate
    let mut evict_idx = 0;
    let mut evict_max_cut = MaxCut::MIN;

    for (i, (s, min_mc, highest)) in self.entries.iter_mut().enumerate() {
        if *s == segment {
            // Segment exists - update highest_command if this entry point is higher
            if command > *highest {
                *highest = command;
            }
            return;
        }
        // Track entry with highest effective max_cut for potential eviction
        let effective_max_cut = *min_mc + MaxCut::from(*highest);
        if effective_max_cut > evict_max_cut {
            evict_max_cut = effective_max_cut;
            evict_idx = i;
        }
    }

    // Segment not found - insert new entry
    if self.entries.len() < CAP {
        self.entries.push((segment, min_max_cut, command)).unwrap();
    } else {
        // Evict entry with highest effective max_cut (already found above)
        self.entries[evict_idx] = (segment, min_max_cut, command);
    }
}
```

### Segment-Level Tracking

For operations that only need segment-level visited tracking (not entry point granularity), use `CappedVisited` with `CommandIndex::MAX` to indicate the entire segment has been visited. This allows a single buffer to be reused across different traversal operations, reducing total memory allocation in embedded environments with static buffers.

#### `mark_segment_visited(segment: usize, min_max_cut: MaxCut)`

Helper for segment-level-only tracking:

```rust
fn mark_segment_visited(&mut self, segment: usize, min_max_cut: MaxCut) {
    self.insert_or_update(segment, min_max_cut, CommandIndex::MAX);
}
```

#### `was_segment_visited(segment: usize) -> bool`

Check if a segment was visited at any entry point:

```rust
fn was_segment_visited(&self, segment: usize) -> bool {
    self.get(segment).is_some()
}
```

### Integration with Traversal

The visited set enables skipping segment loads when we've already visited a segment at the same or higher entry point. Buffers are passed in by the caller to avoid large stack allocations in the traversal functions.

#### is_ancestor traversal

```rust
fn is_ancestor(
    target: Location,
    start: Location,
    storage: &Storage,
    visited: &mut CappedVisited<CAP>,
    queue: &mut heapless::Deque<Location, MAX_QUEUE>,
) -> bool {
    visited.clear();
    queue.clear();
    queue.push_back(start).unwrap();

    while let Some(loc) = queue.pop_front() {
        // Check if target found BEFORE visited check
        if loc.segment == target.segment && loc.command >= target.command {
            return true;
        }

        // Check if we can skip loading this segment entirely
        if let Some((_, highest)) = visited.get(loc.segment) {
            if loc.command <= highest {
                continue;  // Already visited at this entry point or higher
            }
        }

        // Must load segment
        let segment = storage.get_segment(loc.segment);
        visited.insert_or_update(loc.segment, segment.min_max_cut(), loc.command);

        // Add priors to queue with push_back()
    }
    false
}
```

#### get_location_from traversal

For `get_location_from`, we may need to search only the portion of the segment we haven't searched before:

```rust
fn get_location_from(
    start: Location,
    target_address: Address,
    storage: &Storage,
    visited: &mut CappedVisited<CAP>,
    queue: &mut heapless::Deque<Location, MAX_QUEUE>,
) -> Option<Location> {
    visited.clear();
    queue.clear();
    queue.push_back(start).unwrap();

    while let Some(loc) = queue.pop_front() {
        // Check visited status and determine search range
        let search_start = if let Some((_, highest)) = visited.get(loc.segment) {
            if loc.command <= highest {
                continue;  // Already searched this entry point or higher
            }
            highest + 1  // Only search commands we haven't seen
        } else {
            0  // First visit - search from beginning
        };

        // Must load segment
        let segment = storage.get_segment(loc.segment);
        visited.insert_or_update(loc.segment, segment.min_max_cut(), loc.command);

        // Search commands from search_start to loc.command
        for cmd_idx in (search_start..=loc.command).rev() {
            if segment.command(cmd_idx).address == target_address {
                return Some(Location::new(loc.segment, cmd_idx));
            }
        }

        // Add priors to queue with push_back()
    }
    None
}
```

#### find_needed_segments traversal

For operations that only need segment-level tracking (not entry point granularity), use `CappedVisited` with the segment-level helpers:

```rust
fn find_needed_segments(
    storage: &Storage,
    visited: &mut CappedVisited<CAP>,
    queue: &mut heapless::Deque<Location, MAX_QUEUE>,
) -> Vec<Location> {
    visited.clear();
    queue.clear();
    queue.push_back(storage.get_head()).unwrap();

    let mut result = Vec::new();
    while let Some(head) = queue.pop_front() {
        // Simple segment-level check - no entry point tracking needed
        if visited.was_segment_visited(head.segment) {
            continue;  // Already visited this segment
        }

        let segment = storage.get_segment(head.segment);
        visited.mark_segment_visited(head.segment, segment.min_max_cut());
        // Process segment...
        // Add priors to queue with push_back()
    }
    result
}
```

Using FIFO ordering (breadth-first) aligns with the eviction strategy: segments are processed from high to low max_cut, so low max_cut entries accumulate in the visited set. When eviction occurs, the entries with highest effective max_cut are removed—precisely the ones least likely to be encountered again.

### Capacity Sizing

The "active frontier" during traversal is bounded by concurrent branches, which is bounded by peer count for well-behaved devices. The lazy eviction strategy (evicting highest effective max_cut on overflow) keeps low max_cut entries that are more likely to be revisited during backward traversal.

Each entry requires approximately 24 bytes (8-byte segment_id + 8-byte MaxCut + 4-byte CommandIndex + padding).

| Environment          | Suggested Capacity | Memory       |
|:---------------------|:------------------:|:------------:|
| Embedded (small)     | 64                 | ~1.5 KB      |
| Embedded (standard)  | 256                | ~6 KB        |
| Server               | 512                | ~12 KB       |

Using a single `CappedVisited` buffer for all traversal operations (rather than separate structures for entry-point vs. segment-level tracking) reduces total memory allocation, particularly important in embedded environments with static buffers.

Capacity should be tuned based on profiling of real-world graph topologies.

### Correctness

The algorithm remains correct even when the set overflows:
- Eviction may cause a segment to be revisited
- Revisiting produces redundant work but not incorrect results
- The algorithm converges as long as progress is made toward the root

### Complexity

**CappedVisited**:

| Aspect               | Bound                             |
|:---------------------|:----------------------------------|
| Memory               | O(CAP) - constant                 |
| `clear`              | O(1)                              |
| `get`                | O(CAP)                            |
| `insert_or_update`   | O(CAP)                            |

**Traversal**:

| Aspect               | Bound                             |
|:---------------------|:----------------------------------|
| Typical              | O(S) where S = segment count      |
| Overflow             | O(S * R) where R = revisit factor |

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

For larger CAP values, maintaining a sorted list by effective max_cut with binary search could reduce eviction candidate lookup from O(CAP) to O(1). However, this trades eviction performance for insert cost:

- **Unsorted (specified above):** O(CAP) insert (to find eviction candidate), O(CAP) lookup by segment_id
- **Sorted by effective max_cut:** O(1) eviction candidate, O(CAP) insert (due to shifting), O(CAP) lookup by segment_id

Note that lookup by segment_id remains O(CAP) either way since we're searching by segment_id, not by max_cut. The optimal choice depends on the hit rate and target architecture. On systems where CAP fits in L1 cache, linear scan may outperform more complex data structures due to cache locality. Benchmarking on target hardware is recommended for CAP values exceeding ~64 entries.
