# Network

This document contains networks or situations that we want to be able to handle with Aranya syncing and data transfer. 


## Asymmetric link networks

Some networks we wish to operate on will contain asymmetric links. For example:

- Highly asymmetric speeds
    - Some links may have different upload and download speeds. This presents a challenge, as some parts of our protocol involve exchanging messages both ways. To handle this, we would need to minimize bandwidth in the slow direction.
- One-way connection initialization
    - Some links may not allow connections to be initiated from one direction. In this case, we need to initiate and reuse connections wherever we can to establish communication.
    - ex: A can request a sync from B and get a reply, but B cannot initiate a connection to A
- One-way links
    - Some links may only allow data to flow one way at all. In this case, we need to handle blind transmission of data.


## Abnormal network requirements

- Small MTUs
    - Networks that use IP-like communication may have non-standard MTUs set. We should be able to handle arbitrary MTUs above some lower bound $N$
    - ex: some networks could have MTUs around 100 bytes.
- High/Unstable latency
    - Our transport protocols need to be able to handle high latencey and fluctuating latency.
    - We could handle this by making syncing a fully async process, from sending a request to processing a response.
    - Our transport protocols should behave nicely under high/changing latency, taking congestion control into account.
- Sending and receiving a reply from a different address
    - Some networks may not allow the same address to send and receive data. We need to be able to handle syncs with peers where the place we send a sync request is different from where the response comes from.
    - ex: send to 10.10.10.1, get reply from 10.10.10.6

## Other Protocols

- Mixed protocols
    - We may need to send and receive data on different protocols.
    - Some peers may only accept data from one protocol, but use another to send data.
        - ex: a peer might only be able to receive with TCP, while responding in UDP.
    - Some peers will support different protocols, so we need to be able to sync with different protocols for different users.
        - ex: A only speaks TCP, B only speaks UDP, etc.
- File syncing
    - Generally useful across many different systems that already use files as messages.


## Actions

Rearchitect the syncer to better handle these cases. Moore proposed a three layer syncer:

- Key Management layer
    - The layer that handles authentication and authorization. Uses keys from aranya.
- TXP layer
    - This is where we would manually chunk the traffic.
- Network layer
    - This layer would interact directly with the network/communication protocol.



IP, packet level txp, file based txp (IPoAC)


- We need to chunk our own traffic. This allows us to reach arbitrary MTUs
- Syncing should reuse the connection and maybe give the option for the peer to request a syncback