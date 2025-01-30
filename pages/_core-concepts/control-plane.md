---
layout: page
title: Control vs Data Plane
category: Core Concepts
---

## Control Plane vs. Data Plane

The next two sections will lay out the foundational knowledge of the control plane and data plane which will be helpful to better understand how they interact within the system and the capabilities that each of them provides.

### Control Plane

The Aranya control plane is the heart of its access governance solution. It is where the defined policy is stored and executed to provide the functionality needed to enforce the set of roles, permissions, and requirements it outlines. The policy file is fully customizable to allow each organization to explicitly define the authority model that best suits their needs to control access to resources with as much granularity as they may need.

The policy contains the full set of operations that devices can perform in the system and specifies the permission requirements for each. These operations are denoted by data structures, known to Aranya as "Commands." Each command is essentially a piece of data that defines an operation and embeds into it the set of requirements needed to perform it. Hence, executing a command will carry out the operation it defines, and storing it will make up the audit log of authority model operations.

The distributed data is stored as commands in a Directed Acyclic Graph (DAG) which is updated via a policy. The policy outlines the different commands, actions, and effects which define the objects, operations, and validity checks for those operations to update the state of the graph.

All endpoints participating in the graph will receive all updates to the graph regardless of whether that command is relevant to that endpoint. This property allows commands to propagate asynchronously and opportunistically across the sync network to reach its intended destination through all available transport paths, but also imposes a cost in terms of network bandwidth and processing on each node for each command. Therefore, on-graph messages are limited to 100’s of messages per second, limited by available aggregate transport bandwidth and processing performance of the slowest endpoints on the DAG.

**Workflow**

The general workflow for exchanging control plane commands on-graph across two endpoints can be seen below in Figure 2. This workflow assumes a policy has been written and validated for all actions desired in the architecture.

<img src="{{ site.url }}/assets/images/overview-image2.png" class="doc-image" alt="A diagram of a diagram Description automatically generated" />

_Figure 2: General On-Graph Workflow_

**Directed Acyclic Graph (DAG)**

The DAG is a decentralized record of all commands that are replicated and shared between endpoints over the peer-to-peer network managed by an entity's application on the endpoint. Aranya records each command using a DAG. We think about the graph in the way a tree grows - from the root to the tip of each branch - and how that tree grows over time to explain how a record of entity activity is created, and data is shared over time. Each time an entity operates on or shares new data, the historical record is changed.

Since not all endpoints will always be in communication, these records and data storage are not linear. For instance, an endpoint may reset and will need to sync/integrate data with other entities. Hence, a new branch is created for operations performed by disconnected endpoints that are working in parallel and a sync between any two such endpoints will result in a new node on the graph that joins the two branches to represent a merged state.

Aranya uses an ordering algorithm to produce a sequential ordering of commands. Conflict resolution becomes important for determining the order in which to execute commands received from syncing. Aranya uses its ordering algorithm on top of the policy to determine which command to prioritize to produce a linear sequence of commands.

The algorithm is deterministic and can be somewhat compared to a consensus algorithm approach. It builds this linear sequence of commands from the DAG, but it does not change how data is represented in the DAG. The purpose of the linear sequence is to define an eventually consistent state across the system. Thus, the state of the system is denoted as the output of the ordering algorithm.

**Policy**

To execute actions, a custom policy file must be written and validated prior to deployment. Policies outline the accepted actions that can be issued and the corresponding commands that will be generated. Successful commands will emit effects and/or write facts (stored key value pairs) to the graph. The following is a basic overview of the parts that make up a policy.

-   **Action**: Actions are an application's entry point into the policy. They are functions that can perform entity checks and publish commands into the local database. When new commands arrive (from either local creation, or synced from other nodes), the policy for those commands is evaluated, which may produce fact changes and effects. Actions are, alongside effects, part of the application interface implemented by the policy. Actions execute atomically - they only succeed if all the commands they produce succeed.

-   **Command**: A command defines structured data, methods for packing and unpacking this data, and policy decisions for processing data.

-   **Effect**: Effects are structured data emitted by policy, which communicate changes and status from the policy to the application. The outcome of an effect is defined by policy.

-   **Fact**: A fact is a key value pair stored in the Fact Database. The shape of a fact is defined via policy with fact schema statements.

To make changes to a graph, an entity calls an action to generate one or more commands. Another way to think about commands is to envision a piece of data (or fact) that you can manipulate by calling an action. The action is merely the "act" you wish to perform on the data and the command holds the actual execution of this action. Both actions and commands can be implemented on raw data if that data is passed to the action. For example, an action may be adding/removing entities, creating/deleting channels, or sending encrypted data. Once an action is called, the generated command is then evaluated by the policy engine to determine its validity given the current state and loaded policy.

If a command is valid, it may be stored on the graph and some facts may be added, updated, or removed in the fact database. An effect, which provides information at the application level about the operation that was performed, can also be produced when a command is published. Upon syncing, all other peers may see the new validated command on the DAG. If they are authorized to view its contents, such as an encrypted message, then they will be able to obtain that too.

**Fact Database**

Information relevant to the system can be stored as a key/value pair, called a "fact." Facts are stored in the Fact Database and can only be created or mutated by a command. Executing a series of commands will produce a set of facts that depends on the order of execution, that is, if the commands are executed in a different order, they could result in a different set of facts.

