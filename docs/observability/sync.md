---
layout: page
title: Sync Observability
permalink: "/observability/sync"
---

# Sync Observability

How to debug and monitor synchronization operations in Aranya.

## Overview

Sync issues are the most common in deployed Aranya systems. This guide covers:
- What to log during sync operations
- How to detect sync stalls and timeouts
- PSK (pre-shared key) mismatches/ authentication failures.
- Network quality metrics
- Performance timing breakdown

## What to Log

### Essential Sync Fields

Log these fields at INFO for each sync:

```rust
info!(
    duration_ms = start.elapsed().as_millis(),
    peer_device_id = %peer.device_id,
    peer_addr = %peer.addr,
    cmd_count_received,
    effects_count,
    bytes_transferred,
    first_cmd_hash = ?first_cmd.map(|c| c.hash()),
    first_cmd_max_cts = ?first_cmd.map(|c| c.max_cts()),
    "Sync completed successfully"
);
```

**Required fields:**
- `duration_ms` - Total sync duration (request + response + processing)
- `peer_device_id` - Device ID of sync peer
- `peer_addr` - Network address of peer
- `cmd_count_received` - Number of commands received
- `effects_count` - Number of effects generated
- `bytes_transferred` - Total bytes sent/received
- `first_cmd_hash` - Hash of first command in sync (for stall detection)
- `first_cmd_max_cts` - Max CTS of first command (for stall detection)

**Optional but recommended:**
- `network_stats.rtt_ms` - Round-trip time
- `network_stats.bandwidth_mbps` - Measured bandwidth
- `local_head` - Local graph head before sync
- `peer_head` - Peer's graph head

### Sync Failure Logging

Log failures at ERROR level with full context:

```rust
error!(
    error = %err,
    peer_device_id = %peer.device_id,
    peer_addr = %peer.addr,
    duration_ms = start.elapsed().as_millis(),
    last_successful_sync = ?peer.last_successful_sync,
    retry_count = peer.retry_count,
    ?network_stats,
    "Sync failed with peer"
);
```

### Sync Timeout Logging

Timeouts are common and deserve special handling:

```rust
error!(
    peer_device_id = %peer.device_id,
    peer_addr = %peer.addr,
    timeout_ms = sync_timeout.as_millis(),
    last_successful_sync = ?peer.last_successful_sync,
    retry_count = peer.retry_count,
    network_rtt_ms = ?peer.last_rtt,
    "Sync timeout - exceeded maximum duration"
);
```

### PSK Authentication Failures

PSK (pre-shared key) mismatches occur during QUIC connection establishment when peers attempt to sync:

```rust
error!(
    peer_device_id = %peer.device_id,
    peer_addr = %peer.addr,
    error = "PSK authentication failed",
    psk_id = %psk_id,
    last_successful_sync = ?peer.last_successful_sync,
    "QUIC connection failed: PSK mismatch with peer"
);
```

**Common causes:**
- Peer devices out of sync on label keys
- Policy changes affecting label permissions
- Device removed from label but still attempting to connect
- Key rotation in progress

**Debug steps:**
1. Check both devices have the same label configuration
2. Verify both devices successfully synced recent label updates
3. Check policy permits both devices to use the label
4. Verify AQC channel keys are current
5. Check for clock skew (may affect key validity periods)

**When to log:**
- ERROR: Initial PSK failure
- WARN: Repeated PSK failures (potential configuration issue)
- INFO: PSK failure resolved after retry

## Stall Detection

### What is a Sync Stall?

A sync stall occurs when the same first command is repeatedly sent while new commands are expected but not delivered.

Not a stall: Repeating the first command when the graph is idle (no new commands).  
Is a stall: Repeating the first command when the local graph has advanced or the peer advertised newer state.

### Stall Detection Logic

Track per-peer state:

```rust
struct SyncPeerState {
    device_id: DeviceId,
    last_first_cmd_hash: Option<Hash>,
    last_first_cmd_max_cts: Option<u64>,
    last_sent_cts: u64,           // Our head CTS when we last synced
    last_peer_head_cts: u64,      // Peer's head CTS they advertised
    stall_count: u32,
}
```

After each sync:

```rust
// Determine if we expect new commands
let should_have_new = 
    local_head_cts > peer_state.last_sent_cts ||           // Local advanced
    peer_head_cts > peer_state.last_peer_head_cts ||       // Peer advertised new
    elapsed_since_last_sync > multiple_sync_windows;        // Time passed with activity

// Check for stall
if first_cmd_hash == peer_state.last_first_cmd_hash && should_have_new {
    peer_state.stall_count += 1;
    if peer_state.stall_count >= 3 {
        warn!(
            peer_device_id = %peer.device_id,
            stall_count = peer_state.stall_count,
            cmd_hash = %first_cmd_hash,
            cmd_max_cts = first_cmd_max_cts,
            local_head_cts,
            peer_head_cts,
            "Sync stalled: expected new commands but first command repeated"
        );
    }
} else {
    peer_state.stall_count = 0;  // Reset on progress
}

// Update tracking
peer_state.last_first_cmd_hash = first_cmd_hash;
peer_state.last_first_cmd_max_cts = first_cmd_max_cts;
peer_state.last_sent_cts = local_head_cts;
peer_state.last_peer_head_cts = peer_head_cts;
```

