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

Aranya's sync traffic is secured via mTLS over QUIC using the `quinn` library with `rustls` for TLS. This replaces the previous PSK-based authentication. All QUIC connections MUST use TLS 1.3. **[MTLS-001]**

Abbreviations in this document:
- certificate -> cert
- certificates -> certs

## Terminology

| Term | Definition |
|---|---|
| **Device cert** | The leaf X.509 cert identifying a device. Signed by a CA in the team's cert chain. Each device has one device cert per team (though the same cert MAY be reused across teams). |
| **Cert chain** | The set of CA certs used to validate a device cert. Includes root CA certs and any intermediate CA certs. Configured per-team via the `root_certs` parameter in `set_cert`. |
| **Root CA cert** | A self-signed trust anchor at the top of the cert chain. |
| **Intermediate CA cert** | A CA cert signed by the root CA (or another intermediate) that can sign device certs. Optional — device certs MAY be signed directly by the root CA. |
| **Private key** | The private key corresponding to the device cert. Used for TLS authentication. Stored AEAD-encrypted in the daemon's keystore. |

## Requirements

Certs MUST be X.509 TLS certs in a format supported by rustls (PEM or DER). **[CERT-001]** The `aranya-certgen` tool currently outputs PEM only (DER support is a future enhancement — see [Certgen CLI Tool](#certgen-cli-tool)). Users MUST be able to leverage their existing external PKI for generating and signing certs. **[CERT-002]**

All certs MUST contain at least one Subject Alternative Name (SAN). **[CERT-003]** The daemon MUST correctly validate certs containing multiple DNS SANs and multiple IP SANs. The `aranya-certgen` tool MUST be able to generate certs with multiple SANs (see **[GEN-008]**). TLS requires server certs to have SANs for hostname verification (CN is deprecated). Client SANs are verified when reusing an inbound connection in reverse (see [Client SAN Verification](#client-san-verification)).

Each team MUST be configured with a device cert, private key, and cert chain via `set_cert`. **[CERT-004]** The device cert MUST be signed by a CA in the team's cert chain. **[CERT-005]** The `root_certs` parameter MUST be a directory path containing the cert chain files (root CA certs and any intermediate CA certs). **[CERT-007]** The `device_cert` parameter MUST contain only the device cert. A device MAY reuse the same device cert and key pair across multiple teams (each team configured with a cert chain that trusts that device cert), or MAY use entirely different device cert and key pairs per team. **[CERT-006]**

QUIC connection attempts MUST fail the TLS handshake if certs have not been configured or signed properly. **[CONN-001]** QUIC connection attempts with expired certs MUST fail the TLS handshake. **[CONN-002]**

The daemon MUST log rejected connections including the IP address, port, and hostname (if available). **[LOG-001]**

Certs and private keys MUST NOT be checked into repositories. **[GEN-010]**

Certs SHOULD use P-256 ECDSA secret keys of at least 256 bits to meet current NIST standards (NIST SP 800-52 Rev. 2). **[INTEG-001]** Source cert/key files SHOULD be protected with an encrypted filesystem and restricted file permissions prior to importing them into Aranya. **[INTEG-002]**

See [Future Work](#future-work) for planned enhancements including cert revocation, system root certs, and cert chain validation at configuration time.

Note: Aranya does not currently check certificate revocation status (CRL/OCSP). Devices SHOULD be removed from the Aranya team immediately upon cert compromise.

## Certgen CLI Tool

The `aranya-certgen` CLI tool generates X.509 certs for use with Aranya's mTLS implementation. Users MAY use their own PKI infrastructure instead. **[GEN-001]**

The tool MUST use P-256 ECDSA secret keys. **[GEN-002]** It MUST be able to generate a root CA cert and key pair **[GEN-003]** and signed certs along with their key. **[GEN-004]** It MUST output certs in PEM format with `.crt.pem` and `.key.pem` extensions. **[GEN-005]**

A CN (Common Name) MUST be specifiable for each generated cert **[GEN-006]** and MUST be automatically added as a SAN, auto-detected as DNS or IP based on format. **[GEN-007]** Additional SANs MUST be specifiable via `--dns` and `--ip` flags for multiple DNS hostnames and IP addresses beyond the CN. **[GEN-008]** A validity period in days MUST be specifiable so certs can expire. **[GEN-009]**

Example usage:
```bash
# Create a root CA (creates ca.crt.pem and ca.key.pem)
aranya-certgen ca --cn "My Company CA" --days 365

# Create a root CA with custom output prefix
aranya-certgen ca --cn "My Company CA" --days 365 -o ./certs/myca -p

# Create a signed certificate
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

See [Future Work](#future-work) for planned enhancements including DER output format and encrypted private key files.

## Certificate Configuration

Certs MUST be configured per-team via the `set_cert` method. **[CFG-001]** `set_cert` MUST be exposed on both the client API and the daemon API. **[CFG-011]** Applications SHOULD configure certs before adding sync peers **[CFG-003]** — if sync peers are added first, connections will fail TLS handshakes until certs are set up.

### API

Certs can be configured in two ways:

1. **At team creation/addition** — via the optional `set_cert` method on `CreateTeamConfig` / `AddTeamConfig` builders:
```rust
let cfg = CreateTeamConfig::builder()
    .set_cert(root_certs, device_cert, device_key)
    .build()?;
client.create_team(cfg).await?;
```

2. **After team creation** — via the standalone `set_cert` method on the client:
```
set_cert(team_id, root_certs, device_cert, device_key)
```

Both paths use the same import flow. The standalone `set_cert` is required for cert rotation since `create_team`/`add_team` cannot be called again for an existing team. **[CFG-002]**

Parameters:
- `team_id` — the team to configure mTLS certificates for (implicit when called via builder)
- `root_certs` — directory path containing the cert chain files (root CA and intermediate CA certs; see **[CERT-007]**)
- `device_cert` — file path to the device cert file
- `device_key` — file path to the device private key file

The daemon MUST accept file paths from the client via IPC. **[CFG-004]** The daemon MUST detect the certificate format (PEM, DER, etc.) and perform any necessary conversion. **[CFG-005]**

`set_cert` MUST be idempotent — calling it again for the same team MUST overwrite the previous cert configuration with no other side effects. **[CFG-006]** This handles both initial configuration and cert rotation.

Recommended call ordering: `create_team` / `add_team` (with optional `set_cert`) → `set_cert` (if not provided earlier) → `add_sync_peer`

### Import Flow

When `set_cert` is called:

1. Read the cert and key files from the provided paths. **[CFG-004]**
2. Copy the device cert to `state_dir/certs/<team_id>/device.crt.pem`. **[CFG-007]**
3. Copy the root CA certs to `state_dir/certs/<team_id>/root.crt.pem`. **[CFG-008]**
4. Store the private key in the keystore as a `TlsPrivateKey` (AEAD-encrypted at rest, keyed by team ID). **[SEC-002]** If a key already exists for this team, replace it per **[CFG-006]**. The keystore is the source of truth for the private key. **[SEC-005]**
5. Build rustls `ClientConfig` and `ServerConfig` for the team, indexed by team ID. **[CFG-009]**
6. Zeroize and drop private key bytes from daemon memory. **[SEC-004]** Only rustls retains the key material after this point.
7. Delete the source cert and private key files. **[SEC-003]** Source files MUST only be deleted after the keystore write and cert directory copy both succeed. If either step fails, both MUST be rolled back to their previous state and `set_cert` MUST return an error. **[CFG-010, CFG-016]** `set_cert` MUST serialize updates per team to prevent race conditions. **[CFG-015]**

Note: file deletion via `unlink` does not securely erase data on most filesystems (especially SSD/flash). **[INTEG-002]** recommends encrypted filesystems for source file protection prior to import.

### Startup Flow

When the daemon starts:

1. Scan `state_dir/certs/` for team subdirectories. **[START-001]**
2. For each team: load the device cert and root CA certs from `state_dir/certs/<team_id>/`. **[START-002]**
3. For each team: decrypt the `TlsPrivateKey` from the keystore using the team ID. **[START-003, SEC-006]**
4. Build rustls configs per team per **[CFG-009]** and store for use by the quinn endpoint. **[START-004]**
5. Zeroize and drop private key bytes per **[SEC-004]**.

### Cert Rotation

Call `set_cert` again with new file paths per **[CFG-006]**. The daemon overwrites cert files, replaces the keystore key, rebuilds rustls configs, and deletes source files.

### Team Removal

1. Delete the `state_dir/certs/<team_id>/` directory and its contents. **[REM-001]**
2. Remove the `TlsPrivateKey` from the keystore. **[REM-002]**
3. Remove the team's rustls configs. **[REM-003]**
4. Close any open connections for this team. **[REM-004]**

## Private Key Storage

A new `TlsPrivateKey<CS>` type MUST be added to aranya-core's crypto engine for storing TLS private keys in the daemon's keystore. **[KEY-001]** This follows the existing pattern used by `PskSeed`, signing keys, and encryption keys.

- `TlsPrivateKey<CS>` — unwrapped key type holding the raw private key bytes
- `TlsKeyId` — typed ID for keystore lookup. The team ID MUST be usable directly (cast/reinterpret) as the `TlsKeyId` without derivation. **[KEY-002]**
- `Ciphertext::Tls` — new variant in the keystore's AEAD wrapping enum **[KEY-003]**

The private key MUST be AEAD-encrypted at rest in the keystore. **[SEC-002]** It is decrypted only at daemon startup (**[SEC-006]**) — during `set_cert` import, the key is read from the plaintext source file and does not need decryption. After building the rustls config, the daemon MUST zeroize its copy per **[SEC-004]**.

At runtime, only rustls retains the private key material. Quinn MUST be configured with the `rustls-aws-lc-rs` feature (not the default `rustls-ring`). **[SEC-007]** aws-lc-rs zeroizes private key memory at the C library level when the key is freed. ring explicitly does not zeroize key material on drop.

## TLS Configuration Architecture

### Outbound Connections

For outbound connections, the daemon selects the team's `ClientConfig` (team's device cert + cert chain) using `connect_with()` and MUST set the team ID as the SNI hostname. **[CONN-004]** The TLS handshake validates the server's device cert against the team's cert chain and verifies server SANs per **[SAN-001]**.

### Inbound Connections

For inbound connections, the daemon uses a shared `ServerConfig` that contains all configured teams' device certs and cert chains. **[CONN-005]** The connecting client MUST set the team ID (or a team-specific identifier) as the SNI hostname in the TLS ClientHello. **[CONN-012]** The server's `ResolvesServerCert` implementation MUST use the SNI value to select the correct team's device cert for the handshake. **[CONN-013]** If the SNI value does not match any configured team, the handshake MUST fail. **[CONN-014]**

After the handshake, the connection is bound to the team identified by SNI. Subsequent sync requests on the connection MUST include a team ID that matches the SNI-selected team. **[CONN-015]** If a sync request's team ID does not match, the request MUST be rejected and the QUIC stream closed. **[CONN-016]** This prevents a peer that shares multiple teams from accidentally or maliciously syncing on the wrong team's connection.

### Connection Model

QUIC connections MUST be established per (peer, team) pair. **[CONN-003]** Separate connections per team are required because:
- Each team may use different device certs and cert chains. Sharing a connection across teams would complicate server-side cert selection and risk presenting the wrong device cert.
- TLS 1.3 uses ephemeral key exchange for session encryption, so certs affect authentication only, not confidentiality. However, using the wrong device cert could allow a device authenticated for Team A to sync Team B's graph if the cert chains are cross-trusted.
- If a shared connection is used for multiple teams and one team's cert chain is compromised, a MiTM attacker could intercept sync traffic for all teams on that connection. Per-team connections contain the blast radius to the compromised team.

The TLS handshake MUST validate both peers' device certs against the team's cert chain (mutual certificate validation). **[CONN-006]** This refers to cert chain validation only — server SANs are verified by the client per **[SAN-001]**, and client SANs are only verified on reverse connection reuse (see [Client SAN Verification](#client-san-verification)).

A peer whose device cert is not trusted by a team's cert chain MUST NOT be able to establish a connection for that team. **[CONN-007]**

Connections MUST be reused within a team. **[CONN-008]** A new connection is only established when the existing one drops, when reverse reuse fails the client SAN check, or when syncing with a new peer. When a connection closes, its entry MUST be removed from the connection map. **[CONN-009]**

### Reverse Connection Reuse

When a peer connects to us (inbound) for a specific team, the daemon MAY reuse that connection to sync back to them for the same team. **[CONN-010]** Reverse reuse requires passing client SAN verification (see [Client SAN Verification](#client-san-verification)). If the SAN check fails, the daemon MUST attempt to establish a new outbound connection instead per **[SAN-009]**.

Each connection MUST track: **[CONN-011]**
- **Direction**: whether this device initiated the connection (outbound) or the peer initiated it (inbound), set at connection establishment time.
- **Reverse SAN status**: for inbound connections, whether the connection has passed client SAN verification for reverse reuse. Initially `false`, set to `true` after a successful SAN check. Outbound connections do not need this flag since server SANs were already verified during the TLS handshake.

### In-Memory Representation

```rust
/// Shared server config containing all teams' device certs and cert chains
/// for inbound connections. Must stay alive to accept inbound connections.
server_config: Arc<ServerConfig>
```

`ClientConfig` for outbound connections SHOULD be created on-demand when a new connection is needed. **[CFG-012]** `connect_with()` takes ownership of the `ClientConfig`, so the daemon does not retain a copy after initiating the connection. This minimizes the window during which the private key is held in daemon memory. Since connections are long-lived and reused per **[CONN-008]**, new connections are infrequent and the keystore read cost per connection is negligible.

The shared `ServerConfig` MUST remain in memory to accept inbound connections. **[CFG-013]** The `ServerConfig` MUST use a custom `ResolvesServerCert` implementation that loads the team's device cert and private key from the keystore on-demand per inbound connection, based on the SNI value. **[CFG-014]** This avoids holding all teams' private keys in memory simultaneously — only the key for the current handshake is in memory, and it is zeroized when the handshake completes per **[SEC-007]**. The resolver MUST support concurrent handshakes.

### Connection Flow

Outbound:
1. Check for an existing healthy connection to (peer, team) — if found, reuse it per **[CONN-008]**
2. Otherwise, build a `ClientConfig` on-demand: load the team's device cert from `state_dir/certs/<team_id>/`, decrypt the `TlsPrivateKey` from the keystore, and load the team's cert chain per **[CFG-012]**
3. Initiate connection using `connect_with()`, which takes ownership of the `ClientConfig` per **[CONN-004]**
4. TLS handshake completes with mutual cert chain validation per **[CONN-006]**
5. Zeroize the decrypted private key bytes used to build the `ClientConfig` per **[SEC-004]**
6. Store connection in the connection map keyed by (socket address, team ID)

Inbound:
1. Accept connection using shared `ServerConfig` — SNI in the ClientHello identifies the team per **[CONN-012]**
2. `ResolvesServerCert` loads the team's device cert and private key from the keystore on-demand based on SNI per **[CFG-014]**
3. TLS handshake completes with mutual cert chain validation per **[CONN-006]**
4. Private key zeroized after handshake per **[SEC-007]**
5. Bind the connection to the SNI-identified team
6. Validate that sync requests match the bound team per **[CONN-015]**

## SAN Verification

### Server SAN Verification

Server SANs MUST always be verified (standard TLS 1.3 behavior) and MUST NOT be disabled. **[SAN-001, SAN-002]** The server's certificate MUST contain a SAN matching the hostname or IP the client is connecting to.

For deployments with dynamic server IPs, DNS SANs SHOULD be used that resolve to the server's current IP address. **[SAN-003]** Update DNS records when the IP changes.

### Client SAN Verification

Client SANs MUST be verified only when reusing an inbound connection in reverse. **[SAN-004]** The peer's certificate SANs MUST be checked against the IP address they connected from. **[SAN-005]**

The connection MAY be reused in reverse only if ANY of the following are true: **[SAN-006]**
- A SAN contains an IP address that exactly matches the peer's connecting IP address (byte-level comparison; IPv4-mapped IPv6 addresses MUST be compared against their IPv4 equivalent) **[SAN-011]**
- A SAN contains a DNS hostname that, when resolved via DNS lookup, returns an IP address matching the peer's connecting IP

If no SAN matches, the connection MUST NOT be reused in reverse. **[SAN-007]** The daemon MUST attempt to establish a new outbound connection to the peer. **[SAN-009]** The inbound connection MUST remain open for the peer to continue syncing to us. **[SAN-010]**

DNS resolution results SHOULD be cached. **[SAN-008]**

### NAT Considerations

When a peer is behind NAT, the connecting IP is the NAT's external IP, not the peer's actual IP. The peer's cert SANs typically won't match, so reverse reuse falls back to a new outbound connection.

Strategies for NAT deployments:
- **Use the NAT's external IP or hostname in cert SANs** — if the NAT IP is stable, include it in the cert via `--ip` or `--dns` flags.
- **Establish redundant outbound connections** — both peers initiate outbound connections. This requires each peer to have a routable address or an existing outbound connection that has opened the NAT firewall.
- **Relay via a peer not behind NAT** — recommended when both peers are behind NAT since direct connectivity is not possible without NAT traversal.

QUIC does not natively provide NAT traversal. Deployments where peers are behind NAT SHOULD ensure at least one peer in the sync topology has a routable address, or use a relay peer. **[NAT-001]**

### Implementation

The `ClientCertVerifier` trait does not have access to the peer's IP address, so client SAN verification MUST be performed after the TLS handshake per **[SAN-004]**:
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

## Breaking Changes

### Breaking Aranya API Changes

`CreateSeedMode`, `AddSeedMode`, `WrappedSeed`, and related PSK seed types will be removed.

### Breaking Deployment Changes

Existing Aranya deployments using PSKs will not be compatible with newer Aranya software which has migrated to mTLS certs. All Aranya software in a deployment SHOULD be upgraded to a version that supports mTLS certs at the same time.

## Threat Model

This threat model covers threats at the mTLS transport layer. For sync protocol-level threats (message flooding, stale data replay, oversized messages, DeviceId discovery) see the [sync threat model](sync-threat-model.md).

| Threat | Description | Mitigation | Residual Risk |
|---|---|---|---|
| **Passive eavesdropping** | Attacker observes sync traffic on the network. | TLS 1.3 with ephemeral key exchange encrypts all traffic. **[MTLS-001]** | None — session keys are ephemeral and not derived from certs. |
| **MiTM on outbound connection** | Attacker intercepts connection and presents a fraudulent server cert. | Server SAN verification ensures the server cert matches the expected hostname/IP. **[SAN-001, SAN-002]** Cert chain validation ensures the cert is signed by a trusted CA. **[CONN-006]** | None if cert chain and DNS are not compromised. |
| **MiTM on inbound connection** | Attacker connects to daemon pretending to be a legitimate peer. | Mutual cert validation — the daemon validates the client's device cert against the team's cert chain. **[CONN-006]** SNI binds the connection to a specific team. **[CONN-012, CONN-013]** | None if the attacker does not hold a device cert trusted by the team's cert chain. |
| **Cross-team auth bypass** | Device authenticated for Team A attempts to sync Team B. | Per-team connections with team-specific certs. **[CONN-003]** SNI-based cert selection. **[CONN-013]** Sync request team ID validated against bound team. **[CONN-015, CONN-016]** | None if teams use separate cert chains. If cert chains are cross-trusted, the TLS handshake succeeds but sync request validation catches mismatches. |
| **Compromised device cert** | Attacker obtains a device's private key and cert. | Attacker can authenticate as that device until the cert expires or is rotated via `set_cert`. **[CFG-006]** | Cert revocation is not currently implemented. Device SHOULD be removed from the Aranya team immediately. See [Future Work](#future-work). |
| **Compromised CA** | Attacker compromises a CA in the cert chain and issues fraudulent device certs. | Per-team connections limit blast radius — only teams using the compromised cert chain are affected. **[CONN-003]** | Attacker can authenticate as any device for affected teams until the cert chain is replaced. |
| **Private key exposure on disk** | Source key file read by unauthorized process before import. | Source files deleted after import. **[SEC-003]** Encrypted filesystem recommended. **[INTEG-002]** | File deletion is not secure erasure on SSD/flash. Encrypted filesystem mitigates this. |
| **Private key exposure in memory** | Key material lingers in daemon memory. | Daemon zeroizes key bytes after handing to rustls. **[SEC-004]** aws-lc-rs zeroizes key memory on free. **[SEC-007]** `ClientConfig` ownership transferred to quinn via `connect_with()`. **[CFG-012]** `ResolvesServerCert` loads keys from keystore on-demand per inbound connection. **[CFG-014]** | Key material held in rustls/aws-lc-rs for the lifetime of each connection only. |
| **Private key exposure at rest** | Keystore compromised on disk. | Private key AEAD-encrypted in the keystore. **[SEC-002]** | Attacker who compromises the keystore encryption key can decrypt all stored private keys. |
| **Expired cert used for connection** | Peer presents an expired cert. | rustls rejects expired certs during TLS handshake. **[CONN-002]** | None. |
| **DNS spoofing for SAN verification** | Attacker manipulates DNS to pass SAN checks. | Client SAN verification is only used for reverse connection reuse — failure falls back to new outbound connection, not an error. **[SAN-007, SAN-009]** DNS results SHOULD be cached. **[SAN-008]** | Attacker controlling DNS could pass client SAN check on inbound connection. Impact limited to reverse reuse of a single connection. Server SAN verification is more critical and depends on DNS integrity. |
| **NAT prevents connectivity** | Peers behind NAT cannot establish direct connections. | Multiple strategies: NAT IP in SANs, redundant outbound connections, relay peer. **[NAT-001]** | QUIC does not provide NAT traversal. At least one peer needs a routable address. |
| **Replay attack** | Attacker replays captured TLS handshake. | TLS 1.3 handshake uses ephemeral keys — replayed handshakes fail. **[MTLS-001]** | None. |
| **Connection exhaustion** | Malicious authorized device opens many connections to exhaust resources. | Per-team connections limit one connection per (peer, team) pair. **[CONN-003]** | Under CA compromise, attacker can mint many unique certs, each establishing a separate connection. Per-cert connection limiting does not bound total connections from a compromised CA. |
| **Sync flooding** | Malicious authorized device sends excessive sync requests over an established connection. | Out of scope for mTLS spec. See sync threat model (DOS-1). | Rate limiting should be applied per certificate identity at the sync protocol layer. |
| **Unauthorized sync participation** | External observer initiates sync without valid credentials. | mTLS handshake rejects peers without a device cert trusted by the team's cert chain. **[CONN-006, CONN-007]** | None. |
| **CA compromise connection exhaustion** | Attacker with compromised CA mints many unique certs, each opening a separate connection to bypass per-cert connection limits. | Per-team connections. **[CONN-003]** No full mitigation at the mTLS layer. | Inherent limitation of per-cert connection limiting under CA compromise. Mitigated by cert revocation (see [Future Work](#future-work)) and short cert lifetimes. |
| **SNI spoofing / team existence oracle** | Attacker sets a guessed team ID as SNI to probe whether that team exists on the device. The handshake fails differently for "unknown team" vs "cert not trusted by team." | `ResolvesServerCert` SHOULD NOT reveal whether a team exists — unknown SNI and untrusted cert SHOULD produce indistinguishable handshake failures. **[CONN-014]** | Timing differences between "no such team" and "cert validation failed" may still leak information. |
| **SNI metadata leak** | TLS 1.3 sends SNI in cleartext in the ClientHello. Since team ID is used as SNI, a passive observer learns which teams a device syncs for. | No mitigation in current design. Encrypted Client Hello (ECH) would address this but requires additional infrastructure. | Team membership metadata is visible to passive network observers. Graph contents (roles, permissions, device IDs) remain encrypted. |
| **Traffic analysis** | Observer analyzes sync patterns (who syncs with whom, frequency, data volume, timing) to infer network topology. | No mitigation at the mTLS layer. | Leaks network topology (which devices communicate) but not graph contents (roles, permissions, device IDs). |
| **Core dump / swap exposure** | Daemon crash produces a core dump containing private key material from rustls memory. OS may swap key pages to disk. | Deployments SHOULD disable core dumps for the daemon process, use encrypted swap, or use `mlock` to prevent key pages from being swapped. | If not mitigated, private keys may persist on disk in core dumps or swap files. |
| **Concurrent `set_cert` race condition** | Two concurrent `set_cert` calls for the same team race, leaving cert files, keystore, and rustls config in an inconsistent state. | `set_cert` MUST serialize updates per team. **[CFG-015]** Keystore and cert directory updates MUST be atomic — if either fails, rollback to the previous state. **[CFG-016]** | None if serialization and atomicity requirements are met. |
| **Index timing on mailbox server** | (Onboarding) Attacker probes server to learn mailbox IDs via timing. | Separate mailbox ID (indexed) from authenticator (non-indexed, constant-time comparison). | See async onboarding spec. |

## Future Work

- **Certgen DER output format** — support generating certs in DER format in addition to PEM.
- **Encrypted private key files** — support encrypting private key files in certgen (e.g., PKCS#8 encrypted format) and decrypting them in the daemon before importing into the keystore. This provides an additional layer of protection for private keys at rest on disk prior to import.
- **Cert revocation** — check certificate revocation status (CRL/OCSP) during TLS handshake validation.
- **System root certs** — allow using the operating system's root certificate store.
- **Cert chain validation at configuration time** — verify that the device cert is signed by a CA in the cert chain when `set_cert` is called, rather than failing later during TLS authentication.
