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

## Requirements

- Users must be able to leverage their existing external PKI for generating/signing certs
- mTLS certs must be X.509 TLS certs in a format supported by rustls (PEM or DER). The `aranya-certgen` tool outputs PEM only.
- All certs must contain Subject Alternative Names (SANs). TLS requires server certs to have SANs for hostname verification (CN is deprecated). Client SANs are verified when reusing an inbound connection in reverse (see [Client SAN Verification](#client-san-verification)).
- Each team has its own device cert and root CA certs, allowing different teams to use different PKI trust chains
- The device cert for each team must be signed by one of that team's root certs or an intermediate CA cert
- QUIC connection attempts by the syncer should fail the TLS handshake if certs have not been configured/signed properly
- QUIC connection attempts with expired certs should fail the TLS handshake
- Security-relevant events should be logged:
  - Failed authentication attempts
  - Certificate validation failures
  - Connection accept/reject with IP

Note:
QUIC requires TLS 1.3 so that is an implied requirement. It's worth mentioning here since it is relevant to the security properties of our mTLS implementation.

Future enhancements:
- Use system root certs
- Verify that device cert is signed by one of the root certs when certs are configured, rather than failing later during TLS authentication
- Cert revocation. Currently, Aranya does not check certificate revocation status (CRL/OCSP). If a cert is revoked by external PKI infrastructure but not yet rotated, an attacker with the compromised cert can still establish connections and sync. This leaks graph metadata (e.g., number of devices, team structure) but not application data protected by Aranya's encryption. Devices should be removed from the Aranya team immediately upon cert compromise; cert revocation provides defense-in-depth once implemented.

## Suggested Integration Requirements

- We recommend using P-256 ECDSA secret keys of at least 256 bits to meet current NIST standards (NIST SP 800-52 Rev. 2).
- We recommend protecting the source cert/key files with an encrypted filesystem and restricted file permissions prior to importing them into Aranya.

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

mTLS root and device certs can be generated using either:

1. **External PKI** — Users can provide certs from their existing PKI infrastructure. The daemon accepts any cert format supported by rustls, which includes PEM and DER (see [rustls-pki-types documentation](https://docs.rs/rustls-pki-types/latest/rustls_pki_types/)). Certs must be X.509 and the device cert must be signed by one of the provided root CA certs or an intermediate CA cert.

2. **`aranya-certgen` CLI tool** — Aranya's built-in cert generation tool. Outputs certs in PEM format only (see [Certgen CLI Tool Requirements](#certgen-cli-tool-requirements)).

The generated cert and key files are provided to the daemon via the `set_cert` API (see [Certificate Configuration](#certificate-configuration)). For example, using `aranya-certgen`:

```bash
# Generate a root CA
aranya-certgen ca --cn "My Company CA" --days 365

# Generate a device cert signed by the CA
aranya-certgen signed ca --cn 192.168.1.10 --days 365 -o device

# Configure the team with the generated certs
# (via client API)
# set_cert(team_id, ["ca.crt.pem"], "device.crt.pem", "device.key.pem")
```

We recommend using P-256 ECDSA certs generated from a secret key of at least 256 bits (NIST SP 800-52 Rev. 2).

Certs should not be checked into repositories and should always be generated for each deployment.

## Certificate Configuration

Certs are configured per-team via the client API using the `set_cert` method. This is separate from team creation — a team must exist before its certs can be configured, and certs must be configured before sync peers are added.

### API

```
set_cert(team_id, root_certs, device_cert, device_key)
```

Parameters:
- `team_id` — the team to configure TLS for
- `root_certs` — file paths to one or more root CA certificate files
- `device_cert` — file path to the device certificate file
- `device_key` — file path to the device private key file

The daemon accepts file paths from the client via IPC. The client should zeroize/drop the paths after the IPC call returns since the daemon has its own copy. The daemon is responsible for detecting the certificate format (PEM, DER, etc.) and performing any necessary conversion.

`set_cert` is idempotent — it handles both initial configuration and cert rotation. Calling it again for the same team overwrites the previous cert configuration.

### Call Ordering

```
create_team / add_team  →  set_cert  →  add_sync_peer
```

Sync peers require a TLS configuration to establish connections. `add_sync_peer` should fail if certs have not been configured for the team.

### Import Flow

When `set_cert` is called:

1. Daemon reads the cert and key files from the provided paths
2. Daemon copies the device cert to `state_dir/certs/<team_id>.crt.pem`
3. Daemon copies the root CA certs to `state_dir/certs/<team_id>.root.crt.pem`
4. Daemon stores the private key in the keystore as a `TlsPrivateKey` (AEAD-encrypted at rest, keyed by team ID). If a `TlsPrivateKey` already exists for this team, it is replaced.
5. Daemon deletes the source cert and private key files
6. Daemon builds rustls `ClientConfig` and `ServerConfig` for the team (with the team's device cert, private key, and root CAs)
7. Private key bytes are zeroized and dropped from application memory — only rustls holds the key material internally after this point

### Startup Flow

When the daemon starts:

1. Scan `state_dir/certs/` for team IDs (each `<team_id>.crt.pem` indicates a configured team)
2. For each team: load the device cert and root CA certs from `state_dir/certs/`
3. For each team: load the `TlsPrivateKey` from the keystore using the team ID
4. Build rustls `ClientConfig` and `ServerConfig` per team (team-specific device cert and root CAs)
5. Store configs for use by the quinn QUIC endpoint when establishing connections
6. Zeroize and drop private key bytes from application memory

### Cert Rotation

Call `set_cert` again with new file paths. The daemon overwrites the cert files in `state_dir/certs/`, replaces the `TlsPrivateKey` in the keystore, rebuilds the rustls configs, and deletes the source files.

### Team Removal

When a team is removed:

1. Delete `state_dir/certs/<team_id>.crt.pem` and `state_dir/certs/<team_id>.root.crt.pem`
2. Remove the `TlsPrivateKey` from the keystore
3. Remove the team's `ClientConfig` and `ServerConfig`
4. Close any open connections for this team

## Private Key Storage

### TlsPrivateKey Type

A new `TlsPrivateKey<CS>` type is added to aranya-core's crypto engine to store TLS private keys in the daemon's keystore. This follows the existing pattern used by `PskSeed`, signing keys, and encryption keys.

- `TlsPrivateKey<CS>` — unwrapped key type holding the raw private key bytes
- `TlsKeyId` — typed ID for keystore lookup, derived deterministically from the team ID
- `Ciphertext::Tls` — new variant in the keystore's AEAD wrapping enum

The keystore encrypts the private key at rest using AEAD (AES-256-GCM). The key is only decrypted when needed (during `set_cert` import or daemon startup) and is zeroized immediately after being handed to rustls.

### Security Properties

- **At rest**: private key is AEAD-encrypted in the keystore
- **During import**: private key bytes exist briefly in daemon memory while being read from the source file and stored in the keystore. Source file is deleted after import.
- **At runtime**: only rustls holds the private key internally. The daemon's copy is zeroized after rustls config is built.
- **Source file cleanup**: both the source cert and private key files are deleted after import. The private key file is ephemeral — it exists only long enough to be imported into the keystore.

## TLS Configuration Architecture

### Per-Team Certs and Connections

Each team has its own device cert (signed by that team's CA) and root CA certs. The device uses the same private key across all teams, but has a separate certificate per team since each team's CA signs the device's cert independently.

QUIC connections are established per (peer, team) pair. Each connection uses the team-specific certs on both sides:
- The outbound peer configures the connection with the team's `ClientConfig` (team's device cert + team's root CAs)
- The inbound peer configures the connection with the team's `ServerConfig` (team's device cert + team's root CAs)
- The TLS handshake mutually validates both peers' certs against the team's root CAs

This means all cert validation is handled by the TLS layer — no application-layer post-handshake verification is needed. A peer with a cert from Team A's CA cannot establish a connection for Team B because the TLS handshake will fail.

Connections are reused within a team. A new connection is only established when the existing one drops or when syncing with a new peer.

### In-Memory Representation

```rust
/// Per-team TLS configs (team-specific device cert + root CAs).
/// Used for both outbound (ClientConfig) and inbound (ServerConfig) connections.
tls_configs: HashMap<TeamId, TeamTlsState>

struct TeamTlsState {
    client_config: Arc<ClientConfig>,
    server_config: Arc<ServerConfig>,
}
```

Keeping one config pair per team is acceptable for the expected number of teams per device. Both `ClientConfig` and `ServerConfig` are lightweight — they hold cert/key references and root CA stores.

## Connection Management

### Connection Flow

1. Want to sync with peer at address X for team T
2. Check if we have an existing healthy connection to (X, T) — if yes, reuse it
3. Otherwise, initiate connection to X using team T's `ClientConfig` (via `connect_with()`)
4. TLS handshake completes (mutual cert validation against team T's root CAs)
5. Store connection in the connection map keyed by (socket address, team ID)

When a connection closes, remove its entry from the connection map.

Peers that share multiple teams maintain separate connections per team. Each connection uses the appropriate team-specific certs and root CAs. QUIC connections are lightweight, so this is not a significant resource concern.

### Reverse Connection Reuse

When a peer connects to us (inbound) for a specific team, we may reuse that connection to sync back to them for the same team rather than opening a separate outbound connection. This is the only case where client SAN verification applies (see [Client SAN Verification](#client-san-verification)).

### Peer Caches and Subscriptions

Peer caches (sync state) and hello subscriptions (push notifications) are keyed by `(SocketAddr, GraphId)`:
```rust
struct PeerCacheKey {
    addr: SocketAddr,
    graph_id: GraphId,
}
```

## SAN Verification

By default, TLS verifies server certificate SANs on outbound connections. Client certificate SANs are not verified on inbound connections because there is no "expected hostname" to check against.

### Client SAN Verification

Client SAN verification is performed only when reusing an inbound connection in reverse — i.e., when a peer connected to us and we want to reuse that connection to sync back to them. In this case, we verify that the peer's certificate SANs match the IP address they connected from, since we are now treating the inbound connection as if it were an outbound connection to that address.

The connection is accepted if ANY of the following are true:
- A SAN contains an IP address matching the peer's connecting IP
- A SAN contains a DNS hostname that resolves to the peer's connecting IP

If no SAN matches, the connection is not reused in reverse and a new outbound connection is established instead.

Client SAN verification can be disabled via config for deployments with dynamic IPs:

```toml
[sync.quic]
# Optional: disable client SAN verification for reverse connection reuse.
# When disabled, inbound connections can be reused in reverse regardless of SANs.
# Default: false (verification enabled)
# disable_client_san_verification = true
```

### Server SAN Verification

Standard TLS server SAN verification ensures the server's certificate contains a SAN matching the hostname or IP the client is connecting to. This prevents man-in-the-middle attacks.

Server SAN verification can be disabled via config:

```toml
[sync.quic]
# DANGEROUS: Disable server SAN verification. Enables man-in-the-middle attacks.
# Only use if servers have dynamic IPs AND no DNS infrastructure is available.
# Default: false (verification enabled)
# disable_server_san_verification = true
```

### Implementation

The `ClientCertVerifier` trait does not have access to the peer's IP address, so client SAN verification is performed after the TLS handshake when deciding whether to reuse a connection in reverse:
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

Server SAN verification is disabled by implementing a custom `ServerCertVerifier` that skips the server name matching while still verifying the certificate chain.

### Security Considerations

- **DNS resolution**: DNS resolution for SAN verification introduces a dependency on DNS infrastructure and adds latency. Consider caching results.
- **NAT**: If the client is behind NAT, the connecting IP may not match cert SANs. Use DNS-based SANs that resolve to the NAT's external IP.
- **Dynamic IPs**: For deployments with dynamic IP addresses where DNS is not available, disable SAN verification via config flags.

## Breaking Changes

### Breaking Aranya API Changes

All QUIC syncer PSK and IKM related Aranya APIs and configs for the QUIC syncer will be replaced with the new `set_cert` API defined in this document. `CreateTeamQuicSyncConfig`, `AddTeamQuicSyncConfig`, `CreateSeedMode`, `AddSeedMode`, and related types will be removed. This will cause breaking changes to the Aranya API.

### Breaking Deployment Changes

Existing Aranya deployments using PSKs will not be compatible with newer Aranya software which has migrated to mTLS certs. We recommend upgrading all Aranya software in a deployment to a version that supports mTLS certs at the same time.
