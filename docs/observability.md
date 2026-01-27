---
layout: page
title: Observability
permalink: "/observability/"
---

# Observability Specification for Aranya

## Overview

This document is an outline of a strategy to use for debugging of Aranya deployments in remote or production environments where debug access is limited. The end goal is to make this into a system in which it would be easier for a customer to set some flags and gather information in a more convenient manner. Even further, defining a format for this data to be in to make debugging more efficient.

## Common Issues to Debug

1. Sync Issues
2. Account/Client State Issues
3. AFC Issues
4. Storage/Graph Issues
5. Policy Enforcement Issues

## Data Collection Methods

### Design Principles

The observability system is designed for remote debugging of systems, not real-time monitoring.

1. File based logging - which includes writing to local files, collecting them into a single bundle.
2. Leveraging the rust tracing crate.
3. Configuration at runtime - a means to enable or disable without recompilation.
4. Keeping performance in mind - avoid verbose logging in hot paths.
5. Sync Debugging - given that sync issues are most common.

### Sync Specific Items

- Operation start time and duration
- Peer addresses and device IDs
- Success/failure status
- Command count received
- First command address (hash+max_cts)
- Bytes transferred
- Network quality metrics (when available)
- Detailed policy evaluation failures with line numbers and specific checks

### Log Level Guidelines

- ERROR: require attention
- WARN: potential issues
- INFO: Key operations
- DEBUG: Details on operation flow
- TRACE: Verbose details (use sparingly)

### Performance Considerations

Verbose logging should only be visible when the log level is set to TRACE. When the log level is INFO or DEBUG, TRACE logs should not be visible to minimize performance impact.

### Must Have Items

1. Sync start time and duration
2. Success/failure status
3. Peer information (sync sender and receiver)
4. Command count received (per sync)
5. First command address (hash+max_cts)
6. Data volume transferred
7. AFC Encrypt/Decrypt time?

### Nice to Have Items

1. Network quality metrics (MTU, packet loss, RTT)
2. Protocol info
3. Full command details (only at trace level)
4. Policy evaluation error logging

## Data Collection Tools

### 1. Structured Logging

What items need to be logged:

1. Timestamp (ms precision)
2. Log level
3. Component identifier (daemon, client, sync, afc, policy)
4. Device and Team ID
5. Correlation IDs (used for tracing across components)
   - **Note:** Correlation IDs track logical operations/requests as they flow through multiple components (e.g., a single sync operation that involves policy checks, AFC operations, and storage updates). This is distinct from command IDs, which identify specific commands in the command graph representing state changes. A single operation may process multiple commands but shares one correlation ID for debugging the operational flow.
6. Error context
7. Operation duration for all syncs
8. Peer address and network info for syncs
9. Detailed policy evaluation with line number and what check failed

**Log output example**
info!(
    component = "sync",
    device_id = %device_id,
    team_id = %team_id,
    correlation_id = %correlation_id,
    peer_device_id = %peer_device_id,
    peer_addr = %peer_addr,
    local_addr = %local_addr,
    duration_ms = duration_ms,
    cmd_count_received = cmd_count_received,
    first_cmd_sent.hash = %first_cmd_hash,
    first_cmd_sent.max_cts = first_cmd_max_cts,
    bytes_transferred = bytes_transferred,
    effects_count = effects_count,
    network_stats.rtt_ms = rtt_ms,
    network_stats.bandwidth_mbps = bandwidth_mbps,
    "Sync completed successfully"
);

**Log Format:** 
Sync Request Info:
```json
{ 
    "timestamp": "2026-01-12T12:34:56.789Z",
    "level": "INFO",
    "component": "sync",
    "device_id": { "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    "team_id": { "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" },
    "correlation_id": "req_001",
    "message": "Sync completed successfully",
    "fields": {
        "peer_device_id": { "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" },
        "peer_addr": "192.168.1.100:5000",
        "local_addr": "192.168.1.101:5000",
        "duration_ms": 100,
        "cmd_count_received": 5,
        "first_cmd_sent": {
            "hash": "abcdef1234567890",
            "max_cts": 42,
        },
        "bytes_transferred": 2048,
        "effects_count": 3,
        "network_stats": {
            "rtt_ms": 45.2,
            "bandwidth_mbps": 10
        }
    }
}
```

Sync Request Error:
```json
{
    "timestamp": "2026-01-07T12:34:56.789Z",
    "level": "ERROR",
    "component": "sync",
    "device_id": { "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    "team_id": { "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" },
    "correlation_id": "req_001",
    "message": "Sync failed with peer",
    "error": {
        "device_id": { "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba" },
        "peer_addr": "192.168.1.100:5000",
        "local_addr": "192.168.1.101:5000",
        "duration_ms": 30000,
    },
    "metadata": {
        "retry_count": 3,
        "last_successful_sync": "2026-01-07T12:30:00.000Z",
        "network_stats": {
            "rtt_ms": 450,
            "bandwidth_mbps": 10,
        }
    }
}
```

**Policy Error Format:**

```json
{
    "timestamp": "2026-01-15T12:34:56.789Z",
    "level": "ERROR",
    "component": "policy",
    "device_id": { "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    "team_id":{ "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" },
    "correlation_id": "req_002",
    "message": "Policy authorization failed",
    "error": {
        "kind": "AuthorizationFailed",
        "action": "create_label",
        "check_failed": "CanCreateLabels",
        "policy_file": "src/policy.md",
        "policy_line": 456,
        "policy_context": "action create_label requires permission CanCreateLabels",
        "device_permissions": ["CanUseAfc","CanSync"],
        "required_permissions": ["CanCreateLabels"]
    }
}
```

**AFC SHM Error Format:** 

