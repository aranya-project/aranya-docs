---
layout: page
title: Aranya Quic Channels
permalink: "/aranya-quic-channels/"
---

# Aranya Quic Channels (AQC)

## Overview

Aranya Quic Channels are a way for application data to be sent over the 
network to other peers using TLS to ensure security. The QUIC protocol will
be used to send data. This provides multiplexing of connections, TLS for
security, and custom congestion control. We will default to using BBRv2
for congestion control.

## Connections

A connection allows two peers to communicate and will be used for one channel.
When receiving a QUIC connection the TLS key is used to connect will identify 
the channel.

When a channel is created the peer who creates the channel will connect to
the other peer and open a bidirectional stream. The connection and stream 
will remain open until the channel is deleted. The bidirectional stream
will be used to stream data. 

Unidirectional streams will be opened to send messages. Each stream will 
contain a single message.

Both peers will spawn an async task to await messages from the `ReceiveStream`
for each channel.

Each channel will hold a `SendStream` for the bidirectional stream. As well
as receivers for stream and message data. 

QUIC will split messages into several pieces so a data chunk in a stream 
may not represent a complete message.

```rust
/// The maximum number of channels that haven't been received.
const MAXIMUM_UNRECEIVED_CHANNELS: usize = 10;

/// An AQC client. Used to create and receive channels.
pub struct AqcClient {
    quic_client: Client,
    /// Holds channels that have created, but not yet been received.
    pub new_channels: HVec<AqcChannel, MAXIMUM_UNRECEIVED_CHANNELS>,
}

impl AqcClient {
    /// Create an Aqc client with the given certificate chain.
    pub fn new<T: provider::tls::Provider>(cert: T) -> Result<AqcClient, AqcError> 

    /// Receive the next available channel. If no channel is available, return None.
    /// This method will return a channel created by a peer that hasn't been received yet.
    pub fn receive_channel(&mut self) -> Option<AqcChannel> 

    /// Create a new channel to the given address.
    pub async fn create_channel(&mut self, addr: SocketAddr, label: Label) -> Result<AqcChannel, AqcError> 
}

/// Identifies a unique channel between two peers.
pub struct AqcChannelID {
    /// The node id of the peer.
    node_id: NodeId,
    /// The channel label. This allows multiple channels between two peers.
    label: Label,
}


/// A unique channel between two peers.
/// Allows sending and receiving data over a channel.
pub struct AqcChannel {
    id: AqcChannelID
    stream_receiver: mpsc::Receiver<Bytes>,
    message_receiver: mpsc::Receiver<Bytes>,
    send: SendStream,
}

impl AqcChannel {
    /// Create a new channel with the given send stream.
    ///
    /// Returns the channel and the senders for the stream and message channels.
    pub fn new(send: SendStream) -> (Self, mpsc::Sender<Bytes>, mpsc::Sender<Bytes>) 

    /// Receive the next available data from a channel. If no data is available, return None.
    /// If the channel is closed, return an AqcError::ChannelClosed error.
    ///
    /// This method will return data as soon as it is available, and will not block.
    /// The data is not guaranteed to be complete, and may need to be called
    /// multiple times to receive all data from a message.
    pub fn try_recv_stream(&mut self, target: &mut [u8]) -> Result<Option<usize>, AqcError> 

    /// Receive the next available data from a channel. If the channel has been
    /// closed, return None.
    ///
    /// This method will block until data is available to return.
    /// The data is not guaranteed to be complete, and may need to be called
    /// multiple times to receive all data from a message.
    pub async fn recv_stream(&mut self, target: &mut [u8]) -> Option<usize> 

    /// Receive the next available message from a channel. If no data is available, 
    /// return None.
    /// If the channel is closed, return an AqcError::ChannelClosed error.
    ///
    /// This method will return messages as soon as they are available, and will not block.
    pub fn try_recv_message(&mut self, target: &mut [u8]) -> Result<Option<usize>, AqcError> 

    /// Receive the next available message from a channel. If the channel has been
    /// closed, return None.
    ///
    /// This method will block until data is available to return.
    /// The data is not guaranteed to be complete, and may need to be called
    /// multiple times to receive all data from a message.
    pub async fn recv_message(&mut self, target: &mut [u8]) -> Option<usize> 

    /// Stream data to the given channel.
    pub async fn send_stream(&mut self, data: &[u8]) -> Result<(), AqcError> 

    /// Send a message the given channel.
    pub async fn send_message(&mut self, data: &[u8]) -> Result<(), AqcError> 

    /// Close the given channel if it's open. If the channel is already closed, do nothing.
    pub fn close(&mut self) 
}
```
