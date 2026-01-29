---
layout: page
title: Policy Observability
permalink: "/observability/policy"
---

# Policy Observability

How to debug policy evaluation failures and role/permission issues in Aranya.

## Overview

Policy enforcement issues often show up as:
- Authorization failures (action denied despite valid request)
- Role assignment problems (devices lacking expected roles)
- Permission conflicts (missing required permissions)
- Cryptographic failures (signature validation, key exchange)

## What to Log

### Policy Authorization Failures

Log all policy denials at ERROR level with full context:

```rust
error!(
    action = "create_label",
    check_failed = "CanCreateLabels",
    policy_file = "src/policy.md",
    policy_line = 456,
    policy_context = "action create_label requires permission CanCreateLabels",
    device_permissions = ?device_permissions,
    required_permissions = ["CanCreateLabels"],
    "Policy authorization failed"
);
```

**Required fields:**
- `action` - What operation was attempted (e.g., `create_label`, `manage_role`)
- `check_failed` - Which permission check failed (e.g., `CanCreateLabels`)
- `policy_file` - Source of policy (usually `src/policy.md`)
- `policy_line` - Exact line number in policy.md where check failed
- `policy_context` - Human-readable context from policy
- `device_permissions` - Permissions device actually has
- `required_permissions` - Permissions action requires

### Role Assignment Events

Log role changes at INFO level:

```rust
// On role assignment
info!(
    target_device = %target_device_id,
    role_id = %role_id,
    assigned_by = %assigning_device_id,
    permissions = ?role_permissions,
    "Role assigned to device"
);

// On role revocation
info!(
    target_device = %target_device_id,
    role_id = %role_id,
    revoked_by = %revoking_device_id,
    "Role revoked from device"
);
```

### Role and Permission Inspection

Log role and permission state at DEBUG level:

```rust
// On role creation
debug!(
    role_id = %role_id,
    permissions = ?permissions,
    owner = %owner_device_id,
    "Role created"
);

// On device join
debug!(
    device_id = %device_id,
    team_id = %team_id,
    assigned_role = %role_id,
    role_permissions = ?role_permissions,
    "Device joined team with role"
);

// On role query
debug!(
    device_id = %device_id,
    roles = ?device_roles,
    aggregate_permissions = ?all_permissions,
    "Device role query"
);
```

### Crypto Failures with Policy Context

Log cryptographic failures related to policy at ERROR level:

```rust
// Signature validation failure
error!(
    device_id = %device_id,
    team_id = %team_id,
    command_id = %command_id,
    signer_device = %signer_id,
    error = "signature validation failed",
    "Crypto verification failed - command rejected"
);

// Key exchange failure
error!(
    device_id = %device_id,
    peer_device = %peer_id,
    label_id = %label_id,
    error = "PSK derivation failed",
    "AFC PSK exchange failed - channels may not work"
);
```

## JSON Log Examples

### Authorization Denied

```json
{
  "timestamp": "2026-01-28T10:20:00.123456Z",
  "level": "ERROR",
  "target": "aranya_daemon::actions",
  "fields": {
    "message": "Policy authorization failed",
    "device_id": "6fKz8vR2yN4mHpXqWtLcE9jD3uBaG1sV7iO5kY0wZxM",
    "team_id": "A7bC9dE2fG4hI6jK8lM0nO3pQ5rS7tU9vW1xY3zA5bC",
    "action": "create_label",
    "check_failed": "CanCreateLabels",
    "policy_file": "src/policy.md",
    "policy_line": 456,
    "policy_context": "action create_label requires CanCreateLabels permission",
    "device_permissions": ["CanUseAfc", "CanSync"],
    "required_permissions": ["CanCreateLabels"]
  }
}
```

### Role Assignment

```json
{
  "timestamp": "2026-01-28T10:15:30.456789Z",
  "level": "INFO",
  "target": "aranya_daemon::actions",
  "fields": {
    "message": "Role assigned to device",
    "device_id": "6fKz8vR2yN4mHpXqWtLcE9jD3uBaG1sV7iO5kY0wZxM",
    "team_id": "A7bC9dE2fG4hI6jK8lM0nO3pQ5rS7tU9vW1xY3zA5bC",
    "target_device": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "role_id": "R2nO5pQ8sT1uV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN1o",
    "assigned_by": "6fKz8vR2yN4mHpXqWtLcE9jD3uBaG1sV7iO5kY0wZxM",
    "permissions": ["CanSync", "CanUseAfc"]
  }
}
```

### Device Roles Query

```json
{
  "timestamp": "2026-01-28T10:10:00.789012Z",
  "level": "DEBUG",
  "target": "aranya_daemon::actions",
  "fields": {
    "message": "Device role query",
    "device_id": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "roles": [
      "R2nO5pQ8sT1uV4wX7yZ0aB3cD6eF9gH2iJ5kL8mN1o"
    ],
    "aggregate_permissions": [
      "CanSync",
      "CanUseAfc"
    ]
  }
}
```

### Crypto Verification Failure

```json
{
  "timestamp": "2026-01-28T10:25:15.123456Z",
  "level": "ERROR",
  "target": "aranya_daemon::sync",
  "fields": {
    "message": "Command signature verification failed",
    "device_id": "6fKz8vR2yN4mHpXqWtLcE9jD3uBaG1sV7iO5kY0wZxM",
    "team_id": "A7bC9dE2fG4hI6jK8lM0nO3pQ5rS7tU9vW1xY3zA5bC",
    "command_id": "C4dE7fG0hI3jK6lM9nO2pQ5rS8tU1vW4xY7zA0bC3d",
    "signer_device": "8gH4jK9mL2nP5qR7sT0uV3wX6yZ1aB4cD7eF0gH3iJ6",
    "error": "signature validation failed"
  }
}
```

## Implementation Checklist

- [ ] Add policy evaluation logging for all authorization failures
- [ ] Include `check_failed`, `policy_line`, and permission details
- [ ] Log role assignment/revocation with full context
- [ ] Add device role query logging
- [ ] Generate policy.md source maps during compilation
- [ ] Log policy_line numbers in all policy-related errors
- [ ] Add crypto verification logging with policy context
- [ ] Create integration test for policy error logging