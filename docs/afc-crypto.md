---
layout: page
title: AFC Cryptography
permalink: "/afc-cryptography/"
---

# AFC Cryptography

## Overview

Aranya Fast Channels (AFC) is a low latency, high throughput
encryption engine that uses Aranya for key management and
authorization.

Its primary concerns are throughput and latency. In general, its
fast path should only add a handful of additional instructions on
top of the underlying cryptography engine.

Encryption is scoped to a particular _channel_, which supports
one-to-one communication in either a unidirectional or
bidirectional manner.

## Notation

- `"abc"`: A byte string containing the UTF-8 characters between
  the double quotation marks (`"`).
- `concat(x0, ..., xN)`: The concatenation of byte strings.
  `concat(a, b, c) = abc`.
- `EncryptionKey(u)`: The Aranya device's `EncryptionKey`.
- `i2osp(n, w)`: Converts the unsigned (non-negative) integer `n`
  to a `w`-byte big-endian byte string.
- `random(n)`: A uniform, pseudorandom byte string of `n` bytes.
- `(x0, ..., xN) = split(x)`: The reverse of `concat`.
- `DeviceId(u)`: The Aranya DeviceID for some device `u`.
- `ALG_Op(...)`: A cryptographic algorithm routine. E.g.,
  `AEAD_Seal(...)`, `HPKE_OneShotSeal(...)`, etc.

## Design

Conceptually, AFC implements this interface:

```
// Encrypts and authenticates `plaintext` for the channel
// (device, label).
fn encrypt(device, label, plaintext) -> ciphertext;

// Decrypts and authenticates `ciphertext` received from `device`.
fn decrypt(device, ciphertext) -> (label, plaintext);
```

As mentioned, a _channel_ facilitates one-to-one communication.
Logically, it is identified by a (device1, device2, label) tuple
where _device1_ and _device2_ are Aranya devices and
_label_ is an identifier that both devices have been granted
permission to use.

The label binds a channel to a set of Aranya policy rules,
ensuring that both channel devices meet some specified criteria.

> **Note**: Devices and Labels are mapped to 32 byte IDs.

### Bidirectional Channels

Bidirectional channels allow both devices to encrypt and decrypt
data. Generally speaking, they're the default channel type.

#### Cryptography

Each bidirectional channel has two unique symmetric [AEAD] keys,
(k1, k2), called the _ChannelKeys_. One side of the channel uses
k1 for encryption and k2 for decryption. The other side uses the
k2 for encryption and k1 for decryption. The key used for
encryption is referred to as the _SealKey_ and the key used for
decryption is referred to as the _OpenKey_.

##### Key Derivation

ChannelKeys are derived using HPKE's Secret Export API.

For domain separation purposes, the key derivation scheme
includes both DeviceIDs. Additionally, in order to prevent
duplicate ChannelKeys (from a buggy CSPRNG), it mixes in the ID
of the command that created the channel. (Command IDs are assumed
to be unique; for more information, see the [Aranya spec](/docs/aranya-beta.md).)

The key derivation scheme is as follows:

```rust
// `parent_cmd_id` is the parent command ID.
fn NewChannelKeys(us, peer, parent_cmd_id, label) {
    if DeviceId(us) == DeviceId(peer) {
        raise SameIdError
    }

    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AfcChannelKeys",
        suite_id,
        engine_id,
        parent_cmd_id,
        DeviceId(us),
        DeviceId(peer)
        label,
    )
    (enc, ctx) = HPKE_SetupSend(
        mode=mode_auth,
        skS=sk(EncryptionKey(us)),   // our private key
        pkR=pk(EncryptionKey(peer)), // the peer's public key
        info=info,
    )

    SealKey = HPKE_ExportSecret(ctx, DeviceId(peer))
    OpenKey = HPKE_ExportSecret(ctx, DeviceId(us))

    // `enc` is sent to the other device.
    // `seal_key` and `open_key` are provided to AFC.
    return (enc, (SealKey, OpenKey))
}

// `parent_cmd_id` is the parent command ID.
fn DecryptChannelKeys(enc, us, peer, parent_cmd_id, label) {
    if DeviceId(us) == DeviceId(peer) {
        raise SameIdError
    }

    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AfcChannelKeys",
        suite_id,
        engine_id,
        parent_cmd_id,
        // Note how these are swapped.
        DeviceId(peer)
        DeviceId(us),
        label,
    )
    ctx = HPKE_SetupRecv(
        mode=mode_auth,
        enc=enc,
        pkS=pk(EncryptionKey(peer)), // the peer's public key
        skR=sk(EncryptionKey(us)),   // our private key
        info=info,
    )

    // Remember, these are the reverse of `NewChannelKeys`.
    SealKey = HPKE_ExportSecret(ctx, DeviceId(peer))
    OpenKey = HPKE_ExportSecret(ctx, DeviceId(us))

    return (seal_key, open_key)
}
```

