---
layout: page
title: Aranya Fast Channels
permalink: "/afc/"
---

# Aranya Fast Channels Data Routing For Aranya Beta V2

## Overview

Aranya Fast Channels are a way for application data to be sent over the network to other peers using cryptography to ensure security.

This is the path data takes through the system:
```
application plaintext <->
user library <->
fast channel seal <->
ciphertext <->
tcp <->
ciphertext <->
user library <->
fast channel open <->
application plaintext
```

Data starts as plaintext in the application layer. The user library will encrypt/decrypt the data with fast channel open/seal operations.
Ciphertext fast channel data is sent to other peers by the user library via TCP transport.
The TCP transport will be used instead of QUIC to communicate between peers because it does not need certificates which complicate setup for the device.

The daemon's Unix domain socket API is used to invoke fast channel creation actions in the Aranya daemon and get ephemeral session commands back from Aranya.
The ephemeral session commands will be sent in ctrl messages (with the message type set to ctrl in the header) to other peers on the network via the TCP transport.
When a peer receives an ephemeral session command, the command will be forwarded to the daemon to be received by Aranya and processed as an ephemeral command added to an ephemeral branch on the graph. Ephemeral commands are not persisted on the graph since they are only stored in RAM. Once the ephemeral session command has been processed, the daemon will update the channel keys in the shm where the user library can read from later.

This is the path an ephemeral command takes through the system:
```
aranya ->
daemon (daemon writes channel keys to shm, user library reads them) ->
Unix domain socket api ->
user library ->
fast channel ctrl message ->
tcp ->
peer user library ->
peer Unix domain socket api ->
peer daemon ->
peer aranya ->
peer daemon writes shm channel keys ->
peer user library reads shm channel keys
```

## Aranya Fast Channel IDs

We need a globally unique identifier to use when looking up fast channels channels.
Use `BidiChannelId` or `UniChannelId` which are already defined using a kdf by `crypto::afc`. These channel IDs are the hash of the peer's encapsulated HPKE secret which are ephemeral public keys.
Since these ids are too large to send in a header, truncate them down from 512 bits to 128 bits to create the `afc_id`.
The ids will still be globally unique after truncation due to the number of bits remaining.

Upon receiving a `ctrl` message, a peer will compute the `afc_id` based on the `BidiChannelId` or `UniChannelId` of the processed ephemeral command.

When fast channel data is sent, the `afc_id` mapping can be used to lookup the corresponding `channel_id = (node_id, label)` for use with the open/seal operations.

The `afc_id` and `label` are used to create the following mapping:
`afc_id` -> `(node_id, label)`
The `node_id` is an incrementing counter to ensure each fast channel channel has a unique `channel_id = (node_id, label)` to lookup the fast channel channel with.

The mapping in code could use a `BTreeMap` like this:
`BTreeMap<afc_id, (node_id, label)>`

TODO: consider using a `FnvIndexMap` instead of the `BTreeMap` for the `afc_id -> (node_id, label)` mapping:
https://docs.rs/heapless/latest/heapless/type.FnvIndexMap.html

## Ctrl And Data Messages

`ctrl` messages are used to setup an AFC channel with a peer initially.
`data` message are used to send encrypted AFC channel ciphertext. The ciphertext is encrypted using the AFC `seal` operation.

`postcard` format is used to serialize/deserialize an enum containing both types of messages so it's easier to send them over the wire, deserialize them, and tell what type of message has been received. Fields can be accessed directly from the deserialized object rather than pulling data out of byte offsets.

Here's an example of what the transport messages sent to the AFC peer would look like as a Rust enum:
```
/// AFC ctrl/data messages.
/// These messages are sent/received between AFC peers via the TCP transport.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum TxpMsg {
    Ctrl {
        /// AFC protocol version.
        version: Version,
        /// Ephemeral command for AFC channel creation.
        cmd: AfcCtrl,
    },
    Data {
        /// AFC protocol version.
        version: Version,
        /// Truncated channel ID.
        afc_id: AfcId,
        /// Data encrypted with AFC `seal`.
        ciphertext: Vec<u8>,
    },
}
```

