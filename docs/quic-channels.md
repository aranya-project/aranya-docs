---
layout: page
title: Aranya QUIC Channels
permalink: "/aranya-quic-channels/"
---

# Aranya QUIC Channels (AQC)

## Overview

Aranya QUIC Channels are end-to-end encrypted, topic-segmented
communication channels between two devices. AQC channels are
implemented on top of QUIC, which uses TLS for security, allows
multiplexing connections, and custom congestion control
(defaulting to BBRv2).

## Design

### Channels

A channel is comprised of one or more QUIC connections between
two devices. Any number of QUIC connections may be opened at
a time, so long as the cumulative maximum number of QUIC
connections over the lifetime of the channel is respected. The
cumulative maximum number of QUIC connections over the lifetime
of the channel depends on the cryptographic secrets used to
create the channel; see the "cryptography" section below.
Channels are lightweight and can be easily created or destroyed.

Channels can be either bidirectional or unidirectional.
Bidirectional channels allow both devices to send and receive
data. Unidirectional channels allow one device to send data and
the other device to receive data. Generally speaking,
bidirectional channels are the default channel type.

The two devices participating in a channel are referred to as the
channel participants. The participant that created the channel is
called the "author" and the other participant is called the
"peer". Channels can only be created by one of the two
participants. For example, it is impossible for device A to
create a channel for device B and device C.

### Labels

Each channel is associated with a label, which defines the
channel's topic.

Devices with sufficient permissions (typically administrators)
can create labels, and devices with sufficient permissions can
grant other devices permission to use those labels. Devices can
be granted permission to use an arbitrary number of labels.

Labels can be as general or as specific as needed. For example,
an administrator might create the more general `TELEMETRY` label
and assign it to all devices capable of sending or receiving
telemetry data. Alternatively, an administrator might create
a `TELEMETRY_SAT2_GS3` label and apply it only to satellite #2
and ground station #3.

Aranya Policy prevents devices from creating or participating in
channels with non-existent labels or with labels the device does
not have permission to use.

Labels are included in the channel's key derivation,
cryptographically ensuring both devices agree on the channel
topic.

Once created, a channel's label cannot be changed. Instead, a new
channel with a different label must be created. Channels are
designed to be light weight and ephemeral, so this does not pose
a burden on applications.

### Cryptography

#### Notation

- `"abc"`: A byte string containing the UTF-8 characters between
  the double quotation marks (`"`).
- `concat(x0, ..., xN)`: The concatenation of byte strings.
  `concat(a, b, c) = abc`.
- `EncryptionKey(u)`: The Aranya device's `EncryptionKey`.
- `i2osp(n, w)`: Converts the unsigned (non-negative) integer `n`
  to a `w`-byte big-endian byte string.
- `random(n)`: A uniform, pseudorandom byte string of `n` bytes.
- `(x0, ..., xN) = split(x)`: The reverse of `concat`.
- `DeviceId(d)`: The Aranya DeviceID for some device `d`.
- `ALG_Op(...)`: A cryptographic algorithm routine. E.g.,
  `AEAD_Seal(...)`, `HPKE_OneShotSeal(...)`, etc.
- `sk(x)` the secret (private) part of the key `x`.
- `pk(x)` the public part of the key `x`.
- `tuple_hash(s0, ... , sN)` is a cryptographic hash over a set
  of strings such that each element is unambiguously encoded per
  [NIST SP 800-185].
- `bytes(x)` returns the byte encoding of `x`.

#### Overview

A channel's cryptographic secrets are comprised of

1. An [HPKE] encryption context.
2. Optional TLS certificates.

Each QUIC connection is keyed with a preshared key (PSK) exported
from the HPKE encryption context and, if avaiable, the TLS
certificates.

The TLS 1.3 key schedule (used by QUIC) includes a 256-bit random
nonce from the client and 256-bit random nonce from the server,
ensuring each connection uses different key material, even when
the same PSK is used.

#### Bidirectional Channel PSK

