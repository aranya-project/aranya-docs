---
layout: page
title: Observability Implementation
permalink: "/observability/implementation"
---

# Implementation Roadmap

This document outlines the phased implementation plan for Aranya observability.

## Phase Overview

| Phase | Goal | Status |
|-------|------|--------|
| 1 | Foundation: structured logging, correlation IDs, error chains | Planned |
| 2 | Enhanced sync debugging: stall detection, topology, bundling | Planned |
| 3 | Policy & AFC: detailed error reporting, SHM logging | Planned |

## Phase 1: Foundation

Goal: Establish consistent structured logging with correlation IDs and device/team context.

### What Gets Done

1. **Structured JSON logging**
   - Configure `tracing_subscriber` with JSON formatter
   - All logs output as consistent JSON with required fields
   - Files: `crates/aranya-daemon/src/main.rs`

2. **Correlation IDs**
   - Add `correlation_id: String` to all RPC requests
   - Thread through client → daemon → sync
   - Generate from team_id and device_id: `<team_id>-<device_id>`
   - Files: `crates/aranya-daemon-api/`, `crates/aranya-daemon/src/api.rs`, `crates/aranya-client/src/client.rs`

3. **Error chains**
   - Wrap errors with `.context()` for full causal chain
   - Add structured fields (device_id, team_id, peer_id, etc.)
   - Files: All error handling locations in daemon and client

## Phase 2: Enhanced Sync Debugging

Goal: Provide comprehensive sync visibility: first command tracking, stall detection, network metrics, topology.

### What Gets Done

1. **First command tracking**
   - Log hash + max_cts of first command sent in each sync
   - Compare on next sync to detect stalls
   - Files: `crates/aranya-daemon/src/sync/mod.rs`

2. **Stall detection**
   - Track per-peer: `last_first_cmd_hash`, `last_first_cmd_max_cts`, `stall_count`
   - Only flag as stall when first command repeats AND new data expected
   - Threshold: 3 consecutive identical first commands → WARNING
   - Files: `crates/aranya-daemon/src/sync/mod.rs`

3. **Network quality metrics**
   - Measure RTT (round-trip time)
   - Calculate bandwidth from bytes transferred
   - Track packet loss (if using QUIC)
   - Files: `crates/aranya-daemon/src/sync/mod.rs`, `crates/aranya-aqc-util/`

4. **Sync topology tracking**
   - Create `SyncTopology` struct tracking peer-to-peer edges
   - Statistics per edge: duration, timeout rate, bandwidth
   - Export to Graphviz format
   - Files: `crates/aranya-daemon/src/sync/topology.rs` (new)

## Phase 3: Policy & AFC

Goal: Enhanced policy and AFC observability with detailed error reporting.

### What Gets Done

1. **Policy error reporting**
   - Add source file and line number to policy errors
   - Show permission mismatches (required vs actual)
   - Include check name that failed (e.g., "CanCreateLabels")
   - Generate source maps during compilation
   - Files: `crates/aranya-policy-vm/`, `crates/aranya-daemon/src/actions.rs`

2. **AFC SHM operation logging**
   - Log all key add/remove operations at DEBUG level
   - Log failures with error codes and context
   - Track per-channel statistics
   - Files: `crates/aranya-client/src/afc.rs`

3. **AFC failure tracking**
   - Detect SHM permission errors
   - Detect SHM full conditions (max_keys reached)
   - Log seal/open failures with crypto context
   - Track failure patterns
   - Files: `crates/aranya-client/src/afc.rs`