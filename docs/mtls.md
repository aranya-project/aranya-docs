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
- fingerprint -> SHA-256 fingerprint of the X.509 certificate's public key

## Requirements

- Users must be able to leverage their existing external PKI for generating/signing certs
- mTLS certs must be X.509 TLS certs in PEM format.
- All certs must contain Subject Alternative Names (SANs). Certs without SANs will be rejected. TLS requires server certs to have SANs for hostname verification (CN is deprecated). TLS does not require client certs to have SANs, but we enforce this with our custom client cert verification which checks the client's connecting IP against IP SANs or DNS SANs that resolve to the client's IP.
- A single device cert is configured when the daemon loads. The device cert must be signed by one of the root certs or an intermediate CA cert.
- A set of root certs is configured when the Aranya daemon loads
- The configured root certs and device cert are used for all QUIC connections and Aranya teams
- QUIC connection attempts by the syncer should fail the TLS handshake if certs have not been configured/signed properly
- QUIC connection attempts with expired certs should fail the TLS handshake
- Connection events (fingerprint, IP, accept/reject) should be logged for external security monitoring

Note:
QUIC requires TLS 1.3 so that is an implied requirement. It's worth mentioning here since it is relevant to the security properties of our mTLS implementation.

Future enhancements:
- Different root and device certs for different teams
- Use system root certs
- Verify that device cert is signed by one of the root certs when daemon loads, rather than failing later during TLS authentication
- Cert revocation. Syncing with a revoked cert only leaks team metadata. Devices can be removed from an Aranya team without the need for revoking certs.
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

## Fingerprint Uniqueness

### Problem

While mTLS validates the peer's certificate, it doesn't prevent the same certificate from being used to establish multiple connections from different IP addresses. This creates a denial-of-service vulnerability:

An attacker with a compromised cert could connect from many different IP addresses, each creating a separate entry in the connection map. This could exhaust connection slots or resources, preventing legitimate peers from connecting.

### Solution

Connection maps and peer caches are keyed by socket address, but we enforce that only one connection can exist per fingerprint. A new connection with a fingerprint that matches an existing connection will be accepted and cause the old connection to be closed.

It's possible for an attacker with a compromised cert to DOS attack a single device by repeatedly connecting and forcing that device's connection to close. However, this requires the attacker to have that device's compromised cert. A compromised cert should be revoked and a new cert generated and deployed. The goal of this solution is to prevent a single compromised cert from DOS attacking the entire Aranya network — an attacker can only disrupt connections for the specific cert they have compromised.

Properties of fingerprint:
- **Unique per certificate**: Each certificate has a distinct fingerprint
- **Survives certificate rotation**: If the same key pair is used for a renewed cert, the fingerprint remains the same
- **Available only after TLS handshake**: Cannot be spoofed since it's computed from the validated certificate

### Fingerprint Type

The `Fingerprint` type is a 32-byte SHA-256 hash of the public key in the peer's certificate:
```rust
/// SHA-256 hash of a peer's certificate public key.
/// Used to uniquely identify peers regardless of their network address.
#[derive(Copy, Clone, Debug, Eq, PartialEq, Ord, PartialOrd, Hash)]
pub(crate) struct Fingerprint([u8; 32]);

impl Fingerprint {
    /// Compute fingerprint from a QUIC connection's verified peer certificate.
    ///
    /// Returns an error if the peer identity cannot be extracted or parsed.
    pub fn from_connection(conn: &quinn::Connection) -> Result<Self, FingerprintError>;
}
```

### Fingerprint Computation

`Fingerprint::from_connection` computes the fingerprint from the QUIC connection after the TLS handshake completes:

1. Call `conn.peer_identity()` to get the certificate chain
2. Downcast to `Vec<CertificateDer>` (rustls's certificate type)
3. Take the first certificate (the leaf/end-entity cert) - TLS certificate chains are ordered with the leaf first
4. Parse the DER-encoded certificate using `x509-parser` to extract the SubjectPublicKeyInfo
5. Compute SHA-256 hash of the public key bytes using `aranya-crypto`

We hash only the public key (not the entire certificate) so that certificate rotation with the same key pair preserves the fingerprint.

Note: Fingerprints are only computed for certificates that rustls has already validated against our root CA store.

Dependencies: `x509-parser` for parsing DER-encoded certificates, `aranya-crypto` for SHA-256.

## Connection Management

### Data Structures
```rust
/// Map keyed by network address for connection reuse.
connections: HashMap<SocketAddr, Connection>

/// Map from fingerprint to address for enforcing one connection per identity.
/// New connections with an existing fingerprint cause the old connection to be closed.
fingerprints: HashMap<Fingerprint, SocketAddr>
```

### Connection Flow

1. Want to connect to address X
2. Check if we have an existing healthy connection to X — if yes, reuse it
3. Otherwise, initiate connection to X
4. TLS handshake completes (validates peer certificate, verifies client SANs)
5. Compute fingerprint from peer certificate
6. If fingerprint exists in `fingerprints` map, close the old connection and remove it from `connections`
7. Insert fingerprint into `fingerprints` map, store connection in `connections` map

When a connection closes, remove its entry from both maps.

### Peer Caches and Subscriptions

Peer caches (sync state) and hello subscriptions (push notifications) are keyed by `(SocketAddr, GraphId)`:
```rust
struct PeerCacheKey {
    addr: SocketAddr,
    graph_id: GraphId,
}
```

## Client SAN Verification

By default, TLS only verifies server certificate SANs. Client certificate SANs are not verified because there is no "expected hostname" to check against. We enforce client SAN verification to ensure the client's connecting IP matches their certificate.

### Verification Rules

The connection is accepted if ANY of the following are true:
- A SAN contains an IP address matching the client's connecting IP
- A SAN contains a DNS hostname that resolves to the client's connecting IP

If no SAN matches, reject the connection.

### Implementation

The `ClientCertVerifier` trait does not have access to the peer's IP address, so SAN verification is performed after the TLS handshake:
```rust
fn verify_client_san(conn: &quinn::Connection) -> Result<(), SanError> {
    let peer_ip = conn.remote_address().ip();
    let certs = conn.peer_identity()
        .and_then(|id| id.downcast::<Vec<CertificateDer>>().ok())?;
    let cert = certs.first()?;

    let (_, parsed) = x509_parser::parse_x509_certificate(cert)?;

    for san in parsed.subject_alternative_name()?.value.general_names.iter() {
        match san {
            GeneralName::IPAddress(ip_bytes) => {
                if ip_from_bytes(ip_bytes) == peer_ip {
                    return Ok(());
                }
            }
            GeneralName::DNSName(hostname) => {
                if dns_resolves_to(hostname, peer_ip) {
                    return Ok(());
                }
            }
            _ => continue,
        }
    }

    Err(SanError::NoMatchingSan)
}
```

### Security Considerations

- **DNS resolution**: DNS resolution for SAN verification introduces a dependency on DNS infrastructure and adds latency. Consider caching results.
- **NAT**: If the client is behind NAT, the connecting IP may not match cert SANs. Use DNS-based SANs that resolve to the NAT's external IP.
- **Dynamic IPs**: For clients with dynamic IP addresses, use DNS-based SANs and ensure DNS records are updated when IPs change.
