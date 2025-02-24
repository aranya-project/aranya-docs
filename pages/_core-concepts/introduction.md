---
layout: page
title: Introduction
---

Aranya is useful anywhere you have data that needs to be reconciled, sent
securely, or restricted. Possible uses could be sending data between IoT
devices, files or messages between users, encryption keys between computer
systems or information between embedded devices. All of this capability is
provided by the open-source [Aranya project](https://github.com/aranya-project),
written in [Rust](https://www.rust-lang.org/). We provide a
[client library](https://github.com/aranya-project/aranya/tree/main/crates/aranya-client)
for integrating with larger applications and a
[daemon](https://github.com/aranya-project/aranya/tree/main/crates/aranya-daemon)
that operates over the
[core functionality](https://github.com/aranya-project/aranya-core).

To test out Aranya for yourself, see the
[walkthrough]({{ 'getting-started/walkthrough/' | relative_url }}).
Otherwise, continue reading for more details on the inner workings of Aranya.

## Terminology

The following terms will be used throughout the documentation to describe
Aranya deployments on **endpoints.** These deployments, or **instances,** are
further defined as specific **entities,** or devices, once the instance is
assigned a specific set of cryptographic keys used for identity and
authentication and are governed by written **policy**.

**Endpoint:** A piece of hardware (e.g. IoT device, computer, cellular phone,
etc.) or software (e.g. application) on which Aranya is integrated.

**Instance:** A single deployment of the Aranya software. To note, each
endpoint can have one or many instances deployed on it.

**Entity:** You can think of this as a specific device identity and it is used
to identify an instance by assigning it a set of cryptographic keys used for
identity and authentication, allowing it to govern the behavior of the
endpoint.

**Policy:** Defines specific behaviors, or accepted actions with corresponding
commands, that will be generated and executed on the endpoint.

For information on more terms commonly used throughout Aranya and our
documentation, see the [glossary]({{ 'glossary/glossary' | relative_url }}).
