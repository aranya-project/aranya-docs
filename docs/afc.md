---
layout: page
title: Aranya Fast Channels
permalink: "/afc/"
---

# Aranya Fast Channels (AFC)

## Overview

Aranya Fast Channels provide high-throughput encryption for application data, with keys managed by Aranya's policy system.

This is the path data takes through the system:
```
application plaintext <->
user library <->
fast channel seal <->
ciphertext <->
user preferred transport <->
ciphertext <->
user library <->
fast channel open <->
application plaintext
```

Data starts as plaintext in the application layer. The user library will encrypt/decrypt the data with fast channel open/seal operations.
Ciphertext fast channel data is sent to other peers by the user library via the user's transport mechanism of choice.
AFC is transport-agnostic - applications can use TCP, QUIC, UDP, or any other transport for the encrypted data.

Channel creation is initiated through Aranya policy actions. When a policy action creates a channel, Aranya creates an ephemeral command that emits effects (`AfcBidiChannelCreated` or `AfcBidiChannelReceived`) that are processed by an AFC handler. The handler extracts channel keys from these effects and stores them in AFC state where the client can access them.

This is the path an ephemeral command takes through the system:
```
aranya ->
daemon (daemon writes channel keys to shm, user library reads them) ->
Unix domain socket api ->
user library ->
fast channel ctrl message ->
user provided transport ->
peer user library ->
peer Unix domain socket api ->
peer daemon ->
peer aranya ->
peer daemon writes shm channel keys ->
peer user library reads shm channel keys
```

## Aranya Fast Channel IDs

Channels are locally identified by a `channel_id` which is a 32-bit integer. 
The Aranya daemon generates channel IDs by incrementing a monotonic counter.

This provides direct lookup without hash truncation.

There is a one-to-many relationship between `label_id` and `channel_id`. In other words, a channel_id is associated with a single label_id but a label_id can be associated with many channels.

## Channel Types

AFC supports bidirectional and unidirectional channels:

**Bidirectional**: Both devices can encrypt and decrypt. Each side has
different seal/open keys that correspond to each other.

**Unidirectional**: The sender encrypts (seal_only_key), while the receiver decrypts
(open_only_key).

Channel type is determined by the policy action used to create it.

## AFC Client Interface

**Note: This is an overview of the relevant Public APIs for the aranya-fast-channels crate.

- `add(channel_id, label_id, keys)` -
  Creates a new entry for a channel.
- `remove(channel_id)` -
  Removes an existing channel
- `seal(channel_id, label_id, ciphertext_buffer, plaintext) -> Header` -
  Encrypts plaintext for the specified channel.
  The returned header can be used in a number of different ways[^header_usage]
- `open(channel_id, label_id, plaintext_buffer, ciphertext) -> sequence_number` -
  Decrypts ciphertext from the peer. Returns the sequence number.
  N.B. the `label_id` given as input is compared against the `label_id` associated with the channel.

### Policy

Channel creation happens through policy actions:

```policy
action create_afc_bidi_channel(peer_id id, label_id id) {
    let channel = afc::create_bidi_channel(peer_id, label)
    publish AfcBidiChannelCreated { ... }
}

action create_afc_uni_channel(sender_id id, receiver_id id, label_id id) {
    let channel = afc::create_bidi_channel(peer_id, label)
    publish AfcUniChannelCreated { ... }
}
```

Applications handle transport - AFC only does encryption/decryption.

## Effect Processing

When channels are created, Aranya emits effects:
- `AfcBidiChannelCreated` - Channel author receives this with keys
- `AfcBidiChannelReceived` - Peer receives this with corresponding keys
- `AfcUniChannelCreated/Received` - For unidirectional channels

The AFC handler processes these effects to install keys in AFC state.

## Initial Setup

See [Aranya Client APIs](/docs/aranya-mvp.md#client-apis-1) for the high-level client APIs.
See [Channel Types](/docs/aranya-mvp.md#channel-types) for the types of channel objects.

1. App calls `Create*Channel*(..)` to create a channel object for the author and a `ctrl` message[^ctrl]
2. App sends `ctrl` message via any transport (TCP, QUIC, etc.)
3. Peer receives `ctrl` message via transport
4. Peer calls `ReceiveCtrl(.., ctrl)` to create their own channel object

## Transport Usage

(Note: Assumes that channel objects were creating by calling `Create*Channel*` or `ReceiveChannel`)

1. App calls `Channel.seal(..)` to encrypt data
2. App sends ciphertext via any transport (TCP, QUIC, etc.)
3. Peer receives ciphertext via transport  
4. Peer calls `Channel.open(..)` to decrypt and get the sequence number

This keeps AFC focused on encryption while letting apps choose their
preferred transport.

Note: The user must keep track of (device -> channel object) pairs

[^header_usage]: The header provides channel metadata that can be transmitted out-of-band from the ciphertext, such as through TLS ALPN for transport protocol negotiation.

[^ctrl]: The control message contains the serialized channel creation command, including the HPKE encapsulation that allows the peer device to derive the shared channel keys. Only the intended recipient can use this encapsulation with their private key to send/receive messages on the secure channel. See [HPKE key derivation](/docs/afc-crypto.md#key-derivation).

