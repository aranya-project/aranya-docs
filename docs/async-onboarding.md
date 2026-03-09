# Async Onboarding

Aranya currently requires synchronous exchange of information to onboard a new device. This specification provides a machanism for devices to onboard themselves with a single exchange of information with a privileged device.

The system uses an 11 word phrase to exchange entropy used to derive cryptographic material. The privileged device uses the derived key to encrypt an onboarding bundle. The encrypted onboarding bundle is then dropped in the onboarding server, and a one time key is added to the graph by the privileged device. The new device uses the 11words (exchanged out of band) to derive the keys and information reiquired to fetch the onboarding bundle and decrypt it. The new device then uses the single-use onboarding key posted to graph to self join the team.


## Architecture

async-onboarding uses a standalone server to mediate asynchronous onboarding operations. This server is not a participant in the aranya team, but instead receives and distributed onboarding information according to a process that protects sensitive join information from the onboarding server. 

The server provides two endpoints: `drop` and `fetch`. These endpoints correspond to the privileged device dropping an encrypted onboarding bundle, and the new device fetching the onboarding bundle. 

### `drop`

The `drop` endpoint is authenticated by validating that the certificate presented matches a list of expected certificates, and that it is signed by a specific root authority. Requests against this endpoint require authentication via PKI. Drop takes three arguments:

1. The mailbox ID
2. The HMAC of the authenticator and mailbox
3. The ciphertext of the onboarding bundle

The onboarding server then stores this data for use with the `fetch` endpoint.

The onboarding server MUST validate that the presented

### `fetch`

The `fetch` endpoint is used by new devices to fetch the encrypted onboarding bundle. This endpoint does not require authentication via PKI, and instead authenticates requests based on the provided authenticator. Fetch takes two arguments:

1. The mailbox ID
2. The authenticator


## Onboarding Sequence

Actors:
- Admin - the privileged device capable and authorized to initiate the asynchronous onboarding proceedure. 
- Onboarding Server - the server that stores the onboarding bundle and validates the credentials provided for requests.
- New Device - the device that is being onboarded to the team.

```mermaid
sequenceDiagram
    participant Admin
    participant Graph
    participant Server as Onboarding Server
    participant New as New Device

    Note over Admin: Generate 11-word phrase from CSPRNG
    Note over Admin: Derive mailbox ID (128 bits)
    Note over Admin: Derive symmetric encryption key
    Note over Admin: Derive authenticator
    Note over Admin: Create one-time join keypair
    Note over Admin: Create signed device certificate
    Note over Admin: Encrypt bundle:<br/>cert + private key,<br/>one-time join keypair,<br/>pairing/syncing info,<br/>team ID

    Admin->>Graph: Publish one-time onboarding public key<br/>(AllowSelfJoinTeam)
    Admin->>Server: drop(mailbox ID, HMAC(authenticator, mailbox ID), ciphertext)
    Note over Server: Store bundle keyed by mailbox ID

    Admin-->>New: Send 11-word phrase (out of band)

    Note over New: Derive mailbox ID
    Note over New: Derive symmetric encryption key
    Note over New: Derive authenticator

    New->>Server: fetch(mailbox ID, authenticator)
    Note over Server: Validate HMAC(authenticator, mailbox ID)
    Server->>New: Encrypted onboarding bundle

    Note over New: Decrypt cert + private key
    Note over New: Decrypt one-time join keypair
    Note over New: Decrypt pairing/syncing info
    Note over New: Decrypt team ID

    New->>Graph: SelfJoinTeam (using one-time join key)
```

1. Admin prepares onboarding process
    1. Admin create one time join key (asymmetric key)
    2. Admin create signed device certificate
    3. Admin create onboarding bundle
        1. Admin creates 11 word phrase from CSPRNG
        2. Admin derives mailbox ID (128bits)
        3. Admin derives symmetric encryption key for onboarding bundle
        4. Admin derives authenticator that the new user will use to authenticate to the onboarding server
        5. Admin encrypts certificate + private key
        6. Admin encrypts one time join keypair
        7. Admin encrypts pairing/syncing info
        8. Admin encrypts team ID
    4. Admin publishes one-time onboarding public key to graph (AllowSelfJoinTeam)
    5. Admin sends onboarding bundle to onboarding server, with mailbox ID, encrypted payload, and HMAC of authenticator against mailbox ID
    6. send 11words to new user
2. Admin sends 11 words to new device:
    1. New device derives mailbox ID
    2. New device derives symmetric encryption key for onboarding bundle
3. New device fetches encrypted onboarding bundle using mailbox ID and authenticator (sends authenticator and mailbox ID, server computes HMAC(auth, mailbox ID)) from onboarding server
    1. New device decrypts certificate + private key
    2. New device decrypts one time join keypair
    3. New device decrypts pairing/syncing info
    4. New device decrypts team ID
4. New device publishes SelfJoinTeam command