```rust
// Creates the HPKE encryption context and peer encapsulation for
// a bidirectional channel.
//
// `author` is the channel author device.
// `peer` is the channel peer device.
fn create_bidi_channel(author, peer) {
    if DeviceId(author) == DeviceId(peer) {
        raise SameIdError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AqcBidiPsk",
        suite_id,
        parent_cmd_id,
        DeviceId(author),
        DeviceId(peer),
        i2osp(label),
    )
    // `enc` is the peer's encapsulation.
    // `ctx` is the encryption context.
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(author)),
        pkR=pk(EncryptionKey(peer)),
        info=info,
    )
    return (enc, ctx)
}

// Derives the channel PSK for the author.
//
// `ctx` comes from `create_bidi_channel`.
fn author_derive_psk(ctx) {
    psk = HPKE_Context.Export(ctx, "aqc bidi psk")
    return psk
}

// Derives the channel PSK for the peer.
//
// `enc` comes from `create_bidi_channel` and is sent to the peer
// by the author.
//
// `author` is the channel author device.
fn peer_derive_psk(enc, author) {
    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat (
        "AqcBidiPsk",
        suite_id,
        parent_cmd_id,
        DeviceId(author),
        DeviceId(peer),
        i2osp(label),
    )
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(peer)),
        pkR=pk(EncryptionKey(author)),
        info=info,
    )
    psk = HPKE_Context.Export(ctx, "aqc bidi psk")
    return psk
}

// Returns the PSK identity.
fn psk_identity(enc) {
    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    id = tuple_hash(
        "ID-v1",
        suite_id,
        bytes(enc),
        "UniChannelId",
    )
    return id
}
```

#### Unidirectional Channel PSK

```rust
// Creates the HPKE encryption context and peer encapsulation for
// a unidirectional channel.
//
// `author` is the channel author device.
// `peer` is the channel peer device.
fn create_uni_channel(author, peer) {
    if DeviceId(author) == DeviceId(peer) {
        raise SameIdError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat (
        "AqcUniPsk",
        suite_id,
        engine_id,
        parent_cmd_id,
        DeviceId(author),
        DeviceId(peer),
        i2osp(label),
    )
    // `enc` is the peer's encapsulation.
    // `ctx` is the encryption context.
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(author)),
        pkR=pk(EncryptionKey(peer)),
        info=info,
    )
    return (enc, ctx)
}

// Derives the channel PSK for the author.
//
// `ctx` comes from `create_uni_channel`.
fn author_derive_psk(ctx) {
    psk = HPKE_Context.Export(ctx, "aqc uni psk")
    return psk
}

// Derives the channel PSK for the peer.
//
// `enc` comes from `create_uni_channel` and is sent to the peer
// by the author.
//
// `author` is the channel author device.
fn peer_derive_psk(enc, author) {
    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AqcUniPsk",
        suite_id,
        engine_id,
        parent_cmd_id,
        DeviceId(author),
        DeviceId(peer),
        i2osp(label),
    )
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(peer)),
        pkR=pk(EncryptionKey(author)),
        info=info,
    )
    psk = HPKE_Context.Export(ctx, "aqc uni psk")
    return psk
}

// Returns the PSK identity.
fn psk_identity(enc) {
    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    id = tuple_hash(
        "ID-v1",
        suite_id,
        bytes(enc),
        "UniChannelId",
    )
    return id
}
```

#### TLS Certificates

This feature is currently schedule for after MVP.

#### Security Considerations

##### Security Model and Goals

1. Only the channel participants should be able to decrypt data
   sent over a channel.
2. Channel participants should be able to determine when data
   sent over a channel has been tampered with or corrupted.
3. Channel participants should cryptographically agree on all
   channel parameters, including the channel topic.
4. Aranya policy should dictate which devices are allowed to
   participate in channels.
5. Channels should allow participants to transmit a reasonable
   amount of data without accidentally exceeding those limits.

(1) and (2) are solved by [RFC 8446], [RFC 9000], and [HPKE].
Additionally, trust in the device `EncryptionKey`s are rooted in
the Aranya graph.

(3) is solved by contextual binding. All channel parameters are
included as contextual binding, so if any channel parameters
differ the resulting PSKs will also differ, preventing
communication.

(4) is solved by AQC policy; see the "labels" section.

(5) is primarily solved by [RFC 8446]. Also, see the "maximum
number of connections" section.

##### Cumulative Maximum Number of Connections

