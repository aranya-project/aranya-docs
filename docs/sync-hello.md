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

Additionally, peers can be configured to send hello notifications to specified peers without requiring those peers to subscribe to hello notifications first. This configuration-based approach allows peer A to automatically notify peer B based on local settings.

### Message Types

```rust
pub enum SyncHelloType {
    // Subscribe to receive hello notifications from this peer
    Subscribe {
        /// The team ID to subscribe to updates for
        team_id: TeamId,
        /// Minimum delay in milliseconds between notifications to this subscriber
        /// 0 = notify immediately, 1 = 1 millisecond delay between notifications, etc.
        delay_milliseconds: u64,
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

There are two ways peers can be subscribed to receive hello notifications:

#### Subscribe to Hello Notifications
Peers can subscribe to hello notifications over the network from other peers:

1. **Subscribe**: Send a `Subscribe` message specifying the team ID and desired delay between notifications
2. **Subscription Storage**: The receiving peer stores subscription information including the subscriber's address, team ID, and delay preference
3. **Unsubscribe**: Send an `Unsubscribe` message to stop receiving notifications

#### Hello Subscriptions
Peers can be configured to send hello notifications to specified peers:

1. **Configuration**: Each peer's client has a `hello_interval_milliseconds` setting that defines the default delay for hello subscriptions
2. **Hello Subscription API**: Peers can use a local API to add hello subscriptions for specific peers.

#### Subscription Precedence
- All subscriptions are stored in the same way, regardless of how they were created
- Any new subscription (whether from hello subscription API or Subscribe message) replaces any existing subscription for that peer and team
- Unsubscribing removes the subscription for that peer and team, regardless of how it was originally created

### Sending Hello Messages

1. **Trigger**: A hello message is sent to subscribers whenever the local graph head changes due to:
   - Local action execution that adds new commands
   - Sync operations that incorporate new commands from peers

2. **Delay Management**: Messages are sent to each subscriber respecting their configured delay:
   - `delay_milliseconds: 0` - notify immediately
   - `delay_milliseconds: 1` - wait 1millisecond between notifying each subscriber
   - Higher values provide longer delays between notifications

3. **Delivery**: Hello messages are sent as fire-and-forget notifications - no acknowledgment or retry mechanism is required

### Receiving Hello Messages

1. **Head Comparison**: Upon receiving a hello message, the peer compares the received head address with their own graph state

2. **Sync Decision**: If the received head is unknown to the local graph, the peer may initiate a sync operation with the sender

### Implementation Flow

```
Setup Phase:
Peer B → Subscribe{team_id: T1, delay_milliseconds: 0} → Peer A
Peer A stores subscription for B with delay 0

Runtime Phase:
Peer A updates graph → New head address H1
                   ↓
    Send Hello{team_id: T1, head_id: H1} to subscribers
    (respecting delay_milliseconds for each subscriber)
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
    /// The graph ID they're subscribed to
    team_id: GraphId,
    /// Delay in milliseconds between notifications to this subscriber
    delay_milliseconds: u64,
    /// Last notification time for delay management
    last_notified: Option<Instant>,
}

// Storage: Map from (team_id, subscriber_address) to subscription details
type HelloSubscriptions = HashMap<(GraphId, SocketAddr), HelloSubscription>;
```

### Hello Subscription API

The daemon will expose a local API for managing hello subscriptions (separate from the network-based sync hello messages):

```rust
// Local API calls (in aranya repo, not aranya-core)
pub struct HelloSubscriptionRequest {
    /// The peer's network address to notify
    peer_address: SocketAddr,
    /// The team ID to send notifications for
    team_id: GraphId,
}

// API methods
impl SyncHelloManager {
    /// Add a hello subscription using the client's hello_interval_milliseconds delay
    pub fn add_hello_subscription(&mut self, request: HelloSubscriptionRequest) -> Result<()>;
    
    /// Remove a hello subscription
    pub fn remove_hello_subscription(&mut self, request: HelloSubscriptionRequest) -> Result<()>;
    
    /// List all current hello subscriptions
    pub fn list_hello_subscriptions(&self) -> Vec<HelloSubscriptionRequest>;
}
```

### Configuration

The client configuration will be extended to support sync hello settings via the `ClientBuilder`:

```rust
// Client-side configuration
let client = Client::builder()
    .daemon_uds_path("/var/run/aranya/uds.sock".as_ref())
    .aqc_server_addr(&(Ipv4Addr::UNSPECIFIED, 1234).into())
    .hello_interval_milliseconds(30) // Global interval for hello subscriptions
    .connect()
    .await?;
```

If `hello_interval_milliseconds` is not set, it will default to 1 millisecond.

### Delay Management

To manage notification timing:

- **Delay Scheduling**: Track `last_notified` time for each subscriber and respect their `delay_milliseconds` setting
- **Hello Subscriptions**: Use the client's `hello_interval_milliseconds` setting as the delay when creating subscriptions via the local API
- **Subscribe to Hello Notifications**: Use the `delay_milliseconds` value from the Subscribe message
- **Replacement**: Any new subscription replaces the existing one with the new delay value
- **Batching**: If multiple graph updates occur during a subscriber's delay period, send only the latest head

## Limitations

1. **Fire-and-Forget**: No delivery guarantees or retry mechanism - peers may miss notifications if network issues occur
2. **Additional Round Trip**: Requires a separate sync operation after notification
