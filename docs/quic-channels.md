# Aranya Quic Channels

## Overview

Aranya Quic Channels are a way for application data to be sent over the 
network to other peers using TLS to ensure security. The QUIC protocol will
be used to send data. This provides multiplexing of connections, tls for
security, and custom congestion control.

## Channels

Quic channels will be stored in an `FnvIndexMap` with a max size of `32`. 
Creating a channel when the map is full will fail with a `QuicChannelError`.

```rust
/// FNVIndexMap requires that the size be a power of 2.
const MAXIMUM_CHANNELS: usize = 32;
type ChannelMap = FNVIndexMap<(SocketAddr, GraphID), BiDirectionalStream, MAXIMUM_CHANNELS>
```

BiDirectional streams will have the following methods, mirroring the API of
s2n_quic. Receive will return a chunk of data from the stream. It will 
return Ok(None) when the stream is finished.

```rust
pub async fn receive(&mut self) -> Result<Option<bytes::Bytes>>
pub async fn send(&mut self, mut data: bytes::Bytes) -> Result<()>
```

## API Methods

Methods needed by the daemon's Unix domain socket API to support sending and receiving fast channel messages.

- `CreateChannel(team_id: GraphID, addr: SocketAddr) -> Result<BiDirectionalStream, QuicChannelError>` creates a channel in Aranya, returning a `BiDirectionalStream`. Adds the stream to the `ChannelMap`.
- `DeleteChannel(team_id: GraphID, addr: SocketAddr)` closes the channel if it exists and is open and removes the channel from the `ChannelMap`. 