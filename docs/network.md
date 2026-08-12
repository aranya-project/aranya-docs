# Network and Communication

This document contains networks or situations that we want to be able to handle with
Aranya syncing and data transfer. The goal of this document is to act as the starting 
point for a new specification for a unified networking/communication approach. The 
goal of this new approach is to improve the flxibility and security of our syncing and 
data plane traffic. The approach takes into account non-standard networks and 
communication schemes so that Aranya can function in these environments.

The first section contain descriptions of networks we may encounter.

## Network conditions

We will encounter networks with abnormal setups, missing features, or just non-standard
configurations. This sections lists some of the conditions we might encounter.

### Asymmetric link networks

Some networks we wish to operate on will contain asymmetric links. For example:

- Highly asymmetric speeds
    - Some links may have different upload and download speeds. This presents a challenge, 
    as some parts of our protocol involve exchanging messages both ways. To handle this, 
    we would need to minimize bandwidth in the slow direction.
- One-way connection initialization
    - Some links may not allow connections to be initiated from one direction. In this case, 
    we need to initiate and reuse connections wherever we can to establish communication.
    - ex: Alice can request a sync from Bob and get a reply, but Bob cannot initiate
    a connection to Alice
- One-way links
    - Some links may only allow data to flow one way at all. In this case, we 
    need to handle blind transmission of data.


### Abnormal network requirements

- Small MTUs
    - Networks that use IP-like communication may have non-standard MTUs set. We should be able to handle 
    arbitrary MTUs above some lower bound $N$.
    - ex: some networks could have MTUs less than 100 bytes.
    - If we encounter extremely small MTUs, we may need to take steps to reduce the overhead of our protocols.
- High/Unstable latency
    - Our transport protocols need to be able to handle high latency and fluctuating latency.
    - We could handle this by making syncing a fully async process, from sending a request to processing a response.
    - Our transport protocols should behave nicely under high/changing latency, taking congestion control into account.
- Sending and receiving a reply from a different address
    - Some networks may not allow the same address to send and receive data. We need to 
    be able to handle syncs with peers where the place we send a sync request is different 
    from where the response comes from.
    - ex: send to 10.10.10.1, get reply from 10.10.10.6
- Very Lossy Environments
    - We will need to operate in environments with high levels of loss. Our protocols 
    should be able to handle networks with high loss without unnecessarily degrading performance.


## Other Protocols

- Mixed protocols
    - We may need to send and receive data on different protocols.
    - Some peers may only accept data from one protocol, but use another to send data.
        - ex: a peer might only be able to receive with TCP, while responding in UDP.
    - Some peers will support different protocols, so we need to be able to sync with 
    different protocols for different users.
        - ex: A only speaks TCP, B only speaks UDP, etc.
- File syncing
    - Generally useful across many different systems that already use files as messages.
    - We should be able to write syncs or data to files, and have an easy way to receive data from files.
- Packet level
    - We may need to support raw non-IP packet level transports. (needs more detail)

## Actions

Rearchitect the syncer to better handle these cases.


- **Sync Layer**: this layer handles the actual logic behind syncing sets of commands from
    one device to another. This consists of computing a set difference and then sending the 
    missing commands. Operational considerations for this layer. 
    - How do we limit latency. 
    - How do we limit total bandwidth used. 
    - How do we limit memory used.  
    - How do we deal with partial syncs. (Are there more? IO bounds? CPU bounds?)
    - How do we control access to private data? See Access Control.
- **Transport**: this layer handles actually moving the messages. It is implemented as
    an async message passing layer. Operational considerations for this layer:
    - How do we deal will loss on the link? 
    - How do we handle end to end congestion. 
    - How do we handle link local channel congestion. 
    - How do we handle cases where the network MTU is smaller then sync message size?
    The solution for each of these points depends on the goal of the implementation of
    this layer.

We need chunking in between these layers. We could implement this as a middle layer, or
create a reusable utility that transports can include to chunk or reassemble the data.
I think its likely the chunking would need to be coupled with the transport.

A daemon or instance should be able to support multiple syncer stacks once, or the stack 
may need to support an archtecture where each layer may have multiple implementations above 
or below it. This is to support multi-protocol syncing and cases where a device may participate 
on multiple networks with different configurations. This brings in additional considerations:

- How do we define these layers? 
- How do we configure these layers when starting the daemon without overly burdensome configuration files?
- Should we plan to add/remove these layers at runtime (a bit more complex)?

The transport layer should be easily swapped out without having to change the layers above it (ex: starting
a listen server). This entails designing a lifecycle that is general enough to support a wide range of protocols.

**Access controls**: In some cases the contents of the graph are sensitive, in these cases how do
we ensure that only authorized parties gain access to the graph data. Operational considerations: 

- What is the root of trust? 
- How is access revoked? 
- How is data protected in transit?
- What data is protected? 
- How are users bootstrapped into the access control?
- Do we add this on as another layer, or make it a core part of the sync layer?

**Peer discovery**: One must know of other peers to sync with them how do we discover and configure 
sync peers? Operational considerations: 

- How is this updated?
- What is the latency for updates?
- How much of the network does this consume?
- How does access control affect peer discovery?
- Is there additional information we want to include in peer discovery? Public Keys? Protocols (multicast?)?
- What is the trust model for peer discovery?
    





