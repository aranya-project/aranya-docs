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

A connection allows two peers to communicate and will be used for one channel.
When receiving a QUIC connection the TLS key used to connect will identify the 
channel.

When a channel is created the peer who creates the channel will connect to
the other peer and open a bidirectional stream. The connection and stream 
will remain open until the channel is deleted.

Both peers will spawn an async task to await messages from the `ReceiveStream`.
When a message is received it will be sent on the `qc_sender` channel. 
Quic may split messages into several pieces so a data chunk in the channel 
may not represent a complete message.

The `SendStreams` will be stored in an `FnvIndexMap`. 
Creating a connection when the map is full will close and remove the 
connection that has gone the longest without being used.

```rust
/// Identifies a unique channel between two peers.
pub struct QuicChannel {
    /// The node id of the peer.
    node_id: NodeId,
    /// The channel label. This allows multiple channels between two peers.
    label: Label,
}

/// FNVIndexMap requires that the size be a power of 2.
const MAXIMUM_CONNECTIONS: usize = 32;

/// For a given SendStream stores the Connection and the last time it 
/// was used.
type ConnectionMap = FNVIndexMap<
    QuicChannel, (SendStream, SystemTime), MAXIMUM_CONNECTIONS
>

/// Quic data chunks will be read as soon as they're received and sent into this
/// channel. When the channel is full we will wait to read new chunks until
/// the channel has room.
/// 
/// The default maximum message size for QUIC is 1MB so this channel will
/// be just over 1 MB.
let (qc_sender, mut qc_receiver): (
    Sender<(QuicChannel, Bytes)>, Receiver<(QuicChannel, Bytes)>
) = mpsc::channel(1);
```

## API Methods

Methods needed by the daemon's Unix domain socket API to support sending and 
receiving Quic channel messages.

```rust
/// This will either create a new connection or retrieve an existing connection
/// from the ConnectionMap. It will then send the message to the peer.
SendQuicMessage(channel: QuicChannel, message: &[u8])
    -> Result<(), QuicMessageError>
/// Returns the next message from qc_receiver or none if the channel is empty. 
ReceiveQuicData(target: &mut [u8])
    -> Result<Option<(QuicChannel, usize)>, QuicMessageError>  
/// Closes the connection if it exists and is open and removes the connection 
/// from the `ConnectionMap`.
CloseQuicConnection(addr: SocketAddr) 
```