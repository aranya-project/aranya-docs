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

Verbose logging should be at trace level when debugging is enabled at INFO or DEBUG.

### Must Have Items

1. Sync start time and duration
2. Success/failure status
3. Peer information (sync sender and receiver)
4. Command count received (per sync)
5. First command address (hash+max_cts)
6. Data volume transferred

### Nice to Have Items

1. Network quality metrics (MTU, packet loss, RTT)
2. Protocol info
3. Full command details (only at trace level)

## Data Collection Tools

### 1. Structured Logging

What items need to be logged:

1. Timestamp (ns precision)
2. Log level
3. Component identifier (daemon, client, sync, afc, policy)
4. Device and Team ID
5. Correlation IDs (used for tracing across components)
6. Error context
7. Operation duration for all syncs
8. Peer address and network info for syncs
9. Detailed policy evaluation with line number and what check failed

**Log Format:** 
INFO:
```json
{ 
    "timestanp": "2026-01-12T12:34:56.789012Z",
    "level": "INFO",
    "component": "sync",
    "device_id": "dev_a",
    "team_id": "team_123",
    "correlation_id": "req_001",
    "message": "Sync completed successfully",
    "fields": {
        "peer_device_id": "dev_peer_a",
        "peer_addr": "192.168.1.100:5000",
        "local_addr": "192.168.1.101:5000",
        "duration_ms": 100.,
        "cmd_count_received": 5,
        "first_cmd_sent": {
            "hash": "abcdef1234567890",
            "max_cts": 42,
        },
        "bytes_transferred": 2048,
        "effects_count": 3,
        "network_stats": {
            "rtt_ms": 45.2,
            "bandwidth_mbps": 100
        }
    }
}
```

ERROR:
```json
{
    "timestanp": "2026-01-07T12:34:56.789012Z",
    "level": "ERROR",
    "component": "sync",
    "device_id": "dev_a",
    "team_id": "team_123",
    "correlation_id": "req_001",
    "message": "Sync failed with peer",
    "error": {
        "device_id": "dev_b",
        "peer_addr": "192.168.1.100:5000",
        "local_addr": "192.168.1.101:5000",
        "duration_ms": 30000,
    },
    "metadata": {
        "retry_count": 3,
        "last_successful_sync": "2026-01-07T12:30:00.000000Z",
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
    "timestamp": "2026-01-15T12:34:56.789012Z",.
    "level": "ERROR",
    "component": "policy",
    "device_id": "dev_a",
    "team_id": "team_123",
    "correlation_id": "req_002",
    "message": "Policy authorization failed",
    "error": {
        "kind": "AuthorizationFailed",
        "action": "create_label",
        "check_failed": "CanCreateLabels",
        "policy_file": "src/policy.md",
        "policy_line": 456,
        "policy_context": "action create_label requires permission CanCeateLabels",
        "device_permissions": ["CanUseAfc","CanSync"],
        "required_permissions": ["CanCreateLabels"]
    }
}
```

**AFC SHM Error Format:** 

```json
{
    "timestamp": "2026-01-16T12:34:56.789012Z",
    "level": "ERROR",
    "component": "afc",
    "device_id": "dev_a",
    "team_id": "team_123",
    "correlation_id": "req_003",
    "message": "Failed to add key to SHMM",
    "error": {
        "kind": "ShmKeyAddFailed",
        "channel_id": "ch_123",
        "label_id": "label_123",
        "peer_device_id": "dev_b",
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
        "last_operation": "2026-01-16T11:34:56.789012Z",
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
2. Role assigments/revocations
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
        "timestamp": "2026-01-16T11:34:56.789012Z",
        "event_type": "device_joined_team",
        "device_id": "dev_b",
        "team_id": "team_123",
        "details":{
            "assigned_role": "member",
            "added_by": "dev_a",
        }
    }
```
## Implementation Roadmap

TODO

## Configuration

Additions to the daemon config will be needed for location to store the debug file, logging configuration, debug endpoints.

```toml
[debug]
# Enable debug endpoints
enabled = true
# endpoint address
bind_addr = "127.0.0.1:9090"

[logging]
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