If only using a PSK, the maximum number of connections is bounded
by the probability of the client and server choosing the same
(client, server) nonce tuple for multiple connections.

The optimial bound is 2^r where the collision risk is 2^-r after
`r` connections. Per [Abdalla and Bellare](rekey), this bound can
be approximated as 2^(n/3).

Both the client and server provide 256-bit nonces, so each
connection effectively has a 512-bit nonce. However, we
conservatively assume that only the client's nonce is truly
random. This places the optimal bound at 2^(256/3) = 2^85
connections. If the client creates QUIC connections at the
impossible rate of one per nanosecond, the first collision can be
expected in approximately 1.227 billion years.

If using a PSK and TLS certificates, each QUIC connection mixes
in an (EC)DHE shared secret. This increases the bound so
significantly that it is not even worth calculating.

##### Contextual Binding

The following contextual binding is used when creating the HPKE
encryption context:

- The strings "AqcBidiPsk" and "AqcUniPsk" bind the HPKE
  encryption context to a particular channel direction. This
  ensures that a bidirectional channel cannot be substituted for
  a unidirectional channel and vice versa.

- `suite_id` binds the HPKE encryption context to the set of
  cryptographic primitives used to create it. This helps protect
  against algorithm confusion attacks and prevents the HPKE
  encryption context from being used across Aranya Team cipher
  suite upgrades.

- `DeviceId(author)` and `DeviceId(peer)` binds the HPKE
  encryption context to the two channel participants, forcing
  both participants to agree on which devices are participating
  in the channel.

- `i2osp(label)` binds the HPKE encryption context to the label.
  This forces both participants to agree on the channel topic.

These are consistent with the recommendations for non-key pair
authentication in [HPKE] section 5.1.3 and [AKE].

The following contextual binding is used when deriving the PSK
from the HPKE encryption context:

- The strings "aqc bidi psk" and "aqc uni psk" bind the PSK to
  either bidirectional or unidirectional channels. This further
  ensures that a bidirectional channel cannot be substituted for
  a unidirectional channel and vice versa.

##### HPKE Authentication

The HPKE encryption context is created using `mode_auth`,
allowing the channel peer to verify that the channel author
possesses a particular `EncryptionKey`.

##### Forward Security

As mentioned in [RFC 8446] and [RFC 9257], PSK-only TLS
connections lack foward security. To add forward security,
include TLS certificates as discussed above.

##### Safe Usage of PSKs

AQC avoids the security risks of PSKs outlined in [RFC 9257]:

- AQC PSKs are known to exactly one client and one server (i.e.,
  the channel participants).
- AQC PSKs are high entropy.
- AQC PSK identities are the cryptographic hash of the peer's
  encapsulation. They have a fixed length and are not privacy
  sensitive. As the output of a cryptographic hash function, they
  are unlikely to collide with resumption PSK identities.

##### Privacy Considerations

In general, most privacy considerations can be found in [RFC
8446], [RFC 9000], [HPKE], and Aranya's specifications.

###### PSK Identities

If [Encrypted Client Hello](ECH) (ECH) is used, PSK identities
are transmitted as ciphertext. Otherwise, if ECH is not used,
PSKs are transmitted in clear text. (ECH is an artifact of the
TLS implementation being used and is out of scope of this
specification.)

AQC PSK identities are the cryptographic hash of the peer's
encapsulation, which is an IND-CCA2 ciphertext (assuming that the
KEM used by HPKE is IND-CCA2; see [HPKE] for more information).
It is infeasible for an attacker to link a PSK identity to
a particular device without additional information that is out of
AQC's security model.

### Connections

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

[AKE]: https://doi.org/10.1007/bf00124891
[ECH]: https://www.ietf.org/archive/id/draft-ietf-tls-esni-24.html
[HPKE]: https://www.rfc-editor.org/rfc/rfc9180.html
[NIST SP 800-185]: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-185.pdf
[RFC 8446]: https://www.rfc-editor.org/rfc/rfc8446.html
[RFC 9000]: https://www.rfc-editor.org/rfc/rfc9000.html
[RFC 9257]: https://www.rfc-editor.org/rfc/rfc9257.html
[rekey]: https://cseweb.ucsd.edu/~mihir/papers/rekey.pdf
