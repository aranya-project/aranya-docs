---
layout: page
title: mTLS
permalink: "/mtls/"
---

# Aranya mTLS Authentication

This specification uses [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) keywords (MUST, MUST NOT, SHOULD, SHOULD NOT, MAY) for normative requirements.

## Overview

mTLS is mutual TLS authentication. Traditional TLS only authenticates the server to the client, but not the client to the server. mTLS provides mutual authentication by validating the identities of both peers to each other via their TLS certs before sending data over a secure channel.

mTLS authentication in the Aranya syncer allows users to leverage their existing PKI infrastructure to authenticate nodes to each other before syncing.

Aranya's sync traffic is secured via mTLS over QUIC using the `quinn` library with `rustls` for TLS. This replaces the previous PSK-based authentication. QUIC requires TLS 1.3, which is an implied requirement relevant to the security properties of this implementation. **[MTLS-001]**

Abbreviations in this document:
- certificate -> cert
- certificates -> certs

## Requirements

Certs MUST be X.509 TLS certs in a format supported by rustls (PEM or DER). **[CERT-001]** The `aranya-certgen` tool outputs PEM only. Users MUST be able to leverage their existing external PKI for generating and signing certs. **[CERT-002]**

All certs MUST contain Subject Alternative Names (SANs). **[CERT-003]** TLS requires server certs to have SANs for hostname verification (CN is deprecated). Client SANs are verified when reusing an inbound connection in reverse (see [Client SAN Verification](#client-san-verification)).

Each team MUST have its own device cert and root CA certs, allowing different teams to use different PKI trust chains. **[CERT-004]** The device cert for each team MUST be signed by one of that team's root certs or an intermediate CA cert. **[CERT-005]** A device MAY reuse the same private key across multiple teams with different certs signed by each team's CA, or MAY use entirely different certs and keys per team. **[CERT-006]**

QUIC connection attempts MUST fail the TLS handshake if certs have not been configured or signed properly. **[CONN-001]** QUIC connection attempts with expired certs MUST fail the TLS handshake. **[CONN-002]**

The daemon MUST log security-relevant events: **[LOG-001]**
- Failed authentication attempts
- Certificate validation failures
- Connection accept/reject with IP

Future enhancements:
- Use system root certs
- Verify that device cert is signed by one of the root certs when certs are configured, rather than failing later during TLS authentication
- Cert revocation. Currently, Aranya does not check certificate revocation status (CRL/OCSP). If a cert is revoked by external PKI infrastructure but not yet rotated, an attacker with the compromised cert can still establish connections and sync. This leaks graph metadata (e.g., number of devices, team structure) but not application data protected by Aranya's encryption. Devices SHOULD be removed from the Aranya team immediately upon cert compromise; cert revocation provides defense-in-depth once implemented.

## Suggested Integration Requirements

Certs SHOULD use P-256 ECDSA secret keys of at least 256 bits to meet current NIST standards (NIST SP 800-52 Rev. 2). **[INTEG-001]** Source cert/key files SHOULD be protected with an encrypted filesystem and restricted file permissions prior to importing them into Aranya. **[INTEG-002]**

## Certgen CLI Tool

The `aranya-certgen` CLI tool generates X.509 certs for use with Aranya's mTLS implementation. It is provided as a convenience — users MAY use their own PKI infrastructure instead. **[GEN-001]**

The tool MUST use P-256 ECDSA secret keys. **[GEN-002]** It MUST be able to generate a root CA cert and key pair. **[GEN-003]** It MUST be able to generate new certs signed by a root CA along with their key. **[GEN-004]** It MUST output certs in PEM format with `.crt.pem` and `.key.pem` extensions. **[GEN-005]**

A CN (Common Name) MUST be specifiable for each generated cert. **[GEN-006]** The CN MUST be automatically added as a SAN (Subject Alternative Name), auto-detected as DNS or IP based on format. **[GEN-007]** Additional SANs MUST be specifiable via `--dns` and `--ip` flags for multiple DNS hostnames and IP addresses beyond the CN. **[GEN-008]** A validity period in days MUST be specifiable so certs can expire. **[GEN-009]**

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

# Create a signed certificate with multiple SANs (for NAT/multi-homed deployments)
aranya-certgen signed ca --cn mydevice.example.com --ip 192.168.1.10 --ip 10.0.0.5 --dns mydevice.local --days 365
```

CLI flags:
- `--cn`: Common Name for the certificate (required)
- `--dns`: Additional DNS SAN (can be specified multiple times)
- `--ip`: Additional IP SAN (can be specified multiple times)
- `--days`: Validity period in days (default: 365)
- `-o/--output`: Output path prefix (default: "ca" for CA, "cert" for signed)
- `-p`: Create parent directories if they don't exist
- `-f/--force`: Overwrite existing files

Future enhancements:
- HSM encryption of secret keys

## Certificate Generation

mTLS root and device certs can be generated using either:

1. **External PKI** — Users MAY provide certs from their existing PKI infrastructure. **[GEN-001]** The daemon MUST accept any cert format supported by rustls, which includes PEM and DER (see [rustls-pki-types documentation](https://docs.rs/rustls-pki-types/latest/rustls_pki_types/)). **[CERT-001]** Certs MUST be X.509 and the device cert MUST be signed by one of the provided root CA certs or an intermediate CA cert. **[CERT-005]**

2. **`aranya-certgen` CLI tool** — Aranya's built-in cert generation tool. Outputs certs in PEM format only (see [Certgen CLI Tool](#certgen-cli-tool)).

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

Certs SHOULD use P-256 ECDSA generated from a secret key of at least 256 bits (NIST SP 800-52 Rev. 2). **[INTEG-001]**

Certs MUST NOT be checked into repositories and SHOULD always be generated for each deployment. **[GEN-010]**

## Certificate Configuration

Certs MUST be configured per-team via the client API using the `set_cert` method. **[CFG-001]** This is separate from team creation — a team MUST exist before its certs can be configured. **[CFG-002]** Certs MUST be configured before sync peers are added. **[CFG-003]**

### API

```
set_cert(team_id, root_certs, device_cert, device_key)
```

Parameters:
- `team_id` — the team to configure TLS for
- `root_certs` — file paths to one or more root CA certificate files
- `device_cert` — file path to the device certificate file
- `device_key` — file path to the device private key file

The daemon MUST accept file paths from the client via IPC. **[CFG-004]** The client SHOULD zeroize/drop the paths after the IPC call returns since the daemon has its own copy. **[SEC-001]** The daemon MUST detect the certificate format (PEM, DER, etc.) and perform any necessary conversion. **[CFG-005]**

`set_cert` MUST be idempotent — it handles both initial configuration and cert rotation. **[CFG-006]** Calling it again for the same team MUST overwrite the previous cert configuration.

### Call Ordering

```
create_team / add_team  →  set_cert  →  add_sync_peer
```

`add_sync_peer` MUST fail if certs have not been configured for the team. **[CFG-003]**

### Import Flow

When `set_cert` is called:

1. The daemon MUST read the cert and key files from the provided paths. **[CFG-004]**
2. The daemon MUST copy the device cert to `state_dir/certs/<team_id>.crt.pem`. **[CFG-007]**
3. The daemon MUST copy the root CA certs to `state_dir/certs/<team_id>.root.crt.pem`. **[CFG-008]**
4. The daemon MUST store the private key in the keystore as a `TlsPrivateKey` (AEAD-encrypted at rest, keyed by team ID). **[SEC-002]** If a `TlsPrivateKey` already exists for this team, it MUST be replaced. **[CFG-006]**
5. The daemon MUST delete the source cert and private key files. **[SEC-003]**
6. The daemon MUST build rustls `ClientConfig` and `ServerConfig` for the team (with the team's device cert, private key, and root CAs). **[CFG-009]**
7. Private key bytes MUST be zeroized and dropped from application memory after being handed to rustls. **[SEC-004]**

### Startup Flow

When the daemon starts:

1. The daemon MUST scan `state_dir/certs/` for team IDs (each `<team_id>.crt.pem` indicates a configured team). **[START-001]**
2. For each team: the daemon MUST load the device cert and root CA certs from `state_dir/certs/`. **[START-002]**
3. For each team: the daemon MUST load the `TlsPrivateKey` from the keystore using the team ID. **[START-003]**
4. The daemon MUST build rustls `ClientConfig` and `ServerConfig` per team (team-specific device cert and root CAs). **[CFG-009]**
5. The daemon MUST store configs for use by the quinn QUIC endpoint when establishing connections. **[START-004]**
6. Private key bytes MUST be zeroized and dropped from application memory after being handed to rustls. **[SEC-004]**

### Cert Rotation

`set_cert` MUST be called again with new file paths to rotate certs. **[CFG-006]** The daemon MUST overwrite the cert files in `state_dir/certs/`, replace the `TlsPrivateKey` in the keystore, rebuild the rustls configs, and delete the source files.

### Team Removal

When a team is removed:

1. The daemon MUST delete `state_dir/certs/<team_id>.crt.pem` and `state_dir/certs/<team_id>.root.crt.pem`. **[REM-001]**
2. The daemon MUST remove the `TlsPrivateKey` from the keystore. **[REM-002]**
3. The daemon MUST remove the team's `ClientConfig` and `ServerConfig`. **[REM-003]**
4. The daemon MUST close any open connections for this team. **[REM-004]**

## Private Key Storage

### TlsPrivateKey Type

A new `TlsPrivateKey<CS>` type MUST be added to aranya-core's crypto engine to store TLS private keys in the daemon's keystore. **[KEY-001]** This follows the existing pattern used by `PskSeed`, signing keys, and encryption keys.

- `TlsPrivateKey<CS>` — unwrapped key type holding the raw private key bytes
- `TlsKeyId` — typed ID for keystore lookup, derived deterministically from the team ID **[KEY-002]**
- `Ciphertext::Tls` — new variant in the keystore's AEAD wrapping enum **[KEY-003]**

The keystore MUST encrypt the private key at rest using AEAD (AES-256-GCM). **[SEC-002]** The key MUST only be decrypted when needed (during `set_cert` import or daemon startup) and MUST be zeroized immediately after being handed to rustls. **[SEC-004]**

### Security Properties

- **At rest**: the private key MUST be AEAD-encrypted in the keystore. **[SEC-002]**
- **During import**: private key bytes exist briefly in daemon memory while being read from the source file and stored in the keystore. The source file MUST be deleted after import. **[SEC-003]**
- **At runtime**: only rustls holds the private key internally. The daemon's copy MUST be zeroized after the rustls config is built. **[SEC-004]**
- **Source file cleanup**: both the source cert and private key files MUST be deleted after import. **[SEC-003]** The private key file is ephemeral — it exists only long enough to be imported into the keystore.

## TLS Configuration Architecture

### Per-Team Certs and Connections

Each team MUST have its own device cert (signed by that team's CA) and root CA certs. **[CERT-004]** A device MAY use the same private key across all teams with a separate certificate per team, or MAY use entirely different certs and keys per team. **[CERT-006]**

QUIC connections MUST be established per (peer, team) pair. **[CONN-003]** Each connection MUST use the team-specific certs on both sides:
- The outbound peer MUST configure the connection with the team's `ClientConfig` (team's device cert + team's root CAs). **[CONN-004]**
- The inbound peer MUST configure the connection with the team's `ServerConfig` (team's device cert + team's root CAs). **[CONN-005]**
- The TLS handshake MUST mutually validate both peers' certs against the team's root CAs. **[CONN-006]**

All cert validation is handled by the TLS layer — no application-layer post-handshake verification is needed. A peer with a cert from Team A's CA MUST NOT be able to establish a connection for Team B. **[CONN-007]**

Connections MUST be reused within a team. **[CONN-008]** A new connection is only established when the existing one drops or when syncing with a new peer.

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
2. Check if we have an existing healthy connection to (X, T) — if yes, reuse it **[CONN-008]**
3. Otherwise, initiate connection to X using team T's `ClientConfig` (via `connect_with()`) **[CONN-004]**
4. TLS handshake completes (mutual cert validation against team T's root CAs) **[CONN-006]**
5. Store connection in the connection map keyed by (socket address, team ID)

When a connection closes, its entry MUST be removed from the connection map. **[CONN-009]**

Peers that share multiple teams MUST maintain separate connections per team. **[CONN-003]** Each connection uses the appropriate team-specific certs and root CAs. QUIC connections are lightweight, so this is not a significant resource concern.

### Reverse Connection Reuse

When a peer connects to us (inbound) for a specific team, we MAY reuse that connection to sync back to them for the same team rather than opening a separate outbound connection. **[CONN-010]** This is the only case where client SAN verification applies (see [Client SAN Verification](#client-san-verification)).

### Peer Caches and Subscriptions

Peer caches (sync state) and hello subscriptions (push notifications) are keyed by `(SocketAddr, GraphId)`:
```rust
struct PeerCacheKey {
    addr: SocketAddr,
    graph_id: GraphId,
}
```

## SAN Verification

### Server SAN Verification

Server SANs MUST always be verified (standard TLS 1.3 behavior). **[SAN-001]** The server's certificate MUST contain a SAN matching the hostname or IP the client is connecting to. This prevents man-in-the-middle attacks and MUST NOT be disabled. **[SAN-002]**

For deployments with dynamic server IPs, DNS SANs SHOULD be used that resolve to the server's current IP address rather than IP SANs. **[SAN-003]** Generate certs with a DNS hostname as the CN (e.g., `aranya-certgen signed ca --cn mydevice.example.com --days 365`). Update DNS records when the IP changes.

### Client SAN Verification

Client SANs MUST be verified only when reusing an inbound connection in reverse — i.e., when a peer connected to us and we want to reuse that connection to sync back to them for the same team. **[SAN-004]** In this case, the peer's certificate SANs MUST be checked against the IP address they connected from, since we are now treating the inbound connection as if it were an outbound connection to that address. **[SAN-005]**

The connection MUST be reused in reverse if ANY of the following are true: **[SAN-006]**
- A SAN contains an IP address matching the peer's connecting IP
- A SAN contains a DNS hostname that resolves to the peer's connecting IP

If no SAN matches, the connection MUST NOT be reused in reverse. **[SAN-007]** Instead, a new outbound connection MUST be established to the peer. This is a graceful fallback, not an error.

### NAT Considerations

When a peer is behind NAT, the connecting IP seen by the server is the NAT's external IP, not the peer's actual IP. The peer's cert SANs typically won't match the NAT IP, so reverse connection reuse will fail the SAN check and fall back to a new outbound connection.

Strategies for NAT deployments:
- **Use the NAT's external IP or hostname in cert SANs** — if the NAT IP is stable, include it in the cert. Reverse reuse will work.
- **Establish redundant outbound connections** — both peers initiate outbound connections to each other. No reverse reuse needed. The QUIC transport handles this gracefully.
- **Relay via a peer not behind NAT** — both NAT'd peers sync through a third party with a routable address.

### Implementation

The `ClientCertVerifier` trait does not have access to the peer's IP address, so client SAN verification MUST be performed after the TLS handshake when deciding whether to reuse a connection in reverse: **[SAN-004]**
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

### Additional Security Considerations

- **DNS resolution**: DNS resolution for SAN verification introduces a dependency on DNS infrastructure and adds latency. Results SHOULD be cached. **[SAN-008]**
- **Dynamic IPs without DNS**: If a deployment has dynamic IPs and no DNS infrastructure, IP SANs SHOULD be used and certs rotated when IPs change via `set_cert`. Alternatively, redundant outbound connections can be used rather than reverse reuse.

## Breaking Changes

### Breaking Aranya API Changes

All QUIC syncer PSK and IKM related Aranya APIs and configs MUST be replaced with the new `set_cert` API defined in this document. **[BREAK-001]** `CreateTeamQuicSyncConfig`, `AddTeamQuicSyncConfig`, `CreateSeedMode`, `AddSeedMode`, and related types MUST be removed. **[BREAK-002]**

### Breaking Deployment Changes

Existing Aranya deployments using PSKs MUST NOT be expected to be compatible with newer Aranya software which has migrated to mTLS certs. **[BREAK-003]** All Aranya software in a deployment SHOULD be upgraded to a version that supports mTLS certs at the same time.
