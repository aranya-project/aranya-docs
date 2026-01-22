# Aranya Distributed Scale Testing Specification

## Overview

In order to support more realistic testing scenarios, this document describes a server that can be used to spawn daemons and control them from multiple machines. Each test server exposes a REST API that can be used to command the daemons based on device ID. An orchestrator can use the test server to start remote daemons and add them to a test scenario. 

The test orchestrators can either interact with the test server APIs directly, or use a utility library to automatically track the location of daemons or set up sync topologies. 

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Test Orchestrator                               │
│                    (external test driver/script)                        │
└─────────────────────────────────┬───────────────────────────────────────┘
                                  │ HTTP/REST
                    ┌─────────────┼─────────────┐
                    │             │             │
                    ▼             ▼             ▼
           ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
           │ Test Server  │ │ Test Server  │ │ Test Server  │
           │   (Node A)   │ │   (Node B)   │ │   (Node C)   │
           └──────┬───────┘ └──────┬───────┘ └──────┬───────┘
                  │                │                │
        ┌─────────┼────────────┐  ...             ...
        ▼         ▼            ▼
   ┌─────────┐ ┌─────────┐ ┌─────────┐
   │ Daemon  │ │ Daemon  │ │ Daemon  │
   └─────────┘ └─────────┘ └─────────┘
```

**Not in scope:** production tooling, benchmarking.

---

## Data Format Notes

- All IDs (device, team, role, label) use **base58** encoding
- Key bundles (identity, signing, encryption public keys) use **hex** encoding
- Sync seed IKM uses **base64** encoding (32 bytes)

---

## REST API

Base URL: `http://<host>:<port>/api/v1`

### Server Endpoints

| Method | Endpoint | Description | Returns |
|--------|----------|-------------|---------|
| GET | `/health` | Health check | 200 OK |
| GET | `/status` | Server status | server_id, version, daemon counts |

### Daemon Lifecycle

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| POST | `/daemons` | Start daemon | name, sync config, afc config | device_id, sync_addr, uds_path, pid |
| GET | `/daemons` | List daemons | - | array of {device_id, name, status, sync_addr} |
| GET | `/daemons/{device_id}` | Get daemon details | - | device_id, name, status, sync_addr, uds_path, pid, key_bundle |
| DELETE | `/daemons/{device_id}` | Stop and remove daemon | - | 204 |
| POST | `/daemons/{device_id}/stop` | Stop daemon (keep state) | - | device_id, status |
| POST | `/daemons/{device_id}/start` | Restart stopped daemon | - | device_id, status, sync_addr |

### Team Operations

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| POST | `/daemons/{device_id}/teams` | Create team | quic_sync seed config | team_id |
| POST | `/daemons/{device_id}/teams/{team_id}/add` | Join existing team | quic_sync seed config | 204 |
| DELETE | `/daemons/{device_id}/teams/{team_id}` | Remove team from daemon | - | 204 |
| POST | `/daemons/{device_id}/teams/{team_id}/close` | Close/terminate team | - | 204 |

### Device Operations

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| GET | `.../teams/{team_id}/devices` | List team devices | - | array of device_ids |
| POST | `.../teams/{team_id}/devices` | Add device to team | key_bundle, initial_role_id (optional) | 204 |
| DELETE | `.../teams/{team_id}/devices/{target_device_id}` | Remove device | - | 204 |
| GET | `.../teams/{team_id}/devices/{target_device_id}/keybundle` | Get key bundle | - | identity, signing, encryption keys |

### Role Operations

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| GET | `.../teams/{team_id}/roles` | List roles | - | array of {id, name, author_id, default} |
| POST | `.../teams/{team_id}/roles/setup-defaults` | Setup default roles | owning_role_id | created roles |
| POST | `.../devices/{target_device_id}/role` | Assign role | role_id | 204 |
| DELETE | `.../devices/{target_device_id}/role/{role_id}` | Revoke role | - | 204 |
| GET | `.../devices/{target_device_id}/role` | Get device role | - | role object |

### Sync Operations

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| POST | `.../teams/{team_id}/sync-peers` | Add sync peer | addr, interval_ms, sync_now | 204 |
| DELETE | `.../teams/{team_id}/sync-peers` | Remove sync peer | addr | 204 |
| POST | `.../teams/{team_id}/sync-now` | Trigger immediate sync | addr | 204 |

### Label Operations

