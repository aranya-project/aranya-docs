---
layout: page
title: Multi-Daemon Convergence Test
permalink: "/multi-daemon-convergence-test/"
---

# Multi-Daemon Convergence Test Specification

## Overview

This specification defines a test suite for validating Aranya daemon convergence behavior with a large number of nodes on a single device. The primary goal is to verify that all nodes in a network eventually reach a consistent state after commands are issued and synchronized across a defined network topology.

This specification is designed for use with [duvet](https://github.com/awslabs/duvet) for requirements traceability.

## Motivation

Existing Aranya integration tests typically use 5 nodes (`DevicesCtx` with owner, admin, operator, membera, memberb). While sufficient for testing role-based access control and basic synchronization, these tests do not exercise:

- Convergence behavior at scale (100+ nodes)
- Complex network topologies beyond fully-connected meshes
- Convergence time tracking and verification
- Resource utilization under load

This test suite addresses these gaps by providing a framework for large-scale convergence testing with configurable topologies.

## Definitions

### Terms

- **Node**: A single Aranya daemon instance with its associated client
- **Convergence**: The state where all nodes in the network have received and processed the same set of commands
- **Ring Topology**: A network topology where each node connects to exactly two neighbors, forming a circular structure
- **Bidirectional Ring**: A ring topology where sync can occur in both directions (clockwise and counter-clockwise)
- **Convergence Time**: The elapsed time from when a command is issued until all nodes have received it
- **Sync Round**: A single synchronization attempt between two connected peers

### Graph State

Each node maintains an Aranya command graph. Convergence is achieved when all nodes have identical graph heads (accounting for merge commands created during synchronization).

## Test Architecture

### Node Context

The test uses a scalable node context that extends the patterns from `DeviceCtx` in the existing test infrastructure.

```rust
struct NodeCtx {
    /// Unique node identifier (0 to N-1)
    index: usize,
    /// Aranya client connection
    client: Client,
    /// Device's public key bundle
    pk: KeyBundle,
    /// Device ID
    id: DeviceId,
    /// Daemon handle
    daemon: DaemonHandle,
    /// Sync peers (indices of connected nodes)
    peers: Vec<usize>,
}
```

### Ring Context

The ring context manages all nodes in the ring topology.

```rust
struct RingCtx {
    /// All nodes in the ring
    nodes: Vec<NodeCtx>,
    /// Team ID for the test
    team_id: TeamId,
    /// Convergence tracker
    tracker: ConvergenceTracker,
}
```

### Convergence Tracker

Tracks convergence state across all nodes.

```rust
struct ConvergenceTracker {
    /// Expected graph state (set of command addresses)
    expected_commands: HashSet<Address>,
    /// Per-node convergence status
    node_status: Vec<ConvergenceStatus>,
    /// Timestamps for convergence measurements
    timestamps: ConvergenceTimestamps,
}

struct ConvergenceStatus {
    /// Commands received by this node
    received_commands: HashSet<Address>,
    /// Whether this node has converged
    converged: bool,
    /// Time when convergence was achieved
    convergence_time: Option<Instant>,
}
```

## Requirements

### Test Configuration Requirements

#### CONF-001

The test MUST support configuring the number of nodes in the ring.

#### CONF-002

The default node count MUST be 100 nodes.

#### CONF-003

The test MUST support a minimum of 3 nodes (the minimum for a valid ring).

#### CONF-004

The test MUST support configuring the sync interval between peers.

#### CONF-005

The default sync interval MUST be 100 milliseconds.

#### CONF-006

The test MUST support configuring a maximum test duration timeout.

#### CONF-007

The default maximum test duration MUST be 300 seconds (5 minutes).

### Topology Requirements

#### TOPO-001

Each node MUST connect to exactly two other nodes: its clockwise neighbor and its counter-clockwise neighbor.

#### TOPO-002

For node at index `i` in a ring of size `N`:
- The clockwise neighbor MUST be at index `(i + 1) % N`
- The counter-clockwise neighbor MUST be at index `(i + N - 1) % N`

#### TOPO-003

Sync peers MUST be configured bidirectionally, meaning if node A syncs with node B, node B MUST also sync with node A.

#### TOPO-004

The topology MUST form a single connected ring with no partitions.

#### TOPO-005

No node MUST have more than 2 sync peers in the ring topology.

### Node Initialization Requirements

#### INIT-001

Each node MUST be initialized with a unique daemon instance.

#### INIT-002

Each node MUST generate its own cryptographic key bundle.

#### INIT-003

Each node MUST have a unique device ID derived from its key bundle.

#### INIT-004

Nodes MUST be initialized in parallel where possible to reduce setup time.

#### INIT-005

Node initialization MUST complete within a configurable timeout (default: 60 seconds per node batch).

#### INIT-006

The test MUST verify that all nodes have successfully started before proceeding.

### Team Setup Requirements

#### TEAM-001

A single team MUST be created by node 0 (the designated owner).

#### TEAM-002

All nodes MUST be added to the team before convergence testing begins.

#### TEAM-003

Node 0 MUST have the owner role.

#### TEAM-004

All other nodes MUST be added as members with appropriate roles.

#### TEAM-005

Team configuration MUST be synchronized to all nodes before the convergence test phase.

#### TEAM-006

The test MUST verify that all nodes have received the team configuration.

### Sync Peer Configuration Requirements

#### SYNC-001

Each node MUST add its two ring neighbors as sync peers.

#### SYNC-002

Sync peer configuration MUST specify the sync interval.

#### SYNC-003

The sync peer address MUST be obtained from the neighbor node's local address.

#### SYNC-004

Sync peer configuration MUST complete before the convergence test phase.

### Convergence Test Requirements

#### CONV-001

The test MUST issue a command from a designated source node.

#### CONV-002

The default source node for command issuance MUST be node 0.

#### CONV-003

The test MUST track when each node receives the issued command.

#### CONV-004

Convergence MUST be defined as all nodes having received all expected commands.

#### CONV-005

The test MUST measure the total convergence time from command issuance to full convergence.

#### CONV-006

The test MUST fail if convergence is not achieved within the maximum test duration.

#### CONV-007

The test MUST report which nodes failed to converge if the timeout is reached.

### Convergence Verification Requirements

#### VERIFY-001

Each node's graph state MUST be queryable to determine received commands.

#### VERIFY-002

The test MUST poll nodes periodically to check convergence status.

#### VERIFY-003

The polling interval MUST be configurable (default: 250 milliseconds).

#### VERIFY-004

A node MUST be considered converged when it has received all expected commands.

#### VERIFY-005

The test MUST verify that merged graphs are consistent (no conflicting commands).

### Propagation Requirements

#### PROP-001

A command issued at node 0 MUST propagate through the ring in both directions.

#### PROP-002

The maximum propagation distance in a bidirectional ring of N nodes MUST be ceil(N/2) hops.

#### PROP-003

For 100 nodes, the theoretical minimum propagation distance MUST be 50 hops.

#### PROP-004

The test MUST verify that propagation occurs through both ring directions.

### Performance Measurement Requirements

#### PERF-001

The test MUST record the timestamp when a command is issued.

#### PERF-002

The test MUST record the timestamp when each node achieves convergence.

#### PERF-003

The test MUST calculate and report the following metrics:
- Minimum convergence time (fastest node)
- Maximum convergence time (slowest node)
- Mean convergence time
- Median convergence time
- Standard deviation of convergence times

#### PERF-004

The test MUST report the total number of sync operations performed.

#### PERF-005

The test SHOULD report memory usage per node if available.

### Error Handling Requirements

#### ERR-001

The test MUST handle node initialization failures gracefully.

#### ERR-002

If a node fails to initialize, the test MUST report the failure and continue with remaining nodes if the ring can still be formed.

#### ERR-003

The test MUST handle sync failures between nodes.

#### ERR-004

Transient sync failures MUST NOT cause immediate test failure; the sync will be retried on the next interval.

#### ERR-005

The test MUST log all errors with sufficient context for debugging.

### Cleanup Requirements

#### CLEAN-001

All daemon processes MUST be terminated when the test completes.

#### CLEAN-002

All temporary directories MUST be removed when the test completes.

#### CLEAN-003

Cleanup MUST occur even if the test fails or times out.

#### CLEAN-004

The test MUST use RAII patterns to ensure cleanup on panic.

## Test Implementation

### Test Structure

```rust
#[test(tokio::test(flavor = "multi_thread"))]
async fn test_ring_convergence_100_nodes() -> Result<()> {
    //= multi-daemon-convergence-test.md#CONF-002
    //# The default node count MUST be 100 nodes.
    let config = RingTestConfig::default();
    assert_eq!(config.node_count, 100);

    //= multi-daemon-convergence-test.md#INIT-001
    //# Each node MUST be initialized with a unique daemon instance.
    let mut ring = RingCtx::new(config).await?;

    //= multi-daemon-convergence-test.md#TEAM-001
    //# A single team MUST be created by node 0 (the designated owner).
    let team_id = ring.create_team().await?;

    //= multi-daemon-convergence-test.md#TEAM-002
    //# All nodes MUST be added to the team before convergence testing begins.
    ring.add_all_nodes_to_team(team_id).await?;

    //= multi-daemon-convergence-test.md#SYNC-001
    //# Each node MUST add its two ring neighbors as sync peers.
    ring.configure_ring_topology(team_id).await?;

    //= multi-daemon-convergence-test.md#CONV-001
    //# The test MUST issue a command from a designated source node.
    ring.issue_test_command(0, team_id).await?;

    //= multi-daemon-convergence-test.md#CONV-004
    //# Convergence MUST be defined as all nodes having received all expected commands.
    ring.wait_for_convergence().await?;

    //= multi-daemon-convergence-test.md#PERF-003
    //# The test MUST calculate and report metrics.
    ring.report_metrics();

    Ok(())
}
```

### Ring Configuration

```rust
struct RingTestConfig {
    /// Number of nodes in the ring
    node_count: usize,
    /// Sync interval between peers
    sync_interval: Duration,
    /// Maximum test duration
    max_duration: Duration,
    /// Convergence polling interval
    poll_interval: Duration,
    /// Node initialization timeout
    init_timeout: Duration,
}

impl Default for RingTestConfig {
    fn default() -> Self {
        Self {
            //= multi-daemon-convergence-test.md#CONF-002
            //# The default node count MUST be 100 nodes.
            node_count: 100,

            //= multi-daemon-convergence-test.md#CONF-005
            //# The default sync interval MUST be 100 milliseconds.
            sync_interval: Duration::from_millis(100),

            //= multi-daemon-convergence-test.md#CONF-007
            //# The default maximum test duration MUST be 300 seconds (5 minutes).
            max_duration: Duration::from_secs(300),

            //= multi-daemon-convergence-test.md#VERIFY-003
            //# The polling interval MUST be configurable (default: 250 milliseconds).
            poll_interval: Duration::from_millis(250),

            //= multi-daemon-convergence-test.md#INIT-005
            //# Node initialization MUST complete within a configurable timeout.
            init_timeout: Duration::from_secs(60),
        }
    }
}
```

### Topology Configuration

```rust
impl RingCtx {
    //= multi-daemon-convergence-test.md#TOPO-001
    //# Each node MUST connect to exactly two other nodes.
    async fn configure_ring_topology(&mut self, team_id: TeamId) -> Result<()> {
        let n = self.nodes.len();

        for i in 0..n {
            //= multi-daemon-convergence-test.md#TOPO-002
            //# For node at index `i` in a ring of size `N`:
            //# - The clockwise neighbor MUST be at index `(i + 1) % N`
            //# - The counter-clockwise neighbor MUST be at index `(i + N - 1) % N`
            let clockwise = (i + 1) % n;
            let counter_clockwise = (i + n - 1) % n;

            let cw_addr = self.nodes[clockwise].aranya_local_addr().await?;
            let ccw_addr = self.nodes[counter_clockwise].aranya_local_addr().await?;

            //= multi-daemon-convergence-test.md#SYNC-002
            //# Sync peer configuration MUST specify the sync interval.
            let config = SyncPeerConfig::builder()
                .interval(self.config.sync_interval)
                .build()?;

            self.nodes[i].client
                .team(team_id)
                .add_sync_peer(cw_addr, config.clone())
                .await?;

            self.nodes[i].client
                .team(team_id)
                .add_sync_peer(ccw_addr, config)
                .await?;
        }

        Ok(())
    }
}
```

### Convergence Tracking

```rust
impl RingCtx {
    //= multi-daemon-convergence-test.md#CONV-003
    //# The test MUST track when each node receives the issued command.
    async fn wait_for_convergence(&mut self) -> Result<()> {
        let start = Instant::now();

        loop {
            //= multi-daemon-convergence-test.md#CONV-006
            //# The test MUST fail if convergence is not achieved within the maximum test duration.
            if start.elapsed() > self.config.max_duration {
                //= multi-daemon-convergence-test.md#CONV-007
                //# The test MUST report which nodes failed to converge.
                let unconverged: Vec<_> = self.tracker.node_status
                    .iter()
                    .enumerate()
                    .filter(|(_, s)| !s.converged)
                    .map(|(i, _)| i)
                    .collect();

                bail!("Convergence timeout: nodes {:?} did not converge", unconverged);
            }

            //= multi-daemon-convergence-test.md#VERIFY-002
            //# The test MUST poll nodes periodically to check convergence status.
            self.check_all_nodes_convergence().await?;

            //= multi-daemon-convergence-test.md#VERIFY-004
            //# A node MUST be considered converged when it has received all expected commands.
            if self.tracker.all_converged() {
                break;
            }

            tokio::time::sleep(self.config.poll_interval).await;
        }

        //= multi-daemon-convergence-test.md#PERF-002
        //# The test MUST record the timestamp when each node achieves convergence.
        self.tracker.record_final_convergence_time();

        Ok(())
    }

    async fn check_all_nodes_convergence(&mut self) -> Result<()> {
        for (i, node) in self.nodes.iter().enumerate() {
            if self.tracker.node_status[i].converged {
                continue;
            }

            //= multi-daemon-convergence-test.md#VERIFY-001
            //# Each node's graph state MUST be queryable to determine received commands.
            let commands = node.client
                .team(self.team_id)
                .query_commands()
                .await?;

            let received: HashSet<_> = commands.iter()
                .map(|c| c.address)
                .collect();

            self.tracker.node_status[i].received_commands = received.clone();

            if received.is_superset(&self.tracker.expected_commands) {
                self.tracker.node_status[i].converged = true;
                self.tracker.node_status[i].convergence_time = Some(Instant::now());
            }
        }

        Ok(())
    }
}
```

### Metrics Reporting

```rust
impl RingCtx {
    //= multi-daemon-convergence-test.md#PERF-003
    //# The test MUST calculate and report the following metrics.
    fn report_metrics(&self) {
        let times: Vec<_> = self.tracker.node_status
            .iter()
            .filter_map(|s| s.convergence_time)
            .map(|t| t.duration_since(self.tracker.timestamps.command_issued))
            .collect();

        if times.is_empty() {
            println!("No convergence data available");
            return;
        }

        let min = times.iter().min().unwrap();
        let max = times.iter().max().unwrap();
        let sum: Duration = times.iter().sum();
        let mean = sum / times.len() as u32;

        let mut sorted = times.clone();
        sorted.sort();
        let median = sorted[sorted.len() / 2];

        // Standard deviation
        let mean_nanos = mean.as_nanos() as f64;
        let variance: f64 = times.iter()
            .map(|t| {
                let diff = t.as_nanos() as f64 - mean_nanos;
                diff * diff
            })
            .sum::<f64>() / times.len() as f64;
        let std_dev = Duration::from_nanos(variance.sqrt() as u64);

        println!("=== Convergence Metrics ===");
        println!("Nodes: {}", self.nodes.len());
        println!("Min convergence time: {:?}", min);
        println!("Max convergence time: {:?}", max);
        println!("Mean convergence time: {:?}", mean);
        println!("Median convergence time: {:?}", median);
        println!("Std deviation: {:?}", std_dev);

        //= multi-daemon-convergence-test.md#PERF-004
        //# The test MUST report the total number of sync operations performed.
        println!("Total sync operations: {}", self.tracker.sync_count);
    }
}
```

## Expected Behavior

### Propagation Pattern

In a bidirectional ring of 100 nodes:

1. Node 0 issues a command at time T0
2. The command propagates in both directions:
   - Clockwise: 0 → 1 → 2 → ... → 49 → 50
   - Counter-clockwise: 0 → 99 → 98 → ... → 51 → 50
3. Node 50 (the antipode) receives the command last from both directions
4. Merge commands are created when paths converge

### Theoretical Convergence Time

For a ring of N nodes with sync interval S:
- Minimum hops to reach the farthest node: ceil(N/2)
- Theoretical minimum convergence time: ceil(N/2) * S
- For 100 nodes with 100ms sync interval: 50 * 100ms = 5 seconds

Actual convergence time will be higher due to:
- Sync timing variability
- Command processing time
- Merge command creation and propagation

### Success Criteria

The test passes when:
1. All 100 nodes successfully initialize
2. Team configuration propagates to all nodes
3. Ring topology is correctly configured
4. Test command reaches all nodes
5. Convergence is achieved within the timeout
6. No errors are reported during synchronization

## Future Extensions

### Planned Enhancements

1. **Topology Variations**
   - Star topology
   - Mesh topology
   - Random graph topology
   - Hierarchical topology

2. **Failure Injection**
   - Node failure simulation
   - Network partition simulation
   - Message loss simulation

3. **Scalability Testing**
   - 500 node tests
   - 1000 node tests
   - Resource utilization profiling

4. **Concurrent Commands**
   - Multiple simultaneous command sources
   - Conflict resolution verification
   - Merge behavior validation

## Appendix

### Duvet Integration

This specification is designed for use with duvet. Requirements are marked with unique identifiers (e.g., `CONF-001`, `TOPO-002`) that can be referenced in implementation code using duvet annotations:

```rust
//= https://github.com/aranya-project/aranya-docs/docs/multi-daemon-convergence-test.md#CONF-002
//# The default node count MUST be 100 nodes.
const DEFAULT_NODE_COUNT: usize = 100;
```

To generate a requirements coverage report:

```bash
duvet report --spec docs/multi-daemon-convergence-test.md --source crates/aranya-client/tests/
```

### Related Documents

- [Sync Specification](/sync/)
- [Graph Traversal Optimization](/graph-traversal/)
- [Aranya Architecture](/aranya-architecture/)
