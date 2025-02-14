---
layout: page
title: Aranya Rust API
---

{% assign gh_aranya_url = 'https://github.com/aranya-project/aranya' %}

# Aranya Rust API
Aranya provides Rust APIs to interact with the Aranya Client and Daemon. The Rust <a href="https://crates.io/crates/aranya-client" target="_blank">Client</a> library is used as an interface to the <a href="https://crates.io/crates/aranya-daemon" target="_blank">Daemon</a>, the Aranya Daemon maintains the state of Aranya and syncs with peers.

### Aranya Client
Aranya's Rust Client is the library that your application will interface with. By integrating the library into an application, IDAM/RBAC and secure data transmission can be easily added without needing to develop complex security architectures, protocols, and cryptography.

The client provides the following functionality:

- Add and remove sync peers. The daemon will periodically attempt to sync Aranya state with any peers (as long as it is able to communicate with the peer over the network) in its configured sync peer list.
- Add and remove devices from the team as determined by the implemented policy.
- Assign and revoke device roles as determined by the implemented policy.
- Create, delete, assign and revoke labels used for attribute based controls and segmentation of data communicated between peers within Aranya Fast Channels as determined by the implemented policy.
- Create and delete Fast Channels channels as determined by the implemented policy.
- Send and receive encrypted data using Aranya Fast Channels. Fast Channels supports bidirectional encrypted data exchange over TCP transport. Note: The functionality noted 'as determined by the implemented policy' are defined in the <a href="{{ gh_aranya_url }}/blob/HEAD/crates/aranya-daemon/src/policy.md" target="_blank">default policy</a>. As such, these may differ depending on the policy implemented in your application.

### Aranya Daemon
The Aranya Daemon is a long-running executable that is used to maintain the state of Aranya after adding commands to the graph or syncing commands from other peers by interacting directly with the <a href="https://github.com/aranya-project/aranya-core" target="_blank">Aranya Core</a> library. See <a href="{{ gh_aranya_url }}/blob/HEAD/crates/aranya-daemon-api/src/service.rs" target="_blank">here</a> for details on the Aranya functionality available through the daemon.

The daemon's responsibilities include:

- Periodically syncing state between networked Aranya peers to ensure they all have consistent state. This includes the ability to add and remove sync peers, available to your application through the <a href="{{ gh_aranya_url }}/blob/HEAD/crates/aranya-client/" target="_blank">Rust Client</a> library.
- Invokes actions received from the client and handles effects from the <a href="https://github.com/aranya-project/aranya-core" target="_blank">Aranya Core</a> library. See the [walkthrough]({{ '/getting-started/walkthrough/' | relative_url }}) for more details.
- Generates and maintains cryptographic keys for encrypting and decrypting data for Aranya and Fast Channels.

## Rust API docs
- <a href="https://docs.rs/aranya-client/latest/aranya_client/" target="_blank">Aranya Client API docs</a>
- <a href="https://docs.rs/aranya-daemon/latest/aranya_daemon/" target="_blank">Aranya Daemon API docs</a>

## Rust example
There is a <a href="{{ gh_aranya_url }}/blob/main/templates/aranya-example/README.md" target="_blank">Rust example</a> application that runs a `cargo-generate` template to give a quick way to get up and running. During setup, the example application starts an instance of the aranya-daemon for multiple Aranya devices in the background. The daemon automatically handles syncing the Aranya graph states between peers so the Aranya client can focus on the operations it wants to perform on the team.

The example app shows how to use the `aranya-client` library to:
- Setup a team
- Sync Aranya graphs
- Create an Aranya Fast Channel
- Send encrypted data between peers