| Method | Endpoint | Description | Request | Returns |
|--------|----------|-------------|---------|---------|
| POST | `.../teams/{team_id}/labels` | Create label | name, managing_role_id | label_id |
| GET | `.../teams/{team_id}/labels` | List labels | - | array of {id, name, author_id} |
| DELETE | `.../teams/{team_id}/labels/{label_id}` | Delete label | - | 204 |
| POST | `.../devices/{target_device_id}/labels` | Assign label | label_id, chan_op | 204 |
| DELETE | `.../devices/{target_device_id}/labels/{label_id}` | Revoke label | - | 204 |

**chan_op values:** `recv_only`, `send_only`, `send_recv`

---

## Configuration

```toml
server_id = "node-a"
api_addr = "0.0.0.0:8080"
work_dir = "/tmp/aranya-scale-test"
daemon_binary = "./target/release/aranya-daemon"

[state]
mode = "memory"  # or "file"
path = "/tmp/aranya-scale-test/state.json"

[logging]
level = "info"
format = "pretty"
```

CLI: `aranya-test-server [-c config.toml] [-p port] [-w work_dir] [-v]`

---

## Sync Topologies

Sync topologies are set up by the orchestrator either manually (by adding sync peers) or via a library capable of automatically setting up a topology. 

### Sync Direction

Sync relationships are **one-way**. When device A adds device B as a sync peer, A pulls from B. If you want two-way sync, you must explicitly configure both directions.

### Topology Types

| Type | Description | Connections (n devices) |
|------|-------------|-------------------------|
| Star (one-way) | Spokes pull from hub | n-1 |
| Star (two-way) | Hub and spokes pull from each other | 2(n-1) |
| Ring (one-way) | Each device pulls from next neighbor | n |
| Ring (two-way) | Each device pulls from both neighbors | 2n |
| Full Mesh | Every device pulls from every other | n(n-1) |

### Setup Sequence

1. **Start daemons** across test servers (POST `/daemons` on each server)
2. **Create team** on owner device (POST `.../teams`)
3. **Add devices** to team via owner (POST `.../devices` with each device's key_bundle)
4. **Add team** to each non-owner device (POST `.../teams/{team_id}/add`)
5. **Configure sync peers** based on chosen topology (POST `.../sync-peers` for each peer relationship)

### Peer Selection

**Star (two-way):**
```
hub = devices[0]
for spoke in devices[1:]:
    add_sync_peer(spoke, hub.sync_addr)   # spoke pulls from hub
    add_sync_peer(hub, spoke.sync_addr)   # hub pulls from spoke
```

**Star (one-way, hub broadcasts):**
```
hub = devices[0]
for spoke in devices[1:]:
    add_sync_peer(spoke, hub.sync_addr)   # spokes pull from hub only
```

**Ring (two-way):**
```
for i, device in enumerate(devices):
    next = devices[(i + 1) % len(devices)]
    add_sync_peer(device, next.sync_addr)  # device pulls from next
    add_sync_peer(next, device.sync_addr)  # next pulls from device
```

**Full Mesh:**
```
for i, a in enumerate(devices):
    for b in devices[i+1:]:
        add_sync_peer(a, b.sync_addr)  # a pulls from b
        add_sync_peer(b, a.sync_addr)  # b pulls from a
```

### Sync Peer Config

Each `add_sync_peer` call includes:
- `addr`: peer's sync server address 
- `interval_ms`: polling interval
- `sync_now`: trigger immediate sync after adding

### Cross-Server Considerations

When daemons span multiple test servers, the orchestrator must:
- Track which server hosts each device
- Use the correct server's API for each sync-peer call
- Ensure `sync_addr` is reachable across servers (not localhost)

---

## Error Codes

| Code | HTTP | Description |
|------|------|-------------|
| DAEMON_NOT_FOUND | 404 | Daemon doesn't exist |
| DAEMON_NOT_RUNNING | 409 | Daemon stopped |
| DAEMON_ALREADY_RUNNING | 409 | Can't start running daemon |
| DAEMON_START_FAILED | 500 | Process failed to start |
| DAEMON_API_ERROR | 502 | Underlying daemon error |
| INVALID_CONFIG | 400 | Bad configuration |
| INVALID_REQUEST | 400 | Malformed request |
| TEAM_NOT_FOUND | 404 | Team doesn't exist |
| DEVICE_NOT_FOUND | 404 | Device not on team |

---

## Limits

- Max daemons per server: 100
- Daemon startup timeout: 30s
- API request timeout: 60s
