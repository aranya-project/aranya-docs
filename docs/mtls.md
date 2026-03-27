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
2. The daemon MUST copy the device cert to `state_dir/certs/<team_id>/device.crt.pem`. **[CFG-007]**
3. The daemon MUST copy the root CA certs to `state_dir/certs/<team_id>/root.crt.pem`. **[CFG-008]**
4. The daemon MUST store the private key in the keystore as a `TlsPrivateKey` (AEAD-encrypted at rest, keyed by team ID). **[SEC-002]** If a `TlsPrivateKey` already exists for this team, it MUST be replaced. **[CFG-006]** The keystore MUST be the source of truth for the private key — the source file is ephemeral and only exists long enough to be imported. **[SEC-005]**
5. The daemon MUST build rustls `ClientConfig` and `ServerConfig` for the team (with the team's device cert, private key, and root CAs), indexed by team ID. **[CFG-009]**
6. Private key bytes MUST be zeroized and dropped from application memory after being handed to rustls. **[SEC-004]**
7. The daemon MUST delete the source cert and private key files only after the private key has been successfully stored in the keystore and the rustls configs have been successfully built. **[SEC-003]** If either step fails, the source files MUST be retained and `set_cert` MUST return an error. **[CFG-010]**

### Startup Flow

When the daemon starts:

1. The daemon MUST scan `state_dir/certs/` for team subdirectories (each `<team_id>/` subdirectory indicates a configured team). **[START-001]**
2. For each team: the daemon MUST load the device cert and root CA certs from `state_dir/certs/<team_id>/`. **[START-002]**
3. For each team: the daemon MUST load the `TlsPrivateKey` from the keystore using the team ID. **[START-003]**
4. The daemon MUST build rustls `ClientConfig` and `ServerConfig` per team (team-specific device cert and root CAs). **[CFG-009]**
5. The daemon MUST store configs for use by the quinn QUIC endpoint when establishing connections. **[START-004]**
6. Private key bytes MUST be zeroized and dropped from application memory after being handed to rustls. **[SEC-004]**

### Cert Rotation

`set_cert` MUST be called again with new file paths to rotate certs. **[CFG-006]** The daemon MUST overwrite the cert files in `state_dir/certs/<team_id>/`, replace the `TlsPrivateKey` in the keystore, rebuild the rustls configs, and delete the source files.

### Team Removal

When a team is removed:

1. The daemon MUST delete the `state_dir/certs/<team_id>/` directory and its contents. **[REM-001]**
2. The daemon MUST remove the `TlsPrivateKey` from the keystore. **[REM-002]**
3. The daemon MUST remove the team's `ClientConfig` and `ServerConfig`. **[REM-003]**
4. The daemon MUST close any open connections for this team. **[REM-004]**

## Private Key Storage

### TlsPrivateKey Type

A new `TlsPrivateKey<CS>` type MUST be added to aranya-core's crypto engine to store TLS private keys in the daemon's keystore. **[KEY-001]** This follows the existing pattern used by `PskSeed`, signing keys, and encryption keys.

- `TlsPrivateKey<CS>` — unwrapped key type holding the raw private key bytes
- `TlsKeyId` — typed ID for keystore lookup. The team ID MUST be usable directly (or cast/reinterpreted) as the `TlsKeyId` without derivation. **[KEY-002]**
- `Ciphertext::Tls` — new variant in the keystore's AEAD wrapping enum **[KEY-003]**

The keystore MUST encrypt the private key at rest using AEAD (AES-256-GCM). **[SEC-002]** The key MUST only be decrypted at daemon startup when building rustls configs. **[SEC-006]** During `set_cert` import, the key is read from the plaintext source file and does not need decryption. In both cases, the key MUST be zeroized from daemon memory immediately after being handed to rustls. **[SEC-004]**

### Security Properties

- **At rest**: the private key MUST be AEAD-encrypted in the keystore. **[SEC-002]**
- **During import**: private key bytes exist briefly in daemon memory while being read from the source file, stored in the keystore, and handed to rustls. The daemon's copy MUST be zeroized after the rustls config is built. **[SEC-004]** The source files MUST be deleted only after the keystore write and rustls config build both succeed. **[SEC-003]**
- **At runtime**: only rustls holds the private key internally. The daemon MUST NOT retain a copy. **[SEC-004]**
- **Source file cleanup**: the source private key file is ephemeral — it exists only long enough to be imported into the keystore. **[SEC-005]** The keystore is the source of truth for the private key.

## TLS Configuration Architecture

### Per-Team Certs and Connections

Each team has its own root CA certs configured via `set_cert`. **[CERT-004]** A device MAY use the same cert and key across multiple teams (if the cert is trusted by each team's root CAs), MAY use the same private key with different certs signed by each team's CA, or MAY use entirely different certs and keys per team. **[CERT-006]** Teams MAY also share the same root CAs if desired — there is no requirement that root CAs be unique per team.

QUIC connections MUST be established per (peer, team) pair. **[CONN-003]** Separate connections per team are required because each team may use different certs and root CAs. Sharing a single QUIC connection across teams would risk using the wrong cert for a given team and complicate server-side cert selection during the TLS handshake. Each connection MUST use the team-specific certs on both sides:
- The outbound peer MUST configure the connection with the team's `ClientConfig` (team's device cert + team's root CAs). **[CONN-004]**
- The inbound peer MUST configure the connection with the team's `ServerConfig` (team's device cert + team's root CAs). **[CONN-005]**
- The TLS handshake MUST validate both peers' certs against the team's root CAs (mutual certificate validation). **[CONN-006]** This refers to cert chain validation only — server SANs are verified by the client, and client SANs are only verified on reverse connection reuse (see [SAN Verification](#san-verification)).

A peer with a cert from Team A's CA MUST NOT be able to establish a connection for Team B (unless Team B's root CAs also trust that cert). **[CONN-007]** This is enforced by the TLS handshake — no application-layer post-handshake verification is needed.

Connections MUST be reused within a team. **[CONN-008]** A new connection is only established when the existing one drops, when reverse connection reuse fails the client SAN check, or when syncing with a new peer.

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

When a peer connects to us (inbound) for a specific team, we MAY reuse that connection to sync back to them for the same team rather than opening a separate outbound connection. **[CONN-010]** Reverse reuse requires passing client SAN verification (see [Client SAN Verification](#client-san-verification)). If client SAN verification fails, the daemon MUST attempt to establish a new outbound connection instead. **[SAN-009]**

Each connection MUST track its direction (inbound or outbound) and whether it has passed the reverse client SAN check. **[CONN-011]** This allows the daemon to determine whether an existing connection can be used for syncing in the reverse direction.

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
- A SAN contains an IP address that exactly matches the peer's connecting IP address
- A SAN contains a DNS hostname that, when resolved via DNS lookup, returns an IP address matching the peer's connecting IP

If no SAN matches, the connection MUST NOT be reused in reverse. **[SAN-007]** Instead, the daemon MUST attempt to establish a new outbound connection to the peer. **[SAN-009]** The inbound connection MUST remain open for the peer to continue syncing to us — only the reverse direction is affected. **[SAN-010]** This is a graceful fallback, not an error.

### NAT Considerations

When a peer is behind NAT, the connecting IP seen by the server is the NAT's external IP, not the peer's actual IP. The peer's cert SANs typically won't match the NAT IP, so reverse connection reuse will fail the SAN check and fall back to a new outbound connection.

Strategies for NAT deployments:
- **Use the NAT's external IP or hostname in cert SANs** — if the NAT IP is stable, include it in the cert. Reverse reuse will work.
- **Establish redundant outbound connections** — both peers initiate outbound connections to each other. No reverse reuse needed. Note: this requires each peer to have a routable address or an existing outbound connection that has opened the NAT firewall for inbound traffic. A peer behind NAT that has never made an outbound connection cannot receive inbound connections.
- **Relay via a peer not behind NAT** — both NAT'd peers sync through a third party with a routable address. This is the recommended approach when both peers are behind NAT since direct connectivity is not possible without NAT traversal.

QUIC does not natively provide NAT traversal. Deployments where peers are behind NAT SHOULD ensure at least one peer in the sync topology has a routable address, or use a relay peer. **[NAT-001]**

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

All QUIC syncer PSK and IKM related Aranya APIs and configs will be replaced with the new `set_cert` API defined in this document. `CreateTeamQuicSyncConfig`, `AddTeamQuicSyncConfig`, `CreateSeedMode`, `AddSeedMode`, and related types will be removed.

### Breaking Deployment Changes

Existing Aranya deployments using PSKs will not be compatible with newer Aranya software which has migrated to mTLS certs. All Aranya software in a deployment SHOULD be upgraded to a version that supports mTLS certs at the same time.
