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

### Sync Completion (INFO level)

Log these fields for successful syncs:
- `duration_ms`
- `peer_device_id`
- `peer_addr`
- `cmd_count_received`
- `effects_count`
- `bytes_transferred`
- `first_cmd_hash`
- `first_cmd_max_cts`
- Optional: `network_stats.rtt_ms`, `network_stats.bandwidth_mbps`
- Optional: `local_head`, `peer_head`

### Sync Failures (ERROR level)

Log failures with:
- `error`
- `peer_device_id`
- `peer_addr`
- `duration_ms`
- `last_successful_sync`
- `retry_count`
- Optional: `network_stats`

### Sync Timeouts (ERROR level)

Log timeouts with:
- `peer_device_id`
- `peer_addr`
- `timeout_ms`
- `last_successful_sync`
- `retry_count`
- `network_rtt_ms`

### PSK Authentication Failures (ERROR level)
TODO: Will need updated when mtls lands.

Log PSK mismatches during QUIC connection establishment with:
- `peer_device_id`
- `peer_addr`
- `psk_id`
- `last_successful_sync`

## Stall Detection

### What is a Sync Stall?

A sync stall occurs when the same first command is repeatedly sent while new commands are expected but not delivered.

Not a stall: Repeating the first command when the graph is idle (no new commands).  
Is a stall: Repeating the first command when the local graph has advanced or the peer advertised newer state.

Sync being stalled is from the local node perspective on the sync response, it is detecting that the peer is stalled when it just sends repeated first commands when the local node is expecting new data.

### Stall Detection (WARN level)

Log stalls with:
- `peer_device_id`
- `stall_count`
- `cmd_hash`
- `cmd_max_cts`
- `local_head_cts`
- `peer_head_cts`

Threshold: 3 consecutive identical first commands (configurable). Reset when the first command changes.

## Network Quality Metrics

Note: These metrics are on a per-transport basis; some are not applicable to all transports.

Recommended fields:
- `network_stats.rtt_ms`
- `network_stats.bandwidth_mbps`
- `network_stats.packet_loss_percent` (QUIC only)

## Performance Timing Breakdown

Use `duration_ms` for overall timing, and optionally add per-phase timings at DEBUG level.

### Phase Breakdown (DEBUG level)

Log phase timings with:
- `phase` (network, add_commands, commit)
- `duration_ms`

### Per-Command Processing (TRACE level)

Log per-command timings with:
- `command_id`
- `duration_ms`

## Output Format

The JSON format is configured via the tracing subscriber. See [Logging Configuration](logging.md) for setup details.

Example log entry for successful sync:
```json
{
  "timestamp": "2026-02-03T16:35:25.128361Z",
  "level": "INFO",
  "target": "aranya_daemon::sync::manager",
  "fields": {
    "event_type": "sync_complete",
    "message": "Sync completed successfully",
    "peer_device_id": "127.0.0.1:51047",
    "peer_graph_id": "3rK8CzrjzEyP3bL9kjkEj28bCCJ2opuCAidtzKu6bBM2",
    "duration_ms": 0,
    "cmd_count_received": 0,
    "effects_count": 0
  },
  "span": {
    "graph": "3rK8CzrjzEyP3bL9kjkEj28bCCJ2opuCAidtzKu6bBM2",
    "peer": "127.0.0.1:51047",
    "name": "sync"
  },
  "spans": [
    {"component": "daemon", "name": "daemon"},
    {"component": "sync_manager", "name": "syncer"},
    {"graph": "3rK8CzrjzEyP3bL9kjkEj28bCCJ2opuCAidtzKu6bBM2", "peer": "127.0.0.1:51047", "name": "sync"}
  ]
}
```
