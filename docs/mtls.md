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
- mTLS certs must be X.509 TLS certs generated from ECDSA keys of at least 224 bits
- Certs and their corresponding secret keys will be stored on the system's disk in plaintext (deployment should consider using an encrypted filesystem to protect them)
    Example:
    `<daemon_working_directory>/certs/roots/`
        `root1.pem`
        `root2.pem`
    `<daemon_working_directory>/certs/device/`
        `cert.pem`
        `cert.key`
- A single device cert is configured when the daemon loads. The device cert must be signed by one of the root certs.
- A set of root certs is configured when the Aranya daemon loads
- The configured root certs and device cert are used for all QUIC connections and Aranya teams

Future enhancements:
- Different root and device certs for different teams
- Use system root certs
- Verify that device cert is signed by one of the root certs when daemon loads, rather than failing later during TLS authentication

## Certificate Generation

mTLS root and device certs are generated externally via a user's existing PKI infrastructure.
Device certs are signed by one of the root certs using the PKI infrastructure.
An example CA that generates root and device certs will be provided for users that do not have an existing PKI infrastructure.

We recommend using ECDSA certs generated from a secret key of at least 224 bits.

Aranya assumes that all certs have been generated and signed prior to configuring and loading the Aranya daemon.

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

Assumptions:
- The root certs directory contains at least one root certificate (e.g. `root1.pem`).
- The device cert directory contains the device cert (e.g. `cert.pem`) signed by one of the root certs and the corresponding secret key (e.g. `cert.key`).

## Aranya API Changes

All QUIC syncer PSK and IKM related Aranya APIs and configs for the QUIC syncer will be replaced with the new daemon cert configuration defined in this document.
This will cause breaking changes to the Aranya API.
