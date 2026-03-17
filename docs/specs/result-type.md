# Result Type Specification

## Overview

A `result` type represents the outcome of an operation that can either succeed with a value, or fail with an error. This is a common pattern for error handling that makes error cases explicit and forces callers to handle them.

## Type Definition

```policy
result[<ok-type>, <err-type>]
```


## Variants


```policy
Ok(result)
Err(err)
```

## Usage

### Returning result values

```policy
function foo(n int) result[int, string] {
    it n < 0 {
        return Err("invalid")
    }
    return Ok(n)
}
```

### Matching result values

Result values can be used in match statements or expressions. The patterns are:
```
Ok(ident) => ...
Err(ident) => ...
```
Where `ident` holds the success or error value, respectively.


## Examples:

```policy
enum Err { invalid }
command Foo { ... }

function foo(n int) result[int, Err] {
    if n < 0 {
        return Err(Err::invalid)
    }
    return Ok(n)
}

function do_something() result[int, enum Err] {
    // in match expression
    let n = match foo() {
        Ok(value) => value
        Err(error) => return Err(error)
    }
    return n
}

action foo() {
    // in match statement
    match do_something() {
        Ok(value) => {
            publish Foo { ... }
        }
        Err(reason) => {
            check false
        }
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


[Planned] The `is` operator works on result values too. 

## Next steps

- Extend match patterns to allow literals, in addition to identifiers. E.g. `Ok(true)`
- Allow alternation, e.g. `Ok(2) | Ok(3)`
- Extend `is` operator to work on results, e.g. `res is Ok`.
- Update tracer to flag unused results as errors.
