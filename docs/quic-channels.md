---
layout: page
title: Aranya QUIC Channels
permalink: "/aranya-quic-channels/"
policy-version: 2
---

# Aranya QUIC Channels (AQC)

## Overview

Aranya QUIC Channels are end-to-end encrypted, topic-segmented
communication channels between two devices. The security and
authorization for AQC channels is rooted in Aranya's graph,
providing strong access governance and security controls. Data is
transmitted over QUIC, which uses TLS 1.3 for security, supports
multiplexing connections, and allows custom congestion control
(defaulting to BBRv2).

## Design

### Participants

Each channel has exactly two _participants_. The participant that
created the channel is called the _author_ and the other
participant is called the _peer_.

Channels can only be created by one of the two participants. For
example, given three distinct devices A, B, and C, it is
impossible for device A to create a channel for device B and
device C.

### Directionality

Channels are either bidirectional or unidirectional.
Bidirectional channels allow both participants to send and
receive data. Unidirectional channels allow one participant to
send data and the other to receive data.

While a channel's directionality is included as contextual
binding when the channel is created, directionality is not
cryptographically enforced. Instead, it is enforced
programmatically.

Generally speaking, bidirectional channels are the default
channel type.

### Sending and Receiving Data

Channel participants transmit and receive data over QUIC
connections. Either participant may open or close a QUIC
connection at any time.

Channel participants may open any number of QUIC connections at
a time, so long as they do not exceed the cumulative maximum
number of QUIC connections over the lifetime of the channel. This
upper bound depends depends on the cryptographic secrets used to
create the channel; see the "cryptography" section below.

The QUIC connections are secured with cryptographic secrets known
only to the channel participants; see the "cryptography" section
below.

### Topics (Labels)

Each channel is associated with a _label_, which specifies the
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
designed to be lightweight and ephemeral, so this does not pose
a burden on applications.

#### Label Design

TODO

### Creation and Lifetime

To create a channel, the author sends an off-graph "session"
command containing (among other things) an encapsulated channels
secrets to the peer. The peer verifies the command in the graph,
then decapsulates the channel secrets. See the "policy" section
for a more formal description.

This process is designed to be lightweight and ephemeral. The
size of channel creation commands is mostly a factor of the
cryptography being used.

Each AQC channel is unique: creating N channels with the same
label will create N distinct channels.

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
  [[NIST SP 800-185]].
- `bytes(x)` returns the byte encoding of `x`.

#### Overview

As described above, each AQC channel is comprised of one or more
QUIC connections opened over the lifetime of the channel. QUIC
secures its connections with TLS 1.3 [[RFC 9001]].

Each TLS 1.3 [[RFC 8446]] connection has two input secrets:

1. PSK (a pre-shared key)
2. (EC)DHE shared secret

Each AQC channel has a 256-bit (or greater) PSK with the
following security properties:

- It is cryptographically secure.
- It is unique to that channel.
- It is only known by the channel participants.
- It is only used by the channel participants.
- It is never used more than permitted by this specification.
- It is *never* used for any other purpose, including after the
  channel is destroyed.
- It is destroyed after the channel is destroyed.

The PSK is generated with HPKE [[RFC 9180]]. The generation
strategies for bidirectional and unidirectional channels are very
similar, differing only in their constants. They are listed in
following sections.

For operational reasons, a channel's PSK is used for each QUIC
connection opened over the lifetime of the channel. (As opposed
to generating a fresh PSK for each QUIC connection.) This is
a normal, secure use for TLS 1.3 PSKs. The TLS 1.3 key schedule
includes two 256-bit random nonces: one provided by the client,
and one provided by the server. These nonces ensure each TLS
connection has a unique key schedule, even when the same PSK is
used across multiple connections.

The PSK identity is a fixed size Aranya ID cryptographically
derived from the encapsulated KEM shared secret output by HPKE.

