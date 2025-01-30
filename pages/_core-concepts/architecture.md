---
layout: page
title: Architecture
category: Core Concepts
---

<img src="{{ site.url }}/assets/images/overview-image1.png"  class="doc-image" alt="A diagram of a software application Description automatically generated" />

_Figure 1: System Architecture Overview Diagram_

**On-Graph Components:**

-   Pre-defined **policy** that contains the set of roles and permissions which make up the authority model.

-   **Crypto Module** that is used to perform all cryptographic functions without exposing sensitive material outside its domain. The system leverages a set of cryptographic protocols where the underlying algorithms are configurable up to NIST standard requirements for security. The system leverages whichever crypto is configured and does not provide the cryptographic cipher suite.

-   **Virtual Machine (VM) for executing the policy** and connecting it to the cryptographic module.

-   **Aranya Runtime** which connects your application and all other external components together for passing data and commands. The application will perform its functional operation leveraging the Aranya APIs. The Aranya instance will route API calls to the Policy VM for execution, and any commands published by an action will be provided back to the device for storage. If any effects are emitted by the commands, they too will be provided to the device to be sent back to the user application via the APIs.

Aranya Runtime performs similar routing to handle peer-to-peer communication through the Sync API.

-   **Storage component (DAG and Fact DB)** to hold executed operations that have been validated and added to the audit log.

-   **Set of APIs for the device to perform or exchange policy operations.**

    -   Generic Actions/Effects API

    -   Sync Transport API

**Off-Graph Components:**

-   **Aranya Fast Channels (AFC)** High throughput, low latency **network channels for exchanging data between endpoints.**

-   **Shared Local Memory** to hold the **channel keys** for AFC, used for encrypting and/or decrypting data.

-   **Crypto Module** that is used to perform all cryptographic functions without exposing sensitive material outside its domain.

-   **Set of APIs to send and receive data** or **compute new channel keys.**

    -   Channel Transport API

_Note:_ The control plane and data plane may utilize different on or off-graph components to execute tasks they are responsible for. For example, while the data plane may mostly use the off-graph approach for handling secure message exchanges in real-time, off-graph messaging does not inherently provide an immutable record of the commands. There may be scenarios where the message being sent must be captured by an immutable/verifiable command that is tracked against the authority state. This would grant usage of on-graph handling of messages by the data plane.