### Unidirectional Channels

Unidirectional channels allow one device to encrypt and one device to
decrypt.

#### Cryptography

Each unidirectional channel has one unique symmetric [AEAD] key.
The side that encrypts calls this the _SealOnlyKey_ and the side
that decrypts calls this the _OpenOnlyKey_.

##### Key Derivation

The SealOnlyKey/OpenOnlyKey is derived using HPKE's Secret Export
API.

For domain separation purposes, the key derivation scheme
includes both DeviceIDs. Additionally, in order to prevent
duplicate keys (from a buggy CSPRNG), it mixes in the ID of the
command that created the channel. (Command IDs are assumed to be
unique; for more information, see the [Aranya spec](/docs/aranya-beta.md).)

The key derivation scheme is as follows:

```rust
// `seal_id` is the device that is allowed to encrypt.
// `open_id` is the device that is allowed to decrypt.
// `parent_cmd_id` is the parent command ID.
fn NewSealOnlyKey(seal_id, open_id, parent_cmd_id, label) {
    if seal_id == open_id {
        raise SameIdError
    }

    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AfcUnidirectionalKey",
        suite_id,
        engine_id,
        parent_cmd_id,
        seal_id,
        open_id,
        label,
    )
    (enc, ctx) = HPKE_SetupSend(
        mode=mode_auth,
        skS=sk(EncryptionKey(us)),   // our private key
        pkR=pk(EncryptionKey(peer)), // the peer's public key
        info=info,
    )

    SealOnlyKey = HPKE_ExportSecret(ctx, "unidirectional key")

    // `enc` is sent to the other device.
    // `SealOnlyKey` is provided to AFC.
    return (enc, SealOnlyKey)
}

// `seal_id` is the device that is allowed to encrypt.
// `open_id` is the device that is allowed to decrypt.
// `parent_cmd_id` is the parent command ID.
fn DecryptOpenOnlyKey(enc, us, peer, parent_cmd_id, label) {
    if DeviceId(us) == DeviceId(peer) {
        raise SameIdError
    }

    suite_id = concat(aead_id, kdf_id, signer_id, ...)
    info = concat(
        "AfcUnidirectionalKey",
        suite_id,
        engine_id,
        parent_cmd_id,
        seal_id,
        open_id,
        label,
    )
    ctx = HPKE_SetupRecv(
        mode=mode_auth,
        enc=enc,
        pkS=pk(EncryptionKey(peer)), // the peer's public key
        skR=sk(EncryptionKey(us)),   // our private key
        info=info,
    )

    return HPKE_ExportSecret(ctx, "unidirectional key")
}
```

### Cryptography

Outside of key derivation, the remaining cryptography is
identical for both channel types.

#### Message Encryption

AFC encrypts each message with a uniformly random nonce generated
by a CSPRNG.

