---
layout: page
title: Observability Logging
permalink: "/observability/logging"
---

# Logging Configuration

How to configure logging for the Aranya daemon and client applications.

## Overview

Aranya uses Rust `tracing` for structured logging. Configure logging separately for:
- Daemon (`aranya-daemon`) - configured via config file or environment variable
- Client applications - configured by the application embedding `aranya-client`

## Log Levels

- ERROR: Failures requiring immediate attention (sync failures, authorization denials, storage errors)
- WARN: Potential issues or degraded performance (high resource usage, retry attempts, stalls)
- INFO: Key operations and state changes (role assignments, channel creation)
- DEBUG: Detailed operation flow (sync completion, individual operations, intermediate states)
- TRACE: Verbose details (full command contents, crypto operations)

Use TRACE only for targeted debugging sessions; it can significantly impact performance.

## Daemon Logging Configuration

### Configuration File

Add logging configuration to your `daemon.toml`:

```toml
[debug]
# Enable debug endpoints
enabled = true
# Endpoint address
bind_addr = "127.0.0.1:9090"

[logging]
# Toggle logging
enabled = true
# Log format (json or text)
format = "json"
# Default log level (error, warn, info, debug, trace)
level = "info"
# Per-component log level overrides (optional)
# Format: "component1=level1,component2=level2"
# Example: "sync=debug,afc=trace,policy=info"
# log_filter = ""
# Log path
path = "/var/log/aranya/daemon.log"
# Log to standard out
stdout = true
```

