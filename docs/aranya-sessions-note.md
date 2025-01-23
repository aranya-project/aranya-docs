---
layout: page
title: Aranya Sessions
permalink: "/aranya-sessions/"
---

# Aranya Sessions Design Note

## Rationale
It is sometimes useful to leverage the strong security guarantees provided by the existing Aranya graph without incurring the costs of storing additional data on-graph. We therefore need a mechanism that can evaluate policy commands locally at the current "perspective" in the graph. We call this mechanism an Aranya Session - that processes 'ephemeral' commands as we would normal commands, but where data is only temporarily stored in memory and will be lost after restarting the application or power cycling hardware.

This is useful, for example, when creating a potentially lighter-weight protocol or an [Aranya Fast Channel (AFC)](afc.md), where only the two channel endpoints may require specific session data. If this were on-graph, all nodes would have to pay the cost of syncing and storing the data, which can be extremely costly depending on the amount of data and the number of nodes involved.

## Challenges
Any data that affects the persistent fact database *must* be on-graph; therefore, while we can update the facts in a session, it is not possible to have those changes persist.

## Design
At its highest level, an Aranya Session is just a perspective that cannot be committed to the graph.

Additionally, the order of commands is defined by the order that they're added to the perspective, instead of being ordered by the graph resolving various commands (see the [Weave Function](graph.md#weave-function) for details on how we end up with eventual consistency). Because of this, commands added to an Aranya Session's perspective don't require a parent field, although for simplicity our initial implementation may retain this feature.

To make use of this session perspective, some additional changes to the API will be required.

### Add Command
The Aranya Client currently can only accept new commands via `sync_receive()` or by calling  `action()`. This leaves us with no easy way to add commands from a remote device to a session perspective. To fix this, we should add a `session_receive()` method to the Aranya Client that attempts to add a command to a session perspective.

### Session Sinks
Other Aranya Client APIs take a `Sink` which contains a callback returning an `Effects`, so Session Sinks must also contain a callback to return commands. This is strictly required for `Actions` on a session as any generated commands will not be added to the graph. It will also be useful for indicating success for adding commands received from remote parties.
