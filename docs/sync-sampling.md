---
layout: page
title: Sync Graph Sampling
permalink: "/sync-sampling/"
---

# Sync Graph Sampling

## Overview

A sync request carries a sample of commands the requester holds. The
responder treats each sample command it holds, and all of that
command's ancestors, as held by the requester, and sends the lowest
commands not covered.

This document specifies a sample that spreads a fixed budget across
the graph instead of packing it at the tip. It replaces the phase 3
walk in `SyncRequester::get_commands`.

## Current Algorithm

The sample is a fixed-capacity list of `COMMAND_SAMPLE_MAX` addresses
(100, or 20 with `low-mem-usage`), filled in three phases:

1. **Session heads.** When the caller keeps a transaction open across
   several requests, the commands received so far are flushed but not
   committed, so they appear in neither the storage heads nor the peer
   cache. The transaction's tips are advertised so the responder does
   not resend them.
2. **Peer cache heads.** Up to `PEER_HEAD_MAX` (10) committed commands
   the responder is known to hold.
3. **Committed heads and a backward walk.** Starting from every graph
   head, walk segments breadth-first toward the root, adding each
   segment's head command until a path reaches a peer cache head or the
   sample is full. The result is a dense window at the tip of the
   graph.

## Problem

The responder needs to locate, on each of its branches, the highest
command the requester holds. A dense window at the tip only does that
when the responder's frontier falls inside the window.

When the requester is ahead or has diverged by more than 100 segments,
no sample command above the cache exists in the responder's graph. The
responder sends everything above the highest cache head, at most
`COMMAND_RESPONSE_MAX` (100) commands per reply. Each reply's commands
are ones the requester already holds. They enter the requester's peer
cache, so the next round resumes 100 commands higher. Convergence
takes one round per 100 commands of the responder's graph.

## Goals

1. Minimize waste: commands the responder sends that the requester
   already holds.
2. Always make progress. No pair of graphs leaves the requester and
   responder stuck resending the same commands.

The design is chosen for its worst case. Most syncs are between peers
that synced recently, and any sample does well there.

## Design

This section describes what each part does and why, without the data
structures used to compute it. Implementation covers those.

### Coverage

The responder treats a command as held by the requester when it is in
the sample or peer cache, or is an ancestor of one. The responder adds
each sample command it holds to its peer cache for the requester. It
never adds commands it sent. It learns only from samples it receives,
since it cannot know whether a reply arrived.

Keeping earlier knowledge is what lets a sample that cannot hold every
head still converge. Each request sends a different random subset of
heads, and the responder's picture of the requester grows until it
covers everything.

A peer cache holds at most `PEER_HEAD_MAX` (100) heads. When a new
head would exceed that, a random existing head is evicted. Eviction
only loses knowledge, so the responder may resend that head's branch.
With more than 100 live branches the cache can thrash, evicting heads
nearly as fast as it learns them. Sync still converges, since the
random choices mean each round has some chance of progress, but it
can take many more rounds.

**Reset.** That knowledge is wrong if the requester loses commands,
for example by losing its storage, restoring a backup, or dropping a
transaction whose session heads it sent. The requester then sets
`reset` in its request, and the responder clears its peer cache for
the requester before resolving the sample.

The requester sets `reset` when any of these holds:

- **Its peer cache for the responder is empty.** That cache must not
  outlive the requester's storage, so losing storage or restoring a
  backup always empties it.
- **It received a command from the responder whose parent it does not
  have.** The responder only sends a command once it believes the
  requester holds the parent, so a missing parent means its knowledge
  is wrong.
- **It sent session heads to the responder in a transaction that
  ended without committing.** The requester marks its peer cache for
  the responder when it sends session heads, and a successful commit
  clears the mark. A dropped or failed transaction leaves it set, and
  the next request outside that transaction resets. The missing parent
  check does not cover this case when the lost commands are the tips
  of the responder's branch, since the responder then has nothing
  newer to send.

A reset that was not needed only costs one round without the
responder's earlier knowledge. A reset that is lost in transit is sent
again, since the requester clears the condition only when a reply
arrives.

### Requester Sample

The sample is filled from four sources:

1. **Session heads.** When the caller keeps a transaction open across
   several requests, the commands received so far are not committed,
   so they are in neither the graph heads nor the peer cache. Their
   tips are sent so the responder does not resend them.
2. **Peer cache heads.** Commands the responder is known to hold.
3. **Graph heads.** The requester's own heads, skipping any that are
   cache heads. The responder holds them if it is caught up.
4. **Random commands.** Commands spread between the cache heads and
   the graph heads, to find how far up the responder's graph reaches.

Session, cache and graph heads together get at most half the slots,
in that order. When a source does not fit in the slots left for
heads, add a random subset of it that fills them. Random commands get
the rest.

The reserved half keeps sync making progress. If the requester has
more heads than slots and the responder holds none of them, a sample
of only heads resolves nothing, and the responder resends from the
root. The random subset means heads left out of one request are sent
in a later one.

#### Random Commands

Random commands are placed at evenly spaced max cuts between the floor
and the tallest head, starting at a random offset.

- **Floor.** The responder holds the floor and every command below
  it, so random commands only go above it. With an empty cache the
  floor is the root. Otherwise it is the highest command, at or below
  the lowest cache head, that every graph head passes through on the
  way to the root. Every cache head descends from it, so the responder
  holds it, and every lower command is one of its ancestors.

