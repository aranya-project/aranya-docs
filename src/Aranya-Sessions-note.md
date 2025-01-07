---
title: Aranya Session Design Notes
taxonomy:
    category: docs
---

## Rationale
It is sometimes useful to be able to use the strong trust provided by the existing graph without having to pay the costs of storing additional data on-graph. We therefore need a mechanism that can evaluate policy locally at a specific "perspective" in the graph, which we call an Aranya Session. This is an 'ephemeral' session that allows us to process commands as we would normally, but whose data will be lost afterwards.

This is useful, for example, when creating a potentially lighter-weight protocol or an [Aranya Fast Channel (AFC)](afc.md), as only a few endpoints may require specific session data. If this were on-graph, we would have to pay the cost of propagating this to all other nodes, which can be extremely costly depending on the amount of data and the number of nodes involved.

## Challenges
Any data that affects the persistent fact database *must* be on-graph; therefore, while we can update the facts in a session, it is not possible to have those changes persist.

## Design
At its highest level, an Aranya Session is just a perspective that cannot be committed to the graph.

Additionally, the order of commands is defined by the order that they're added to the perspective, instead of being ordered by the graph resolving various commands. Because of this, commands added to an Aranya Session's perspective don't require a parent field, although for simplicity our initial implementation may retain this feature.

To make use of this session perspective, some additional changes to the API will be required.

### Add Command
The Aranya Client currently can only accept new commands via `sync_receive()` or by calling  `action()`. This leaves us with no easy way to add commands from a remote device to a session perspective. To fix this, we should add an `add_command()` method to the Aranya Client that attempts to add a command to a session perspective.

### Session Sinks
Other Aranya Client APIs take a `Sink` which contains a callback returning an `Effects`, so Session Sinks must also contain a callback to return commands. This is strictly required for `Actions` on a session as any generated commands will not be added to the graph. It will also be useful for indicating success for adding commands received from remote parties.