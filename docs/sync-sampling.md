---
layout: page
title: Sync Graph Sampling
permalink: "/sync-sampling/"
---

# Sync Graph Sampling

## Overview

A sync request carries a sample of commands the requester holds. The
responder resolves each sample command in its own graph, treats it and
all of its ancestors as held by the requester, and sends the lowest
uncovered segments. The sample, together with what the responder has
learned from earlier samples, decides how much the responder sends
that the requester already has.

This document specifies a sampling algorithm that spreads a fixed
budget across the graph. It replaces the phase 3 walk in
`SyncRequester::get_commands`. When the requester's sample leaves more
to send than fits in one reply, the responder runs the same algorithm
over its own graph and returns a sample alongside the commands.

## Current Algorithm

The sample is a fixed-capacity list of `COMMAND_SAMPLE_MAX` addresses
(100, or 20 with `low-mem-usage`), filled in three phases:

1. **Session heads.** When the caller keeps a transaction open across
   several requests, the commands received so far are flushed but not
   committed, so they appear in neither the storage heads nor the peer
   cache. The transaction's tips are advertised so the responder does
   not resend them.
2. **Peer cache heads.** Up to `PEER_HEAD_MAX` (10) committed commands
   the peer is known to hold.
3. **Committed heads and a backward walk.** Starting from every graph
   head, walk segments breadth-first toward the root, adding each
   segment's head command until a path reaches a peer cache head or the
   sample is full.

Phase 3 fills the sample with the most recent segment heads above the
cache: a dense window at the tip of the graph.

## Problem

The responder needs to locate, on each of its branches, the highest
command the requester holds. A dense window at the tip only does that
when the peer's frontier falls inside the window.

When the requester is ahead or has diverged by more than 100 segments,
no sample command above the cache exists in the peer's graph. The
responder sends everything above the highest cache head, at most
`COMMAND_RESPONSE_MAX` (100) commands per reply, which can span up to
100 segments. Each reply's commands are ones the requester already
holds. They enter the requester's peer cache, so the next round resumes
100 commands higher. Convergence takes one round per 100 commands of
the peer's graph.

## Goals

1. Minimize waste: commands the responder sends that the requester
   already holds.

## Algorithm

Inputs: the graph's heads, their saved LCA (see Head Set LCA), and the
peer cache. Budget: `COMMAND_SAMPLE_MAX` slots. The sample contains
only committed commands. Session heads are not sent.

1. **Anchors.** Anchors get at most half the slots. Add cache heads
   first, then graph heads, skipping graph heads that equal a cache
   head. When a group does not fit in the remaining anchor slots, add a
   random subset of it that fills them. Probes get the other half plus
   any anchor slots left unused.

   Anchors confirm overlap the requester already knows about. Probes
   find overlap it does not. Without reserved probe slots, two peers
   whose heads fill the sample and are unknown to each other never
   find their shared history, and the responder resends it from the
   root.

2. **Floor.** The floor is a command the peer holds such that
   everything we hold below it is one of its ancestors, so probes only
   cover the region above it. With an empty cache the floor is the
   root. Otherwise let D be the max cut of the deepest cache head.
   Walk back from the heads' LCA to the highest command on its path at
   or below D: take the lowest skip-list entry at or above D when one
   exists, step to the prior on a single-parent segment, and at a
   merge with no usable skip, step to the merge's LCA. Stop at the
   first command at or below D.

   Every point on this path is a command that every head passes
   through on the way to the root: the heads' LCA is one, a merge's LCA
   is one for the merge, and skip-list entries are built only from
   these and single priors. So every path from a head to a cache head
   continues through the floor, and the floor is at or below each
   cache head on it. The peer holds every cache head, so it holds the
   floor and all of its ancestors.

   The walk is a few skip-list jumps. When the requester is one or two
   commands ahead of the cache, the floor is just below the tip, the
   span is too small for a probe, and the sample is only anchors.

