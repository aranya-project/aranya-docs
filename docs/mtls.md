---
layout: page
title: mTLS
permalink: "/mtls/"
---

# Aranya mTLS Authentication

## Overview

mTLS is mutual TLS authentication. Traditional TLS only authenticates the server to the client, but not the client to the server. mTLS provides mutual authentication by validating the identities of both peers to each other via their TLS certs before sending data over a secure channel.

mTLS authentication in the Aranya syncer allows users to leverage their existing PKI infrastructure to authenticate nodes to each other before syncing.

Aranya's sync traffic is currently secured via `s2n_quic` PSKs. We previously developed our own fork of `s2n_quic` to add support for PSKs to the library. While PSKs are the ideal solution for securing QUIC communications for our zero-trust application, there are a few realities that make it impractical:
- Upstreaming our PSK branch to the `main` branch of `s2n_quic` is not going to happen any time soon.
- There is better support for TLS certs in the broader security and networking community as well as the QUIC libraries available in Rust.

Because of this, we plan to migrate the authentication/encryption of the Aranya syncer transport from QUIC PSKs to QUIC mTLS certs.

Abbreviations in this document:
- certificate -> cert
- certificates -> certs

## Requirements

- Users must be able to leverage their existing external PKI for generating/signing certs
- mTLS certs must be X.509 TLS certs in PEM format.
- A single device cert is configured when the daemon loads. The device cert must be signed by one of the root certs or an intermediate CA cert.
- A set of root certs is configured when the Aranya daemon loads
- The configured root certs and device cert are used for all QUIC connections and Aranya teams
- QUIC connection attempts by the syncer should fail the TLS handshake if certs have not been configured/signed properly
- QUIC connection attempts with expired certs should fail the TLS handshake
- Security events such as failed authentication or signature verification should be logged

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
- Must output certs in PEM format
- Must allow a CN (Common Name) to be specified for each generated cert
- Must allow SANs to be specified for non-CA certs such as DNS names and IP addresses
- Must allow a validity period to be specified so certs can expire

Example usage:
```bash
# Create a root CA
aranya-certgen ca --cert ca.pem --key ca.key --ca-name "My Company CA" --validity-days 10

# Create a signed certificate
aranya-certgen signed \
  --ca-cert ca.pem --ca-key ca.key \
  --cert server.pem --key server.key \
  --cn server \
  --dns example.com --dns www.example.com \
  --ip 192.168.1.10
  --validity-days 10
```

Future enhancements:
- HSM encryption of secret keys

## Certificate Generation

mTLS root and device certs are generated externally via a user's existing PKI infrastructure.
Device certs are signed by one of the root certs or an intermediate CA cert using the PKI infrastructure.

We recommend using P-256 ECDSA certs generated from a secret key of at least 256 bits (NIST SP 800-52 Rev. 2).

An example of how to generate/sign certs with the `openssl` cli tool will be provided for users that do not have an existing PKI infrastructure. Certs should not be checked into the `aranya` repo and should always be generated/signed for each deployment.

## Daemon Configuration

Paths to the root certs and device cert will be provided in the daemon config.
The root cert directory is assumed to be flat: we do not support any recursion or symlinks.
Certs will be loaded into the QUIC syncer module when the daemon loads.

daemon_config.toml:
```
[sync.quic]
...
root_certs=<root certs directory>
device_cert=<device cert directory>
...
```

The Aranya daemon will refuse to start if the following conditions are not met:
- The root certs directory contains at least one root certificate (e.g. `root1.pem`).
- The device cert directory contains the device cert (e.g. `cert.pem`) and the corresponding secret key (e.g. `cert.key`).

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
