---
layout: page
title: mTLS
permalink: "/mtls/"
---

# Aranya mTLS Authentication

## Overview

mTLS is mutual TLS authentication. Traditional TLS only authenticates the server to the client, but not the client to the server. mTLS provides mutual authentication by validating the identities of both peers to each other via their TLS certificates before sending data over a secure channel.

mTLS is commonly used in zero-trust environments where there is no trusted third party (TPP) or root CA server that can be trusted. This aligns well with the zero-trust architecture of Aranya.

Aranya's sync traffic is currently secured via `s2n_quic` PSKs. We developed our own fork of `s2n_quic` to add support for PSKs to the library. While PSKs are the ideal solution for securing QUIC communications for our zero-trust application, there are a few realities that make it impractical:
- Upstreaming our PSK branch to the `main` branch of `s2n_quic` is not going to happen any time soon.
- There is better support for TLS certificates in the broader security and networking community as well as the QUIC libraries available in Rust.

Because of this, we plan to migrate the authentication/encryption of the Aranya syncer transport from QUIC PSKs to QUIC mTLS certs.

## Certificate Generation

When each peer generates its initial key bundle, it will also generate an a random mTLS secret key from which the mTLS cert is derived.

The mTLS secret key is a 2048 byte RSA key generated using Aranya's CSPRNG.
A public, self-signed x509 mTLS cert is derived from the secret RSA key.

It is recommended to use another device's cert (such as the team owner) as a root cert which signs device certs.
Once a cert is signed with `SignDeviceCert()`, use `SetSignedDeviceCert()` to upgrade a device's cert from a self-signed cert to a root-signed cert.

## Certificate Exchange

In order to sync with each other, peers must either exchange their self-signed certs ahead of time, or posses a shared root cert that can be used to validate cert signatures.

It is important to exchange certs via a secure out-of-band channel or they are susceptible to man-in-the-middle attacks.

Certificates can be exchanged in a few different ways:
- Directly, by exchanging certificates with a peer via a secure, out-of-band channel
- Indirectly, by syncing certificates via the graph from another peer
- Indirectly, by sharing root certs which can be used to validate cert signatures

Add new Aranya APIs for adding/removing/signing device certs:
- `AddDeviceCert(x509_cert)` - adds a device's cert to the certificate store. The QUIC transport will now trust this cert when syncing. If a root cert is added via this API, any certs signed by that root cert will also be trusted. TODO: `NetworkIdentifier` for cert hostname?
- `RemoveDeviceCert(x509_cert)` - removes a peer device's cert from the certificate store. The QUIC transport will no longer trust this cert when syncing.
- `SignDeviceCert(x509_cert) -> (x509_cert_signed, x509_root_cert)` - signs a cert with the current device's cert. The QUIC transport will now trust this cert when syncing.
- `SetSignedDeviceCert(x509_cert_signed, x509_root_cert)` - replace current device's cert with a cert signed by another device. Validates the cert is signed by the root cert before updating the device's cert. Invokes the `UpdateCert` command. Adds the root cert to the local cert store to trust it.
- `RegenerateDeviceCert()` - regenerates a random cert for the current device replacing the old cert with the newly generated cert. Invokes the `UpdateCert` command.
- `GetDeviceCert() -> x509_cert` - returns the current device's x509 cert. The cert returned by this API can be passed into `SignDeviceCert()` on another device to obtain a signed cert. The signed cert can be set on the current device with `SetSignedDeviceCert()`.
- `GetDeviceCerts() -> [(DeviceId, x509_cert)]` - lists the x509 certs for all devices on the team.

## Storing Certs On The Graph

### Graph Bootstrapping Problem

Storing mTLS certs on the graph is beneficial, because it allows devices to sync the certs of other devices via the graph.

However, there is a bootstrapping problem with this. If all the certs are stored on the graph, how does a peer initially sync the graph from another peer without knowing what mTLS certificates to authenticate the QUIC transport with?

The solution to this is to exchange x509 certs with a peer prior to the initial team sync with that peer. Once this initial sync completes, the device will have access to other certs via the graph that it can use to sync with other peers in the future.

The initial team sync will provide the device with the team owner's mTLS cert and the certs of any devices that have already been added to the team. If any new devices are added to the team after that, the device would need to sync with one of the devices it already has a cert for, or obtain a cert directly from the peer it wishes to sync with.

#### Adding/Removing Certs Via Graph Commands

When a device originally creates the team, it will publish its x509 cert to the graph in the `CreateTeam` command. This command emits a `CertAdded` effect with the cert.

Whenever a device is added to the team, its x509 cert is published to the graph in the `AddDevice` command. This command emits a `CertAdded` effect with the cert.

Whenever a device is removed from the team via the `RemoveDevice` command, its x509 cert is removed from the factdb and cert store. This command emits a `CertRemoved` effect with the cert.

A device's cert can be updated via a `UpdateCert(old_cert, new_cert)` command which emits a `CertRemoved` effect for the old cert and a `CertAdded` effect for the new cert.

Whenever a Aranya daemon observes a `CertAdded` or `CertRemoved` effect, it should make the corresponding update to the local cert store.

A new `query_device_certs()` query will be added to the default policy to support querying a list of certs for each device on the team.

A new `query_device_cert(device_id) -> cert` query will be added to the default policy to support obtaining a device's current cert.

## Persistent Certificate Storage

mTLS certificates will be stored in a persistent location such as a certificate directory on disk.

The filename of each certificate will be the hash of the certificate so there are no naming collisions.

Storing the certificates in a directory on disk is flexible since certs can be manually added/removed by an operator or automatically by syncing graph commands which update certs.

Whenever an effect is processed that could add/remove certs, the Aranya daemon should make the corresponding updates to the cert store as well as the QUIC transport implementation's trusted certs.

The aranya daemon should periodically (e.g. once a second) check the cert directory for any changes so it can update the certs in-use by the QUIC transport implementation. Generally, the daemon would already know if there are any changes because it would process an affect or receive an API call to add/remove a peer's cert. The reason for checking the directory periodically is to handle the case where an operator manually added/removed a cert from the directory.

Note: storing certs in the factdb would have worked if certs could always be synced via the graph, but due to the bootstraping problem it doesn't work for direct cert exchange prior to syncing so this option was ruled out.

## Example

Example of bootstrapping device certs for syncing.

1. Team owner creates a team with the `CreateTeam` command. Its cert is added to the graph and the local cert store.
2. Team owner onboards new member devices A and B to the team via the `AddDevice` command. Their certs are added to each device's respective graph and local cert store.
3. Members A and B obtain their current certs with `GetDeviceCert() -> cert`.
4. Members A and B send their certs to team owner out-of-band.
5. Team owner signs member A and B certs with `SignDeviceCert(cert) -> (signed_cert, root_cert)`. The team owner device now trusts the signed certs of members A and B because it has added their certs to its local cert store.
6. Team owner sends signed certs back to members A and B along with the public root cert. This all happens out-of-band.
7. Members A and B upgrade from self-signed certs to root-signed certs with `SetSignedDeviceCert(signed_cert, root_cert)`. The root cert has been added to the local cert store to trust it. Members A and B now trust the root cert as well as each other's root-signed certs.
8. The team owner, member A, and member B have established a chain of trust via certificates that allows them to sync with each other.
