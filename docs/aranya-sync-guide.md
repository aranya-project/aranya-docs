---
layout: page
title: Aranya Sync
permalink: "/aranya-sync/"
---

# Aranya Sync

## Introduction

In distributed systems, keeping multiple peers synchronized is a fundamental challenge. Different network topologies, update patterns, and reliability requirements demand different synchronization strategies. Aranya provides three complementary sync methods that can be used individually or in combination to efficiently synchronize graph state across peers.

This document explains each sync method, provides guidance on when to use each approach, and highlights common anti-patterns to avoid.

## Sync Methods Overview

### Poll Sync

Poll sync is a request-response synchronization method where one peer queries another for updates.

**How it works:**
- Peer A sends a sample of its graph (command hashes) to Peer B
- Peer B analyzes the sample to determine which commands Peer A likely doesn't have
- Peer B sends those commands back to Peer A
- Peer A continues polling until no new commands are received

**Advantages:**
- Simple and reliable
- Works well for occasional synchronization
- No state management required on the sending peer

**Disadvantages:**
- Overhead from sending graph samples in each request
- Inefficient when updates are infrequent (large messages sent even when nothing has changed)
- Requires active polling even when there are no updates

**Best used for:**
- Occasional synchronization between peers
- Scenarios where update frequency is unknown
- Backup synchronization mechanism

See [Sync](/sync/) for detailed algorithm specifications.

### Push Sync

Push sync is a subscription-based method where peers subscribe to receive updates automatically.

**How it works:**
- Peer A subscribes to Peer B, indicating it wants to receive updates
- Peer B tracks Peer A's last known graph head
- When Peer B receives new commands, it automatically pushes them to subscribed peers
- Subscription includes parameters for duration and maximum bytes

**Advantages:**
- Very efficient when updates come from a single source
- Low latency - subscribers receive updates immediately
- No wasted bandwidth on empty poll responses

**Disadvantages:**
- Inefficient with many subscriptions (each update gets sent to all subscribers)
- In multi-writer scenarios, peers can receive duplicate commands from multiple sources
- Requires subscription state management
- Subscriptions can be lost in unreliable networks

**Best used for:**
- Hub-and-spoke architectures with a single writer
- Hierarchical distribution where updates flow in one direction
- Scenarios where a peer has few upstream sources

See [Open Sync Requests](/open-sync-requests/) for detailed push sync design.

### Hello Sync

Hello sync is a lightweight notification method that alerts peers when updates are available.

**How it works:**
- Peer A subscribes to hello notifications from Peer B
- Peer B sends hello messages containing the current graph head in two ways:
  - When the graph head changes (triggered by updates)
  - Periodically on a schedule (regardless of changes)
- Peer A receives the hello message and checks if it has that head
- If Peer A doesn't have that head, it initiates a sync (typically poll sync) to fetch the updates

**Advantages:**
- Lightweight messages (just the graph head, not actual command data)
- Good for unreliable networks (messages sent regularly, eventually get through)
- Provides awareness without sending duplicate command data
- Can be configured with different notification frequencies

**Disadvantages:**
- Requires an additional round trip (hello notification, then sync request)
- Not appropriate when immediate update delivery is required with minimal latency

**Best used for:**
- Providing awareness of available updates across a network
- Unreliable or intermittent networks
- Reducing poll sync overhead by triggering syncs only when needed
- Networks where bandwidth is expensive but connectivity is reasonably frequent

See [Sync Hello](/sync-hello/) for detailed hello sync implementation.

## Scenarios

### Scenario 1: Central Server Architecture

**Network Topology:**
- One central server that is always online
- Multiple client devices that connect occasionally
- Clients need to sync when they come online

**Update Patterns:**
- Server receives updates from various sources
- Clients need to catch up when they reconnect

**Recommended Strategy:** Hello Sync + Poll Sync

**Rationale:**
- Server sends hello notifications to inform clients of available updates
- Clients use poll sync when they receive hello messages or when they reconnect
- Push sync would be problematic because clients are occasionally offline - pushed updates would be lost when clients aren't connected
- Hello messages sent on a schedule ensure clients eventually receive notifications when they come online

