---
layout: page
title: Sync
---

# Sync

## Problem

We want to minimize the size of sync requests while not sending
more duplicate commands than necessary.

## Limitations

Sync requests should have a fixed maximum size. This size can be adjusted based
on network characteristics. If sending data is slow or expensive while receiving
data is fast then smaller sync requests should be used.

The minimum number of round trips should be used.

## Design

### Definitions

Command: Each command has 0-2 parent commands. Since multiple peers can be
creating commands simultaneously this leads to branches. When additional branches
are synced they will be merged. Thus all known commands can be represented as a
tree with a single leaf node.

The init command has 0 parents. Merge commands have 2 parents. All other
commands have 1 parent.

```
// The ID of a command
ID

struct Command {
    left ID
    right ID
    id ID
}

// shortHash uniquely identifies a command.
shortHash [16]byte
```

Ancestor: CommandA is an ancestor of commandC if it can be reached by
following commandC's parents.

```
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}
```

In this example A is an ancestor of C since you can follow C to B and
B to A.

```
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}
Command{left: A, right: nil, id: D}
Command{left: C, right: D, id: E}
```

In this example D is not an ancestor of C. But, B and C are both ancestors of E.

Command Window: The range of commands from which a command to be sent will be
chosen. If there were 1000 commands with 100 equal sized command windows then
a command would be chosen from commands 1-10, 11-20, 21-30, etc. Commands
are randomly chosen to prevent falling into a local minima where the
same set of duplicate commands are sent each time. The randomness will
ensure that eventually new commands will be sent.

### Sync algorithm

1. Peer1 sends a series of command hashes in weave order.
2. Peer2 finds all of the commands that it has in common with Peer1.
3. Peer2 sends all commands that are not ancestors of the common commands.

#### Sync Examples

```
Peer1
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}

Peer2
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}
Command{left: C, right: nil, id: D}
```

1. Peer1 sends A and C.
2. Peer2 finds A and C as common commands.
3. Peer2 sends D.

This will sometimes lead to duplicate commands being sent. For our use case
it's better to send some duplicate commands in order to keep the sync
request size small and minimize round trips.

```
Peer1
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}

Peer2
// branch 1
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}
Command{left: C, right: nil, id: D}

// branch 2
Command{left: A, right: nil, id: E}
Command{left: E, right: nil, id: F}
Command{left: F, right: nil, id: G}

// merge command
Command{left: D, right: G, id: H}
```

1. Peer1 sends A and C.
2. Peer2 finds A and C as common commands.
3. Peer2 sends D, E, F, G, and H.

```
Peer1
// branch 1
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}

// branch 2
Command{left: A, right: nil, id: E}

// merge command
Command{left: C, right: E, id: I}

Peer2
// branch 1
Command{left: nil, right: nil, id: A}
Command{left: A, right: nil, id: B}
Command{left: B, right: nil, id: C}
Command{left: C, right: nil, id: D}

// branch 2
Command{left: A, right: nil, id: E}
Command{left: E, right: nil, id: F}
Command{left: F, right: nil, id: G}

// merge command
Command{left: D, right: G, id: H}

1. Peer1 sends B, E, and I.
2. Peer2 finds B and E as common commands.
3. Peer2 sends C, D, F, G, and H.
```

### Design challenges

No algorithm will be best for all situations. The goal is to keep the command
windows small in the range where differences are expected. If there are a
great number of peers that rarely sync then equal sized windows would be best.

Generally peers will sync somewhat regularly and over time most of the history
will be shared. Because of this, the command windows should be smaller towards
the end of the weave where differences are expected.

### Detailed design

The peer receiving the sync request doesn't need to know how the commands it
receives were chosen. Because of this the peer initiating the request can
change the number of commands or how they're chosen based on network conditions.
The specific numbers in this section are for a general default algorithm, but
other algorithms should be supported for varying conditions.

A sync request will contain a maximum number of hashes that will be configurable
based on the network conditions. This should generally be a small subset of
the total number of commands. In the following design I use 100 commands as
the default. These numbers will be adjustable.

A sync request will contain a maximum of 100 short hashes. This will result
in a maximum of 1600 bytes of command hashes in each sync request. Less than 100
commands may be sent if 100 are not needed or for performance reasons.

The last command will always be sent.

Command window:
Command windows will look at commands in reverse weave order. Starting before the
last command, the first 20 windows will be 2n from the previous window.
2-3, 4-7, 8-13, ..., 381-421

The next 79 windows will be equally divided among the remaining commands with a
minimum window size of 50 commands. Any remaining commands will go in
the final window.

Commands will be randomly chosen from the command window.  Merge commands
will be chosen first. A random non merge command will be
chosen within the window. In there are no merge commands a random non merge
command will be chosen.

The sync request will contain up to MaxResp bytes of data. The peer requesting
sync will specify the MaxResp size. Commands will be sent in order. This means
a command will not be sent unless its parent command has been already sent.

### Performance

If a given team has one reader and one writer the writer will never have to
send extra commands because the reader's last command will always be known
to the reader. If the writer initiates a sync the reader will regularly
send unnecessary commands.

With a large number of commands and no knowledge of peer's state extra
commands will almost always be sent. The number of extra commands will
depend on the size of the command windows and the graph structure.

### Optimizations

When the weave gets extremely large the command windows will inevitably grow
large. If there are 1,000,000 commands then the command windows will be
10000 commands which could result in 20000 unnecessary commands being sent.

#### Last known command

We will store the last known command for each peer. When sending a sync request
this command will always be sent. No commands will be sent which are ancestors
of the stored command.

The last known command will be the command with the highest max cut that we
know the peer has. We will update the last known command when receiving a sync
request or a sync response.

The last known commands will be stored in memory. And can be recreated after
a restart.