AQC optionally uses (EC)DHE key agreement to provide additional
security properties (e.g., forward security). The TLS
certificates used to authenticate the (EC)DHE key exchange are
taken from the Aranya graph. The (EC)DHE key agreement design is
described in a following section.

#### Bidirectional Channel PSK

```rust
// Creates the HPKE encryption context and peer encapsulation for
// a bidirectional channel.
//
// `author` is the channel author device.
// `peer` is the channel peer device.
fn create_bidi_channel(author, peer) {
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }
    if DeviceId(author) == DeviceId(peer) {
        raise SameIdError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    // `psk_length_in_bytes` is the length, in bytes, of the PSK.
    info = tuple_hash(
        "AqcBidiPsk",
        suite_id,
        parent_cmd_id,
        i2osp(psk_length_in_bytes, 2),
        DeviceId(author),
        DeviceId(peer),
        i2osp(label, 4),
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
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }
    psk = ctx.Export("aqc bidi psk", psk_length_in_bytes)
    return psk
}

// Derives the channel PSK for the peer.
//
// `enc` comes from `create_bidi_channel` and is sent to the peer
// by the author.
//
// `author` is the channel author device.
fn peer_derive_psk(enc, author) {
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    // `psk_length_in_bytes` is the length, in bytes, of the PSK.
    info = tuple_hash(
        "AqcBidiPsk",
        suite_id,
        parent_cmd_id,
        i2osp(psk_length_in_bytes, 2),
        DeviceId(author),
        DeviceId(peer),
        i2osp(label, 4),
    )
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(peer)),
        pkR=pk(EncryptionKey(author)),
        info=info,
    )
    psk = ctx.Export("aqc bidi psk", psk_length_in_bytes)
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
        "AqcBidiChannelId",
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
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }
    if DeviceId(author) == DeviceId(peer) {
        raise SameIdError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    // `psk_length_in_bytes` is the length, in bytes, of the PSK.
    info = tuple_hash(
        "AqcUniPsk",
        suite_id,
        engine_id,
        parent_cmd_id,
        i2osp(psk_length_in_bytes, 2),
        DeviceId(author),
        DeviceId(peer),
        i2osp(label, 4),
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
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }
    psk = ctx.Export("aqc uni psk", psk_length_in_bytes)
    return psk
}

// Derives the channel PSK for the peer.
//
// `enc` comes from `create_uni_channel` and is sent to the peer
// by the author.
//
// `author` is the channel author device.
fn peer_derive_psk(enc, author) {
    if psk_length_in_bytes < 32 {
        raise InsecurePskLengthError
    }
    if psk_length_in_bytes >= 2^16 {
        raise PskTooLongError
    }

    // `suite_id` is derived from the Aranya Team's cipher suite.
    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    // `psk_length_in_bytes` is the length, in bytes, of the PSK.
    info = tuple_hash(
        "AqcUniPsk",
        suite_id,
        engine_id,
        parent_cmd_id,
        i2osp(psk_length_in_bytes, 2),
        DeviceId(author),
        DeviceId(peer),
        i2osp(label, 4),
    )
    (enc, ctx) = HPKE_SetupAuth(
        mode=mode_auth,
        skS=sk(EncryptionKey(peer)),
        pkR=pk(EncryptionKey(author)),
        info=info,
    )
    psk = ctx.Export("aqc uni psk", psk_length_in_bytes)
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
        "AqcUniChannelId",
    )
    return id
}
```

#### (EC)DHE Key Agreement

This feature is currently scheduled for after the MVP.

#### TLS Authentication

This feature is currently scheduled for after the MVP.

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

(1) and (2) are solved by [[RFC 8446]], [[RFC 9000]], and [[RFC
9180]]. Additionally, trust in the device `EncryptionKey`s is
rooted in the Aranya graph.

(3) is solved by contextual binding. All channel parameters are
included as contextual binding, so if any channel parameters
differ the resulting PSKs will also differ, preventing
communication.

(4) is solved by AQC policy; see the "labels" section.

