# Result Type Specification

## Overview

A `Result` type represents the outcome of an operation that can either succeed with a value, or fail with an error. This is a common pattern for error handling that makes error cases explicit and forces callers to handle them.

## Type Definition

```policy
result <ok-type>, <err-type>
```

Where:
- `<ok-type>` is the type of the success value
- `<err-type>` is the type of the error value

## Variants


```policy
Ok(value)
Err(value)
```

## Usage

### Creating Results

```policy
let success = Ok(42)
let failure = Err("operation failed")
```

### Pattern Matching

Results are typically consumed using pattern matching:

```policy
let n = match result {
    Ok(value) => {
        :value
    }
    Err(error) => {
        return error // NOTE returning from an expression isn't supported
    }
}
```

### Helper functions

There are built-in functions to make working with results easier.

#### `unwrap` operator works on results, in addition to optionals

```policy
let n = unwrap Ok(42) // n == 42
let n = unwrap Err(-1) // policy check-exits
```
>TBD Probably shouldn't be allowed in policy/recall blocks

#### `is_ok(result) bool`

Returns `true` if the result is `Ok`.

```policy
if is_ok(result) {
    // proceed with success path
}
```

#### `is_err(result) bool`

Returns `true` if the result is `Err`.

```policy
if is_err(result) {
    // handle error case
}
```

## Handling errors

Results must be handled, but how? Maybe pushing a `result` value on the stack "creates an obligation" to check both variants. The compiler/analyzer can then examine the code to ensure this obligation is met.

```policy
let value = foo() // the Return instruction adds a must_use obligation, which can be met with the following:
let v = match value {
    Err(e) => { return  e } // currently, we can't return from match expression
    Ok(v) => :v
}
// this must appear immediately after the Const instruction that pushed the result
// can't use the name `value`, though, because . 
```

This can be sugared with `?`, e.g. `let value = foo()?`.

### Handling errors in non-returning contexts

```policy
function foo() result int, int {
    ...
    return Err(-1)
}

command Foo {
    ...
    policy {
        let f = foo()

        check is_ok(f), recall
        
        // or
        match f {
            Err(e) => recall with_arg(e) // dedicated recall statement?
            _ => {}
        }
    }

    // Do we want the result returned to the action?

    recall {}

    recall with_arg(err int) {

    }
}
```