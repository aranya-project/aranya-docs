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
tcp <->
ciphertext <->
user library <->
fast channel open <->
application plaintext
```

Data starts as plaintext in the application layer. The user library will encrypt/decrypt the data with fast channel open/seal operations.
Ciphertext fast channel data is sent to other peers by the user library via TCP transport.
AFC is transport-agnostic - applications can use TCP, QUIC, UDP, or any other transport for the encrypted data.

Channel creation is initiated through Aranya policy actions. When a policy action creates a channel, Aranya emits effects (`AqcBidiChannelCreated` or `AqcBidiChannelReceived`) that are processed by an AFC handler. The handler extracts channel keys from these effects and stores them in AFC state where the client can access them.

This is the path a channel creation takes through the system:
```
policy action ->
aranya (creates channel secrets) ->
AqcBidiChannelCreated effect ->
afc handler (installs keys) ->
afc state ->
afc client (encryption/decryption)
```

## Aranya Fast Channel IDs

Channels are identified by a `channel_id` which is a 32-bit integer. 
The Aranya daemon generates channel IDs by incrementing a monotonic counter.

This provides direct lookup without hash truncation and integrates with
policy-based permissions through labels.

## Channel Types

AFC supports bidirectional and unidirectional channels:

**Bidirectional**: Both devices can encrypt and decrypt. Each side has
different seal/open keys that correspond to each other.

**Unidirectional**: One device encrypts (seal_only_key), one decrypts
(open_only_key).

Channel type is determined by the policy action used to create it.

## AFC Client Interface

- `seal(channel_id, label_id, ciphertext_buffer, plaintext) -> sequence_number` -
  Encrypts plaintext for the specified channel. Returns sequence number for
  replay protection.

- `open(label_id, plaintext_buffer, ciphertext) -> (label_id, sequence_number)` -
  Decrypts ciphertext from the peer. Returns the channel label id and sequence.
  The returned label_id will match the label_id that was given if decryption was successful.

  N.B. the `channel_id` is included in the header of the ciphertext

Channel creation happens through policy actions:

```
action create_bidirectional_channel(peer_id, label) {
    let channel = afc::create_bidi_channel(peer_id, label)
    publish AqcBidiChannelCreated { ... }
}
```

Applications handle transport - AFC only does encryption/decryption.

## Effect Processing

When channels are created, Aranya emits effects:
- `AqcBidiChannelCreated` - Channel author receives this with keys
- `AqcBidiChannelReceived` - Peer receives this with corresponding keys
- `AqcUniChannelCreated/Received` - For unidirectional channels

The AFC handler processes these effects to install keys in AFC state.

## Transport Usage

1. App calls `seal()` to encrypt data
2. App sends ciphertext via any transport (TCP, QUIC, etc.)
3. Peer receives ciphertext via transport  
4. Peer calls `open()` to decrypt and get label

This keeps AFC focused on encryption while letting apps choose their
preferred transport.
