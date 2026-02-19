---
layout: page
title: Graph Traversal Optimization
permalink: "/graph-traversal/"
---

# Graph Traversal Optimization

## Overview

Graph traversal in Aranya can exhibit exponential time complexity when visiting ancestor segments during operations like `is_ancestor` and `get_location_from`. This document specifies a bounded-memory solution using a max-heap priority queue with in-queue deduplication, suitable for no-alloc embedded environments.

## Problem Statement

### Graph Structure

Commands in Aranya are organized into segments within a DAG. Each segment contains:
- A sequence of commands
- A `prior` field: `Prior::None`, `Prior::Single(Location)`, or `Prior::Merge(Location, Location)`
- A skip list for fast backward traversal, sorted by `max_cut` ascending: `Vec<Location>`

A `Location` identifies a command by its segment index and `max_cut`.

### Exponential Blowup

When multiple clients make concurrent changes, the graph develops merge points. Each merge acts as a "multiplication point" for traversal paths. Without deduplication, the same segment can be queued multiple times through different paths.

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

| Merge Levels | Without Deduplication | With Deduplication |
|:------------:|:---------------------:|:------------------:|
| 10           | 1,024                 | ~20                |
| 20           | 1,048,576             | ~40                |

Skip lists help mitigate this by allowing larger backward jumps. When a valid skip list entry exists, it is used *instead of* the prior locations, reducing the number of segments visited.

### Affected Operations

#### `get_location_from(start: Location, address: Address) -> Option<Location>`

Finds a command by its address, searching backward from a starting location. The algorithm:

1. Initialize a max-heap queue with `start`
2. Pop the highest `max_cut` location from the queue
3. Scan commands in the current segment for matching address
4. If not found, add the first valid skip list target to the queue if one exists, otherwise add the prior location(s); skip any with `max_cut` below the target address (too old to contain it) and deduplicate by segment
5. Repeat until found or queue exhausted

#### `is_ancestor(candidate: Location, head: Segment) -> bool`

Determines if a location is an ancestor of a given segment head. The algorithm:

1. Initialize a max-heap queue with the head segment's prior location(s) that have `max_cut >= candidate.max_cut`
2. Pop the highest `max_cut` location from the queue
3. Load the segment and check if it contains the candidate command
4. If not found, find the first skip list entry with `max_cut >= candidate.max_cut` (the lowest valid skip, which jumps furthest back); if none, add prior location(s) with `max_cut >= candidate.max_cut`
5. Deduplicate by segment before enqueuing
6. Repeat until found or queue exhausted

This operation is particularly expensive during braiding, where it is invoked O(B * S) times (B = braid size, S = active strands). Each call potentially traverses a significant portion of the graph.

#### Why These Operations Are Vulnerable

Both operations share a common pattern:
- Backward traversal from a starting point
- Queue-based exploration of prior segments
- Merge segments contribute two parent edges to the queue

Without deduplication, the number of queue operations grows exponentially with merge depth rather than linearly with segment count.

## Design Constraints

Target environments include:
- **No-alloc embedded systems**: Cannot use dynamic allocation
- **Large peer counts**: Thousands of peers (satellite constellations, drone swarms)

Key observations:
1. Branch width at any point is bounded by peer count (P), assuming well-behaved devices. Each device can only create one new branch from any given command (either via action or merge, but not both). Misbehaving devices could violate this bound.
2. Traversal proceeds backward (high `max_cut` to low `max_cut`). Processing the highest `max_cut` first bounds the queue size to the graph width at any given `max_cut` level, rather than accumulating entries across many levels as a FIFO would.

## Specification

### Location Ordering

`Location` is ordered by `max_cut` first (then by segment index as a tiebreaker). This means the max-heap naturally processes locations with the highest `max_cut` first:

```rust
#[derive(PartialEq, Eq, PartialOrd, Ord)]
pub struct Location {
    pub max_cut: MaxCut,
    pub segment: SegmentIndex,
}
```

The field ordering is critical: Rust's derived `Ord` compares fields in declaration order, so `max_cut` being first gives the desired heap behavior.

