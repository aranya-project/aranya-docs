# Serialize and Deserialize

The `serialize` and `deserialize` builtin functions have been removed. `seal`
and `open` now receive both `this` and `payload bytes` to access the command
and its serialized representation.
