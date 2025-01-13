---
layout: page
title: Aranya Sessions Design Note
---

# Aranya Sessions Design Note

## Rational
We would like to allow off graph data to be evaluated by policy at some perspective in the graph. This will be useful for session oriented APIs such as AFC and the light-weight-protocol.

These off graph protocols allow us to leverage the strong trust built in the graph at a lower cost than storing the data on graph. Storing on graph is costly especially for data that is not relevant to all nodes because the graph is distributed to all nodes. For example, AFC supports point to point communication and only the two end points require the session data.

## Challenges
Any data which effects the persisted fact database must be on the graph, therefore while we can update the facts in a session it is not possible to persist those changes.

## Design
At the highest level an Aranya Sessions is just perspectives which can not be committed.

In addition, the order of commands is defined by the order that they are added to the perspective instead of graph ordering. Because of this commands added to a Session Perspective need not have a parent field, though for simplicity our initial implementation may retain this feature.

To make use of this Session Perspective some additional changes to the API will be required.

### Add Command
The Aranya Client currently can only accept new commands via `sync_receive()` or by calling  `action()`. This leaves us with no easy way to add commands from a remote device to a session perspective. To fix this we should add an `add_command()` method to the Aranya client that attempts to add a command to a session perspective.


### Session Sinks
Other Aranya Client APIs take `Sink` which contains a call back to return `Effects`, Session Sinks must also contain a call back to return commands. This is strictly required for `Actions` on a session as any generated commands will not be added to the graph. It will also be useful for indicating success for adding commands received from remote parties.
