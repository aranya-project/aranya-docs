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

TODO

**Policy Error Format:**

TODO

**AFC SHM Error Format:** 

TODO

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
4. Sync peer connection/disconnections
5. AFC channel creations/closures
6. Policy auth failures
7. Storage errors
8. Graph finalization

**Format:**

TODO

## Implementation Roadmap

TODO

## Configuration

Additions to the daemon config will be needed for location to store the debug file, logging configuration, debug endpoints.

TODO