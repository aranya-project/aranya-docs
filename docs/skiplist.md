---
layout: page
title: Skip List
permalink: "/skip-list/"
---

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
graph. A skip is a reference to a segment. When a segment is created we will
randomly generate three different max cuts that are less than the new segment's
max cut. The segment will then have skips to segments with matching max cuts.
This will usually result in three skips, but it can be less if two different
max cuts reference the same segment.

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

### Search algorithm
Search will start at the head of the graph. If the max cut of the command is within
the head segment that segment will be checked. If the command is found it will be
returned. If the command is not found, the skip segment with lowest low_max_cut that is
>= to the command's max cut will be checked. If there is no skip segment to check
the segments parent will be checked. If a merge command is reached both
parent segments will be added to the list of heads. The algorithm will then be
repeated with all of the added heads.

This will result in quickly skipping deeply into the graph. When the search gets
close and can no longer skip it'll fall back to checking segments and if a
segment is reached whose low_max_cut is less than the commands max cut, then the
search will back up and continue from a previous head.

```rust
fn locate(id: Id, max_cut: usize) -> Some(Command) {
    heads = [head.segment];
    'outer: while let Some(head) = heads.pop() {
        if head.high_max_cut < max_cut {
            // we are too far back
            continue;
        }
        if head.low_max_cut <= max_cut {
            let command = head[max_cut - head.low_max_cut];
            if command.id == id {
                return Some(command);
            }
            continue;
        }
        // Assumes this is in ascending order
        // Find the lowest skip that is not "below" the max_cut
        for segment in head.skip_segments {
            if segment.high_max_cut >= max_cut {
                heads.push(segment);
                continue 'outer;
            }
        }
        heads.extend(head.parents());
    }
    None
}
```
