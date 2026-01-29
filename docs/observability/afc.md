---
layout: page
title: AFC Observability
permalink: "/observability/afc"
---

# AFC (Aranya Fast Channels) Observability

How to debug and monitor Aranya Fast Channels (AFC), including shared memory (SHM) operations, channel lifecycle, and seal/open operations.

## Overview

AFC provides high‑performance encrypted communication over shared memory. Common issues include:
- SHM configuration or access problems (permissions, paths)
- Key management failures (adding/removing keys to SHM)
- Channel creation or connection issues
- Seal/open operation failures (encryption/decryption)
- PSK (pre-shared key) mismatches

## Client-Side Logging

AFC operations occur in the client application, not the daemon. The `aranya-client` library emits tracing events that the application must capture.

See [Logging Configuration](logging.md#client-application-logging) for how to set up logging in your application.

## What to Log

### Channel Lifecycle Events

Log channel creation, acceptance, and closure at INFO level:

```rust
// On channel creation
info!(
    channel_id = %channel.id(),
    peer_device_id = %peer_id,
    label_id = %label_id,
    direction = "send",
    "afc_channel_created"
);

// On channel acceptance
info!(
    channel_id = %channel.id(),
    peer_device_id = %peer_id,
    label_id = %label_id,
    direction = "receive",
    "afc_channel_accepted"
);

// On channel closure
info!(
    channel_id = %channel.id(),
    total_messages_sent,
    total_bytes_sent,
    total_seal_failures,
    "afc_channel_closed"
);
```

### SHM Key Operations

Log SHM key add/remove at DEBUG level (frequent operations):

```rust
// On successful key add
debug!(
    channel_id = %channel_id,
    label_id = %label_id,
    peer_device_id = %peer_device_id,
    shm_path = %shm_path,
    key_index = key_idx,
    current_key_count,
    "afc_shm_key_add"
);

// On successful key remove
debug!(
    channel_id = %channel_id,
    key_index = key_idx,
    remaining_key_count,
    "afc_shm_key_remove"
);
```

### SHM Failures

Log SHM operation failures at ERROR level:

```rust
// On key add failure
error!(
    channel_id = %channel_id,
    label_id = %label_id,
    peer_device_id = %peer_device_id,
    shm_path = %shm_path,
    error_code = ?error.raw_os_error(),
    error_message = %error,
    current_keys = stats.keys_added - stats.keys_removed,
    max_keys = MAX_KEYS,
    total_add_failures = stats.add_failures,
    retry_count,
    "afc_shm_key_add_failed"
);

// On key remove failure
error!(
    channel_id = %channel_id,
    key_index = key_idx,
    error_code = ?error.raw_os_error(),
    error_message = %error,
    "afc_shm_key_remove_failed"
);
```

### Seal/Open Operations

Log seal/open operations at **TRACE** level (very frequent), failures at ERROR:

```rust
// Seal (encrypt) - TRACE level
trace!(
    channel_id = %channel_id,
    plaintext_len = plaintext.len(),
    ciphertext_len = ciphertext.len(),
    seq_num = seq.0,
    "afc_seal"
);

// Open (decrypt) - TRACE level
trace!(
    channel_id = %channel_id,
    ciphertext_len = ciphertext.len(),
    plaintext_len = plaintext.len(),
    seq_num = seq.0,
    "afc_open"
);

// Seal failure - ERROR
error!(
    channel_id = %channel_id,
    error = %err,
    plaintext_len = plaintext.len(),
    seq_num = seq.0,
    "afc_seal_failed"
);

// Open failure - ERROR
error!(
    channel_id = %channel_id,
    error = %err,
    ciphertext_len = ciphertext.len(),
    seq_num = seq.0,
    "afc_open_failed"
);
```

**Note:** TRACE logging for seal/open can generate huge volumes in high‑throughput scenarios. Use sparingly.

### Channel Statistics

Log per-channel statistics periodically or on close at INFO level:

## JSON Log Examples

### Channel Creation

```json
{
  "timestamp": "2026-01-28T10:15:23.456789Z",
  "level": "INFO",
  "target": "aranya_client::afc",
  "fields": {
    "message": "AFC channel created",
    "channel_id": "K8lM0nO3pQ5rS7tU9vW1xY3zA5bC9dE2fG4hI6jK8lM",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "label_id": "L9mN1oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN",
    "direction": "send"
  }
}
```

### SHM Key Add Success

```json
{
  "timestamp": "2026-01-28T10:15:23.500000Z",
  "level": "DEBUG",
  "target": "aranya_client::afc",
  "fields": {
    "message": "SHM key added",
    "channel_id": "K8lM0nO3pQ5rS7tU9vW1xY3zA5bC9dE2fG4hI6jK8lM",
    "label_id": "L9mN1oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "shm_path": "/dev/shm/aranya_ch_123",
    "key_index": 42,
    "current_key_count": 43
  }
}
```

### SHM Key Add Failure

```json
{
  "timestamp": "2026-01-28T10:20:30.789012Z",
  "level": "ERROR",
  "target": "aranya_client::afc",
  "fields": {
    "message": "Failed to add key to SHM",
    "channel_id": "K8lM0nO3pQ5rS7tU9vW1xY3zA5bC9dE2fG4hI6jK8lM",
    "label_id": "L9mN1oP4qR6sT8uV0wX2yZ4aB6cD8eF0gH2iJ4kL6mN",
    "peer_device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "shm_path": "/dev/shm/aranya_ch_123",
    "error_code": 13,
    "error_message": "Permission denied",
    "current_keys": 45,
    "max_keys": 1000,
    "total_add_failures": 1,
    "retry_count": 3
  }
}
```

### Seal Failure

```json
{
  "timestamp": "2026-01-28T10:25:45.123456Z",
  "level": "ERROR",
  "target": "aranya_client::afc",
  "fields": {
    "message": "Seal operation failed",
    "channel_id": "K8lM0nO3pQ5rS7tU9vW1xY3zA5bC9dE2fG4hI6jK8lM",
    "error": "encryption failed: key not found",
    "plaintext_len": 1024,
    "seq_num": 42
  }
}
```

### Channel Statistics

```json
{
  "timestamp": "2026-01-28T10:30:00.000000Z",
  "level": "INFO",
  "target": "aranya_client::afc",
  "fields": {
    "message": "AFC channel statistics",
    "channel_id": "K8lM0nO3pQ5rS7tU9vW1xY3zA5bC9dE2fG4hI6jK8lM",
    "messages_sent": 1234,
    "messages_received": 1180,
    "bytes_sent": 1572864,
    "bytes_received": 1507328,
    "seal_failures": 0,
    "open_failures": 2,
    "keys_added": 45,
    "keys_removed": 43,
    "shm_add_failures": 0
  }
}
```

## Implementation Checklist

- [ ] Add `afc_channel_created` log event with channel_id, peer, label
- [ ] Add `afc_channel_accepted` log event  
- [ ] Add `afc_channel_closed` log event with statistics
- [ ] Add `afc_shm_key_add` log event (DEBUG level)
- [ ] Add `afc_shm_key_remove` log event (DEBUG level)
- [ ] Add `afc_shm_key_add_failed` log event with error details
- [ ] Add `afc_shm_key_remove_failed` log event
- [ ] Add `afc_seal_failed` log event
- [ ] Add `afc_open_failed` log event
- [ ] Implement per-channel statistics tracking
- [ ] Log channel statistics periodically (every 1000 messages or 60s)
- [ ] Log channel statistics on close
- [ ] Add optional seal/open logging at TRACE level
- [ ] Test SHM permission error scenarios
- [ ] Test SHM full scenario (max_keys reached)
- [ ] Test seal/open failure scenarios
