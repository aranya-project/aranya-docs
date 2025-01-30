---
layout: page
title: Home
permalink: "/"
---

## What is Aranya?

Aranya is an **access governance and secure data exchange platform for organizations to control their critical data and services**. Access governance is a mechanism to define, enforce, and maintain the set of rules and procedures to secure your system's behaviors.

Aranya enables you to **safeguard sensitive information, maintain compliance, mitigate the risk of unauthorized data exposure, and grant appropriate access.** Aranya's decentralized platform allows you to define and enforce these sets of policies to secure and access your resources.

The platform **provides a software toolkit** for policy-driven access controls and secure data exchange. The software is deployed on endpoints, integrating into applications which require granular access controls over their data and services. Endpoints can entrust Aranya with their data protection and access controls so that other applications running on the endpoint need only to focus on using the data for their intended functionality.

A key discriminating attribute of Aranya is the decentralized, zero trust architecture. Through the integration of the software, access governance is implemented without the need for a connection back to centralized IT infrastructure. With Aranya's decentralized architecture, if two endpoints are connected to each other, but not back to the cloud or centralized infrastructure, **governance over data and applications will be synchronized between peers** and further operations will continue uninterrupted.

## What can I use Aranya for?

-   **Secure Sensitive Data:** Ensure your data is secured from unauthorized access or potential breaches using cryptographic algorithms to encrypt the data.

-   **Data Protection and Privacy:** Granular controls which can grant or revoke access, defined through policy that dictate whether an entity can or can't access data.

-   **Secure Data Exchange:** Enable unidirectional or bidirectional secure data exchange between two devices without the need for access to any form of centralized IT infrastructure.

-   **Data Integrity/Provenance:** Access activity logs provide transparency on data's integrity, ensuring your data has not been compromised or manipulated.

### Capabilities

Aranya provides the following capabilities in a single, low size, weight, and power (SWAP) software platform, key to your organization's access governance:

-   **Identity & Access Management (IdAM)**

    -   **RBAC (Roles):** Entities, or a group of entities, are given permission to interact with data or applications based on pre-defined roles.

    -   **ABAC (Attributes):** Entities, or a group of entities, can be given permission to interact with data or applications based on dynamic attributes.

    -   **Revocation:** Entities or whole RBAC/ABAC roles can be removed from access just as easily as it is to grant access.

-   **Decentralized Peer-to-Peer Messaging**

    -   Enable secure data exchange between two endpoints without the need for access to any form of centralized IT infrastructure.

-   **Key Management**

    -   Aranya leverages the crypto module that is implemented and configured on the endpoint to perform cryptographic functions used by policy commands. This means that an authority model can be designed to utilize the crypto module for generating, storing, and/or distributing cryptographic keys securely and in accordance with the governing policy, enabling dynamic key management.

-   **Data Segmentation**

    -   Data can be segmented based on pre-defined roles or attributes through topic labels. For example, certain roles may be restricted from gaining access to a topic and other roles may be prerequisites for gaining access. In addition to roles, any attribute stored about the entity may be used to control access to a topic.

-   **Audit Log of Immutable Commands**

    -   Using the Control Plane (described below), Aranya provides a high-assurance audit log of all commands, or instructions given by an entity to perform a specific task, providing data integrity and provenance for the movement of your data throughout your infrastructure.

    -   The native data structure _is_ the audit log of all commands. The log, which is distributed and synchronized across all endpoints, provides a cryptographically authenticated, tamper-evident, high-assurance replication of all commands taken.

    -   For each verified command, a cryptographic hash is created. If a previous event has been modified, the current one will no longer be valid due to the hash changing.


<!-- Data flow diagram -->

### Support section
