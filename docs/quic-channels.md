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

## Clients

Each peer will have an AqcClient. This can be used to create new channels
or receive incoming channels. A channel represents a quic connection
between two peers that is secured by crypto generated for the channel.

```rust
/// The maximum number of channels that haven't been received.
const MAXIMUM_UNRECEIVED_CHANNELS: usize = 20;

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
```

## Channels

All peers will spawn an async task to await new connections.

A connection allows two peers to communicate and will be used for one channel.
When receiving a QUIC connection the TLS key is used to connect will identify 
the channel.

When a channel is created the peer who creates the channel will connect to
the other peer and keep the connection alive. 

Each channel will hold a connection `Handle` which can be used to open new 
streams. A channel can have any number of streams.

```rust
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
}

impl AqcChannel {
    /// Create a new channel with the given conection handle.
    ///
    /// Returns the new channel
    pub fn new(conn: Handle) -> Self

    /// Returns a bidirectional stream if one has been received. 
    /// If no stream has been received return None. 
    pub async fn receive_bidirectional_stream(&mut self) -> Option<(AqcSendStream, AqcReceiveStream)> 

    /// Returns a unidirectional stream if one has been received. 
    /// If no stream has been received return None. 
    pub async fn receive_unidirectional_stream(
        &mut self,
    ) -> Result<Option<AqcReceiveStream>, AqcError> 

    /// Creates a new unidirectional stream for the channel. 
    pub async fn create_unidirectional_stream(&mut self) -> Result<AqcSendStream, AqcError> 

    /// Creates a new bidirectional stream for the channel. 
    pub async fn create_bidirectional_stream(
        &mut self,
    ) -> Result<(AqcSendStream, AqcReceiveStream), AqcError> {

    /// Close the channel if it's open. If the channel is already closed, do nothing.
    pub fn close(&mut self) -> Result<(), AqcError>
}
```

## Streams
A stream allows sending or receiving data. 

QUIC will split messages into several pieces so a data chunk in a stream 
may not represent a complete message.

```rust
pub struct AqcReceiveStream {
    receive: ReceiveStream,
}

impl AqcReceiveStream {
    /// Receive the next available data from this stream. If the stream has been
    /// closed, return None.
    /// 
    /// The data will be copied into target and the length of the data will be returned.
    ///
    /// This method will block until data is available to return.
    /// The data is not guaranteed to be complete, and may need to be called
    /// multiple times to receive all data from a message.
    pub async fn receive(&mut self, target: &mut [u8]) -> Result<Option<usize>, AqcError> 
}

pub struct AqcSendStream {
    send: SendStream,
}

impl AqcSendStream {
    /// Send data to the given stream. 
    pub async fn send(&mut self, data: &[u8]) -> Result<(), AqcError> 

    /// Close the stream.
    pub async fn close(&mut self) -> Result<(), AqcError> 
}
```