```json
{
    "timestamp": "2026-01-16T12:34:56.789Z",
    "level": "ERROR",
    "component": "afc",
    "device_id": { "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
    "team_id": { "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" },
    "correlation_id": "req_003",
    "message": "Failed to add key to SHMM",
    "error": {
        "kind": "ShmKeyAddFailed",
        "channel_id": "ch_123",
        "label_id": "label_123",
        "peer_device_id": { "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba" },
        "shm_path": "/dev/shm/aranya_ch_123",
        "error_code": "EACCES",
        "error_message": "Permission denied",
        "shm_stats": {
            "current_keys": 45,
            "max_keys":1000,
            "total_add_failures": 1
        },
    },
    "metadata": {
        "retry_count": 3,
        "last_operation": "2026-01-16T11:34:56.789Z",
    }
}
```

### 2. Diagnostic Snapshots

- System info
- Daemon state
- Storage stats
- Performance stats

### 3. Event Recording

Critical events only such as:

1. Device joins/leaves team
2. Role assignments/revocations
3. Label creations/deletions
4. Permission grants/revocations
5. Sync peer connection/disconnections
6. Sync timeouts (logged as errors)
7. AFC channel creations/closures
8. AFC SHM key add/remove failures
9. Policy authorization failures
10. Policy evaluation errors (with policy source line numbers)
11. Storage errors
12. Graph finalization

**Format:**

```json
    {
        "event_id": "event_a",
        "timestamp": "2026-01-16T11:34:56.789Z",
        "event_type": "device_joined_team",
        "device_id": { "9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210fedcba" },
        "team_id": { "fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321" },
        "details":{
            "assigned_role": "member",
            "added_by": { "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef" },
        }
    }
```
## Implementation Roadmap

### Phase 1: Foundation

Goal: Establish consistent structured logging with correlation IDs and device/team context across all operations.

Current State: The tracing crate is integrated, but structured JSON logging with required fields is not implemented.

Tasks:
1. Configure `tracing-subscriber` with JSON formatter for structured logging output
2. Implement correlation IDs across all operations
   - Use UUIDs to tie related logs together
   - Add integration test that traces a request from client through daemon
3. Enhance error context with full causal chains
   - Add specific fields to error types and expand error context
   - Ensure error chains show full context in logs
4. Add device/team ID filtering to logs

### Phase 2: Enhanced Sync Debugging

Goal: Provide visibility into sync operations, detect sync stalls, and enable top-down analysis.

Current State: Sync logging exists but lacks first command tracking, stall detection, network quality metrics, and data path visualization.

Tasks:
1. Add first command address SENT tracking (hash + max_cts)
   - Include fields: `last_first_cmd_hash`, `last_first_cmd_max_cts`, `stall_count`
2. Detect stalled syncs (same first command sent repeatedly)
   - Compare consecutive sync commands to detect stalls
3. Add network quality measurements
   - Implement RTT measurement
   - Expose network metrics from QUIC connections
   - Add querying methods for bandwidth and packet loss
4. Enhanced timeout logging with context
   - Wrap sync operations with timeout tracking
   - Log: `last_successful_sync`, timestamp, `retry_count`, network quality on timeout
5. Add sync peer topology tracking
   - Store and update sync paths
   - Include topology info in logs
6. Complete `aranya-debug bundle` tool
   - Build crate to collect logs from multiple devices
   - Bundle logs for analysis
7. Add `aranya-debug analyze` tool for basic log analysis
   - Parse JSON log files
   - Filter by time range, device, team, log level, component

### Phase 3: Policy & AFC

Goal: Enhance visibility of policy evaluation errors and AFC operations, particularly SHM key management.

Current State: Policy errors lack source line numbers and detailed permission mismatches. AFC SHM operations and failures are not fully logged.

Tasks:
1. Enhanced policy error reporting
   - Modify policy error types to include policy file path and line numbers
   - Include specific failed checks and permission mismatches
   - Add policy context to error messages
2. AFC SHM operation logging
   - Add logging to all SHM operations
   - Track per-channel statistics
   - Log OS-level errors with details (SHM path, permissions, size)
   - Log whether the SHM is either already populated or empty when doing an operation.
3. AFC failure tracking and debugging
   - Add source mapping in `aranya-policy-ifgen`
   - Track SHM key add/remove failures

### Phase 4: Analysis Tools

Goal: Build user-friendly CLI tools to analyze debug data and identify root causes.

Tasks:
1. Build log analysis CLI
   - Error aggregation by type and component
   - Ordered timeline of events
   - Summary statistics (log counts by level, warnings, devices)
   - Request tracking across devices via correlation IDs
   - Export analysis results to JSON
2. Build sync diagnostics tool with topology visualization
   - Parse sync logs to generate network topology graph
   - Visualize sync paths and peer relationships
3. Build state comparison tool
   - Compare graph state between two timestamps
   - Show differences in commands, effects, and state changes

### Phase 5: Optional Monitoring (Future)

Goal: Add real-time monitoring capabilities for operational visibility.

Tasks:
1. Prometheus metrics endpoint (for health monitoring, not debugging)
2. Dashboard for real-time monitoring (separate from debugging)
3. Alerting based on metrics

Note: Phase 5 is for monitoring, not debugging. Focus is on remote debugging capabilities first.

## Configuration

Additions to the daemon config will be needed for location to store the debug file, logging configuration, debug endpoints.

```toml
[debug]
# Enable debug endpoints
enabled = true
# endpoint address
bind_addr = "127.0.0.1:9090"

[logging]
# Toggle logging
enabled = "true"
# Log format (json or text)
format = "json"
# Default level
level = "info"
# Log path
path = "/var/log/aranya/daemon.log"
# Log rotation size in bytes
max_log_size = 104857600
# Log rotation number
max_log_files = 7
# Log to standard out
stdout = true
```