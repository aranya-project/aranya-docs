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
- INFO: Key operations and state changes (sync completion, role assignments, channel creation)
- DEBUG: Detailed operation flow (individual operations, intermediate states)
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
# Log rotation size in bytes
max_log_size = 104857600
# Log rotation number
max_log_files = 7
# Log to standard out
stdout = true

**Common log filter configurations:**
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

### Application Setup

Initialize logging in the application:

```rust
use tracing_subscriber::{prelude::*, EnvFilter};
use std::io;

fn main() {
    // Initialize tracing subscriber
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_writer(io::stderr)
                .with_filter(EnvFilter::from_env("APP_LOG")),
        )
        .init();
    
    // Client library logs are now captured
    let client = aranya_client::Client::connect(...).await?;
    let afc = client.afc();
    // AFC seal/open operations will log
}
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

## Log Fields to Include

When adding logging to Aranya code, include these fields where applicable:

### Common Fields
```rust
use tracing::{info, error, instrument};

#[instrument(skip_all, fields(
    device_id = %device_id,
    team_id = %team_id,
))]
async fn my_operation(...) {
    info!(
        duration_ms = start.elapsed().as_millis(),
        "Operation completed"
    );
}
```

### Sync Operations
```rust
info!(
    peer_device_id = %peer.device_id,
    peer_addr = %peer.addr,
    duration_ms = elapsed.as_millis(),
    cmd_count,
    effects_count,
    bytes_transferred,
    ?network_stats,  // Debug format for complex types
    "Sync completed successfully"
);
```

### Error Context
```rust
error!(
    error = %err,
    device_id = %device_id,
    operation = "create_channel",
    retry_count,
    "Operation failed"
);
```

## Best Practices

1. Default to INFO: Use `info` level for production
2. Debug on demand: Use env var to enable debug logging temporarily
3. Avoid TRACE in production: TRACE can impact performance significantly
4. Use structured fields: Add `device_id`, `team_id`, `duration_ms` to log entries
5. Include error context: Log full error chains with `.report()` or `.context()`

## Troubleshooting

### Logs not appearing

1. Check log filter is set: `ARANYA_DAEMON=info` or config `log_filter = "info"`
2. Verify output destination: check stderr redirection or systemd journal
3. Confirm module path: use exact module name (e.g., `aranya_daemon::sync`, not `aranya-daemon::sync`)

### Too many logs

1. Reduce level: `info` instead of `debug`
2. Filter specific modules: `info,aranya_daemon::sync=debug` instead of `aranya_daemon=debug`
3. Avoid TRACE level in production

### Client logs not appearing

1. Ensure application initializes `tracing_subscriber`
2. Set application's log environment variable (not `ARANYA_DAEMON`)
3. Check application code for tracing subscriber setup

## Implementation Checklist

### For Daemon Developers

- [ ] Add `#[instrument]` macro to key functions (sync, policy evaluation, AFC operations)
- [ ] Include `device_id` and `team_id` in span fields
- [ ] Log operation start/end with duration at INFO level
- [ ] Log failures at ERROR level with full error context
- [ ] Add correlation_id to RPC request context
- [ ] Use structured fields (not string formatting)
- [ ] Test logging with: `ARANYA_DAEMON=info,aranya_daemon::sync=debug ./aranya-daemon`
- [ ] Verify logs appear in expected format (JSON or text based on config)

### For Client Application Developers

- [ ] Initialize `tracing_subscriber` in main()
- [ ] Use `EnvFilter::from_env("MY_APP_LOG")` for configuration
- [ ] Test with: `MY_APP_LOG=aranya_client=debug ./application`
- [ ] Include correlation_id in RPC calls to daemon
- [ ] Log AFC operations at appropriate levels (TRACE for seal/open, DEBUG for create/close)
- [ ] Verify client logs appear (check stderr if not redirected)

### For New Features

- [ ] Add logging at key decision points (success, failure, retries)
- [ ] Use appropriate log level: ERROR (failures), WARN (degradation), INFO (operations), DEBUG (flow), TRACE (details)
- [ ] Include timing for operations that matter (duration_ms)
- [ ] Include context fields: device_id, team_id, peer_id, channel_id, etc.
- [ ] Document what logs a feature produces
- [ ] Test with `--enable-debug-logging` or environment variable