### Scenario 2: Always-Connected Peer Network

**Network Topology:**
- Multiple peers that are all online most of the time
- Mesh or partially connected network
- Roughly equal update frequency across peers

**Update Patterns:**
- Any peer can create updates at any time
- All peers need to stay synchronized

**Recommended Strategy:** Hello Sync + Poll Sync

**Rationale:**
- Hello sync provides lightweight awareness when any peer has updates
- Poll sync is used when hello indicates a peer needs to sync
- Push sync would create too many duplicate updates (each update would be pushed by multiple peers as it propagates)
- Hello notifications are small, so network overhead is minimal even with many peers

### Scenario 3: Hub-and-Spoke with Single Writer

**Network Topology:**
- One writer peer that generates all updates
- Multiple reader peers that consume those updates
- Readers need updates quickly
- Generally reliable network connectivity

**Update Patterns:**
- All updates originate from a single source
- Unidirectional data flow from writer to readers

**Recommended Strategy:** Push Sync

**Rationale:**
- This is the ideal use case for push sync
- Each reader subscribes to the writer
- Writer pushes each update once to all subscribers
- No duplicate commands because there's only one source
- Very efficient and provides low-latency updates
- No coordination needed between readers
- Reliable network ensures updates aren't lost

### Scenario 4: Unreliable Network (IoT/Mobile)

**Network Topology:**
- Devices with intermittent connectivity
- Packet loss is common

**Update Patterns:**
- Updates may occur while devices are disconnected
- Devices need to sync when connectivity is restored

**Recommended Strategy:** Hello Sync + Poll Sync

**Rationale:**
- Hello sync excels on unreliable networks because lightweight messages are sent regularly
- Even if many hello messages are lost, some will eventually get through
- When a hello message is received, the device can trigger a poll sync when the connection is stable
- Push sync would be problematic because subscription state could be lost
- Regular hello messages provide persistent awareness despite network issues

### Scenario 5: Hierarchical Distribution

**Network Topology:**
- Updates flow in one direction through multiple tiers
- Example: Source → Regional servers → Edge devices
- Each tier has limited upstream sources
- Generally reliable network connectivity

**Update Patterns:**
- Updates originate at the top of the hierarchy
- Each tier forwards to the next tier
- Well-defined update flow paths

**Recommended Strategy:** Push Sync along the hierarchy

**Rationale:**
- Each node subscribes to its direct upstream peers via push sync
- Efficient because each node has few upstream sources
- Low latency as updates flow down the hierarchy
- No duplication because the topology prevents it
- Regional servers can also use poll sync as backup for reliability

### Scenario 6: Occasional Synchronization

**Network Topology:**
- Two or a few peers that sync infrequently
- Example: Backup server that syncs once daily, or manual sync operations

**Update Patterns:**
- Synchronization happens on a schedule or on demand
- Updates may batch between sync operations

**Recommended Strategy:** Poll Sync only

**Rationale:**
- Simple and effective for infrequent sync
- No overhead from subscriptions or hello messages when not syncing
- State management is minimal
- When sync is initiated, poll efficiently transfers all accumulated updates

### Scenario 7: Mixed Requirements

**Network Topology:**
- Some peers need immediate updates (critical systems)
- Other peers can tolerate delay (monitoring, analytics)
- Variable network reliability across peers

**Update Patterns:**
- Different update priorities for different peers
- Some peers are always online, others connect intermittently

**Recommended Strategy:** Combination approach

**Rationale:**
- Critical peers use push sync for immediate updates
- Non-critical peers use hello sync for awareness
- All peers can fall back to poll sync as needed
- Different peers use different strategies based on their specific requirements
- Network conditions and priorities can change over time

## Anti-Patterns to Avoid

### 1. Full Mesh Push Subscriptions

**Problem:**
Configuring every peer to subscribe to push updates from every other peer in a multi-writer network.

