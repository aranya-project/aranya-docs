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
- mTLS certs must be X.509 TLS certs. We recommend using P-256 ECDSA secret keys of at least 256 bits to meet current NIST standards.
- Certs and their corresponding secret keys will be stored on the system's disk in plaintext. We recommend using an encrypted filesystem, restricting file permissions, and encrypting with a HSM/TPM to secure the secret keys.
    Example:
    `<daemon_working_directory>/certs/roots/`
        `root1.pem`
        `root2.pem`
    `<daemon_working_directory>/certs/device/`
        `cert.pem`
        `cert.key`
- A single device cert is configured when the daemon loads. The device cert must be signed by one of the root certs or an intermediate CA cert.
- A set of root certs is configured when the Aranya daemon loads
- The configured root certs and device cert are used for all QUIC connections and Aranya teams
- QUIC connection attempts by the syncer should fail to be established if certs have not been configured/signed properly
- QUIC connection attempts with expired certs should fail
- Security events such as failed authentication or signature verification should be logged

Note:
QUIC requires TLS 1.3 so that is an implied requirement. It's worth mentioning here since it is relevant to the security properties of our mTLS implementation.

Future enhancements:
- Different root and device certs for different teams
- Use system root certs
- Verify that device cert is signed by one of the root certs when daemon loads, rather than failing later during TLS authentication
- Cert revocation. Syncing with a revoked cert only leaks team metadata. Devices can be removed from an Aranya team without the need for revoking certs.
- Cert rotation/renewal

## Certificate Generation

mTLS root and device certs are generated externally via a user's existing PKI infrastructure.
Device certs are signed by one of the root certs or an intermediate CA cert using the PKI infrastructure.

We recommend using P-256 ECDSA certs generated from a secret key of at least 256 bits.

An example of how to generate/sign certs with the `openssl` cli tool will be provided for users that do not have an existing PKI infrastructure. Certs should not be checked into the `aranya` repo and should always be generated/signed for each deployment.

## Daemon Configuration

Paths to the root certs and device cert will be provided in the daemon config.
These certs will be loaded into the QUIC syncer module when the daemon loads.
All QUIC syncer traffic will be authenticated by checking root cert signatures.

daemon_config.toml:
```
[sync.quic]
...
root_certs=<root certs directory>
device_cert=<device cert directory>
...
```

Aranya assumes the following before loading certs into the QUIC syncer:
- Certs have been generated and signed by the user's external PKI infrastructure
- Certs include any relevant SANs information
- The root certs directory contains at least one root certificate (e.g. `root1.pem`).
- The device cert directory contains the device cert (e.g. `cert.pem`) signed by one of the root certs or an intermediate CA cert and the corresponding secret key (e.g. `cert.key`).

## Breaking Changes

### Breaking Aranya API Changes

All QUIC syncer PSK and IKM related Aranya APIs and configs for the QUIC syncer will be replaced with the new daemon cert configuration defined in this document.
This will cause breaking changes to the Aranya API.

### Breaking Deployment Changes

Existing Aranya deployments using PSKs will not be compatible with newer Aranya software which has migrated to mTLS certs. We recommend upgrading all Aranya software in a deployment to a version that supports mTLS certs at the same time.

Existing Aranya deployments using different PSKs for each team will no longer be able to manage different certs for each team. Reusing certs across teams is acceptable since it only leaks team metadata such as devices, roles, permissions, etc. Aranya's RBAC scheme must grant permissions to a device/role before it is allowed to perform any operations on the graph.
If using different mTLS certs for each team is important, we recommend isolating each team into its own Aranya deployment with different certs rather than managing multiple teams in the same deployment. In the future, we intend to allow different certs to be used for each team in a single deployment.
