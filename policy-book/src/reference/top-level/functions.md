# Functions

Functions abstract statements into reusable blocks. There are two types
of functions - pure functions and finish functions.

No function type may be used in a way that would cause recursion.

## Pure Functions

```
function count_valid(v count) bool {
    return v >= 0
}
```

Pure functions can contain data processing statements (`let`, `if`,
`match`, etc.), must have a return type, and must return a value with
`return`.

Pure functions are valid in any expression (see also
[Functions](../expressions/functions.md) in the Expressions section).
But due to the restrictions on finish blocks and functions, they may
only be used in actions, pure functions, command
`seal`/`open`/`policy`/`recall` blocks outside finish blocks, and global
`let` definitions (subject to [their restrictions](global-values.md)).

## Finish Functions

```
finish function set_foo(device id, new int) {
    update FooCounter[device: device]=>{count: current} to {count: new}
}
```

Finish functions allow the abstraction of statements used in [`finish`
blocks](commands.md#finish-block). Thus, they can only contain `finish`
block statements (`create`, `update`, `delete`, `emit`) and cannot
return a value. Finish functions are called like
regular functions, except they stand alone.

```
// In a policy block:
let new = this.current + 1
finish {
    set_foo(this.device_id, new)
}
```

Finish functions can call other finish functions in the same way as in
finish blocks. Like finish blocks, expressions in finish functions are
limited to named values and constants.