3. **Gap.** The span is the tallest head's max cut minus the floor's.
   The gap g is the larger of `COMMAND_RESPONSE_MAX` and the span
   divided by the free slots. Spacing tighter than one message saves
   less than a message.

   Spacing is even rather than geometric from the tip. Geometric
   spacing leaves wide gaps deep in the graph, and when the shared
   history lies below the last probe, nothing resolves and the
   responder resends all of it. Even spacing keeps every gap at most
   span / slots.

4. **Offset.** Pick r uniformly at random between g/2 and g. Starting at
   least g/2 below the tallest head avoids a probe that nearly
   duplicates the head anchor. A random offset means repeated rounds
   probe different commands.

5. **Probes.** Positions are tallest head - r, then down by g, while
   above the floor. For each position t:
   - Eligible heads are those with max cut at least t.
   - Pick one at random, so a branch skipped this round is probed in a
     later one, and walk back to max cut t. Take the lowest skip-list
     entry at or above t when one exists. Otherwise step to a prior: at
     a merge, pick at random among the parents with max cut at least t;
     one always exists, since a merge's max cut is one more than its
     higher parent. Stop at the segment whose range contains t and take
     the command at t.
   - Add the command found, unless already added.

## Head Set LCA

The head set stores the LCA of its heads. For a single head it is the
head. Committing more than one head braids them to rebuild the fact
cache, and the braid computes their LCA, so the commit saves it with
the head set.

## Responder Sample

The requester's probes can miss the overlap. Every probe picks a random
head, and on a graph with long unmerged branches the probes can all
land on branches the responder does not hold. The responder then sends
from the root, and every command below the real overlap is one the
requester already has.

### Trigger

After resolving the requester's sample, the responder computes the
uncovered region: commands in its graph that are not covered (see
Responder Coverage). If the region is larger than one reply, the
responder attaches a sample to the reply. A large send already spans
several rounds, so the sample adds no round trip.

### Contents

The responder runs steps 3 through 5 over its own graph with the root
as the floor, and its own heads as anchors under the same half-slot
limit as step 1. Probes that
land on commands included in this reply are dropped, since the
requester will hold them after processing it. The sample counts
against the reply's size limit, so a reply that carries one has less
room for commands.

### Requester handling

The requester processes the reply's commands, then looks up each sample
address in its own graph and adds the ones it holds to the peer cache.
They become candidates for the next request's anchors.

## Responder Coverage

The responder records each resolved sample command in its peer cache
for the requester. It treats the ancestors of that cache's heads as
covered, along with the current sample. Anchors left out of one
request still count if an earlier request sent them.

## Cost

Building a sample reads the head set and the peer cache, walks from
the heads' LCA to the floor in a few skip-list jumps, then takes one
skip-list jump per probe, at most `COMMAND_SAMPLE_MAX`. Probes span
only the region above the floor, so a peer one or two commands behind
gets a sample of anchors only.

## Changes

- Generalize the `skip_jump` in `responder.rs` so the requester can
  walk a path to a target max cut. At a merge with no usable skip it
  picks a random parent with max cut at least the target, and it
  returns the command at the target rather than a segment at or above
  it.
- Stop sending session heads in the sample.
- Remove `PEER_HEAD_MAX`. The peer cache has no size limit.
- Limit anchors to half of `COMMAND_SAMPLE_MAX`, cache heads before
  graph heads, choosing a random subset when they exceed it.
- Store the heads' LCA in `HeadSet`, saved from the braid on a
  multi-head commit and set to the head for a single head.
- Replace the phase 3 walk in `get_commands` with steps 2 through 5.
- In the responder, treat the heads of its peer cache for the
  requester as covered in `find_needed_segments`.
- Add a sample of addresses to the sync reply. The responder fills it
  when the uncovered region has more commands than fit in the reply,
  using sampling steps 3 through 5 from the root, and leaves it empty
  otherwise.
- In the requester, resolve a reply's sample and add the commands it
  holds to the peer cache.
- Give the responder a random source, as the requester already has.