(5) is primarily solved by [[RFC 8446]], [[RFC 9000]], and [[RFC
9001]]. Also, see the "Cumulative Maximum Number of QUIC
Connections" section.

##### Cumulative Maximum Number of QUIC Connections

If only using a PSK, the maximum number of QUIC connections is
bounded by the probability of the client and server choosing the
same (client, server) nonce tuple for multiple connections.

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

If using a PSK and (EC)DHE key agreement, each QUIC connection
mixes in a fresh (EC)DHE shared secret. This increases the bound
so significantly that it is not even worth calculating.

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

- `i2osp(psk_length_in_bytes, 2)` binds the HPKE encryption
  context to the chosen PSK length. This forces both participants
  to agree on the PSK length. (Note that HPKE's secret export
  interface includes the length of the exported secret as its own
  contextual binding, making this contextual binding somewhat
  redundant.)

- `DeviceId(author)` and `DeviceId(peer)` binds the HPKE
  encryption context to the two channel participants, forcing
  both participants to agree on which devices are participating
  in the channel.

- `i2osp(label, 4)` binds the HPKE encryption context to the
  label. This forces both participants to agree on the channel
  topic.

These are consistent with the recommendations for non-key pair
authentication in [[RFC 9180]] section 5.1.3 and [[AKE]].

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

As mentioned in [[RFC 8446]] and [[RFC 9257]], PSK-only TLS
connections lack foward security. To add forward security,
include TLS certificates as discussed above.

##### Safe Usage of PSKs

AQC avoids the security risks of PSKs outlined in [[RFC 9257]]:

- AQC PSKs are known to exactly one client and one server (i.e.,
  the channel participants).
- AQC PSKs are high entropy (256 or greater bits).
- AQC PSK identities are the cryptographic hash of the peer's
  encapsulation. They have a fixed length and are not privacy
  sensitive. As the output of a cryptographic hash function, they
  are it is cryptographically negligible for them to collide with
  resumption PSK identities.

##### Privacy Considerations

In general, most privacy considerations can be found in [[RFC
8446]], [[RFC 9000]], [[RFC 9001]], [[RFC 9180]], and Aranya's
specifications.

###### PSK Identities

If [Encrypted Client Hello](ECH) (ECH) is used, PSK identities
are transmitted as ciphertext. Otherwise, if ECH is not used,
PSKs are transmitted in clear text. (ECH is an artifact of the
TLS implementation being used and is out of scope of this
specification.)

AQC PSK identities are the cryptographic hash of the peer's
encapsulation, which is an IND-CCA2 ciphertext (assuming that the
KEM used by HPKE is IND-CCA2; see [[RFC 9180]] for more
information). It is infeasible for an attacker to link a PSK
identity to a particular device without additional information
that is out of AQC's security model.

### Policy

#### Globals

```policy
use aqc
use crypto
use device
use envelope
use idam
use perspective

// Returns a device.
function get_valid_device(author_id id) struct Device;

// Returns the device's encoded public encryption key.
function get_enc_pk(device_id id) bytes;

// Returns a device if one exists.
function find_existing_device(device_id id) optional struct Device;
```

#### Enums and Structs

```policy
// Valid channel operations for a label assignment.
enum ChanOp {
    // The device can only receive data in channels with this
    // label.
    ReadOnly,
    // The device can only send data in channels with this
    // label.
    WriteOnly,
    // The device can send and receive data in channels with this
    // label.
    ReadWrite,
}
```

#### Facts

```policy
// Records that a device was granted permission to use a label
// for certain channel operations.
fact AssignedLabel[device_id id, label int]=>{op enum ChanOp}
```

#### Utility Routines

