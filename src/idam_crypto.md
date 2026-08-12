# Crypto Engine Changes for IDAM Integration

This document outlines various changes to the crypto engine that will be needed for the new IDAM 
system and which will strengthen the security of cryptographic data used by Aranya.

## HSM Integration

One of the main goals is to improve our protection of cryptographic data by restricting the access 
and handling of sensitive information to be done only within our crypto engine. A further step is to 
support the use of a secure cryptographic module, such as an HSM or other hardware encryptor, that 
provides safe storage and management of cryptographic material for equipped devices. 

Thus, we will go through the crypto engine operations that are required by the policy specified in 
version 1 of the [IDAM spec](idam.md) and discuss the handling of relevant data. Underlying 
primitives used in our current implementation (detailed in the [SeedKey spec](seedkey.md)) will 
generally be kept.

NB: The first iteration of the IDAM spec assumes only one device per user.


## The Crypto Engine

Our cryptography engine consists of several cryptographic primitives whose underlying algorithms are 
restricted to certain conditions we set for security and system compatibility. Users are able to 
implement their own algorithms, provided that they meet appropriate requirements, or may choose any 
of the defaults supplied in `crypto/src/defaults.rs`. Either way, the algorithms must be explicitly 
declared as nothing will be selected automatically.

In addition, users can also choose the implementation [and storage] mechanisms. That is, rather than 
relying on our cryptography engine, a user may choose other means, such as an HSM, to execute any or 
all portions of an algorithm [and to store sensitive cryptographic material]. 

Whatever the chosen mechanisms, we expect they are secure enough to guarantee that sensitive data is 
never leaked from their domain or that it is extracted in a protected manner to our crypto engine. 
This includes intermediate values obtained from separate function calls made by a single operation. 
Any further use or delivery of such information will be handled only at the crypto engine but it is 
the user's responsibility to ensure the protection of all externally managed secret material.

## Storage

Aranya requires certain cryptographic secrets be kept locally by each user. The particular method 
for storing this data is at the discretion of the user, but some kind of access to it should be made 
available to the Aranya system via the provided KeyStore trait (e.g., by a reference or handle).

Since users determine the mechanism for storing these secret values outside of Aranya, they are 
presumed responsible for ensuring the external protection of all such data[, while we guarantee the 
secure management of this material when handled internally]. That is, we assume the 
chosen storage is secure against unauthorized access or information leakage but we make no guarantee 
regarding the security of the data while it remains outside the Aranya system. When handling these 
values internally, it is assumed that the unwrapped form of any such secret can only be exposed to 
the crypto engine and we guarantee to never 

assumptions:
* storage mechanism is secure against unwanted leaks or accesses
* all data in this storage is held in its wrapped form, using the wrapping algorithm provided to our crypto engine
* external protection of the data is the user's responsibility
* Aranya guarantees internal security of the data by only exposing unwrapped forms to the crypto engine - 
as long as user elects an appropriate wrapping algorithm, in accordance with our specifications

