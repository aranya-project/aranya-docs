---
layout: page
title: Aranya Quic Channels
permalink: "/aranya-quic-channels/"
---

# Aranya Quic Channels

## Overview

Aranya Quic Channels are a way for application data to be sent over the 
network to other peers using TLS to ensure security. The QUIC protocol will
be used to send data. This provides multiplexing of connections, TLS for
security, and custom congestion control. We will default to using BBRv2
for congestion control.

## Connections

Quic connections will be stored in an `FnvIndexMap` with a max size of `32`. 
Creating a connection when the map is full will close and remove the 
connection that has gone the longest without being used.
A connection allows two peers to communicate and can be used for any number of 
channels.

```rust
/// FNVIndexMap requires that the size be a power of 2.
const MAXIMUM_CONNECTIONS: usize = 32;
/// For a given SocketAddr stores the BiDirectionalStream and the last time the 
/// stream was used.
type ConnectionMap = FNVIndexMap<
    SocketAddr, (BiDirectionalStream, SystemTime), MAXIMUM_CONNECTIONS
>

/// Quic messages will be read as soon as they're received and appended to
/// this Vec. When calling ReceiveQuicMessage the first message will be 
/// returned.
type QuicMessages = Vec<(QuicChannel, Bytes)>
```

## Channels

Peers may have an unlimited number of channels between them. 

```rust
/// Identifies a unique channel between two peers.
pub struct QuicChannel {
    /// The address of the peer.
    addr: SocketAddr,
    /// The team ID.
    team_id: GraphID,
    /// The channel label. This allows multiple channels for a team and peer.
    label: String,
}

/// Peers will use a single connection to communicate so this enum will 
/// identify the purpose of the message. 
pub enum QuicMessage {
    /// The type of sync message
    Sync {
        sync_type: aranya_runtime::SyncType,
    },
    /// This identifies the channel the message is for. This enum will be
    /// serialized with postcard and the message will be in the remaining
    /// bytes.
    ChannelMessage {
        /// The team ID.
        team_id: GraphID,
        /// The channel label. This allows multiple channels for a team and peer.
        label: String,
    }
}
```

## API Methods

Methods needed by the daemon's Unix domain socket API to support sending and 
receiving Quic channel messages.

```rust
/// This will either create a new connection or retrieve an existing connection
/// from the ConnectionMap. It will then send the message to the peer.
SendQuicMessage(addr: SocketAddr, team_id: GraphID, label: String, message: &[u8])
    -> Result<(), QuicMessageError>
/// Return Some((QuicChannel, message_len)) if a message exists or None if 
/// there are no messages. If there are multiple messages the oldest will be 
/// returned first.
ReceiveQuicMessage(target: &mut [u8])
    -> Result<Option<(QuicChannel, usize)>, QuicMessageError>  
/// Closes the connection if it exists and is open and removes the connection 
/// from the `ConnectionMap`.
CloseQuicConnection(addr: SocketAddr) 
```