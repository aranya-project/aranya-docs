---
title: Bidirectional Sync
taxonomy:
    category: docs
---

# Bidirectional Sync

## Overview

Bidirectional sync allows two Aranya peers to synchronize with each other in both directions using a single QUIC stream connection. This is particularly useful in scenarios where network connections may be asymmetric - where one peer can easily initiate connections to another, but the reverse direction is difficult or impossible.

In traditional unidirectional sync, Peer A connects to Peer B, sends a sync request, receives a sync response, and closes the connection. If Peer B also needs to sync with Peer A, it must initiate a separate connection. With bidirectional sync, after Peer A receives Peer B's sync response, Peer B can immediately send its own sync request over the same stream, allowing both peers to synchronize in a single connection.

## Design

### Protocol Extension

The existing `SyncType::Poll` variant is extended to include a bidirectional flag:

```rust
pub enum SyncType {
    Poll {
        request: SyncRequestMessage,
        address: ServerAddress,
        // NEW: Indicates whether this is a bidirectional sync request
        bidirectional: bool,
    },
    // ... other variants remain unchanged
}
```

### Message Flow

#### Unidirectional Sync (Current Behavior)
```
Client                    Server
  |                         |
  |--- SyncRequest -------->|
  |    (bidirectional=false)|
  |                         |
  |<--- SyncResponse -------|
  |                         |
 [Stream Closed]
```

#### Bidirectional Sync (New Behavior)
```
Client                    Server
  |                         |
  |--- SyncRequest -------->|
  |    (bidirectional=true) |
  |                         |
  |<--- SyncResponse -------|
  |                         |
  |<--- SyncRequest --------|
  |    (from server)        |
  |                         |
  |--- SyncResponse ------->|
  |    (to server)          |
  |                         |
 [Stream Closed]
```

### Stream Management

Both unidirectional and bidirectional sync use a single QUIC bidirectional stream. The key difference is in the stream lifecycle:

- **Unidirectional**: Client sends request and immediately closes its send side. Server sends response and closes its send side.
- **Bidirectional**: Client doesn't close the send side until it responds to the server's request. The server doesn't close the send side until it sends a sync request.

### Configuration

#### SyncPeerConfig Extension

The `SyncPeerConfig` struct is extended with a bidirectional flag:

```rust
pub struct SyncPeerConfig {
    pub interval: Duration,
    pub sync_now: bool,
    // NEW: Enable bidirectional sync for this peer
    pub bidirectional: bool,
}
```

#### API Changes

All existing APIs that accept `SyncPeerConfig` now respect the `bidirectional` flag:

```rust
// Immediate sync - respects bidirectional flag in cfg
async fn sync_now(addr: Addr, team: TeamId, cfg: Option<SyncPeerConfig>) -> Result<()>;

// Periodic sync - respects bidirectional flag in config
async fn add_sync_peer(addr: Addr, team: TeamId, config: SyncPeerConfig) -> Result<()>;
```

When `bidirectional` is enabled:
- `sync_now`: Performs bidirectional sync immediately
- `add_sync_peer`: Configures the peer for bidirectional sync on all periodic sync operations

If `cfg` is `None` for `sync_now`, unidirectional sync is performed (maintaining backward compatibility).

### Error Handling

Bidirectional sync introduces new error scenarios:

1. **Partial Failure**: The initial sync response succeeds, but the server's subsequent sync request fails.
2. **Response Failure**: The server's sync request succeeds, but the client's response to that request fails.

A new error type is introduced:

```rust
#[derive(Error, Debug)]
pub enum BidirectionalSyncError {
    #[error("Server sync request failed after successful sync response: {0}")]
    ServerRequestFailed(Box<SyncError>),
    #[error("Client response to server request failed: {0}")]
    ClientResponseFailed(Box<SyncError>),
}
```

These errors are wrapped in the existing `SyncError::Other` variant to maintain compatibility with current error handling.

## Implementation

### Client Side Changes

#### QUIC State Implementation

The `sync_impl` method in the QUIC `State` is modified to handle bidirectional sync:

