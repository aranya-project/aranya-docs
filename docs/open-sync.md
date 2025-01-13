---
layout: page
title: Open Sync Requests
permalink: "/open-sync-requests/"
---

## Problem

We currently sync by polling. This can be very inefficient when new commands
are infrequent. We want to allow for pushing new commands to peers. This
will significantly reduce the overhead of syncing.

## Design

Syncing needs to work over many network protocols. We don't want to rely on
anything beyond being able to send a payload of bytes. So the different
sync calls will be distinguished by an enum value.

```rust
pub enum SyncType {
    // The existing sync type. This will include a sync request and be
    // immediately responded to with a sync response.
    Poll {
        request: SyncRequestMessage,
    },
    // Subscribes the peer to receive push syncs from this peer. Calling this
    // again will update remain_open and max_bytes for this peer.
    Subscribe {
        // The number of seconds the sync request will remain open.
        remain_open: u64,
        // The maximum number of bytes that should be sent.
        max_bytes: u64,
        // A sample of the peer's graph. This will be used to update the
        // known heads for the peer.
        commands: Vec<Address, 100>
    },
    // Removes any open subsciptions for the peer. If there is no subscription
    // this will be a noop.
    Unsubscribe,
    // This will only be sent to peers who have an open subscription.
    // Contains any new commands that come after the peer's known heads.
    Push,
}

pub enum SyncTypeError {
    MaximumSubscriptionsExceeded,
}
```

### Subscribe

The following data is stored for each open subscription. Each peer can have at
most one open subscription.

```rust
struct Subscription {
    // The time to close the request. The subscription should be closed when the
    // time is greater than the close time.
    // Calculated by adding remain open seconds to the time when the
    // request was made.
    close_time: SystemTime
    // The number of remaining bytes to send. Every time a Push request is
    // sent this will be updated with the number of bytes sent.
    remaining_bytes: u64,
}

// FnvIndexMap requires that the size is a power of 2.
const MAXIMUM_OPEN_REQUESTS: usize = 128
```

Open subscriptions will be stored in a `heapless::FnvIndexMap` with a maximum size of
`MAXIMUM_OPEN_REQUESTS`. If there are more than `MAXIMUM_OPEN_REQUESTS`, new requests
will be ignored, and a `MaximumSubscriptionExceeded` error will be returned.

### Unsubscribe

Closes the open subscription by removing it from the subscriptions map.

### Push

Every time a new command is committed to the graph a push will be sent to
each peer with an open request, and the bytes sent and stored heads for the
peer will be updated based on the commands that were sent.

A callback will be added to `ClientState` that is called after
`ClientState::action` and `ClientState::commit`. This callback will be
responsible for sending the `Push` to all subscribed peers.

### Quic Syncer

`open_subscriptions` will be stored in a `heapless::FnvIndexMap`.

#### Receiving requests

`run_syncer` will match the `SyncType` and route the requests.

`SyncType::Poll` will be routed to the existing `handle_connection` function.
`SyncType::Subscribe` will add or update `open_requests`.
`SyncType::Unsubscribe` will remove a key from `open_subscriptions` if it exists.
`SyncType::Push` will call `syncer.receive` with the provided commands.