**Result:**
In an N-peer network, each update gets transmitted N times. For example, with 10 peers where all create updates, a single command will be pushed 10 times as it propagates through the graph. This wastes bandwidth and processing resources, with peers receiving many copies of the same commands.

**Better Approach:**
Use hello sync to provide awareness of updates across the network, and use poll sync when peers need to fetch actual commands. This reduces bandwidth usage significantly while still keeping peers informed.

### 2. High-Frequency Polling with Infrequent Updates

**Problem:**
Polling every few seconds when updates only occur every few hours or less frequently.

**Result:**
Large sync request messages (containing graph samples) are sent constantly, but most return empty responses. This wastes bandwidth and processing resources on both the requesting and responding peers.

**Better Approach:**
Use hello sync to notify peers when updates are actually available, then trigger poll sync only when the hello message indicates new commands exist. This eliminates unnecessary polling while maintaining awareness.

### 3. Hello Sync with Zero Delay and Frequent Updates

**Problem:**
Configuring hello subscriptions with `graph_change_delay: 0` when the graph receives frequent updates (e.g., multiple updates per second).

**Result:**
Subscribers get flooded with hello messages, creating network congestion and overwhelming the receiving peers with notification traffic.

**Better Approach:**
Set an appropriate `graph_change_delay` value to rate-limit hello notifications based on the expected update frequency. For example, if updates happen every second, setting a delay of 1 second batches notifications effectively. The subscriber will receive the latest head without being flooded by every intermediate update.

### 4. Using Only One Sync Type

**Problem:**
Trying to use a single sync method for all scenarios, regardless of network topology, update patterns, or requirements.

**Result:**
Suboptimal performance, wasted bandwidth, poor user experience, or inability to handle certain network conditions effectively.

**Better Approach:**
Evaluate your specific requirements and choose the appropriate sync method(s) for each scenario. Different parts of your network may benefit from different strategies. Be willing to combine sync types or adapt your approach as network conditions and requirements evolve.

### 5. Push Sync on Unreliable Networks

**Problem:**
Using push sync subscriptions in environments with frequent packet loss, connection drops, or intermittent connectivity.

**Result:**
Push messages can be lost when peers are temporarily offline or during packet loss, leading to missed updates and inconsistent graph state. Unlike poll sync where the requester can retry, push sync relies on the receiver being available when the push is sent.

**Better Approach:**
Use hello sync or poll sync for unreliable networks. Hello messages are lightweight and sent regularly, so even if many are lost, some will get through. Poll sync is stateless from the requester's perspective and works well when connectivity is restored.

## Combining Sync Methods

The three sync methods are designed to work together. Here are some effective combination patterns:

### Hello Sync + Poll Sync

This is one of the most common and versatile combinations:
- Hello sync provides lightweight awareness of when updates are available
- Poll sync is triggered only when hello messages indicate new commands
- Eliminates wasted bandwidth from unnecessary polling
- Works well in most network topologies

**Example:** A peer subscribes to hello notifications from all known peers. When a hello message arrives with an unknown head, the peer initiates a poll sync to fetch the new commands.

### Push Sync + Poll Sync Backup

Use push sync as the primary mechanism with poll sync as a fallback:
- Push sync provides low-latency updates during normal operation
- Poll sync catches up any missed updates if push subscription is lost
- Combines efficiency with reliability

**Example:** In a hub-and-spoke architecture, readers subscribe to push updates from the writer. Additionally, readers perform a poll sync operation periodically (e.g., every hour) to ensure they haven't missed anything.

### Adapting Strategies Dynamically

Network conditions and requirements change over time. Consider adapting your sync strategy:
- Start with hello + poll when unsure of update patterns
- Switch to push when a clear hub-and-spoke pattern emerges

## Related Documentation

For detailed technical specifications of each sync method, see:

- **[Sync](/sync/)** - Poll sync algorithm details, including the weave sampling strategy and command window calculations
- **[Open Sync Requests](/open-sync-requests/)** - Push sync design, subscription management, and implementation details
- **[Sync Hello](/sync-hello/)** - Hello sync implementation, message types, and QUIC syncer integration
