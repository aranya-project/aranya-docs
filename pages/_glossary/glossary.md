---
layout: page
title: Glossary
---

# Glossary

<a name="action"></a>**Action**\
An action is a generated function defined in the [policy language]({{ '/policy-language-v2' | relative_url }}) that can affect state. Actions create new [commands](#command) to be evaluated by the [policy](#policy) and, if valid, added to the graph (DAG). When new commands arrive (from either local creation, or synced from other nodes), the policy for those commands is evaluated, which may produce fact changes and effects. Actions can be thought of as providing a contract (along with effects) to the application which is implemented by the policy.

<a name="abac"></a>**Attribute-Based Access Control (ABAC)**\
A version of Identity Access Management that uses attributes over defined roles to grant an entity or group of entities' permission(s) to interact with a graph.

<a name="afc"></a>**Aranya Fast Channels (AFC)**\
A low-latency, high-throughput encryption engine that uses Aranya for key management and authorization. Find more details in the [AFC spec]({{ '/afc' | relative_url }}).

<a name="aranya"></a>**Aranya**\
Manages distributed data by representing state as a [graph](#graph), which contains commands and [factDBs](#factdb), that is evaluated by a [policy](#policy). Aranya includes components for evaluating policy, cryptography, storage, conflict resolution and syncing. Find more details in the [Aranya spec]({{ '/aranya-beta' | relative_url }}).

<a name="ast"></a>**Abstract Syntax Tree (AST)**\
An abstract syntax tree, is a tree data structure that represents code. It's used in the policy engine to parse the policy language. Learn more about the [AST data structure](https://en.wikipedia.org/wiki/Abstract_syntax_tree).

<a name="audit-monitoring"></a>**Audit and Monitoring**\
Regularly review and monitor activities and detect suspicious behavior. Use network monitoring tools to track access patterns and machine learning algorithms to detect anomalies.

<a name="bandwidth"></a>**Bandwidth**\
How much data can be theoretically transferred over the network over a certain period of time. Read more about [bandwidth](https://en.wikipedia.org/wiki/Bandwidth_(computing)).

<a name="channel"></a>**Channel**\
An [AFC](#afc) _channel_ facilitates one-to-one communication in either a unidirectional or bidirectional manner. Both channel types use unique symmetric [AEAD](https://datatracker.ietf.org/doc/html/rfc5116) key(s). A unidirectional channel uses one key to function as the seal key on one side, and the open key on the other side. While a bidirectional channel uses two unique symmetric keys as open and seal keys on both side, allowing it to secure returned data with a unique key.

<a name="channelkeys"></a>**ChannelKeys**\
Two unique symmetric keys, (`k1`, `k2`), that enable encryption and decryption for each user in a _bidirectional_ [channel](#channel). One side of the channel uses `k1` for encryption and `k2` for decryption, while the other side uses `k1` for decryption and `k2` for encryption.

<a name="cicd"></a>**CI/CD**\
Continuous Integration and Continuous Delivery. A development best practice that ensures software is tested, integrated, and deliverable/deployable which each commit and pull request against the repositories. Read more about [CICD](https://en.wikipedia.org/wiki/CI/CD).

<a name="command"></a>**Command**\
Instruction given by an device to perform a specific task. It is the object that is sent and stored to denote individual actions by different devices, as defined possible by the [policy](#policy). For example, it could be to add an entity to a team, whereby the command object itself indicates the action that was performed and other necessary information, such as the credentials of the newly added entity.

<a name="crypto-engine"></a>**Crypto Engine**\
Provides a set of APIs for encryption, decryption, and key authentication.

<a name="dag"></a>**Directed Acyclic Graph (DAG)**\
We use this term interchangeably with the [Graph](#graph). Read more about [directed acyclic graphs](https://en.wikipedia.org/wiki/Directed_acyclic_graph).

<a name="device"></a>**Device**\
Represents an instance and has an identity associated to it, as well as other crypto material which govern how it behaves on the endpoint. An entity could be used to describe a specific user on the platform.

<a name="effect"></a>**Effect**\
Data, as defined in a policy, that may be emitted to clients when a [command](#command) is processed.

<a name="endpoint"></a>**Endpoint**\
Where the Aranya software is deployed. This can be a piece of hardware (e.g. spacecraft payload, drone, cellular device, etc.) or software (e.g. application).

<a name="ephemeral-session"></a>**Ephemeral Session**\
In ephemeral sessions, [commands](#command) are locally processed by a policy but do not persist to the [graph](#graph). An ephemeral session only lasts as long as the lifetime of the Aranya daemon that it's running in. Once a daemon stops/restarts, the session will no longer be available. Read the [sessions]({{ '/aranya-sessions' | relative_url }}) spec for more details.

<a name="fact"></a>**Fact**\
[Key-value pair](https://en.wikipedia.org/wiki/Name%E2%80%93value_pair) that is produced by processing a [command](#command).

<a name="factdb"></a>**FactDB**\
Fact storage within the graph at any given command. The factDB is accessed from a [perspective](#perspective) of the [graph](#graph), therefore, its values change depending on the specific [command](#command) or point-in-time the graph is evaluated.

<a name="ffi"></a>**Foreign Function Interface (FFI)**\
Mechanism to perform operations that are written or compiled in a different programming language. Some examples include policy code calling functions written in Rust and Rust code calling functions written in C. More details on Rust FFIs can be found in the [Rust by Example](https://doc.rust-lang.org/rust-by-example/std_misc/ffi.html) Book.

<a name="ffi-module"></a>**FFI Module**\
Set of [FFI](#ffi) operations that can be imported by a [policy](#policy).

<a name="ffi-schema"></a>**FFI Schema**\
Static description of the names and function signatures provided by [FFI modules](#ffi-module). This allows the [policy Compiler](#policy-compiler) to validate the FFI is being used correctly in policy code.

<a name="graph"></a>**Graph**\
Directed acyclic graph (DAG) where the nodes are [commands](#command), which represents the total ordering of commands. Each command in the graph may contain a new version of its parent's [factDB](#factdb), sometimes refer to as a [team](#team). Each command is connected by a line to the command that occurred immediately before it, as seen from the device's local state.

<a name="idam"></a>**Identity and Access Management (IdAM)**\
Identity and Access Management, controls access to a resource based on the user. Read more about [Identity and Access Management](https://en.wikipedia.org/wiki/Identity_and_access_management).

<a name="Instance"></a>**Instance**\
Individual deployment of the Aranya software. A single endpoint can have one or many instances.

<a name="label"></a>**Label**\
An identifier that binds an AFC [channel](#channel) to a set of Aranya policy rules, ensuring that both channel users are authorized to transmit data via the channel according to rule defined by the policy.

<a name="latency"></a>**Latency**\
Amount of time it takes data to travel from one point to another. Read more about [latency](https://en.wikipedia.org/wiki/Latency_(engineering)).

<a name="least-privilege-access"></a>**Least Privilege Access**\
This IDAM policy cornerstone gives devices and systems only the minimal access needed to perform their tasks, reducing the risk of unauthorized access or activities.

<a name="linear-storage"></a>**Linear Storage**\
An implementation of the storage APIs using a file-like byte storage interface that is suitable for many different systems without making many assumptions on the underlying storage.

<a name="memory-storage"></a>**Memory Storage**\
An implementation of the storage APIs that relies on the system's global allocator. This is a simpler implementation that is meant to be easy to verify its correctness. This is mostly useful for testing purposes.

<a name="model"></a>**Model**\
Simulates [aranya](#aranya) by providing a library with functionality to construct clients, execute actions and sync. Read the [model spec]({{ '/aranya-model' | relative_url }}) for more details.

<a name="openkey"></a>**OpenKey**\
The key used to decrypt on either side of a _bidirectional_ [channel](#channel).

<a name="openonlykey"></a>**OpenOnlyKey**\
The key used by the side that decrypts in a _unidirectional_ [channel](#channel).

<a name="peer-to-peer"></a>**Peer to Peer**\
Allows computers to share access by acting as a server for each other.

<a name="perspective"></a>**Perspective**\
In storage, a version of the [graph](#graph) from a specific [command](#command), or point-in-time.

<a name="policy"></a>**Policy**\
Defines rules for evaluating [actions](#action) to publish [commands](#command) on the [graph](#graph), resulting in [effects](#effect) emitted to [Aranya](#aranya) clients. The policy can be thought of as the execution and validation of business logic in Aranya. More information on the Aranya _Policy_ _Language_ can be found in the [specification]({{ '/policy-language-v2' | relative_url }}).

<a name="policy-compiler"></a>**Policy Compiler**\
Compiles policy code into a module to be consumed by the [policy VM](policy-vm).

<a name="policy-document"></a>**Policy Document**\
Markdown file that describes and implements the objects and operations used to create, update, and delete state, including a [graph](#graph) and [factDB](#factdb).

<a name="policy-engine"></a>**Policy Engine**\
An implementation used as part of [Aranya](#aranya) client state to store and retrieve policies.

<a name="policy-module"></a>**Policy Module**\
A policy module consists of compiled policy code.

<a name="policy-vm"></a>**Policy VM**\
Policy virtual machine. Consumes a compiled policy module to execute and perform policy decisions.

<a name="quic"></a>**QUIC**\
A general-purpose transport layer network protocol, that utilizes several multiplexed [UDP](#udp) connections and encrypts traffic with TLS. Read more about the [QUIC protocol](https://en.wikipedia.org/wiki/QUIC).

<a name="rbac"></a>**Role-Based Access Control (RBAC)**\
A version of Identity Access and Management that uses roles to grant a user or group of users permission(s) to interact with a [graph](#graph).

<a name="revocation"></a>**Revocation**\
Removal of access to a specific data set.

<a name="role"></a>**Role**\
Defines capabilities a user or group of users may be assigned to perform operations in a policy that uses an [RBAC](#rbac) system.

<a name="rtt"></a>**Round-Trip Time (RTT)**\
How long it takes data to travel from one point to another and back. Read more about [round-trip delay](https://en.wikipedia.org/wiki/Round-trip_delay).

<a name="sealkey"></a>**SealKey**\
The key used to encrypt on either side of a _bidirectional_ [channel](#channel).

<a name="sealonlykey"></a>**SealOnlyKey**\
The key used by the side that encrypts in a _unidirectional_ [channel](#channel).

<a name="segment"></a>**Segment**\
In storage, a nonempty sequence of [commands](#command) that have been persisted to the graph.

<a name="secure-authentication-and-authorization"></a>**Secure Authentication and Authorization:**\
Implement strong authentication methods and control what authenticated devices can do. Consider multi-factor authentication and digital certificates to ensure only authorized individuals have access.

<a name="segmentation"></a>**Segmentation**\
Data segmentation is the process of organizing data into groups based on shared characteristics or access/sensitivity levels.

<a name="segregation-of-duties"></a>**Segregation of Duties**\
Responsibilities should be distributed among different individuals to prevent fraud or error. This is especially important in mesh networks, where one error can have significant consequences.

<a name="shm"></a>**Shared memory (Shm)**\
Shared memory or shared local memory allows processes to communicate information by sharing a region of memory. It's used to store channel keys for ephemeral sessions and APS channels in Aranya.

<a name="state"></a>**State**\
All the information that defines how the software platform is currently functioning, how it can change, and how it should behave in different scenarios.

<a name="sync"></a>**Sync**\
Implementations that allow remote [Aranya](#aranya) clients to share state. More details on syncing in Aranya can be found in the [sync]({{ '/sync' | relative_url }}) specification.

<a name="tcp"></a>**Transmission Control Protocol (TCP)**\
Transport that supports resending dropped packets. Read more about [tcp](https://en.wikipedia.org/wiki/Transmission_Control_Protocol).

<a name="team"></a>**Team**\
A group of users who interact over a [graph](#graph). Sometimes used interchangeably with graph, as a team is associated with a single graph.

<a name="throughput"></a>**Throughput**\
The amount of data that can actually be transferred over the network over a certain period of time. This is a measurement rather than a theoretical estimate. Read more about [throughput](https://en.wikipedia.org/wiki/Network_throughput).

<a name="ttl"></a>**Time To Live (TTL)**\
This value is set to the number of hops a packet should exist on the network before it is dropped. Read more about [ttl](https://en.wikipedia.org/wiki/Time_to_live).

<a name="udp"></a>**User Datagram Protocol (UDP)**\
A simple connectionless protocol that prioritizes speed over error checking and correction. Read more about [udp](https://en.wikipedia.org/wiki/User_Datagram_Protocol).

<a name="uds"></a>**Unix Domain Socket (UDS)**\
An endpoint for exchanging data. Read more about [UDS](https://en.wikipedia.org/wiki/Unix_domain_socket).

<a name="weave"></a>**Weave**\
The weave algorithm enforces deterministic ordering while merging two [DAG](#dag)s, or sets of [commands](#command), each may have multiple branches.

<a name="zero-trust"></a>**Zero-Trust**\
A cybersecurity approach that requires all entities and devices to be authenticated and authorized before accessing data, endpoints, applications, and services.
