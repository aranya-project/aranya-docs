---
layout: page
title: Sync Hello
permalink: "/sync-hello/"
---

# Sync Hello

## Problem

Current sync mechanisms have significant drawbacks:

1. **Polling** is inefficient when new commands are infrequent, as peers must continuously check for updates even when none exist.

2. **Push syncing** (as described in [Open Sync Requests](/docs/open-sync-requests/)) can result in sending many duplicate commands to peers. When multiple peers push the same updates, recipients may receive the same command data repeatedly, wasting bandwidth and processing resources.

We need a lightweight notification mechanism that alerts peers when new commands are available without sending the actual command data. This allows peers to control when they want to sync while avoiding both inefficient polling and duplicate command transmission.

Sync hello provides this notification approach, letting peers know when updates are available so they can decide whether to initiate a sync operation.

## Design

Sync hello implements a subscription-based notification approach where peers can subscribe to receive lightweight "hello" messages containing the current graph head whenever the sender's graph is updated. Receiving peers can compare this head with their own state to determine if they need to sync.

### Message Types

```rust
pub enum SyncHelloType {
    // Subscribe to receive hello notifications from this peer
    Subscribe {
        /// The team ID to subscribe to updates for
        team_id: TeamId,
        /// Delay in seconds between notifications to this subscriber
        /// 0 = notify immediately, 1 = 1 second delay between notifications, etc.
        delay_seconds: u64,
    },
    // Unsubscribe from hello notifications
    Unsubscribe {
        team_id: TeamId,
    },
    // Notification message sent to subscribers
    Hello {
        /// The team ID this hello applies to
        team_id: TeamId,
        /// The current head of the sender's graph
        head_id: Address,
    },
}
```

## Operation

### Subscription Management

Peers must explicitly subscribe to receive hello notifications from other peers:

1. **Subscribe**: Send a `Subscribe` message specifying the team ID and desired delay between notifications
2. **Subscription Storage**: The receiving peer stores subscription information including the subscriber's address, team ID, and delay preference
3. **Unsubscribe**: Send an `Unsubscribe` message to stop receiving notifications

### Sending Hello Messages

1. **Trigger**: A hello message is sent to subscribers whenever the local graph head changes due to:
   - Local action execution that adds new commands
   - Sync operations that incorporate new commands from peers

2. **Delay Management**: Messages are sent to each subscriber respecting their configured delay:
   - `delay_seconds: 0` - notify immediately
   - `delay_seconds: 1` - wait 1 second between notifying each subscriber
   - Higher values provide longer delays between notifications

3. **Delivery**: Hello messages are sent as fire-and-forget notifications - no acknowledgment or retry mechanism is required

### Receiving Hello Messages

1. **Head Comparison**: Upon receiving a hello message, the peer compares the received head address with their own graph state

2. **Sync Decision**: If the received head is unknown to the local graph, the peer may initiate a sync operation with the sender

### Implementation Flow

```
Setup Phase:
Peer B → Subscribe{team_id: T1, delay_seconds: 0} → Peer A
Peer A stores subscription for B with delay 0

Runtime Phase:
Peer A updates graph → New head address H1
                   ↓
    Send Hello{team_id: T1, head_id: H1} to subscribers
    (respecting delay_seconds for each subscriber)
                   ↓
              Peer B receives hello
                   ↓
           B checks if address H1 is known locally
                   ↓
        If unknown → Initiate sync with Peer A
```

## QUIC Syncer Integration

The QUIC syncer will be extended to support sync hello messages by adding `SyncHelloType` to the existing `SyncType` enum in the dispatcher.rs.

### Message Routing

Sync hello messages will be integrated into the existing `SyncType` enum:

```rust
pub enum SyncType {
    // New sync hello message type
    Hello(SyncHelloType),
}
```

### Connection Management

Sync hello messages will reuse existing QUIC connections managed by the QUIC syncer:

- **Connection Reuse**: Hello messages will leverage the existing `conns: BTreeMap<ConnectionKey, Connection>` maintained by the QUIC syncer state
- **Connection Establishment**: If no open connection exists for a peer when sending a hello message, the syncer will attempt to establish a new QUIC connection using the same mechanism as regular sync operations
- **Connection Key**: Connections are keyed by `(Addr, GraphId)`, ensuring hello messages for the same team use the same connection as regular sync operations

### Subscription Storage

The syncer must maintain subscription state for hello notifications:

```rust
struct HelloSubscription {
    /// The subscriber's network address
    subscriber_address: SocketAddr,
    /// The team ID they're subscribed to
    team_id: TeamId,
    /// Delay in seconds between notifications to this subscriber
    delay_seconds: u64,
    /// Last notification time for delay management
    last_notified: Option<Instant>,
}

// Storage: Map from (team_id, subscriber_address) to subscription details
type HelloSubscriptions = HashMap<(TeamId, SocketAddr), HelloSubscription>;
```

### Delay Management

To manage notification timing:

- **Delay Scheduling**: Track `last_notified` time for each subscriber and respect their `delay_seconds` setting
- **Batching**: If multiple graph updates occur during a subscriber's delay period, send only the latest head

## Limitations

1. **Fire-and-Forget**: No delivery guarantees or retry mechanism - peers may miss notifications if network issues occur
2. **Additional Round Trip**: Requires a separate sync operation after notification