### Stall Detection Threshold

- Threshold: 3 consecutive identical first commands (configurable)
- Action: Log WARNING with stall details
- Reset: Reset to 0 when the first command changes

## Network Quality Metrics

### RTT (Round-Trip Time)

Measure network latency:

```rust
// Option 1: Application-level ping
async fn measure_rtt(peer_addr: &SocketAddr) -> Result<Duration> {
    let start = Instant::now();
    // Send ping, wait for pong
    Ok(start.elapsed())
}

// Option 2: Extract from QUIC connection (s2n-quic)
let rtt = connection.rtt().map(|d| d.as_millis());

info!(
    peer_addr = %peer_addr,
    rtt_ms = rtt,
    "Network RTT measured"
);
```

### Bandwidth

Calculate from sync duration and bytes transferred:

```rust
let bytes_sent = /* track during sync */;
let duration = start.elapsed();
let bandwidth_mbps = (bytes_sent * 8) as f64 
                   / duration.as_secs_f64() 
                   / 1_000_000.0;

info!(
    peer_addr = %peer_addr,
    bytes_transferred = bytes_sent,
    duration_ms = duration.as_millis(),
    bandwidth_mbps = %bandwidth_mbps,
    "Sync bandwidth"
);
```

### Packet Loss (QUIC)

If using QUIC for sync:

```rust
// Extract from quinn or s2n-quic connection stats
let stats = connection.stats();
let packet_loss_percent = (stats.lost_packets as f64 
                         / stats.sent_packets as f64) * 100.0;

info!(
    peer_addr = %peer_addr,
    packet_loss_percent = %packet_loss_percent,
    "Network packet loss"
);
```

## Performance Timing Breakdown

Track timing for individual sync phases: request, command, commits.

When to use:
- INFO level: Total sync duration only
- DEBUG level: Phase breakdown (network, add_commands, commit)
- TRACE level: Individual command processing (avoid in production)

## JSON Log Examples

### Successful Sync

```json
{
  "timestamp": "2026-01-28T10:15:23.456789Z",
  "level": "INFO",
  "target": "aranya_daemon::sync",
  "fields": {
    "message": "Sync completed successfully",
    "peer": "192.168.1.100:5000",
    "graph": "team_abc123",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "peer_addr": "192.168.1.100:5000",
    "duration_ms": 123,
    "cmd_count_received": 5,
    "effects_count": 3,
    "bytes_transferred": 2048,
    "first_cmd_hash": "0x1234567890abcdef",
    "first_cmd_max_cts": 42,
    "network_stats": {
      "rtt_ms": 45.2,
      "bandwidth_mbps": 100.0
    }
  }
}
```

### Sync Timeout

```json
{
  "timestamp": "2026-01-28T10:20:45.123456Z",
  "level": "ERROR",
  "target": "aranya_daemon::sync",
  "fields": {
    "message": "Sync timeout - exceeded maximum duration",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "peer_addr": "192.168.1.100:5000",
    "timeout_ms": 30000,
    "last_successful_sync": "2026-01-28T10:15:23.456789Z",
    "retry_count": 3,
    "network_rtt_ms": 450
  }
}
```

### Sync Stall Detected

```json
{
  "timestamp": "2026-01-28T10:25:30.789012Z",
  "level": "WARN",
  "target": "aranya_daemon::sync",
  "fields": {
    "message": "Sync stalled: expected new commands but first command repeated",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "stall_count": 3,
    "cmd_hash": "0x1234567890abcdef",
    "cmd_max_cts": 42,
    "local_head_cts": 50,
    "peer_head_cts": 45
  }
}
```

## Implementation Checklist

- [ ] Add `first_cmd_hash` and `first_cmd_max_cts` to sync INFO logs
- [ ] Implement per-peer stall detection with `should_have_new` logic
- [ ] Log stall WARNING after 3 consecutive identical first commands
- [ ] Add `duration_ms` to all sync operations
- [ ] Add `bytes_transferred` tracking
- [ ] Implement RTT measurement (application-level or from QUIC)
- [ ] Calculate and log `bandwidth_mbps`
- [ ] Add timeout context (`last_successful_sync`, `retry_count`, `network_rtt_ms`)