```policy
// Reports whether `label` is a valid label.
//
// A valid label must be an unsigned, 32-bit integer.
function is_valid_label(label int) bool {
    return label >= 0 && label <= 4294967295
}

// Reports whether `size` is a valid PSK length (in bytes).
//
// Per the AQC specification, PSKs must be in the range [32, 2^16).
function is_valid_psk_length(size int) bool {
    return size >= 32 && size < 65536
}

// Returns the channel operations that this device is allowed to
// perform for a particular label.
function get_allowed_op(device_id id, label int) enum ChanOp {
    check is_valid_label(label)

    let assigned = check_unwrap query AssignedLabel[device_id: device_id, label: label]
    return assigned.op
}

// Reports whether the devices have permission to create
// a bidirectional AQC channel with each other.
function can_create_aqc_bidi_channel(device1 id, device2 id, label int) bool {
    check is_valid_label(label)

    // Devices cannot create channels with themselves.
    //
    // This should have been caught by the AQC FFI, so check
    // instead of just returning false.
    check device1 != device2

    // Both devices must have permissions to read (recev) and
    // write (send) data.
    let device1_op = get_allowed_op(device1, label)
    if device1_op != ChanOp::ReadWrite {
        return false
    }

    let device2_op = get_allowed_op(device2, label)
    if device2_op != ChanOp::ReadWrite {
        return false
    }

    return true
}

// Reports whether the devices have permission to create
// a unidirectional AQC channel with each other.
function can_create_afc_uni_channel(writer_id id, reader_id id, label int) bool {
    check is_valid_label(label)

    // Devices cannot create channels with themselves.
    //
    // This should have been caught by the AQC FFI, so check
    // instead of just returning false.
    check writer_id != reader_id

    // The writer must have permissions to write (send) data.
    let writer_op = get_allowed_op(writer_id, label)
    match writer_op {
        ChanOpt::ReadOnly => return false,
        ChanOpt::WriteOnly => {}
        ChanOpt::ReadWrite => {}
    }

    // The reader must have permission to read (receive) data.
    let reader_op = get_allowed_op(reader_id, label)
    match reader_op {
        ChanOpt::ReadOnly => {}
        ChanOpt::WriteOnly => return false,
        ChanOpt::ReadWrite => {}
    }

    return true
}
```

#### AqcCreateChannel

##### AqcCreateBidiChannel

Creates a bidirectional AQC channel for off-graph messaging.
This is an ephemeral command, which means that it can only be
emitted within an ephemeral session so that it is not added to
the graph of commands. Furthermore, it cannot persist any changes
to the fact database.