### Traversal Queue

A fixed-capacity max-heap that processes locations with the highest `max_cut` first:

```rust
pub const QUEUE_CAPACITY: usize = 512;

pub type TraversalQueue =
    heapless::binary_heap::BinaryHeap<Location, heapless::binary_heap::Max, QUEUE_CAPACITY>;
```

### Queue Helper

```rust
fn push_queue(queue: &mut TraversalQueue, loc: Location) -> Result<(), StorageError> {
    if queue.iter().any(|q| q.segment == loc.segment) {
        return Ok(());
    }
    queue
        .push(loc)
        .map_err(|_| StorageError::TraversalQueueOverflow(QUEUE_CAPACITY))
}
```

`push_queue` prevents the same segment from appearing in the queue twice, which is the primary mechanism for avoiding exponential blowup. Note that deduplication only applies to items currently in the queue: once a segment is popped and processed, a later path could re-enqueue it. In practice this is rare, especially with skip lists, and revisits produce redundant work but not incorrect results.

### Traversal Buffers

Buffers are owned by the caller and passed into traversal functions. A dual-buffer design supports nested traversals (e.g., `find_needed_segments` calling `is_ancestor`):

```rust
pub struct TraversalBuffer {
    queue: TraversalQueue,
}

impl TraversalBuffer {
    pub const fn new() -> Self {
        Self { queue: TraversalQueue::new() }
    }

    /// Returns a cleared queue ready for use.
    pub fn get(&mut self) -> &mut TraversalQueue {
        self.queue.clear();
        &mut self.queue
    }
}

/// Two independent queue buffers so that an outer traversal
/// (e.g. `find_needed_segments`) can maintain state in one buffer while
/// calling leaf operations (e.g. `is_ancestor`) that use the other.
pub struct TraversalBuffers {
    pub primary: TraversalBuffer,
    pub secondary: TraversalBuffer,
}
```

### Reference Implementation