- **Gap.** The span is the tallest graph head's max cut minus the
  floor's. The gap g is the larger of `COMMAND_RESPONSE_MAX` and the
  span divided by the slots left after the heads. Spacing tighter than
  one reply saves less than a reply.

  Even spacing keeps every gap at most span / slots, wherever the
  responder's frontier is. Geometric spacing from the tip leaves wide
  gaps deep in the graph, and when the shared history lies below the
  last random command, nothing resolves and the responder resends all
  of it.

- **Offset.** Pick r uniformly at random between g/2 and g. Starting
  at least g/2 below the tallest head avoids a random command that
  nearly duplicates the head. A random offset means repeated rounds
  pick different commands.

- **Positions.** The positions are tallest head - r, then down by g,
  while above the floor. For each position t, pick a random head with
  max cut at least t and walk back from it to the command at max cut
  t. At a merge, step to a random parent with max cut at least t. Add 
  the command found, unless already added.

  The random choices mean a branch skipped in one round is sampled in
  a later one.

### Responder Sample

The requester's random commands can all miss. Each follows a random
branch, and on a graph with long unmerged branches they can all land
on branches the responder does not hold. The responder then sends
from the root, and every command below the real overlap is one the
requester already has.

So the responder also samples. If more remains uncovered than fits in
one reply, it samples its own graph the same way and attaches the
sample to the reply. Random commands that land on commands in the
reply are dropped, since the requester will hold them. The sample
counts against the reply's size limit.

The requester processes the reply's commands, then looks up each
sample address in its own graph and adds the ones it holds to its
peer cache. 

A send that needs more than one reply already takes several rounds,
so the responder's sample adds no round trip. With both sides sampling,
each round trip searches both graphs for the overlap instead of one.

## Implementation

### Head Set LCA

The head set stores the LCA of its heads. For a single head it is the
head. Committing more than one head braids them to rebuild the fact
cache, and the braid computes their LCA, so the commit saves it with
the head set.

### Floor Walk

The floor is found by walking down from the graph heads' LCA using
skip lists. Let D be the lowest max cut among the cache heads.

```rust
fn floor(lca: Command, cache: &PeerCache) -> Command {
    let Some(d) = cache.heads().map(max_cut).min() else {
        return root();
    };
    let mut c = lca;
    while max_cut(c) > d {
        c = match lowest_skip_at_or_above(c, d) {
            Some(s) => s,
            None if is_merge(c) => merge_lca(c),
            None => prior(c),
        };
    }
    c
}
```

Every command this walk visits is one that every head passes through
on the way to the root. The heads' LCA is one, a merge's LCA is one for
the merge, and skip-list entries are built only from these and single
priors. Such a command is the only command at its max cut, so each
jump lands where the graph is one command wide, and the walk never
needs to search side branches.

Coloring ancestors of the cache heads would find a higher floor in
some graphs, but it can walk the whole graph when any uncovered path
reaches the root.

### Random Command Walk

```rust
fn random_command(
    heads: &[Command],
    t: MaxCut,
    rng: &mut impl Csprng,
) -> Command {
    let mut c = random(rng, heads.iter().filter(|h| max_cut(h) >= t));
    while max_cut(c) > t {
        c = match lowest_skip_at_or_above(c, t) {
            Some(s) => s,
            None => random(rng, parents(c).filter(|p| max_cut(p) >= t)),
        };
    }
    c
}
```

Both walks operate on segments. A skip or prior step moves to a
segment, and the walk ends in the segment whose range contains the
target, taking the command there.

### Cost

Building a sample reads the head set and the peer cache, walks from
the graph heads' LCA to the floor in a few skip-list jumps, then takes
a few skip-list jumps per random command, at most
`COMMAND_SAMPLE_MAX` of them. Random commands span only the region
above the floor, so a responder one or two commands behind gets a
sample of heads only.

## Changes

- Generalize the `skip_jump` in `responder.rs` so the requester can
  walk a path to a target max cut. At a merge with no usable skip it
  picks a random parent with max cut at least the target, and it
  returns the command at the target rather than a segment at or above
  it.
- Raise `PEER_HEAD_MAX` to 100. When the peer cache is full, evict a
  random head instead of dropping the new one.
- Limit heads to half of `COMMAND_SAMPLE_MAX`, session heads, then
  cache heads, then graph heads, choosing a random subset when they
  exceed it.
- Store the heads' LCA in `HeadSet`, saved from the braid on a
  multi-head commit and set to the head for a single head.
- Replace the phase 3 walk in `get_commands` with the random commands.
- In the responder, treat the heads of its peer cache for the
  requester as covered in `find_needed_segments`.
- Add a `reset` flag to the sync request. The requester sets it when
  its peer cache for the responder is empty, after a reply from the
  responder fails with `ClientError::NoSuchParent`, or when it sent
  session heads to the responder in a transaction that ended without
  committing. The responder clears its peer cache for the requester
  before resolving the sample.
- Add a mark to `PeerCache`, set when session heads are sent to that
  peer and cleared when the transaction commits.
- Add a sample of addresses to the sync reply. The responder fills it
  when the uncovered region has more commands than fit in the reply,
  with its heads and random commands above the floor from its peer
  cache for the requester, and leaves it empty otherwise.
- In the requester, resolve a reply's sample and add the commands it
  holds to the peer cache.
- Give the responder a random source, as the requester already has.