```policy
action create_aqc_bidi_channel(peer_id id, label int) {
    let parent_cmd_id = perspective::head_id()
    let author_id = device::current_device_id()
    let author = get_valid_device(author_id)
    let peer_enc_pk = get_enc_pk(peer_id)

    let ch = aqc::create_bidi_channel(
        parent_cmd_id,
        author.enc_key_id,
        author_id,
        peer_enc_pk,
        peer_id,
        label,
    )

    publish AqcCreateBidiChannel {
        peer_id: peer_id,
        label: label,
        peer_encap: ch.peer_encap,
        channel_id: ch.channel_id,
    }
}

// The effect that is emitted when the author of a bidirectional
// AQC channel processes the `AqcCreateBidiChannel` command.
effect AqcBidiChannelCreated {
    // The unique ID of the previous command.
    parent_cmd_id id,
    // The channel author's device ID.
    author_id id,
    // The channel author's encryption key ID.
    author_enc_key_id id,
    // The channel peer's device Id.
    peer_id id,
    // The channel peer's encoded public encryption key.
    peer_enc_pk bytes,
    // The channel label.
    label int,
    // The channel's unique identifier.
    channel_id,
}

// The effect that is emitted when the peer of a bidirectional
// AQC channel processes the `AqcCreateBidiChannel` command.
effect AqcBidiChannelReceived {
    // The unique ID of the previous command.
    parent_cmd_id id,
    // The channel author's device ID.
    author_id id,
    // The channel author's encoded public encryption key.
    author_enc_pk bytes,
    // The channel peer's device Id.
    peer_id id,
    // The channel peer's encryption key ID.
    peer_enc_key_id id,
    // The channel label.
    label int,
    // The channel peer's encapsulated KEM shared secret.
    encap bytes,
}

command AqcCreateBidiChannel {
    fields {
        // The channel peer's device Id.
        peer_id id,
        // The label applied to the channel.
        label int,
        // The channel peer's encapsulated KEM shared secret.
        peer_encap bytes,
        // The channel's unique identifier.
        channel_idid,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        let author = get_valid_device(envelope::author_id(envelope))
        let peer = check_unwrap find_existing_device(this.peer_id)

        // Check that both devices are allowed to participate in
        // this bidirectional channel.
        check can_create_aqc_bidi_channel(author.device_id, peer.device_id, this.label)

        let parent_cmd_id = envelope::parent_id(envelope)
        let current_device_id = device::current_device_id()

        if current_device_id == author.device_id {
            // We're the channel author.
            let peer_enc_pk = get_enc_pk(peer.device_id)
            finish {
                emit AqcBidiChannelCreated {
                    parent_cmd_id: parent_cmd_id,
                    author_id: author.device_id,
                    author_enc_key_id: author.enc_key_id,
                    peer_id: peer.device_id,
                    peer_enc_pk: peer_enc_pk,
                    label: this.label,
                    channel_id: this.channel_id,
                }
            }
        } else if current_device_id == peer.device_id {
            // We're the channel peer.
            let author_enc_pk = get_enc_pk(author.device_id)
            finish {
                emit AqcBidiChannelReceived {
                    parent_cmd_id: parent_cmd_id,
                    author_id: author.device_id,
                    author_enc_pk: author_enc_pk,
                    peer_id: peer.device_id,
                    peer_enc_key_id: peer.enc_key_id,
                    label: this.label,
                    encap: this.peer_encap,
                }
            }
        } else {
            // This is an off-graph session command, so only the
            // communicating peers should process this command.
            check false
        }
    }
}
```

**Invariants**:

- Devices can only create channels for the labels they've been
  assigned.
- A device can only use a bidi channel if it has been granted
  `ChanOp::ReadWrite` permission for the label assigned to the
  channel.

##### AqcCreateUniChannel

Creates a bidirectional AQC channel for off-graph messaging.
This is an ephemeral command, which means that it can only be
emitted within an ephemeral session so that it is not added to
the graph of commands. Furthermore, it cannot persist any changes
to the fact database.

