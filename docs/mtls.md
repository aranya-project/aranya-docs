---
layout: page
title: mTLS
permalink: "/mtls/"
---

# Aranya mTLS Authentication

## Overview

mTLS is mutual TLS authentication. Traditional TLS only authenticates the server to the client, but not the client to the server. mTLS provides mutual authentication by validating the identities of both peers to each other via their TLS certs before sending data over a secure channel.

mTLS authentication in the Aranya syncer allows users to leverage their existing PKI infrastructure to authenticate nodes to each other before syncing.

Aranya's sync traffic is secured via mTLS over QUIC using the `quinn` library with `rustls` for TLS. This replaces the previous PSK-based authentication.

Abbreviations in this document:
- certificate -> cert
- certificates -> certs
- SVID -> Subject Verification ID (SHA-256 hash of certificate public key)

## Requirements

- Users must be able to leverage their existing external PKI for generating/signing certs
- mTLS certs must be X.509 TLS certs in PEM format.
- A single device cert is configured when the daemon loads. The device cert must be signed by one of the root certs or an intermediate CA cert.
- A set of root certs is configured when the Aranya daemon loads
- The configured root certs and device cert are used for all QUIC connections and Aranya teams
- QUIC connection attempts by the syncer should fail the TLS handshake if certs have not been configured/signed properly
- QUIC connection attempts with expired certs should fail the TLS handshake
- Security events such as failed authentication, signature verification failures, and suspicious connection patterns (e.g., same certificate from multiple IP addresses) should be logged

Note:
QUIC requires TLS 1.3 so that is an implied requirement. It's worth mentioning here since it is relevant to the security properties of our mTLS implementation.

Future enhancements:
- Different root and device certs for different teams
- Use system root certs
- Verify that device cert is signed by one of the root certs when daemon loads, rather than failing later during TLS authentication
- Cert revocation. SVID-based connection tracking can detect suspicious patterns (same cert from multiple IPs) that may indicate compromise. Syncing with a revoked cert only leaks team metadata. Devices can be removed from an Aranya team without the need for revoking certs.
- Cert rotation/renewal
- Supporting cert formats other than PEM

## Suggested Integration Requirements

- We recommend using P-256 ECDSA secret keys of at least 256 bits to meet current NIST standards (NIST SP 800-52 Rev. 2).
- Certs and their corresponding secret keys are stored on disk without further protection. Therefore, we recommend protecting the secret keys with an encrypted filesystem, restricted file permissions, and a HSM/TPM.

## Certgen CLI Tool Requirements

- Must use P-256 ECDSA secret keys
- Must be able to generate a root CA cert and P-256 ECDSA secret key pair
- Must be able to generate new certs signed by a root CA along with their P-256 ECDSA secret key
- Must output certs in PEM format with `.crt.pem` and `.key.pem` extensions
- Must allow a CN (Common Name) to be specified for each generated cert
- CN is automatically added as a SAN (Subject Alternative Name) - auto-detected as DNS or IP based on format
- Must allow a validity period in days to be specified so certs can expire

Example usage:
```bash
# Create a root CA (creates ca.crt.pem and ca.key.pem)
aranya-certgen ca --cn "My Company CA" --days 365

# Create a root CA with custom output prefix (creates ./certs/myca.crt.pem and ./certs/myca.key.pem)
aranya-certgen ca --cn "My Company CA" --days 365 -o ./certs/myca -p

# Create a signed certificate (creates cert.crt.pem and cert.key.pem)
aranya-certgen signed ca --cn server --days 365

# Create a signed certificate with custom output
aranya-certgen signed ./certs/myca --cn server --days 365 -o ./certs/server
```

CLI flags:
- `--cn`: Common Name for the certificate (required)
- `--days`: Validity period in days (default: 365)
- `-o/--output`: Output path prefix (default: "ca" for CA, "cert" for signed)
- `-p`: Create parent directories if they don't exist
- `-f/--force`: Overwrite existing files

Future enhancements:
- Explicit SAN support via `--dns` and `--ip` flags for additional SANs beyond the CN
- HSM encryption of secret keys

## Certificate Generation

mTLS root and device certs can be generated externally via a user's existing PKI infrastructure, or using the `aranya-certgen` CLI tool provided with Aranya.
Device certs are signed by one of the root certs or an intermediate CA cert.

We recommend using P-256 ECDSA certs generated from a secret key of at least 256 bits (NIST SP 800-52 Rev. 2).

Certs should not be checked into repositories and should always be generated for each deployment.

## Daemon Configuration

Paths to the root certs directory, device cert file, and device key file are provided in the daemon config.
The root cert directory is assumed to be flat: we do not support any recursion or symlinks.
Only `.pem` files in the root certs directory are loaded (`.key.pem` files are skipped).
Certs will be loaded into the QUIC syncer module when the daemon loads.

daemon_config.toml:
```toml
[sync.quic]
enable = true
addr = "0.0.0.0:4321"
root_certs_dir = "/etc/aranya/certs/ca"
device_cert = "/etc/aranya/certs/device.crt.pem"
device_key = "/etc/aranya/certs/device.key.pem"
```

The Aranya daemon will refuse to start if the following conditions are not met:
- The root certs directory (`root_certs_dir`) contains at least one root certificate `.pem` file.
- The device cert file (`device_cert`) exists and contains a valid certificate.
- The device key file (`device_key`) exists and contains a valid private key.

Verification of the cert chain is not performed by the daemon when starting up and loading certs into the QUIC library. For simplicity, we will rely on the QUIC library to detect invalid certs at runtime when performing the TLS handshake for QUIC connections.