```rust
// channel_id is a 32-bit integer used to look up channels
fn Seal(channel_id, label, SealKey, plaintext) {
    header = concat(
        i2osp(version, 4), // version is a constant
        label,
    )
    nonce = random(AEAD_nonce_len())
    SealKey = FindSealKey(channel_id)
    ciphertext = AEAD_Seal(
        key=SealKey,
        nonce=nonce,
        plaintext=plaintext,
        ad=header,
    )
    // For performance reasons, the nonce and header are
    // appended, instead of prepended.
    return concat(ciphertext, nonce, header)
}

// channel_id is a 32-bit integer used to look up channels
fn Open(channel_id, label, ciphertext) {
    // NB: while the header includes multiple fields, we only use
    // the `label` since we already know everything else.
    (ciphertext, nonce, header) = split(ciphertext);
    (_, _, label) = split(header);

    OpenKey = FindOpenKey(channel_id)

    plaintext = AEAD_Open(
        key=OpenKey,
        nonce=nonce,
        ciphertext=ciphertext,
        ad=header,
    )
    return plaintext
}
```

#### Key Usage

Each encryption key must not be used more than allowed by the
underlying AEAD (i.e., it should respect the AEAD's lifetime).
**The current specification does not require AFC to track how
much a particular key is used. This will change in the future.**

#### Algorithms

##### AEAD

Briefly, [AEAD] encryption is a construction with four inputs:

1. uniformly random key `K`
2. nonce `N` that is unique for each unique `(K, P)` tuple
3. plaintext `P` which will be encrypted
4. associated data `A` that will be authenticated, but *not*
   encrypted

It outputs a ciphertext `C` which is at least as long as `P`.
AEAD decryption works in the inverse manner. For formal and
more comprehensive documentation, see [RFC 5116].

The requirements on the chosen AEAD are more restrictive than
[RFC 5116]. Specifically, the cipher must:

* Have at least a 128-bit security level for confidentiality.
* Have at least a 128-bit security level for authenticity.
* Have a minimum key size of 16 octets (128 bits).
* Accept plaintexts up to 2³² - 1 octets (2³⁵ - 8 bits) long.
* Accept associated data up to 2³² - 1 (2³⁵ - 8 bits) octets
  long.

Examples of AEAD algorithms that fulfill these requirements
include [AES-256-GCM], [ChaCha20-Poly1305], and [Ascon]. It is
highly recommended to use a nonce misuse-resistant AEAD, like
[AES-GCM-SIV].

#### Committing AEAD

A _committing_ AEAD is an AEAD that binds the authenticator to
one or more of the AEAD inputs. For more information, see
[Efficient Schemes for Committing Authenticated
Encryption][Bellare].

##### KDF

An extract-then-expand Key Derivation Function (KDF) as
formally defined in section 3 of [HKDF].

The KDF must:

* Have a security level of at least 128 bits.
* Extract a PRK at least 128 bits long.
* Expand a PRK into a key at least 512 bits long.

> **Note**: It does _not_ need to be suitable for deriving keys
> from passwords. In other words, it does not need to be a "slow"
> KDF like PBKDF2.

##### HPKE

Hybrid Public Key Encryption (HPKE) per [RFC 9180].

[AEAD]: https://datatracker.ietf.org/doc/html/rfc5116
[AES-256-GCM]: https://nvlpubs.nist.gov/nistpubs/legacy/sp/nistspecialpublication800-38d.pdf
[AES-GCM-SIV]: https://www.rfc-editor.org/rfc/rfc8452.html
[AFC]: https://github.com/aranya-project/aranya-core/tree/main/crates/aranya-fast-channels
[Ascon]: https://csrc.nist.gov/News/2023/lightweight-cryptography-nist-selects-ascon
[Bellare]: https://eprint.iacr.org/2022/268
[CSPRNG]: https://en.wikipedia.org/wiki/Cryptographically_secure_pseudorandom_number_generator
[ChaCha20-Poly1305]: https://datatracker.ietf.org/doc/html/rfc8439
[HKDF]: https://eprint.iacr.org/2010/264
[RFC 5116]: https://www.rfc-editor.org/rfc/rfc5116.html
[RFC 9180]: https://www.rfc-editor.org/rfc/rfc9180.html