```policy
action create_aqc_uni_channel(writer_id id, reader_id id, label int) {
    let parent_cmd_id = perspective::head_id()
    let author = get_valid_device(device::current_device_id())
    let peer_id = select_peer_id(author.device_id, writer_id, reader_id)
    let peer_enc_pk = get_enc_pk(peer_id)

    let ch = aqc::create_uni_channel(
        parent_cmd_id,
        author.enc_key_id,
        peer_enc_pk,
        writer_id,
        reader_id,
        label,
    )

    publish AqcCreateUniChannel {
        writer_id: writer_id,
        reader_id: reader_id,
        label: label,
        peer_encap: ch.peer_encap,
        channel_id: ch.channel_id,
    }
}

// The effect that is emitted when the author of a unidirectional
// AQC channel processes the `AqcCreateUniChannel` command.
effect AqcUniChannelCreated {
    // The unique ID of the previous command.
    parent_cmd_id id,
    // The channel author's device ID.
    author_id id,
    // The device ID of the participant that can write data.
    writer_id id,
    // The device ID of the participant that can read data.
    reader_id id,
    // The channel author's encryption key ID.
    author_enc_key_id id,
    // The channel peer's encoded public encryption key.
    peer_enc_pk bytes,
    // The channel label.
    label int,
    // The channel's unique identifier.
    channel_id,
}

// The effect that is emitted when the peer of a unidirectional
// AQC channel processes the `AqcCreateUniChannel` command.
effect AqcUniChannelReceived {
    // The unique ID of the previous command.
    parent_cmd_id id,
    // The channel author's device ID.
    author_id id,
    // The device ID of the participant that can write data.
    writer_id id,
    // The device ID of the participant that can read data.
    reader_id id,
    // The channel author's encryption key ID.
    author_enc_pk bytes,
    // The channel peer's encryption key ID.
    peer_enc_key_id id,
    // The channel label.
    label int,
    // The channel peer's encapsulated KEM shared secret.
    encap bytes,
}

command AqcCreateUniChannel {
    fields {
        // The device ID of the participant that can write data.
        writer_id id,
        // The device ID of the participant that can read data.
        reader_id id,
        // The label applied to the channel.
        label int,
        // The channel peer's encapsulated KEM shared secret.
        peer_encap bytes,
        // The ID of the AQC channel key.
        channel_id id,
    }

    seal { return seal_command(serialize(this)) }
    open { return deserialize(open_envelope(envelope)) }

    policy {
        let author = get_valid_device(envelope::author_id(envelope))

        // Ensure that the author is one of the channel
        // participants.
        check author.device_id == this.writer_id ||
              author.device_id == this.reader_id

        let peer_id = if author.device_id == this.writer_id {
            this.reader_id
        } else {
            this.writer_id
        }
        let peer = check_unwrap find_existing_device(peer_id)

        // Check that both devices are allowed to participate in
        // this unidirectional channel.
        check can_create_aqc_uni_channel(this.writer_id, this.reader_id, this.label)

        let parent_cmd_id = envelope::parent_id(envelope)
        let current_device_id = device::current_device_id()

        // We authored this command.
        if current_device_id == author.device_id {
            let peer_enc_pk = get_enc_pk(peer_id)

            finish {
                emit AqcUniChannelCreated {
                    parent_cmd_id: parent_cmd_id,
                    author_id: author.device_id,
                    writer_id: this.writer_id,
                    reader_id: this.reader_id,
                    author_enc_key_id: author.enc_key_id,
                    peer_enc_pk: peer_enc_pk,
                    label: this.label,
                    channel_id: this.channel_id,
                }
            }
        } else if current_device_id == peer.device_id {
            // We're the intended recipient of this command.
            let author_enc_pk = get_enc_pk(author.device_id)

            finish {
                emit AqcUniChannelReceived {
                    parent_cmd_id: parent_cmd_id,
                    author_id: author.device_id,
                    writer_id: this.writer_id,
                    reader_id: this.reader_id,
                    author_enc_pk: author_enc_pk,
                    peer_enc_key_id: peer.enc_key_id,
                    label: this.label,
                    encap: this.peer_encap,
                }
            }
        } else {
            // This is an off-graph session command, so only the
            // communicating peers should process this command.
            check false
        }
    }
}
```

**Invariants**:

- Devices can only create channels for the labels they've been
  assigned.
- A device can only write data to a uni channel if it has been
  granted either the `ChanOp::WriteOnly` or `ChanOp::ReadWrite`
  permission for the label assigned to the channel.
- A device can only read data from a uni channel if it has been
  granted either the `ChanOp::ReadOnly` or `ChanOp::ReadWrite`
  permission for the label assigned to the channel.

#### AQC FFI

```policy
// Returned by `create_bidi_channel`.
struct AqcBidiChannel {
    // The channel peer's encapsulated KEM shared secret.
    peer_encap bytes,
    // The channel's unique ID.
    channel_id id,
}

// Creates a bidirectional AQC channel.
function create_bidi_channel(
    parent_cmd_id id,
    our_enc_key_id id,
    our_id id,
    their_enc_pk bytes,
    their_id id,
    label int,
) struct AqcBidiChannel

// Returned by `create_uni_channel`.
struct AqcUniChannel {
    // The channel peer's encapsulated KEM shared secret.
    peer_encap bytes,
    // The channel's unique ID.
    channel_id id,
}

// Creates a unidirectional AQC channel.
function create_uni_channel(
    parent_cmd_id id,
    author_enc_key_id id,
    their_pk bytes,
    seal_id id,
    open_id id,
    label int,
) struct AqcUniChannel
```

