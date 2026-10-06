# Base Commands

```
base command BaseInit {
    fields {
        sign_key bytes
    }
    get_key {
        return Some(this.sign_key)
    }
}

base command Base {
    get_key {
        return match query DeviceSignPubKey[device_id: author_id] {
            Some(f) => Some(f.key)
            None => None
        }
    }
}
```

Base commands factor out common properties which would otherwise be
replicated across many commands.

## Fields Block

The `fields` block is optional.

The base's fields are combined with the command's fields to get the full
set of fields for the command.

## Get Key Block

The `get_key` block is required.

This block defines how to access the verifying key for a provided
author ID to be used while the runtime opens this command.

The block behaves like a function with this signature:

```
function get_key(this struct <Base>, author_id id) option[bytes]
```

Note that `this` only provides access to the fields of the base command.
Thus, any fields needed by the `get_key` block must be defined on the
base command.