## Aranya Fast Channel C-API / Rust API Interface

- `CreateChannel(team_id, net_identifier, label) -> channel_id` - Open a channel to the dest with the given label. The device API transparently handles sending the ephemeral command to the
peer.

TODO: Channel keys are automatically rotated after a specific byte count.

Sending ctrl messages:
A ctrl message will be sent whenever a new fast channel is created by Aranya. The ctrl message will be sent from the device that created the channel to its peer on the other side of the channel.
The user library will invoke the daemon's Unix domain socket API to create a new fast channel and get the corresponding ephemeral command with `let ephemeral_command = CreateChannel(...)`.
This ephemeral command will be sent to the peer on the other side of the channel in a `ctrl` message so the peer can create a matching ephemeral session for the fast channel with `ReceiveSessionCommand(ephemeral_command)`.

- `DeleteChannel(team_id, channel_id) -> Result<()>` - Close a channel with the given ID. The device API transparently handles sending the ephemeral command to the peer. DeleteChannel results in dropping a TCP socket and map entry for the channel.

- `PollData(timeout) -> Result<()>` - blocks with timeout, returns `Ok` if there is fast channel data to read using `RecvData()`.
Behind the scenes, this `accept()`s incoming TCP client connections and polls TCP streams for incoming data.
If a ctrl message is received, that will be used to send a payload to Aranya via the Unix domain socket API with the daemon.
This is used to set up channel keys based on the ephemeral session commands from the other peer.
Polling is useful for instances where different channels could have different buffer sizes.

If a data message is received, that will be decrypted with the fast channel `open` operation and plaintext will be buffered for `RecvData` later.

- `RecvData(bytes_buffer: &mut [u8]) -> Result<(data: &[u8], remote_net_identifier, label, afc_id)>` - read the fast channel data, returning the plaintext, sender, label, and afc_id (or an error). Returns a single fast channel message at a time. Returns the plaintext data that was previously decrypted and buffered during the call to PollData.

- `SendData(bytes, afc_id, timeout) -> Result<()>` - encrypts data with the fast channel `seal` operation and sends the data
to the given channel with a timeout. This call is blocking until the timeout
is complete. Data is sent via the `TCP` transport. A BTreeMap with net_identifier to channel_id mappings created during fast channel creation is used to lookup the TCP server of the peer to send data to. A DNS lookup is performed right before sending data to the IP address.

## Aranya Fast Channel Unix domain socket API Methods

Methods needed by the daemon's Unix domain socket API to support sending and receiving fast channel messages.

- `CreateChannel(team_id, net_identifier, label) -> (channel_id, ephemeral_command)` creates a channel in Aranya, returning the `channel_id` and `ephemeral_command`. Adds the fast channel to the shm. The `ephemeral_command` will be sent to the fast channel peer so it can also create the channel.
- `DeleteChannel(team_id, channel_id) -> Result<ephemeral_command>` deletes a channel in Aranya. Removes the fast channel from the shm, returning the `ephemeral_command` to send to the peer on the other side of the channel so it can also remove the channel.
- `ReceiveSessionCommand(ephemeral_command) -> Result<()>` processes a session command through the policy. This will be invoked after receiving a ctrl message from an fast channel peer so that the channel exists as an entry in shm on both peers. And again when a channel is deleted.

## Aranya Fast Channel Interface
The fast channel data will be encrypted/decrypted via the seal/open operations:
- `seal(channel_id, ciphertext: &mut [u8], plaintext: &[u8])`
- `open(node_id, plaintext: &mut [u8], ciphertext: &[u8])`

A `channel_id` consists of a node_id and an fast channel label:
```
pub struct ChannelId {
    node_id: NodeId,
    label: Label,
}
```
