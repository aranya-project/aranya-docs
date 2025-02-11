---
layout: page
title: Glossary
---

# Glossary

<a name="action"></a>**Action**\
An operation that may be called by a client to produce a [command](#command), which is then processed and, if valid, may affect state.

<a name="afc"></a>**AFC**\
Aranya Fast Channels. A low-latency, high-throughput encryption engine that uses Aranya for key management and authorization. Find more details in the [AFC spec]({{ '/afc' | relative_url }}).

<a name="aranya"></a>**Aranya**\
Manages distributed data by representing state as a [graph](#graph), which contains commands and [factDBs](#factdb), that is evaluated by a [policy](#policy). Aranya includes components for evaluating policy, cryptography, storage, conflict resolution and syncing. Find more details in the [Aranya spec]({{ '/aranya-beta' | relative_url }}).

<a name="ast"></a>**AST**\
An abstract syntax tree (AST), is a tree data structure that represents code. It's used in the policy engine to parse the policy language. Learn more about the [AST data structure](https://en.wikipedia.org/wiki/Abstract_syntax_tree).

<a name="bandwidth"></a>**Bandwidth**\
How much data can be theoretically transferred over the network over a certain period of time. Read more about [bandwidth](https://en.wikipedia.org/wiki/Bandwidth_(computing)).

<a name="braid"></a>**Braid**\
In storage, enforces deterministic ordering while merging two branches, or sets of [commands](#command), in a [graph](#graph) based on properties of the affected commands.

<a name="channel"></a>**Channel**\
An [AFC](#afc) _channel_ facilitates one-to-one communication in either a unidirectional or bidirectional manner. Both channel types use unique symmetric [AEAD](https://datatracker.ietf.org/doc/html/rfc5116) key(s); a unidirectional channel uses one key and a bidirectional channel uses two keys.

<a name="channelkeys"></a>**ChannelKeys**\
Two unique symmetric keys, (`k1`, `k2`), that enable encryption and decryption for each user in a _bidirectional_ channel. One side of the channel uses `k1` for encryption and `k2` for decryption, while the other side uses `k1` for decryption and `k2` for encryption.

<a name="cicd"></a>**CI/CD**\
Continuous Integration and Development. A development best practice that ensures software is tested, integrated, and deliverable/deployable which each commit and pull request against the repositories.

<a name="command"></a>**Command**\
An object containing new state used while evaluating a [policy](#policy).

<a name="crypto-engine"></a>**Crypto Engine**\
Provides a set of APIs for encryption, decryption, and key authentication.

<a name="effect"></a>**Effect**\
Data, as defined in a policy, that may be emitted to clients when a [command](#command) is processed.

<a name="ephemeral-session"></a>**Ephemeral Session**\
Commands that are locally processed by a policy at some [perspective](#perspective) of the [graph](#graph) but do not persist to the graph. Read the [sessions spec]({{ '/aranya-sessions' | relative_url }}) for more details.

<a name="fact"></a>**Fact**\
Key-value pair that is produced by processing a [command](#command).

<a name="factdb"></a>**FactDB**\
Fact storage within the graph at any given command. The factDB is accessed from a perspective of the graph, therefore, its values change depending on the access point.

<a name="ffi"></a>**FFI**\
Foreign function interface. Mechanism to perform operations that are written or compiled in a different programming language. Some examples include policy code calling functions written in Rust and Rust code calling functions written in C. More details on Rust FFIs can be found in the [Rust by Example](https://doc.rust-lang.org/rust-by-example/std_misc/ffi.html) Book.

<a name="ffi-module"></a>**FFI Module**\
Set of FFI operations that can be imported by a [policy](#policy).

<a name="ffi-schema"></a>**FFI Schema**\
Static description of the names and function signatures provided by FFI modules. This allows the [policy Compiler](#policy-compiler) to validate the FFI is being used correctly in policy code.

<a name="graph"></a>**Graph**\
Directed acyclic graph (DAG) where the nodes are [commands](#command), which represents the total ordering of commands. Each command in the graph may contain a new version of its parent's or parents' [factDB](#factdb). Sometimes used to refer to a [team](#team).

<a name="idam"></a>**IdAM**\
Identity and access management (IdAM), controls access to a resource based on the user.

<a name="label"></a>**Label**\
An identifier that binds an AFC [channel](#channel) to a set of Aranya policy rules, ensuring that both channel users meet some specified criteria.

<a name="latency"></a>**Latency**\
Amount of time it takes data to travel from one point to another. Read more [latency](https://en.wikipedia.org/wiki/Latency_(engineering)).

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

<a name="perspective"></a>**Perspective**\
In storage, a version of the [graph](#graph) from a specific [command](#command), or point-in-time.

<a name="policy"></a>**Policy**\
Defines rules for evaluating [actions](#action) to publish commands on the graph, resulting in effects emitted to [Aranya](#aranya) clients. More information on the Aranya Policy Language can be found in the [specification]({{ '/policy-language-v1' | relative_url }}).

<a name="policy-compiler"></a>**Policy Compiler**\
Compiles policy code into a module to be consumed by the policy VM.

<a name="policy-document"></a>**Policy Document**\
Markdown file that describes and implements the objects and operations used to create, update, and delete state, including a [graph](#graph) and [factDB](#factdb).

<a name="policy-engine"></a>**Policy Engine**\
An implementation used as part of [Aranya](#aranya) client state to store and retrieve policies.

<a name="policy-module"></a>**Policy Module**\
Compiled policy code.

<a name="policy-vm"></a>**Policy VM**\
Policy virtual machine. Consumes a compiled policy module to execute and perform policy decisions.

<a name="quic"></a>**QUIC**\
[UDP](#udp) but better. Read more [here](https://en.wikipedia.org/wiki/QUIC).

<a name="rbac"></a>**RBAC**\
Role-based access control. A version of Identity Access Management that uses roles to grant a user or group of users' permission(s) to interact with a [graph](#graph).

<a name="role"></a>**Role**\
Defines capabilities a user or group of users may be assigned to perform operations in a policy that uses an RBAC system.

<a name="rtt"></a>**RTT**\
Round-trip time. How long it takes data to travel from one point to another and back. Read more [here](https://en.wikipedia.org/wiki/Round-trip_delay).

<a name="sealkey"></a>**SealKey**\
The key used to encrypt on either side of a _bidirectional_ [channel](#channel).

<a name="sealonlykey"></a>**SealOnlyKey**\
The key used by the side that encrypts in a _unidirectional_ [channel](#channel).

<a name="segment"></a>**Segment**\
In storage, a nonempty sequence of [commands](#command) that have been persisted to the graph.

<a name="sync"></a>**Sync**\
Implementations that allow remote [Aranya](#aranya) clients to share state. More details on syncing in Aranya can be found in the [specification]({{ '/sync' | relative_url }}).

<a name="tcp"></a>**TCP**\
Transmission Control Protocol. Transport that supports resending dropped packets. Read more [here](https://en.wikipedia.org/wiki/Transmission_Control_Protocol).

<a name="team"></a>**Team**\
A group of users who interact over a graph. Sometimes used interchangeably with graph as a team is necessarily associated with a single graph.

<a name="throughput"></a>**Throughput**\
The amount of data that can actually be transferred over the network over a certain period of time. This is a measurement rather than a theoretical estimate. Read more [here](https://en.wikipedia.org/wiki/Network_throughput).

<a name="ttl"></a>**TTL**\
Time to live. This value is set to the number of hops a packet should exist on the network before it is dropped. Read more [here](https://en.wikipedia.org/wiki/Time_to_live).

<a name="udp"></a>**UDP**\
User Datagram Protocol. Simple transport. Read more [here](https://en.wikipedia.org/wiki/User_Datagram_Protocol).

<a name="uds"></a>**UDS**\
Unix domain socket. An endpoint for exchanging data. Read more [here](https://en.wikipedia.org/wiki/Unix_domain_socket).
