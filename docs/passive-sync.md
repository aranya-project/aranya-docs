---
title: Passive Sync
taxonomy:
    category: docs
---

# Passive Sync

## Overview

Passive sync allows Aranya peers to control which peers can initiate connections while maintaining the existing persistent QUIC connection model. This is particularly useful in scenarios where network connections may be asymmetric - where one peer can easily initiate connections to another, but the reverse direction is difficult or impossible.

Currently, peers maintain persistent QUIC connections and open individual streams for sync operations. However, if a peer wants to sync and no connection exists, it will always attempt to open a new connection. Passive sync adds the ability to configure peers to only sync through existing connections, providing control over connection initiation in asymmetric network environments.

## Design

### Core Concepts

1. **Single Persistent Connection**: Only one QUIC connection exists between any two peers at a time
2. **Either Peer Can Connect**: The connection can be initiated by either peer 
3. **Stream-per-Sync**: Each sync operation opens its own stream on the shared connection
4. **Connection Control**: Peers can be configured to only sync through existing connections (not initiate new ones)

### Local Configuration

Passive sync is controlled through local configuration only - no protocol changes are needed since the `passive` behavior is purely a local decision about whether to initiate connections.

### Connection Lifecycle

#### Default Behavior (Can Initiate Connections)
```
Peer A                    Peer B
  |                         |
  |=== QUIC Connection ====>| (A initiates connection)
  |                         |
  |--- Stream 1: Sync ----->|
  |<-- Stream 1: Response --|
  |                         |
  |<-- Stream 2: Sync ------|  (B opens stream on existing connection)
  |--- Stream 2: Response ->|
  |                         |
 [Connection remains open]
```

#### Passive Behavior
```
Peer A (passive)   Peer B
  |                         |
  | (A wants to sync but    |
  |  cannot initiate conn)  |
  |                         |
  |<== QUIC Connection =====| (B initiates connection)
  |                         |
  |--- Stream 1: Sync ----->| (A can now sync on existing connection)
  |<-- Stream 1: Response --|
  |                         |
 [Connection remains open]
```

### Configuration

#### SyncPeerConfig Extension

The `SyncPeerConfig` struct is extended with a connection-only flag:

```rust
pub struct SyncPeerConfig {
    pub interval: Duration,
    pub sync_now: bool,
    // NEW: If true, only sync through existing connections (don't initiate new ones)
    pub passive: bool,
}
```

#### API Changes

All existing APIs that accept `SyncPeerConfig` now respect the `passive` flag:

```rust
// Immediate sync - respects passive flag in cfg
async fn sync_now(addr: Addr, team: TeamId, cfg: Option<SyncPeerConfig>) -> Result<()>;

// Periodic sync - respects passive flag in config
async fn add_sync_peer(addr: Addr, team: TeamId, config: SyncPeerConfig) -> Result<()>;
```

When `passive` is enabled:
- `sync_now`: Only syncs if a connection to the peer already exists, otherwise does nothing
- `add_sync_peer`: Periodic sync attempts only occur when a connection exists

If `cfg` is `None` for `sync_now`, default behavior is used (can initiate connections).

### Stream Management

Each sync operation follows this pattern:

1. **Check Connection**: Verify a QUIC connection exists to the target peer
2. **Connection Handling**:
   - If connection exists: Open a new stream and proceed with sync
   - If no connection and `passive=false`: Establish connection then sync  
   - If no connection and `passive=true`: Do nothing (sync skipped)
3. **Sync Execution**: Use the stream for standard sync request/response flow
4. **Stream Cleanup**: Close the stream when sync completes
5. **Connection Persistence**: Leave the QUIC connection open for future sync operations

### Error Handling

Passive sync introduces new error scenarios:

1. **Connection Required**: Sync attempted with `passive=true` but no connection exists
2. **Connection Lost**: Connection drops during sync operation
3. **Stream Failure**: Individual sync stream fails while connection remains healthy

A new error type is introduced:

```rust
#[derive(Error, Debug)]
pub enum PassiveSyncError {
    #[error("Sync requires existing connection but none found for peer {0}")]
    NoConnectionAvailable(Addr),
    #[error("Connection lost during sync operation: {0}")]
    ConnectionLost(Box<SyncError>),
    #[error("Sync stream failed: {0}")]
    StreamFailed(Box<SyncError>),
}
```

These errors are wrapped in the existing `SyncError::Other` variant to maintain compatibility with current error handling.

## Implementation

### Client Side Changes

#### Connection Opening Logic

The existing `connect` method in the QUIC syncer needs to be modified to respect the `passive` flag:

```rust
impl Syncer<State> {
    async fn connect(&mut self, peer: &Addr, config: &SyncPeerConfig) -> SyncResult<BidirectionalStream> {
        debug!("client connecting to QUIC sync server");
        // Check if there is an existing connection with the peer.
        let conns = &mut self.state.conns;
        let client = &self.state.client;

        let conn = match conns.entry(*peer) {
            Entry::Occupied(entry) => {
                debug!("Client is able to re-use existing QUIC connection");
                entry.into_mut()
            }
            Entry::Vacant(entry) => {
                debug!("existing QUIC connection not found");

                // NEW: Check passive flag before creating new connection
                if config.passive {
                    debug!("passive=true and no existing connection, skipping sync");
                    return Err(SyncError::Other(anyhow::anyhow!("No existing connection and passive=true")));
                }

                let addr = tokio::net::lookup_host(peer.to_socket_addrs())
                    .await
                    .context("DNS lookup on for peer address")?
                    .next()
                    .context("could not resolve peer address")?;
                
                debug!("attempting to create new quic connection");
                let mut conn = client
                    .connect(Connect::new(addr).with_server_name(addr.ip().to_string()))
                    .await
                    .map_err(Error::from)?;

                conn.keep_alive(true).map_err(Error::from)?;
                debug!("created new quic connection");
                entry.insert(conn)
            }
        };

        // Rest of method remains the same...
    }
}
```

#### Configuration Threading

The configuration needs to be passed through the sync pipeline:

```rust
// In Syncer::sync() method - pass config to sync_impl
async fn sync(&mut self, peer: &SyncPeer) -> SyncResult<usize> {
    let config = self.peers.get(peer)
        .map(|(cfg, _)| cfg)
        .unwrap_or(&SyncPeerConfig::default());
    
    let cmd_count = ST::sync_impl(self, peer.graph_id, &mut sink, &peer.addr, config).await?;
    // ... rest of method
}

// In SyncState trait - add config parameter
trait SyncState {
    fn sync_impl<S>(
        syncer: &mut Syncer<Self>,
        id: GraphId,
        sink: &mut S,
        peer: &Addr,
        config: &SyncPeerConfig, // NEW parameter
    ) -> impl Future<Output = SyncResult<usize>> + Send;
}

// In QUIC State implementation
impl SyncState for State {
    async fn sync_impl<S>(
        syncer: &mut Syncer<Self>,
        id: GraphId,
        sink: &mut S,
        peer: &Addr,
        config: &SyncPeerConfig, // NEW parameter
    ) -> SyncResult<usize> {
        syncer.state.store.set_team(id.into_id().into());

        // Pass config to connect method
        let stream = syncer.connect(peer, config).await?;
        
        // Rest of method remains the same...
    }
}
```

#### Sync Now Configuration

For immediate sync operations, the configuration is handled appropriately:

```rust
// In Syncer::next() method
Msg::SyncNow { peer, cfg } => {
    // Use provided config or default for immediate sync
    let config = cfg.unwrap_or_default();
    let temp_peers = [(peer.clone(), (config, Key::default()))].into_iter().collect();
    let old_peers = std::mem::replace(&mut self.peers, temp_peers);
    let result = self.sync(&peer).await;
    self.peers = old_peers; // Restore original peers
    result
}
```

### Configuration Changes

#### SyncPeerConfig Builder

```rust
impl SyncPeerConfigBuilder {
    pub fn passive(&mut self, passive: bool) -> &mut Self {
        self.passive = passive;
        self
    }
}
```

#### Default Values

- `passive` defaults to `false` to maintain backward compatibility
- Existing configurations continue to work unchanged

## Backward Compatibility

The implementation maintains full backward compatibility:

1. Existing `SyncPeerConfig` without the `passive` field defaults to allowing connection initiation
2. Existing sync behavior (create connection per sync) continues to work but uses persistent connections transparently
3. The `sync_now` and `add_sync_peer` API signatures remain unchanged
4. Existing error types and handling remain compatible

## Use Cases

### Asymmetric Connectivity

**Scenario**: Peer A (client) can connect to Peer B (server), but Peer B cannot connect to Peer A due to NAT/firewall.

**Configuration**:
- Peer A: `passive = false` (can initiate connections)
- Peer B: `passive = true` (can only use existing connections)

**Flow**:
1. Peer A initiates QUIC connection to Peer B
2. Both peers can now sync freely using streams on this connection
3. Peer B's sync operations use the connection initiated by Peer A

### Symmetric Connectivity  

**Scenario**: Both peers can connect to each other.

**Configuration**:
- Both peers: `passive = false`

**Flow**:
1. First peer to need sync establishes the connection
2. Both peers use this connection for all subsequent sync operations
3. Connection remains persistent for ongoing sync needs

## Security Considerations

Passive sync maintains security properties:

1. Persistent connections use the same PSK-secured QUIC as before
2. Each stream follows existing sync protocol authentication
3. Connection management doesn't bypass existing security validation
4. Stream isolation prevents cross-contamination between sync operations

## Testing

New test cases should cover:

1. **Connection Persistence**: Verify connections remain open across multiple sync operations
2. **Passive Mode**: Test that peers with `passive=true` skip sync when no connection exists
3. **Backward Compatibility**: Ensure existing sync behavior continues to work