The following Rust snippets illustrate how the data structures above are used in each traversal operation. The normative algorithm descriptions are in [Affected Operations](#affected-operations); these snippets show one concrete realization.

#### is_ancestor

```rust
fn is_ancestor(
    search_location: Location,
    segment: &Segment,
    storage: &Storage,
    buffers: &mut TraversalBuffer,
) -> bool {
    let queue = buffers.get();

    // Only enqueue priors that could contain the target
    for prior in segment.prior() {
        if prior.max_cut >= search_location.max_cut {
            push_queue(queue, prior)?;
        }
    }

    while let Some(loc) = queue.pop() {
        let segment = storage.get_segment(loc);

        if segment.get_command(search_location).is_some() {
            return true;
        }

        // Skip list is sorted by max_cut ascending, so the first entry
        // with max_cut >= target has the lowest valid max_cut, jumping
        // furthest back in the graph.
        if let Some(&skip) = segment
            .skip_list()
            .iter()
            .find(|skip| skip.max_cut >= search_location.max_cut)
        {
            push_queue(queue, skip)?;
        } else {
            for prior in segment.prior() {
                if prior.max_cut >= search_location.max_cut {
                    push_queue(queue, prior)?;
                }
            }
        }
    }
    false
}
```

Key properties:
- **Early `max_cut` filtering**: Only locations with `max_cut >= target` are enqueued, eliminating the need to load a segment before determining it's too old.
- **Skip list selection**: Uses the first skip entry with sufficient `max_cut` (which, because the list is sorted ascending, is the lowest valid `max_cut` and therefore jumps furthest back).
- **Deduplication via `push_queue`**: Prevents the same segment from appearing in the queue twice.

#### get_location_from

```rust
fn get_location_from(
    start: Location,
    target_address: Address,
    storage: &Storage,
    buffers: &mut TraversalBuffer,
) -> Option<Location> {
    if start.max_cut < target_address.max_cut {
        return None;  // Starting point is older than target
    }

    let queue = buffers.get();
    push_queue(queue, start)?;

    while let Some(loc) = queue.pop() {
        let segment = storage.get_segment(loc);

        if let Some(found) = segment.get_by_address(target_address) {
            return Some(found);
        }

        // Skip list is sorted by max_cut ascending, so the first entry
        // with max_cut >= target has the lowest valid max_cut, jumping
        // furthest back in the graph.
        if let Some(&skip) = segment
            .skip_list()
            .iter()
            .find(|skip| skip.max_cut >= target_address.max_cut)
        {
            push_queue(queue, skip)?;
        } else {
            for prior in segment.prior() {
                if prior.max_cut >= target_address.max_cut {
                    push_queue(queue, prior)?;
                }
            }
        }
    }
    None
}
```

#### find_needed_segments

This operation uses the dual-buffer pattern: `primary` for its own queue, `secondary` passed to `is_ancestor` calls:

```rust
fn find_needed_segments(
    storage: &Storage,
    buffers: &mut TraversalBuffers,
) -> Vec<Location> {
    let queue = buffers.primary.get();
    push_queue(queue, storage.get_head())?;

    let mut result = Vec::new();
    while let Some(head) = queue.pop() {
        let segment = storage.get_segment(head);
        // Process segment, calling is_ancestor with buffers.secondary...

        for prior in segment.prior() {
            push_queue(queue, prior)?;
        }
    }
    result
}
```

### Why Max-Heap Ordering Works

Processing the highest `max_cut` first has two critical properties:

1. **Bounded queue size**: At any point during traversal, the queue contains at most one entry per concurrent branch at the current `max_cut` frontier. A FIFO queue would accumulate entries across many `max_cut` levels, growing proportionally to graph depth rather than width.

2. **Effective deduplication**: While a segment is in the queue, `push_queue` prevents it from being enqueued again. Once a segment is popped and processed, a different path could re-enqueue it, but this is rare in practice — skip lists cause most backward jumps to converge on the same segments before they are popped, and the max-heap ordering means a segment is unlikely to be reached again at a lower `max_cut` via a substantially different path.

Together, these properties mean the queue serves as the primary deduplication mechanism, with no additional data structures required. Occasional revisits may occur but produce redundant work, not incorrect results.

### Capacity Sizing

The queue size at any point during traversal is bounded by the number of concurrent branches at the current `max_cut` frontier, which is bounded by peer count for well-behaved devices.

Each `Location` entry requires approximately 16 bytes (8-byte `MaxCut` + 8-byte `SegmentIndex`). With the heap's internal bookkeeping, memory usage is:

| Capacity | Memory  |
|:--------:|:-------:|
| 512      | ~8 KB   |

Two buffers (`TraversalBuffers`) use approximately 16 KB total.

### Correctness

The algorithm remains correct because:
- `push_queue` prevents redundant processing, not necessary processing. A segment is only skipped if it is already in the queue (and will be processed when popped). If a segment has already been popped and is later re-enqueued via a different path, it will be processed again — this is redundant but not incorrect.
- Queue overflow produces a clear error (`TraversalQueueOverflow`) rather than silent data loss.
- The `max_cut` filtering invariant ensures only relevant segments are visited: all enqueued locations have `max_cut >= target`, so the search space is bounded.

### Complexity

**Queue operations**:

| Aspect               | Bound                             |
|:---------------------|:----------------------------------|
| Memory               | O(CAP) - constant                 |
| `push_queue`         | O(CAP) (linear scan for dedup, then O(log CAP) heap insert) |
| `pop`                | O(log CAP)                        |

**Traversal**:

| Aspect               | Bound                             |
|:---------------------|:----------------------------------|
| Typical              | O(S * log CAP) where S = segments visited |

## Trade-offs

**Advantages:**
- Fixed memory regardless of graph size
- No dynamic allocation
- Queue handles deduplication without additional data structures
- Queue size bounded by graph width, not depth
- Correct results guaranteed
- Early `max_cut` pruning avoids loading irrelevant segments

**Disadvantages:**
- O(CAP) uniqueness check per enqueue
- Hard error on queue overflow rather than graceful degradation
- Requires capacity sized to maximum expected graph width