Policy evaluation in Aranya relies on the set of facts stored in the fact database to determine whether an operation defined by a command should be permitted to occur. If evaluation is successful, then the command gets fully executed and stored in the DAG. Otherwise, the command may be either rejected or recalled. Both an accepted and a recalled command can change or modify the fact database, however rejected commands never change facts. Rejected commands, therefore, are never added to the graph and are never executed.

**Calling an Action**

To call an Action, the entity will follow the following process:

<div class="mermaid">
flowchart TB
    A(Entity) -- Calls an action --> B(Action) -- Action issues Command --> C(Command) -- Command is evaluated by the policy --> D(Policy)
    D -- Command is accepted --> E(Accepted)
    D -- Command is rejected --> F(Rejected)
    E -- Command is stored on graph and (potentially) updates FactDB -->H(Graph)
</div>

_Figure 3: Calling an Action Workflow_

**Syncing with a Peer (other entity)**

To sync with a peer or other entity using Aranya, the entity will follow the following process:

<div class="mermaid">
flowchart TB
    I(Entity) -- Sync with peer --> J(Sync)
    J -- Sync sends new command --> K(Peer)
    K -- Command is evaluated by the policy --> L(Policy)
    L -- Command is accepted --> M(Accepted)
    L -- Command is rejected --> N(Recalled)
    M --> O(Graph)
    N --> O
</div>

_Figure 4: Syncing with a Peer Workflow_

### Data Plane

The control plane provides the full functionality to implement and enforce the authority model used to govern resource accesses, which includes the transmission of data representing the operations that devices perform by utilizing the sync protocol. Since the sync protocol is designed to work with the DAG to keep a decentralized record of every command, it can have some overhead that increases the latency and may not be the most optimal choice for communicating data real time.

As an alternative, Aranya's data plane may be selected to transmit data securely using end-to-end encryption that is bound to the specific entities as defined by the authority model of the policy in the control plane. An API is provided for this low latency, high throughput data exchange (compared to on-graph) by exposing lightweight channels to applications on the endpoints.

Channels are governed by the authority model defined by the policy. Entities can be incorporated in as many channels as desired. Aranya manages cryptographic keys, leveraging the configured cipher suite for encrypting and decrypting messages on a per-channel basis. Aranya uses the crypto engine to negotiate keys while data is transmitted efficiently off-graph, i.e., without being stored in a command that is added to the DAG. Because the commands are not stored in the DAG, these channels are useful where large messages, network streams, or other high-throughput data must be sent to peers.

Aranya will still leverage the DAG for managing the keys used for authentication. Data segmentation of channels is achieved using topic labels. Encryption is scoped to each channel, which supports one-to-one communication in either a unidirectional or bidirectional manner. The encryption/decryption algorithms provided by the crypto engine are symmetric and facilitate fast communication that is compatible with low resource environments such as embedded systems.

**Workflow**

**Creating a Channel**

A channel is used to group together a fixed number of devices based on specific roles or attributes. User IDs identify the endpoints of the channel, and the topic label is an additional attribute available to write policies against. To create a channel, an entity will generate an ephemeral command. An ephemeral command is one that utilizes the same policy as all other commands, but which is never added to the DAG that audits them. Instead, entities transmit the command through an external transport mechanism. An ephemeral command is part of an ephemeral session, meaning it does not persist to the graph, but is still evaluated by the associated policy. The ephemeral command used as part of the setup includes the information required for the peers to set up the encryption keys that will be used for the channel.

Once the command is validated, the crypto engine generates an encryption key associated with the entity and exposes it through shared memory. If the channel is specified as unidirectional, the entity creating the channel is only assigned an encryption key. If the channel is bidirectional, the entity will also be assigned a decryption key. Aranya stores the key(s) in its own database and associates the key or key pair with this specific channel for this specific entity. After the channel creator's keys have been assigned, a "create channel" command is sent to the specified receiver. Like the process for the initial sender entity, the command is processed by the receiver's associated policy and the crypto engine generates a decryption key (if unidirectional), or encryption/decryption keys (if bidirectional). After the sender and receiver have both processed the "create channel" command, they are free to send and receive messages over their new channel and no further messages will be processed by their policy.

<img src="{{ site.url }}/assets/images/overview-image5.png" class="doc-image" alt="A diagram of a system Description automatically generated" />

_Figure 5: Workflow when creating a Channel_

**Sending Data**

To send data over the channel, an entity will prepare the bytes to submit to the API to be encrypted. Aranya will retrieve the encryption key associated with the intended channel (stored in Shared Local Memory) and encrypt the message using the crypto engine. The user-defined transport method is then used to transmit the message to the receiver. Once the message has been received, Aranya will retrieve the entity's decryption key associated with this channel and use the crypto engine to decrypt the message. If a user's encryption or decryption key associated with the channel cannot be found, then the entity cannot encrypt or decrypt the message.

While channels are one-to-one, a policy may define rules for an entity to send messages to multiple other entities over individual channels. This is facilitated by topic labels, which are defined in a policy and act on the permission system. A label is assigned to entities that want to communicate under a specific topic and a channel can only be created for entities assigned to that same topic. Labels cannot be used to send a message to more than one entity as they are specifically used by policy to allow two entities to talk to each other using that label (if both points have that label assigned to them).

<img src="{{ site.url }}/assets/images/overview-image6.png" class="doc-image" alt="A blue rectangular sign with white text Description automatically generated" />

_Figure 6: Workflow to Send Data on a Channel_
