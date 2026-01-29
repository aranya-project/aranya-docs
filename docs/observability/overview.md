---
layout: page
title: Observability Overview
permalink: "/observability/overview"
---

# Aranya Observability Documentation

This section covers observability and debugging specifications for Aranya.

## Overview

The Aranya observability system targets remote debugging of deployed systems rather than real-time monitoring. It focuses on diagnosing production issues when direct access is limited.

## Documentation Structure

### Core Concepts
- [Logging Configuration](logging.md) - Log levels, filters, output configuration for daemon and clients
- [Analysis Tools](analysis.md) - The `aranya-debug` CLI tool for configuration, collection, and analysis

### Component-Specific Observability
- [Sync Observability](sync.md) - Debugging sync operations, performance, stalls, and topology
- [AFC Observability](afc.md) - Fast Channels logging, SHM operations, seal/open debugging
- [Policy Observability](policy.md) - Policy evaluation logging, authorization failures, role debugging

### Implementation
- [Implementation Roadmap](implementation.md) - Phased rollout plan

## Quick Start

**Add logging to daemon code:**
```rust
info!(
    duration_ms = start.elapsed().as_millis(),
    cmd_count,
    effects_count,
    "Sync completed successfully"
);    
```

**Configure daemon log level:**
```toml
# daemon.toml
log_filter = "info,aranya_daemon::sync=debug"
```

**Initialize logging in your application:**
```rust
use tracing_subscriber::{prelude::*, EnvFilter};

fn main() {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::fmt::layer()
                .with_filter(EnvFilter::from_env("MY_APP_LOG")),
        )
        .init();
    
    // Client library logs are now captured
    let client = aranya_client::Client::connect(...).await?;
}
```

**Enable AFC debugging:**
```bash
APP_LOG=aranya_client::afc=debug ./application
```

## Design Principles

Principles:

1. Remote-First: Designed for production environments with limited access
2. File-Based: Write locally, collect and analyze offline
3. Runtime Configurable: Enable/disable without recompilation
4. Performance Conscious: Avoid hot-path overhead; use TRACE sparingly
5. Sync-Focused: Most production issues are sync-related, so prioritize sync debugging
6. Structured Output: JSON for machine parsing, text for human reading

## Security Considerations

- Logs may contain sensitive data (device IDs, team IDs, addresses)
- Debug endpoints should be disabled in production or protected by authentication
- Avoid logging cryptographic material (keys, passphrases)

## Contributing

When adding observability features:

1. Follow structured logging guidelines in [Logging Configuration](logging.md)
2. Use appropriate log levels (ERROR/WARN/INFO/DEBUG/TRACE)
3. Include device_id/team_id context where relevant
4. Add timing information for operations
5. Update relevant documentation in this directory