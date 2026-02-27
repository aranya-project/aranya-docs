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

### Architecture Note

AFC operations are split between client and daemon:

**Client operations:**
- **Seal/open** - Encryption and decryption of data
- **Loading keys** - Reading keys from SHM for seal/open operations

**Daemon operations:**
- **Adding/removing keys** - Managing keys in SHM
- **Generating encapsulated keys** - Creating keys from ephemeral session data

## What to Log

Note: Avoid placing logging in the hot path.

For level definitions (for example, what `DEBUG` vs `TRACE` means), see [Log Levels](logging.md#log-levels).

### Channel Lifecycle Events (INFO level)

**Channel creation:**
- `channel_id` - Unique channel identifier
- `peer_device_id` - Peer device for the channel
- `label_id` - Label used for the channel
- `direction` - "send" or "receive"

**Channel deletion:**
- `channel_id`
- `total_messages_sent`
- `total_bytes_sent`
- `total_seal_failures`

### SHM Key Operations

**Key add (DEBUG level):**
- `channel_id`
- `label_id`
- `peer_device_id`
- `shm_path` - Shared memory path
- `key_index` - Index where key was added
- `current_key_count` - Total keys in SHM

**Key remove (DEBUG level):**
- `channel_id`
- `key_index` - Index of removed key
- `remaining_key_count` - Keys remaining in SHM

**Key add failure (ERROR level):**
- `channel_id`
- `label_id`
- `peer_device_id`
- `shm_path`
- `error` - Error description from SHM library
- `current_keys` - Current key count
- `max_keys` - Maximum allowed keys
- `total_add_failures` - Cumulative failures
- `retry_count` - Number of retries attempted

**Key remove failure (ERROR level):**
- `channel_id`
- `key_index`
- `error` - Error description from SHM library

### Seal/Open Operations

**Seal (encrypt) - TRACE level:**
- `channel_id`
- `plaintext_len` - Size of plaintext data
- `ciphertext_len` - Size of encrypted data
- `seq_num` - Sequence number
- `duration_us` - Operation duration in microseconds

**Open (decrypt) - TRACE level:**
- `channel_id`
- `ciphertext_len` - Size of encrypted data
- `plaintext_len` - Size of decrypted data
- `seq_num` - Sequence number
- `duration_us` - Operation duration in microseconds

**Seal/Open failures (ERROR level):**
- `channel_id`
- `error` - Error description
- `plaintext_len` or `ciphertext_len` - Data size
- `seq_num`
- `duration_us` - Duration before failure

**Note:** TRACE logging for seal/open can generate huge volumes in high-throughput scenarios. Use sparingly and only for targeted debugging.

### Channel Statistics (INFO level)

Channel statistics should be logged on channel lifecycle events.

**Fields for channel creation:**
- `channel_id`
- `peer_device_id`
- `label_id`
- `direction` - "send" or "receive"

**Fields for channel close:**
- `channel_id`
- `messages_sent` - Total messages sealed
- `messages_received` - Total messages opened
- `bytes_sent` - Total plaintext bytes sent
- `bytes_received` - Total plaintext bytes received
- `seal_failures` - Count of failed seal operations
- `open_failures` - Count of failed open operations
- `keys_added` - Total keys added to SHM
- `keys_removed` - Total keys removed from SHM
- `shm_add_failures` - Count of SHM key add failures

## Output Format

The JSON format is configured via the tracing subscriber. See [Logging Configuration](logging.md) for setup details.

Example log entry:
```json
{
   "timestamp":"2026-02-03T16:35:28.139545Z",
   "level":"INFO",
   "fields":{
      "message":"afc channel deleted"
   },
   "target":"aranya_daemon::api",
   "span":{
      "chan":"LocalChannelId(0)",
      "component":"daemon_api",
      "name":"delete_afc_channel"
   },
   "spans":[
      {
         "component":"daemon",
         "name":"member_a",
         "name":"daemon"
      },
      {
         "component":"daemon_api",
         "name":"api-server"
      },
      {
         "otel.kind":"server",
         "otel.name":"DaemonApi.delete_afc_channel",
         "rpc.deadline":"2026-02-03T16:35:38.139432834Z",
         "rpc.trace_id":"a1b2c3d4e5f6789012345678abcdef01",
         "name":"RPC"
      },
      {
         "chan":"LocalChannelId(0)",
         "component":"daemon_api",
         "name":"delete_afc_channel"
      }
   ]
}
```