## Implementation

Each peer will have an AqcClient. This can be used to create new channels
or receive incoming channels. A channel represents a quic connection
between two peers that is secured by crypto generated for the channel.

```rust
/// Indicates whether the channel is unidirectional or bidirectional
pub enum CHANNEL_DIRECTION = {
    /// Data can only be sent in one direction.
    UNIDIRECTIONAL,
    /// Data can be sent in either direction
    BIDIRECTIONAL,
}

/// Indicates the type of channel
pub enum CHANNEL_TYPE = {
    AqcChannelSender,
    AqcChannelReceiver,
    AqcBidirectionalChannel,
}

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
    pub fn receive_channel(&mut self) -> Option<CHANNEL_TYPE>

    /// Create a new channel to the given address.
    pub async fn create_channel(&mut self, addr: SocketAddr, label: Label, direction: CHANNEL_DIRECTION) -> Result<CHANNEL_TYPE, AqcError>
}
```

### Channels

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

/// The receive end of a unidirectional channel.
/// Allows receiving data streams over a channel.
pub struct AqcChannelReceiver {
    id: AqcChannelID
    uni_receiver: mpsc::Receiver<ReceiveStream>,
}

impl AqcChannelReceiver {
    /// Create a new channel with the given conection handle.
    ///
    /// Returns the new channel and the sender used to send new streams to the
    /// channel.
    pub fn new(conn: Handle) -> (Self, (
            mpsc::Sender<ReceiveStream>,
        ),)

    /// Returns a unidirectional stream if one has been received.
    /// If no stream has been received return None.
    pub async fn receive_unidirectional_stream(
        &mut self,
    ) -> Result<Option<AqcReceiveStream>, AqcError>

    /// Close the channel if it's open. If the channel is already closed, do nothing.
    pub fn close(&mut self) -> Result<(), AqcError>
}

/// The sending end of a unidirectional channel.
/// Allows sending data streams over a channel.
pub struct AqcChannelSender {
    id: AqcChannelID
    conn: Handle,
}

impl AqcChannelSender {
    /// Create a new channel with the given id and conection handle.
    ///
    /// Returns the new channel and the sender used to send new streams to the
    /// channel.
    pub fn new(id: AqcChannelID, conn: Handle) -> Self

    /// Creates a new unidirectional stream for the channel.
    pub async fn create_unidirectional_stream(&mut self) -> Result<AqcSendStream, AqcError>

    /// Close the channel if it's open. If the channel is already closed, do nothing.
    pub fn close(&mut self) -> Result<(), AqcError>
}

/// A unique channel between two peers.
/// Allows sending and receiving data streams over a channel.
pub struct AqcBidirectionalChannel {
    sender: AqcChannelSender,
    receiver: AqcChannelReceiver,
    conn: Handle,
    bi_receiver: mpsc::Receiver<BidirectionalStream>,
}

impl AqcBidirectionalChannel {
    /// Create a new channel with the given conection handle.
    ///
    /// Returns the new channel and the sender used to send new streams to the
    /// channel.
    pub fn new(conn: Handle) -> (Self, (
            mpsc::Sender<ReceiveStream>,
        ),)

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

### Streams
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

[AKE]: https://doi.org/10.1007/bf00124891
[ECH]: https://www.ietf.org/archive/id/draft-ietf-tls-esni-24.html
[NIST SP 800-185]: https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-185.pdf
[RFC 8446]: https://www.rfc-editor.org/rfc/rfc8446.html
[RFC 9000]: https://www.rfc-editor.org/rfc/rfc9000.html
[RFC 9001]: https://www.rfc-editor.org/rfc/rfc9001
[RFC 9180]: https://www.rfc-editor.org/rfc/rfc9180.html
[RFC 9257]: https://www.rfc-editor.org/rfc/rfc9257.html
[rekey]: https://cseweb.ucsd.edu/~mihir/papers/rekey.pdf
