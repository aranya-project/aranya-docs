---
layout: page
title: mTLS
permalink: "/mtls/"
---

# Aranya mTLS Authentication

## Overview

mTLS is mutual TLS authentication. Traditional TLS only authenticates the server to the client, but not the client to the server. mTLS provides mutual authentication by validating the identities of both peers via their TLS certificates before sending data over a secure channel.

mTLS is commonly used in zero-trust environments where there is no trusted third party (TPP) or root CA server that can be trusted. This aligns well with the zero-trust architecture of Aranya.

Aranya's sync traffic is currently secured via `s2n_quic` PSKs. We developed our own fork of `s2n_quic` to add support for PSKs to the library. While PSKs are the ideal solution for securing QUIC communications for our zero-trust application, there are a few realities that make it impractical:
- Upstreaming our changes to the `main` branch of `s2n_quic` is not going to happen any time soon.
- There is better support for TLS certificates in the broader security and networking community as well as the QUIC libraries available in Rust.

Because of this, we plan to migrate the authentication/encryption of the Aranya syncer transport from QUIC PSKs to QUIC mTLS certs.

## Private Key Generation/Derivation

When each peer generates its initial key bundle, it will also generate an mTLS secret key to be used by the mTLS cert.

The mTLS secret key is a 2048 byte RSA key.

TBD if this secret key is derived from one of the device's key bundle keys or is generated independently using Aranya's CSPRNG. Would prefer to derive the certificates from the identities rooted in Aranya to avoid maintaining an independent identity/authorization model alongside Aranya which already provides this.

## Certificate Generation

A public x509 self-signed mTLS cert is generated from the secret RSA key. This cert can be exchanged with other peers out-of-band prior to syncing with them. It is important to exchange self-signed certs via a secure out-of-band channel or they are susceptible to man-in-the-middle attacks.

TBD if not using self-signed certs, which device generates the root cert(s)? How are device certs signed by the root cert?

## Certificate Exchange

mTLS certificates should be exchanged between peers prior to attempting to sync with each other. Each peer needs to be in possession of the mTLS x509 cert of the other peer before mutual mTLS authentication can occur.

Certificates can be exchanged in one of two ways:
- Directly, by exchanging certificates with a peer via a secure, out-of-band channel
- Indirectly, by syncing certificates via the graph from another peer

Add new Aranya APIs for adding/removing peer certs:
- `AddPeerCert(DeviceId, x509_cert)` - adds a peer device's cert to the certificate store. The QUIC transport will now trust this cert. TODO: `NetworkIdentifier` for cert hostname?
- `RemovePeerCert(DeviceId)` - removes a peer device's cert from the certificate store. The QUIC transport will no longer trust this cert.
- `ListPeerCerts()` - lists all the x509 certs for all peers

## Storing Certs On The Graph

### Graph Bootstrapping Problem

Storing mTLS certs on the graph is beneficial, because it allows devices to sync the certs of other devices via the graph.

However, there is a bootstrapping problem with this. If all the certs are stored on the graph, how does a peer initially sync the graph from another peer without knowing what mTLS certificates to authenticate the QUIC transport with?

The solution to this is to exchange x509 certs with a peer prior to the initial team sync with that peer. Once this initial sync completes, the device will have access to other certs via the graph that it can use to sync with other peers in the future.

The initial team sync will provide the device with the team owner's mTLS cert and the certs of any devices that have already been added to the team. If any new devices are added to the team after that, the device would need to sync with one of the devices it already has a cert for, or obtain a cert directly from the peer it wishes to sync with.

#### Adding Certs To The Team Via Commands

When a device originally creates the team, it will publish its x509 cert to the graph in the `CreateTeam` command.

Whenever devices are added to the team, their x509 certs are published to the graph in the `AddDevice` command.

## Persistent Storage

mTLS certificates will be stored in a persistent location such as a certificate directory on disk.

The name of each certificate will be the peer's public device ID so there are no naming collisions. This also makes it easy to track which device certs each peer has.

Storing the certificates in a directory on disk is flexible since certs can be manually added/removed by an operator.

Whenever an effect is processed that could add/remove certs, the Aranya daemon should make the corresponding updates to the cert directory as well as the QUIC transport implementation's trusted certs.

The aranya daemon should periodically (e.g. once a second) check the cert directory for any changes so it can update the certs in-use by the QUIC transport implementation. Generally, the daemon would already know if there are any changes because it would process an affect or receive an API call to add/remove a peer's cert. The reason for checking the directory periodically is to handle the case where an operator manually added/removed a cert from the directory.

Note: storing certs in the factdb would have worked if certs could always be synced via the graph, but due to the bootstraping problem it doesn't work for direct cert exchange prior to syncing so this option was ruled out.