Please ensure that your PKI infrastructure has done the following before loading certs into the daemon's QUIC syncer:
- Generated the root certs and any intermediate CA certs
- Signed device certs with root certs or intermediate CA certs
- Included any relevant SANs information in the certs
- Ideally, the cert chain should be validated before loading certs into Aranya to avoid troubleshooting failed TLS handshakes at runtime

## Breaking Changes

### Breaking Aranya API Changes

All QUIC syncer PSK and IKM related Aranya APIs and configs for the QUIC syncer will be replaced with the new daemon cert configuration defined in this document.
This will cause breaking changes to the Aranya API.

### Breaking Deployment Changes

Existing Aranya deployments using PSKs will not be compatible with newer Aranya software which has migrated to mTLS certs. We recommend upgrading all Aranya software in a deployment to a version that supports mTLS certs at the same time.

Existing Aranya deployments using different PSKs for each team will no longer be able to manage different certs for each team. Reusing certs across teams is acceptable since it only leaks team metadata such as devices, roles, permissions, etc. Aranya's RBAC scheme must grant permissions to a device/role before it is allowed to perform any operations on the graph.
If using different mTLS certs for each team is important, we recommend isolating each team into its own Aranya deployment with different certs rather than managing multiple teams in the same deployment. In the future, we intend to allow different certs to be used for each team in a single deployment.

## SVID-Based Connection and Cache Keying

### Problem

The initial mTLS implementation keys connection maps and peer caches by socket address (`SocketAddr`). While mTLS validates the peer's certificate, it doesn't bind the validated identity to the connection's network address. This creates a denial-of-service vulnerability:

An attacker with a compromised cert could connect from many different IP addresses, each creating a separate entry in the connection map. This could exhaust connection slots or resources, preventing legitimate peers from connecting.

### Solution: SVID (Subject Verification ID)

We introduce an SVID (Subject Verification ID), defined as the SHA-256 hash of the peer's validated certificate public key. Connection maps and peer caches are keyed by SVID rather than socket address.

Properties of SVID:
- **Unique per certificate/identity**: Each certificate has a distinct SVID
- **Survives certificate rotation**: If the same key pair is used for a renewed cert, the SVID remains the same
- **Available only after TLS handshake**: Cannot be spoofed since it's extracted from the validated certificate

### SVID Extraction

After the TLS handshake completes, the SVID is extracted as follows:

1. Call `conn.peer_identity()` on the quinn `Connection` to get the certificate chain
2. Take the first certificate (the leaf/end-entity cert) - TLS certificate chains are ordered with the leaf first
3. Parse the certificate using an X.509 parser to extract the SubjectPublicKeyInfo
4. Compute SHA-256 hash of the public key bytes

We hash only the public key (not the entire certificate) so that certificate rotation with the same key pair preserves the SVID.

Note: We only compute SVIDs for certificates that rustls has already validated against our root CA store. The SVID extraction assumes a trusted certificate.

### Connection Map Keying

The `ConnectionKey` struct changes from:

```rust
struct ConnectionKey {
    addr: SocketAddr,
}
```

To:

```rust
struct ConnectionKey {
    svid: Svid,
    addr: SocketAddr,
}
```

Connections are keyed by **(SVID, addr)**. When a new connection arrives with an SVID that already has a connection from a different address:
- This is suspicious - same cert from multiple IPs suggests compromise
- A warning is logged for investigation
- Future enhancement: trigger certificate revocation

The limit on connections per SVID serves as a safety net, but the real fix for a compromised cert is revocation.

### Peer Cache Keying

Peer caches (used for sync state like last known command) must also key on SVID to prevent the same DOS attack vector:

```rust
struct PeerCacheKey {
    svid: Svid,
    graph_id: GraphId,
}
```

This separates concerns:
- **SyncPeer** with `(Addr, GraphId)` - for scheduling which peers to connect to (our configuration)
- **PeerCacheKey** with `(Svid, GraphId)` - for caching sync state by validated identity
- **ConnectionKey** with `(Svid, Addr)` - for connection deduplication by validated identity

### Hello Subscriptions

Hello subscriptions (used for push notifications) are also keyed by `PeerCacheKey` rather than address. The subscription stores the peer's address separately for sending notifications.

### Security Model

**Key principle:** Never use an address from a peer as a map key without first validating their certificate and computing their SVID.

| Map | Key | Rationale |
|-----|-----|-----------|
| Connection map | (SVID, Addr) | Prevents one compromised cert from occupying many connection slots |
| Peer caches | (SVID, GraphId) | Prevents cache poisoning from spoofed addresses |
| Hello subscriptions | (SVID, GraphId) | Same as peer caches |
| SyncManager.peers | (Addr, GraphId) | Safe because this is our configuration, not peer-provided |

**Connection Flow:**

1. We initiate connection to a configured address (our config, not peer-provided)
2. TLS handshake validates peer certificate against our root CA
3. Extract SVID from validated certificate
4. Use SVID for connection map and cache keying
5. If peer connects to us, same flow: validate cert first, then extract SVID

### Implementation Notes

**Certificate format during extraction:** While certificates are stored on disk as PEM files, quinn/rustls internally converts them to DER during TLS setup. After the TLS handshake, `peer_identity()` returns `CertificateDer` (DER-encoded). The SVID extraction parses DER format.

**Race condition on connect:** We cannot look up an existing connection by SVID before connecting (we don't know the SVID until after TLS). This matches existing behavior where duplicate connections may briefly exist. A future optimization could maintain a secondary index from addr to SVID for quick lookups.