see [Key Wrapping](#key-wrapping).


<!-- Only the crypto engine has access to use the stored data from within the Aranya system, and any 
value that should be provided to other internal components, e.g. for delivery, must be securely 
formulated to do so. However, it is the responsibility of the user to ensure external protection of 
the secure storage.

For the remainder of this document, we refer to any such locally kept data as being held by the KeyStore. 
For simplicity, we refer to material accessible by the KeyStore as data which is held at the Keystore.  -->

<!-- to work properly. As such, users are provided with a `KeyStore` that 
must be initialized the with some kind of access to their secure local storage (e.g. via a reference 
or handle). -->


Some forms of cryptographic data are also stored by our FactDB and are presumed to be publicly 
available. Although values in the FactDB are typically produced from processing commands, an 
adversary could attempt to gain advantage by manually adding facts on a valid user device. It would 
be good to add stronger integrity guarantees by, for example, implementing security attestations 
that could be checked to determine if any tampering occurred.


## Data Types

Some additional data types should be defined for better clarity in distinguishing similar values.

### Identifiers

Identifiers in the form of 64 bytes are used for various cryptographic keys, users and commands. To 
provide a clearer distinction of these categories, we describe the following types:

| Data Type |      Purpose      | Example     |
|-----------|-------------------|-------------|
| `keyId`   | cryptographic key | SignID      |
| `eventId` | command           | ParentID    |
| `userId`  | user              | AuthorID    |
| `changeId`| track valid keys  | GroupChange |

The `changeId` type is slightly different from the others above and is discussed more in a 
[later section](#computing-the-changeid) that explains how to compute its value.

### Cryptographic Keys

There are a few cryptographic keys that our IDAM model uses which should be made separate through 
explicit data types as shown below. The first 3 describe the asymmetric user keys, where the private 
components are kept by the KeyStore and their public counterparts are typically shared between peers 
and stored in the FactDB. The last type, `GroupKey`, is a symmetric key that is held by the FactDB 
in a secure format and which is also delivered to peers.

|    Data Type    |      Purpose      |
|-----------------|-------------------|
| `IdentityKey`   | identify user     |
| `SigningKey`    | sign commands     |
| `EncryptionKey` | personal messages |
| `GroupKey`      | group messages    |

Keys can be provided in many forms and are frequently converted in various ways to obtain different 
representations. To support the use of hardware encryptors, we need most cryptographic keys to have 
an opaque type for better flexibility, but some restrictions apply when delivering keys through a 
command or storing them in the FactDB. 

Specifically, data in the FactDB can only be stored as sequences of bytes. Hence, most symmetric 
keys and asymmetric private keys will have an opaque type, while public asymmetric keys are 
generally the byte serialization of their [certificate](#Public Key Certificates). This applies to 
all of the above key types, except `GroupKey` which is a 64-byte symmetric key.

Note: the crypto engine may define additional key types that are not directly used by the IDAM, 
which is out of the scope of this document.

#### Public Key Certificates

Aranya's asymmetric public keys are stored and transmitted in the form of digital certificates, 
containing contextually binding information that is essential for meeting our security guarantees. 
Rather than using a standard format (e.g. X.509), we define a custom certificate that better holds 
the binding information we require and which is more suitable to implement in our system. 
Specifically, we use the following struct:

```rust
#[derive(Serialize, Deserialize)]
struct ExportedKey<'a, K: PubKey> {
    eng_id: Id, // uniquely identifies the engine
    suite_id: SuiteIds, // contains all algorithm identifiers
    pub_key_bytes: K::Data, // depends on `K`
}
```

Note that public keys are externally sent between peers during team member onboarding. Since only 
Aranya can verify keys with our custom certificate format, users should be cautious towards their 
delivery method and may want to add a layer of security for data authenticity and integrity. 


## Key Wrapping

We assume some key wrapping algorithm is applied to encrypt locally kept sensitive material, and 
leave it up to the user to choose the details for storing it. While no further assumptions are made 
regarding the security of the algorithm or any of its wrapping keys, we do rely on there being an 
appropriate value which can be used by the crypto engine to operate over the underlying data as 
needed. For instance, we might receive the values to fully unwrap the sensitive data, or maybe only 
a handle is given with the ability to call relevant functions that operate on the raw data.

Nevertheless, any such value must be supplied by the user through an implementation of the KeyStore. 
Unless otherwise specified, the type alias for objects held at the KeyStore is assumed to be the 
unique identifier which relates the object to the FactDB. For example, access to a private user key 
via the KeyStore requires the keyId that relates to its public counterpart held at the FactDB.

IDAM-related components that must be wrapped in this way include every received `GroupKey` and the 
private portion of each asymmetric user key (i.e., `IdentityKey`, `EncryptionKey` and `SigningKey`).
The crypto engine calls the corresponding `wrap` and `unwrap` functions when performing an operation 
on these values, but never exposes their raw key material. 


### Associated Data

Many of the following function descriptions include the use of some associated data, mostly to 
provide authentication. The particular values required in each case can differ and do not always 
need to be attained as input from the policy. I.e., it will sometimes be possible for the crypto 
engine to retrieve select data implicitly, such as the AuthorID of any given command.

Since this document outlines the components needed for integrating our new IDAM model, we make note 
of the associated data which must be explicitly provided as input from the policy engine. Some data, 
such as the EngineID or SuiteIDs are commonly used but do not involve the policy and may not always 
be mentioned in the descriptions below. Refer to other documentation for more details.


## Bootstrapping
The initial bootstrapping steps call other APIs from outside the policy and are out of scope of this 
document. Since the values produced by these steps are required by IDAM, we describe them briefly.

1. generate asymmetric `IdentityKey` that can be used for signing (e.g. ECDSA)
2. if account recovery is supported, locally secure `IdentityKey_private` in the KeyStore
3. set `UserID = hash(IdentityKey_public)` (e.g. HMAC) 
4. produce user keys by running `generate_userKey` for each key type: EncryptKey, SignKey
5. perform an onboarding command (either `CreateTeam` or `AddTeamMember`) with the user data

<!-- * To ensure account recovery is allowed only on the original user device, we recommend binding it to 
`IdentityKey_private` (e.g. using static device data). Note that some HSMs might do this by default. -->
* After recovery, users will need to rotate their user keys via a single command that must be signed 
by their private `IdentityKey`. All other commands are signed with a different user key. 

### generate_userKey
Called to bootstrap the system and for rotating a user EncryptionKey or SigningKey.

input: KeyType, Algorithm (both are integer identifiers) 
1. check that the specified Algorithm is permitted for the given KeyType
2. create asymmetric key pair using the specified Algorithm 
3. locally secure the private key in the KeyStore
4. obtain a certificate of the public key
5. serialize the public key certificate into encoded bytes
output: encoded public key certificate (bytes)


### encryption_key_id & signing_key_id
Called by onboarding commands (CreateTeam and AddTeamMember).

input: serialized public key certificate (bytes)
1. deserialize bytes into public key certificate and verify it
2. obtain the raw key bytes from the certificate
3. compute the keyID by hashing the raw public key bytes (e.g. HMAC)
output: keyID (64 bytes)

```rust
/// Derives the keyId for a user's public EncryptionKey
pub fn encryption_key_id<E: Engine + ?Sized>(pub_key_cert: &[u8]) -> Result<Id, Error> {
    let pub_key: EncryptionPublicKey<E> = from_bytes(pub_key_cert)
        .map_err(|e| KeyConversionError::DecodePublicKeyCert(DecodePublicKeyCertError(e)))?;
    Ok(pub_key.id().into())
}

/// Derives the keyId for a user's public SigningKey
pub fn signing_key_id<E: Engine + ?Sized>(pub_key_cert: &[u8]) -> Result<Id, Error> {
    let pub_key: VerifyingKey<E> = from_bytes(pub_key_cert)
        .map_err(|e| KeyConversionError::DecodePublicKeyCert(DecodePublicKeyCertError(e)))?;
    Ok(pub_key.id().into())
}
```

## GroupKey APIs

### generate_group_key
Called only by rotateGroupKey action.

input: 
1. randomly generate 512 bits to be the GroupKey
2. derive a keyId from the raw bytes of the GroupKey
3. wrap the GroupKey to obtain its keyWrap form
output: struct { keyID (bytes), keyWrap (bytes) }

```rust
/// Creates a new GroupKey and returns its wrapped form and keyId for FactDB storage
pub fn generate_group_key<E: Engine + ?Sized>(eng: &mut E) -> Result<WrappedGroupKey, Error> {
    // Randomly generate 512 bits
    let group_key: GroupKey<E> = GroupKey::new(eng);
    // Prepare the GroupKey for FactDb storage
    group_key_for_fact(group_key, eng)
}

fn group_key_for_fact<E: Engine + ?Sized>(
    group_key: GroupKey<E>,
    eng: &mut E,
) -> Result<WrappedGroupKey, Error> {
    // Compute the keyId of the GroupKey
    let group_key_id = group_key.id();
    // Convert to UnwrappedKey and wrap for FactDB storage
    let unwrapped_key = UnwrappedKey::from(group_key);
    let wrapped_key = E::wrap(eng, unwrapped_key)?;

    // Encode the wrapped key into bytes and return WrappedGroupKey struct
    let group_key_wrap = wrapped_key
        .encode()
        .map_err(|_| KeyConversionError::EncodeWrappedKey)?;
    Ok(WrappedGroupKey {
        key_id: group_key_id.into(),
        key_wrap: group_key_wrap.borrow().to_vec(),
    })
}

/// GroupKey struct expected by Policy
pub struct WrappedGroupKey {
    /// Unique identifier for the GroupKey
    pub key_id: Id,
    /// Byte serialization of the wrapped GroupKey
    pub key_wrap: Vec<u8>,
}
```

### seal_group_key
Called by rotateGroupKey action.

input: wrapped GroupKey (bytes), receiver public EncryptionKey (bytes), GroupID
1. get the unwrapped GroupKey object 
2. deserialize and validate the receiver's public EncryptionKey certificate 
3. perform KEM steps to derive a secret key from the GroupID and public EncryptionKey (e.g ECDH)
4. encrypt the GroupKey using derived secret (e.g. AES) to produce the ciphertext
5. encapsulate the secret
output: struct { encapsulated secret (bytes), ciphertext (bytes) }

* A single rotateGroupKey action makes separate calls to this API for each valid recipient. So, a 
performance improvement could be to hold the unwrapped GroupKey in some cache at the crypto engine 
to reduce the number of times the same GroupKey is unwrapped.
* The "info" parameter used when sealing a GroupKey consists of the GroupID, SuiteIDs and EngineID.

```rust
/// Encrypt the GroupKey with the public EncryptionKey of the intended receiver
pub fn seal_group_key<E: Engine + ?Sized>(
    group_key_wrap: &[u8],
    peer_enc_key: &[u8],
    group_id: Id,
    eng: &mut E,
) -> Result<SealedGroupKey, Error>
where
    <E::Aead as Aead>::TagSize: Add<U64>,
    Sum<<E::Aead as Aead>::TagSize, U64>: ArraySize,
{
    // Obtain a GroupKey object for the provided key
    let group_key = unwrap_group_key(group_key_wrap, eng)?;

    // Deserialize and validate the peer's public EncryptionKey cert
    let pub_key: EncryptionPublicKey<E> = from_bytes(peer_enc_key)
        .map_err(|e| KeyConversionError::DecodePublicKeyCert(DecodePublicKeyCertError(e)))?;

    // Seal GroupKey to the peer's public encryption key with the associated GroupID
    let (enc, ct) = pub_key.seal_group_key(eng, &group_key, group_id)?;

    // Return the byte representations of ciphertext and encapsulated secret
    Ok(SealedGroupKey {
        encap: enc.as_bytes().to_vec(),
        ciphertext: ct.as_bytes().to_vec(),
    })
}

// Helper function to deserialize and unwrap the keyWrap of GroupKey
fn unwrap_group_key<E: Engine + ?Sized>(
    group_key_wrap: &[u8],
    eng: &mut E,
) -> Result<GroupKey<E>, Error> {
    // Decode the provided bytes into WrappedKey
    let wrapped_group_key =
        WrappedKey::decode(group_key_wrap).map_err(|_| KeyConversionError::DecodeWrappedKey)?;

    // Unwrap and return the GroupKey object
    let unwrapped_group_key = eng.unwrap(&wrapped_group_key)?;
    Ok(unwrapped_group_key.try_into()?)
}

/// GroupKey sealed for a peer
pub struct SealedGroupKey {
    /// Encapsulated secret needed to decrypt the key
    pub encap: Vec<u8>,
    /// Ciphertext for the encrypted GroupKey
    pub ciphertext: Vec<u8>,
}
```


### unseal_group_key
Called by SealedGroupKey command

input: struct { encapsulated secret (bytes), ciphertext (bytes) }, public EncryptKey (bytes), GroupID
1. parse ciphertext to separate the encapsulated secret from the GroupKey encryption
2. use the public EncryptKey to locate the respective private key from the KeyStore
3. unwrap the private EncryptKey
4. compute the secret from its encapsulation using the private EncryptKey and GroupID
5. decrypt the GroupKey with the secret
6. derive the keyID from the decrypted GroupKey
7. wrap the GroupKey to obtain its keyWrap form
output: struct { keyID (bytes), keyWrap (bytes) }

```rust
/// Decrypt a received GroupKey
pub fn unseal_group_key<E: Engine + ?Sized>(
    sealed_group_key: SealedGroupKey,
    priv_enc_key: &E::WrappedKey,
    group_id: Id,
    eng: &mut E,
) -> Result<WrappedGroupKey, Error>
where
    <E::Aead as Aead>::TagSize: Add<U64>,
    Sum<<E::Aead as Aead>::TagSize, U64>: ArraySize,
{
    // Get encapsulated secret and ciphertext from sealed_group_key
    let SealedGroupKey {
        encap: enc,
        ciphertext: ct,
    } = sealed_group_key;
    let encap = Encap::from_bytes(enc.as_slice())?;
    let ciphertext = EncryptedGroupKey::from_bytes(ct.as_slice())?;

    // Obtain the user's unwrapped private EncryptionKey
    let unwrapped_enc_key = eng.unwrap(priv_enc_key)?;
    let encryption_key: EncryptionKey<E> = unwrapped_enc_key.try_into()?;

    let group_key = encryption_key.open_group_key(&encap, &ciphertext, group_id)?;

    // Return the GroupKey prepared for FactDB storage
    group_key_for_fact(group_key, eng)
}
```


## Message Delivery

Sending and receiving messages require unwrapping the respective GroupKey first. When messages that 
use the same GroupKey are sent/received consecutively, it may be desirable to cache an unwrapped 
GroupKey at the crypto engine for a reasonably short interval to improve the efficiency.

### encrypt_message
Called by the sendMessage action.

input: wrapped GroupKey (bytes), plaintext message (bytes), parentID, public SignKey
1. unwrap the GroupKey
2. compute a per-event key via KDF using the GroupKey, parentID, public SignKey
3. encrypt the plaintext by AEAD with the per-event key, parentID, public SignKey, and random nonce
output: ciphertext (bytes)

```rust
/// Encrypt a message for a group using its GroupKey
pub fn encrypt_message<E: Engine + ?Sized>(
    group_key_wrap: &[u8],
    plaintext: &[u8],
    parent_id: Id,
    pub_sign_key: &[u8],
    command: CommandType,
    eng: &mut E,
) -> Result<Vec<u8>, Error> {
    let group_key = unwrap_group_key(group_key_wrap, eng)?;
    let mut dst = vec![0u8; plaintext.len() + group_key.overhead()];

    let author: VerifyingKey<E> = from_bytes(pub_sign_key)
        .map_err(|e| KeyConversionError::DecodePublicKeyCert(DecodePublicKeyCertError(e)))?;
    let ctx = Context {
        label: command.as_str(),
        parent: parent_id,
        author: &author,
    };

    group_key.seal(eng, &mut dst, plaintext, ctx)?;
    Ok(dst)
}
```

### decrypt_message
Called when a received Message command is being processed 

input: ciphertext, wrapped GroupKey (bytes), parentID (bytes), public SignKey
1. unwrap the GroupKey
2. extract the nonce from the provided ciphertext
3. use the GroupKey, parentID and public SignKey to compute the per-event key via KDF
4. decrypt message with the per-event key, public SignKey, parentID, and the nonce using AEAD
output: plaintext (bytes)


## Command-Related 

### sign
Called by every action in the policy.

input: command struct, public SigningKey (bytes)
1. locate the private SigningKey from KeyStore using the provided public key
2. generate a digital signature over the command using SigningKey_private
output: signed command (bytes?)

* The user's most recent SigningKey should be used. We specify using the public key as an input 
parameter used to locate the private key but an alternative is to index the most recent value.


### Computing the ChangeID 
Computes the hash chain of all rotation-invoking events that occurred at the team or a specific 
group. It is called by every rotation-invoking command.

input: EventID of rotation-invoking command (bytes), previous ChangeID (bytes)
1. Compute the hash (e.g. HMAC) of the EventID and previous ChangeID to obtain the new ChangeID
output: new ChangeID (bytes)

* If HMAC is used as the hashing algorithm, the EventID can be used as the HMAC key and the previous 
ChangeID as the message.
* Initial value `ChangeID_0` is computed over the TeamID / GroupID.



<!-- ## Notation

| Policy Lang       |  Crypto Engine                                      | Primitive |
|-------------------|-----------------------------------------------------|-----------|
// command identifiers
| `eventId`         | command                                             | ParentID  |
| `parentId`        | command                                             | AuthorID  |
| `teamId`          | command                                             | AuthorID  |
| `groupId`         | command                                             | AuthorID  |

// user identifiers
| `userId`          | user                                                | AuthorID  |
| `authorId`        | user                                                | AuthorID  |

// key properties
| `keyId`           | key                                                 | [u8;64]   |
| `keyWrap`         | cryptographic           (WrappedKey)                | bytes     |
| `pub_key_cert`    | asymmetric public       (ExportedKey)               | cert      |

// user keys
| `priv_id_key`     | asymmetric private  (IdentityKey)                   | bytes     |
| `pub_id_key`      | asymmetric public  (IdentityVerifyingKey)           | opaque    |
| `priv_sign_key`   | asymmetric private  (SigningKey)                    | opaque    |
| `pub_sign_key`    | asymmetric public        (VerifyingKey)             | bytes     |
| `priv_enc_key`    | asymmetric private       (EncryptionKey)            | opaque    |
| `pub_enc_key`     | asymmetric public        (EncryptionPublicKey)      | bytes     |

// group key
| `group_key`       | symmetric    (GroupKey)                             | bytes     |
| `WrappedGroupKey` | struct { keyID (bytes), keyWrap (bytes) }           |           |
| `SealedGroupKey`  | struct { Encap (bytes), EncryptedGroupKey (bytes) } |           |
-->

<!-- ### Cryptographic Keys

The table below shows this in more detail.

NB: "keyWrap" refers to the output bytes of wrapping a GroupKey, and "wrappingKey" is the key used 
to produce the keyWrap from a GroupKey (see [Key Wrapping section](#key-wrapping)). 
 
|           Key                 | Location |  Type  |
|-------------------------------|----------|--------|
| keyWrap                       | FactDB   | bytes  |
| IdentityKey (private)         | KeyStore | opaque |
| IdentityVerifyingKey (public) | FactDB   | bytes  |
| SigningKey (private)          | KeyStore | opaque |
| VerifyingKey (public)         | FactDB   | bytes  |
| EncryptionKey (private)       | KeyStore | opaque |
| EncryptionPublicKey (public)  | FactDB   | bytes  |
| GroupKey (symmetric)          | KeyStore | opaque |
| wrappingKey (symmetric)       | KeyStore | opaque | 

|       Key            |    Key Type        |  Type  |
|----------------------|--------------------|--------|
| EncryptedGroupKey    | symmetric          | bytes  |
| ExportedKey          | asymmetric public  | cert   |

* Key types: Signature Key, Encryption Key, Group Key, Identity Key, 
* Key Formats: public key cert (storage/delivery), wrapped GroupKey (storage), sealed GroupKey (delivery)
* only the GroupKey has a fixed size (64 bytes)




Public Key Cert
1. Decoding keys as an incorrect type must fail. For example, decoding a P-256 ECDSA key as a P-256 
ECDH key should fail. Or, decoding an X25519 key as a P-256 key should fail. Etc.
1. Decoding keys with the wrong Engine should fail. For example, if I encode a key using "EngineV1," 
decoding it with "EngineV2" should fail—even if both Engines use the same algorithms. 

Providing the EngineID protects against cross-protocol attacks, while including the key type in ____ 
protects against cross-algorithm attacks.

-->


<!-- ## External Key Management

Cryptographic material can also be handled externally via other means chosen by the device. In this 
case, values would need to be imported and exported in a secure manner that maintains usability of 
the material by the Aranya system. 

For example, a user might decide to use their own generator to create the user keys and import them 
to the crypto engine. Since we currently rely on asymmetric user keys, the import function should be 
set to accept an asymmetric key delivered in a protected format that can be exposed accordingly to 
the crypto engine and used in the appropriate manner noted above. 

An imported key should include:
* KeyTpe - e.g. "UserSigningKey" 
* Supported Algorithms - e.g. "only ECDSA"
* Value - i.e. raw bytes 
* Issuer - 

If an EC private key is being imported, according to RFC 5919, it should be in ECPrivateKey format 
that is then DER [X.690] encoded (i.e. converting it to PrivateKeyInfo form) prior to being 
encrypted for delivery. -->