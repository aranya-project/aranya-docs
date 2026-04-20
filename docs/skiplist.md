---
layout: page
title: Skip List
permalink: "/skip-list/"
---

# Skip List

## Max Cut

The maximum cut of a command is the maximum number of steps it takes to get from a command to the root. The init command is the root and has a max cut of 0. The max cut of a command is one
more than the maximum max cut of the parent commands.

Here are the max cuts for the Init command, a command with a single parent, and a
merge command with two parents.

```
Init: 0
Single(p): max_cut(p) + 1
Merge(l, r): max(max_cut(l), max_cut(r)) + 1
```

## Skip List

A skip list allows O(m log n) average complexity for finding commands.
Where m is the average number of branches at a given max cut and n is the
number of segments in the graph. Typically m should be less than 2.

Each segment will have skips to segments further towards the root of the
graph. A skip is a reference to a segment.

A skip can't jump into a branch. If this was allowed we'd have to backtrack
to find missed branches. A skip can jump back to the last merge
command and it can jump over the branches to a common ancestor. In the
following graph segment Segment(I, J) could jump to Segment(A, B, C), but it
could not jump to Segment(D, E, F), or Segment(G, H). Segment(D, E, F) could
jump to Segment(A, B, C).

Each merge command will have a skip to the last common ancestor. So Segment(I, J)
will have a skip to Segment(A, B, C).

### Example

```
                   D(3) - E(4) - F(5)
                  /                  \
A(0) - B(1) - C(2)                    I(6) - J(7)
                  \                  /
                       G(3) - H(4)
```

```rust
struct Segment {
    low_max_cut: usize,
    high_max_cut: usize,
    items: Vec<Command>
    skip_elements: Vec<Segment>
}

Segment {
    max_cut: 6,
    items: [I, J]
    skip_segments: [
        Segment {
            max_cut: 0,
            items: [A, B, C],
            skip_segments: [],
        },
    ]
},
```

## Skip List Construction

### Skip Targets

For all segments, skip entries are placed at exponentially-spaced
distances from the current max cut toward the root:

```
N/2, 3N/4, 7N/8, 15N/16, ...
```

This continues until the gap between the current position and the next
target is less than or equal to MIN_SKIP_GAP (10). For a segment at
max cut N, this produces approximately log2(N/10) skip entries:

```
N = 100:    entries at 50, 75, 87, 93 (4 entries)
N = 1000:   entries at 500, 750, 875, 937, 968, 984, 992 (7 entries)
N = 10000:  entries at 5000, 7500, 8750, ... (10 entries)
N = 1000000000: approximately 27 entries
```

### Merge Segments

Merge segments use the same exponentially-spaced targets as non-merge
segments, but the walk to find them starts from the least common
ancestor (LCA) instead of the parent. Targets above the LCA's max cut
are in a branch and naturally unreachable during the walk, so they
are skipped. The LCA is always included in the skip list even if the
sparse check (below) determines no other entries are needed.

### Sparse Construction

Not every segment needs a skip list. Before constructing one, check
whether any ancestor within MIN_SKIP_GAP (10) segments already has a
non-empty skip list. If so, skip construction entirely and write an
empty skip list. Merge segments count as having a skip list since
they always contain the LCA. For merge segments where the sparse check
says no skip list is needed, the LCA is still included as the sole
entry.

This means approximately 1 in 10 segments builds a skip list. The other
9 rely on a nearby ancestor's skip list, reachable within at most 10
prior steps.

### Finding Skip Targets

Skip targets are found by walking backwards in a single pass. For
non-merge segments the walk starts from the parent. For merge segments
the walk starts from the LCA. The walk uses existing skip lists on
intermediate segments to jump when possible:

1. Compute all target max cuts (N/2, 3N/4, 7N/8, ...).
2. Walk backwards from the start point, using skip entries that stay
   at or above the lowest remaining target.
3. As each target boundary is crossed, record the segment's first
   location as a skip entry.
4. Stop when all targets are collected.

On a graph with well-formed skip lists, this walk takes O(log n) steps
since intermediate segments have their own skip entries that allow
jumping. The walk visits each segment at most once.
