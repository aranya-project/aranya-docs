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

### Policy Authorization Failures (ERROR level)

Log all policy denials with full context:

**Required fields:**
- `action` - What operation was attempted (e.g., `create_label`, `manage_role`)
- `check_failed` - Which permission check failed (e.g., `CanCreateLabels`)
- `policy_file` - Source of policy (usually `src/policy.md`)
- `policy_line` - Exact line number in policy.md where check failed
- `policy_context` - Human-readable context from policy
- `device_permissions` - Permissions device actually has
- `required_permissions` - Permissions action requires

**Note:** The `policy_line` field requires generating source maps during policy compilation to map runtime checks back to the original policy.md source.

### Role Assignment Events (INFO level)

**Role assignment:**
- `target_device` - Device receiving the role
- `role_id` - Role being assigned
- `assigned_by` - Device performing the assignment
- `permissions` - Permissions granted by this role

**Role revocation:**
- `target_device` - Device losing the role
- `role_id` - Role being revoked
- `revoked_by` - Device performing the revocation

### Role and Permission Inspection (DEBUG level)

**Role creation:**
- `role_id` - New role identifier
- `permissions` - Permissions included in role
- `owner` - Device creating the role

**Device join:**
- `device_id` - Device joining the team
- `team_id` - Team being joined
- `assigned_role` - Initial role assigned
- `role_permissions` - Permissions from assigned role

**Role query:**
- `device_id` - Device being queried
- `roles` - All roles assigned to device
- `aggregate_permissions` - Combined permissions from all roles

### Crypto Failures with Policy Context (ERROR level)

**Signature validation failure:**
- `device_id` - Local device
- `team_id` - Team context
- `command_id` - Command that failed validation
- `signer_device` - Device that signed the command
- `error` - Error description

**Key exchange failure:**
- `device_id` - Local device
- `peer_device` - Remote peer
- `label_id` - Label for the channel
- `error` - Error description

## Output Format

The JSON format is configured via the tracing subscriber. See [Logging Configuration](logging.md) for setup details.

Example log entry for policy authorization failure:
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