**Common log filter configurations:**
[Subscriber filter doc] (https://docs.rs/tracing-subscriber/latest/tracing_subscriber/filter/struct.EnvFilter.html#filter-directives)
```toml
# Debug sync operations only
log_filter = "info,aranya_daemon::sync=debug"

# Debug policy evaluation
log_filter = "info,aranya_daemon::actions=debug,aranya_policy_vm=trace"

# Multiple components
log_filter = "info,aranya_daemon::sync=debug,aranya_daemon::api=debug"
```

### Environment Variable Override

The `ARANYA_DAEMON` environment variable overrides the config file setting:

```bash
# Override to debug level
ARANYA_DAEMON=debug ./aranya-daemon --config daemon.toml

# Override with module-specific filter
ARANYA_DAEMON=info,aranya_daemon::sync=debug ./aranya-daemon --config daemon.toml

# Disable all logging
ARANYA_DAEMON=off ./aranya-daemon --config daemon.toml
```

**When to use:**
- Config file: Production default logging level
- Environment variable: Temporary debugging without config changes

## Client Application Logging

The `aranya-client` library does not configure logging itself. Applications embedding the client must initialize `tracing_subscriber`.

**C applications:** Only Rust applications can configure `tracing_subscriber` directly. C clients require a C API wrapper to set up logging. The current C API exposes an initialization helper, but it is not as flexible as this spec’s configuration goals.

### Application Setup

Initialize logging in the application:

```rust
use tracing_subscriber::{prelude::*, EnvFilter};
use std::io;

    // Initialize tracing subscriber
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(io::stderr)
                .with_filter(EnvFilter::from_env("APP_LOG")),
        )
        .init();
```

### Client Log Filters

**Common client/AFC filters:**
```bash
# All client library logs at debug level
APP_LOG=aranya_client=debug ./application

# AFC operations only
APP_LOG=aranya_client::afc=debug ./application

# Detailed AFC seal/open tracing
APP_LOG=aranya_client::afc=trace ./application

# Multiple modules
APP_LOG=info,aranya_client::afc=debug,aranya_client::client=debug ./application
```

### Recommended Options

Option 1: Application-specific env var
```bash
# Clear ownership - this app controls its logging
APP_LOG=info,aranya_client::afc=debug ./application
```

Option 2: Use RUST_LOG (standard Rust convention)

NOTE: this applies to Rust applications only; C clients need a dedicated logging init API.

```bash
# Works well if you follow standard Rust logging conventions
RUST_LOG=info,aranya_client=debug ./my-application
```

## Daemon + Client Logging

For deployments where you run both daemon and client application:

### Separate Env Vars

```bash
# Clear separation of concerns
ARANYA_DAEMON=info,aranya_daemon::sync=debug \
APP_LOG=info,aranya_client::afc=debug \
  ./application
```

### Shared RUST_LOG

```bash
# Daemon
RUST_LOG=info,aranya=debug ./aranya-daemon --config daemon.toml

# Client application
RUST_LOG=info,aranya=debug ./application
```

Trade-off: Shared RUST_LOG is simpler but gives less granular control.

## Structured Logging Format

### Text Format

Human-readable terminal output:

```
2026-01-28T10:15:23.456789Z  INFO aranya_daemon::sync: Sync completed successfully
    peer=8gH4jK9mL2nP5qR...
    duration_ms=123
    cmd_count=5
    effects_count=3
```

### JSON Format (Machine-Readable)

For log aggregation and analysis:

```json
{
  "timestamp": "2026-01-28T10:15:23.456789Z",
  "level": "INFO",
  "target": "aranya_daemon::sync",
  "fields": {
    "message": "Sync completed successfully",
    "peer": "8gH4jK9mL2nP5qR...",
    "duration_ms": 123,
    "cmd_count": 5,
    "effects_count": 3
  }
}
```

To enable JSON format, modify the logging setup:

```rust
tracing_subscriber::registry()
    .with(
        tracing_subscriber::fmt::layer()
            .json()  // Enable JSON output
            .with_filter(env_filter),
    )
    .init();
```

## Component-Level Tracing

To distinguish where failures occur, use component-level spans organized by architectural layer:

```
API Layer → Component Layer → Sub-component Layer
```

**Architecture:**
- **API Layer** - Request validation, authentication (client/daemon IPC APIs)
- **Component Layer** - Core logic (sync, policy, keystore, AFC)
- **Sub-component Layer** - Dependencies (SHM, storage, crypto)

### Span Structure

Each span should include a `component` field to identify which architectural layer or subsystem is active. This enables filtering logs by component and quickly identifying where errors occur.

### RPC Trace Correlation

Tarpc provides an `rpc.trace_id` for each request. You can include this value in spans on **both** the caller and receiver to correlate client and daemon logs.

**Recommended field:**
- `rpc_trace_id` - Use the tarpc `context::current().trace_id` value

**Outcome:**
- Logs on both sides share the same `rpc_trace_id`
- Easy cross-process correlation for a single request
- Use `rpc_trace_id` as the `correlation_id`/`request_id` when logging RPC activity

**Common components:**
- `daemon` - Top-level daemon
- `daemon_api` - API request handlers
- `policy` - Policy evaluation
- `quic_sync` - QUIC sync operations
- `sync_manager` - Sync coordination
- `keystore` - Key management
- `afc` - Aranya Fast Channels

### Error Attribution in Span Hierarchies

When errors are logged, they occur in the **innermost (active) span**. The singular `span` field at the top level shows exactly which span originated the error:

```json
{
  "timestamp": "2026-02-03T16:35:25.142225Z",
  "level": "ERROR",
  "fields": {
    "message": "server unable to respond to sync request from peer",
    "error": "The connection was closed by the remote endpoint"
  },
  "span": {
    "component": "quic_sync",
    "name": "serve_connection",
    "conn_source": "127.0.0.1:50159"
  },
  "spans": [
    {"component": "daemon", "name": "daemon"},
    {"component": "quic_sync", "name": "sync-server"},
    {"component": "quic_sync", "name": "serve"},
    {"component": "quic_sync", "name": "serve_connection"}
  ]
}
```

**Interpreting the error:**

The `span` field identifies where the error originated:
- **`component: "quic_sync"`** - Network/connection subsystem failed (not API validation or policy evaluation)
- **`name: "serve_connection"`** - Specific function handling the peer connection
- **`conn_source: "127.0.0.1:50159"`** - Context showing which peer was involved

The `spans` array shows the complete call path leading to the error:
```
daemon → sync-server → serve → serve_connection (error occurred here)
```

This makes it immediately clear the error is an infrastructure issue (connection failure) rather than an application-level problem (API validation or policy denial).

## Log Fields to Include

When adding logging to Aranya code, include these structured fields where applicable:

### Event Type (Recommended)

Define a `event_type` field for key observability events. This enables filtering and test assertions without relying on message strings. Could be something like (`sync_timeout`, `policy_denied`, or `afc_shm_add_failed`)

**Benefits:**
- Log filters can match `event_type` reliably
- Integration tests can assert on `event_type` without having to use string matches for a string that may change

### Common Fields (All Operations)

- **`component`** - The architectural component (daemon_api, policy, quic_sync, etc.)
- **`device_id`** - The device performing the operation
- **`team_id`** / **`graph_id`** - The team/graph being operated on
- **`duration_ms`** - Operation duration in milliseconds
- **`message`** - Human-readable operation description

### Sync Operations

- **`peer_device_id`** - Device ID of sync peer
- **`peer_addr`** - Network address of peer
- **`cmd_count`** / **`cmd_count_received`** - Number of commands synced
- **`effects_count`** - Number of effects generated
- **`bytes_transferred`** - Total bytes sent/received
- **`first_cmd_hash`** - Hash of first command (for stall detection)
- **`first_cmd_max_cts`** - Max CTS of first command
- **`network_stats`** - Optional object containing network quality metrics:
  - **`rtt_ms`** - Round-trip time in milliseconds
  - **`bandwidth_mbps`** - Measured bandwidth in megabits per second
  - **`packet_loss_percent`** - Packet loss percentage (if using QUIC)

### API Operations

- **`operation`** - API method name (create_team, add_member, etc.)
- **`request_id`** / **`correlation_id`** - For tracing requests across components
- **`validation_error`** - Specific validation failure (if applicable)

### AFC Operations

- **`channel_id`** - AFC channel identifier
- **`label_id`** - Label used for the channel
- **`peer_device_id`** - Peer device for the channel
- **`plaintext_len`** / **`ciphertext_len`** - Data sizes
- **`seq_num`** - Sequence number for seal/open operations
- **`shm_path`** - Shared memory path (for SHM operations)
- **`key_index`** - Key index in SHM
- **`current_key_count`** - Number of keys in SHM

### Policy Operations

- **`role_id`** - Role being created/modified
- **`label_id`** - Label being created/modified
- **`managing_role_id`** - Role managing the operation
- **`perm`** - Permission being granted/revoked
- **`target_role_id`** - Target role for permission operations

### Error Context

- **`error`** - Error message or description
- **`error_code`** - Specific error code (if applicable)
- **`operation`** - Operation that failed
- **`retry_count`** - Number of retry attempts
- **`last_successful_sync`** - Timestamp of last success (for recurring failures)
- **`psk_id`** - PSK identifier (for authentication failures)

### Network/Connection Operations

- **`local_addr`** - Local network address
- **`remote_addr`** / **`conn_source`** - Remote network address
- **`timeout_ms`** - Timeout value
- **`rtt_ms`** - Round-trip time in milliseconds
- **`bandwidth_mbps`** - Measured bandwidth

## Best Practices

### General Guidelines

1. **Debug on demand** - Use environment variables to enable debug logging temporarily without changing config files
2. **Avoid TRACE in production** - TRACE can significantly impact performance; use only for targeted debugging
3. **Use structured fields** - Always use typed fields (`device_id = %id`) instead of string formatting
4. **Include error context** - Log full error chains to show root causes
5. **Add correlation IDs** - Include request/correlation IDs in RPC calls for distributed tracing

### When Adding Logging to Features

- Log at key decision points: successes, failures, retries
- Choose appropriate levels:
  - **ERROR** - Failures requiring attention
  - **WARN** - Degraded performance or potential issues
  - **INFO** - Key operations and state changes
  - **DEBUG** - Detailed operation flow
  - **TRACE** - Verbose details (avoid in hot paths)
- Include timing for operations (`duration`) to identify bottlenecks
- Include relevant context fields (`device_id`, `team_id`, `peer_id`, `channel_id`)
- Document what logs your feature produces