```rust
async fn sync_impl<S>(
    syncer: &mut Syncer<Self>,
    id: GraphId,
    sink: &mut S,
    peer: &Addr,
    bidi: bool,
) -> impl Future<Output = SyncResult<()>> + Send
where
    S: Sink<<crate::EN as Engine>::Effect> + Send,
{
    async move {
        syncer.state.store.set_team(id.into_id().into());

        let stream = syncer.connect(peer).await?;
        let (mut recv, mut send) = stream.split();

        let server_addr = ();
        let mut sync_requester = SyncRequester::new(id, &mut Rng, server_addr);

        // Send initial sync request
        syncer.send_sync_request(&mut send, &mut sync_requester, peer, bidirectional).await?;

        // Receive sync response  
        syncer.receive_sync_response(&mut recv, &mut sync_requester, &id, sink, peer).await?;

        // If bidirectional, handle server's sync request
        if bidi {
            // Read server's sync request
            // Generate sync response
            // Send response back to server
            // Close send stream
        }

        Ok(())
    }
}
```

#### New Methods

```rust
impl Syncer<State> {
    async fn send_sync_request<A>(
        &self,
        send: &mut SendStream,
        syncer: &mut SyncRequester<'_, A>,
        peer: &Addr,
        bidirectional: bool,
    ) -> SyncResult<()> {
        // Include bidirectional flag in the SyncType::Poll message
        // Do NOT close send stream if bidirectional
    }
}
```

### Server Side Changes

The server's `sync` method is modified to handle bidirectional requests:

```rust
pub async fn sync(
    client: AranyaClient<EN, SP>,
    peer: SocketAddr,
    stream: BidirectionalStream,
    active_team: &TeamId,
) -> SyncResult<()> {
    let (mut recv, mut send) = stream.split();

    // Read initial sync request
    let mut recv_buf = Vec::new();
    recv.read_to_end(&mut recv_buf).await?;

    let sync_type: SyncType = postcard::from_bytes(&recv_buf)?;
    let bidirectional = match sync_type {
        SyncType::Poll { bidirectional, .. } => bidirectional,
        _ => false,
    };

    // Generate and send sync response
    let response_data = Self::sync_respond(client.clone(), &recv_buf, active_team).await?;
    let resp = SyncResponse::Ok(response_data);
    let data = postcard::to_allocvec(&resp)?;
    send.send(Bytes::from(data)).await?;

    // If bidirectional, send our own sync request
    if bidirectional {
        let our_request_data = Self::generate_sync_request(client.clone(), active_team).await?;
        send.send(Bytes::from(our_request_data)).await?;
        send.close().await?;

        // Read client's response to our request
        let mut response_buf = Vec::new();
        recv.read_to_end(&mut response_buf).await?;
        Self::process_sync_response(client, &response_buf, active_team).await?;
    }

    Ok(())
}
```

### Configuration Changes

#### SyncPeerConfig Builder

```rust
impl SyncPeerConfigBuilder {
    pub fn bidirectional(&mut self, bidirectional: bool) -> &mut Self {
        self.bidirectional = bidirectional;
        self
    }
}
```

#### Default Values

- `bidirectional` defaults to `false` to maintain backward compatibility
- Existing configurations continue to work unchanged

## Backward Compatibility

The implementation maintains full backward compatibility:

1. Existing `SyncPeerConfig` without the `bidirectional` field defaults to unidirectional sync
2. Servers automatically detect bidirectional requests via the `SyncType::Poll.bidirectional` flag
3. The `sync_now` API signature remains unchanged
4. Existing error types and handling remain compatible

## Security Considerations

Bidirectional sync does not introduce new security vulnerabilities:

1. Both directions use the same PSK-secured QUIC connection
2. Each direction follows the existing sync protocol with proper authentication
3. Server-initiated sync requests follow the same validation as client-initiated requests

## Testing

New test cases should cover:

1. **Basic Bidirectional Flow**: Verify both directions complete successfully
2. **Backward Compatibility**: Ensure unidirectional sync continues to work unchanged
3. **Configuration**: Test all combinations of `bidirectional` flag settings

## Future Considerations

