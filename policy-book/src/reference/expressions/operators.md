# Operators

In addition to these operators, parentheses (`()`) can be used to set
precedence explicitly. All overflow, underflow, range violations, and
type mismatches are errors and will produce a compile error or runtime
exception.

## Mathematical Operators

There are no mathematical operators in the policy language. See [Math Functions](functions/math.md) for safe methods to do addition and
subtraction.

## Numerical Comparison Operators

Integers can be compared against each other.

| Operator | Meaning |
|----------|---------|
| `>`      | `A > B` is true if A is greater than B |
| `<`      | `A < B` is true if A is less than B |
| `>=`     | `A >= B` is true if A is greater than or equal to B |
| `<=`     | `A <= B` is true if A is less than or equal to B |
| `==`     | `A == B` is true if A is equal to B |
| `!=`     | `A != B` is true if A is not equal to B |

## Logical Operators

| Operator | Meaning |
|----------|---------|
| `&&`     | `A && B` is true if A and B are both true |
| `\|\|`   | `A \|\| B` is true if A or B are true |
| `!`      | `!A` is the logical negation of A |

## Struct Operators

| Operator | Meaning |
|----------|---------|
| `.`      | `A.B` accesses field B in struct A |
| `as` | `A as B` creates a `struct B` from the fields of `A` only if the two struct types have the same fields |
| `substruct` | `A substruct B` creates a `struct B` from the fields of `A` only if the fields of `struct B` are a subset of `A`|

## Optional Operators

| Operator | Meaning |
|----------|---------|
| `unwrap` | `unwrap A` is the value inside A if the option is Some, or else stop with a [runtime exception](../errors.md#runtime-exceptions) |
| `check_unwrap` | Same as `unwrap`, but stop with a [check failure](../errors.md#check-failures) instead of a runtime exception |
| `is None` | `A is None` is true if there is no value inside the optional A |
| `is Some` | `A is Some` is true if there is a value inside the optional A |
| `or` | `A or B` evaluates to the value inside A if it is Some, otherwise evaluates to B |

Using `is` on a non-optional value will fail with a compile error or
runtime exception.

The `or` operator requires A to be `optional[T]` and B to be of type `T`.
The result type is `T`. B is only evaluated when A is None (short-circuit
evaluation). `or` is right-associative, so `a or b or c` is parsed as
`a or (b or c)`.

```
let x = Some(1)
let y = None

let a = Some(1) or 0    // a = 1
let b = None or 0       // b = 0

// chaining: evaluates left to right, stopping at the first Some.
// c = 1
let c = None or Some(1) or 42
```

### Nested optionals

`or` peels just one layer of optionality. When A is `optional[optional[T]]`,
the inner type is `optional[T]`, so B must also be `optional[T]` and the result
is `optional[T]`, not `T`.

| Value of A | Result of `A or B` |
|---|---|
| `None` | B (outer is absent) |
| `Some(Some(v))` | `Some(v)` |
| `Some(None)` | `None` (outer is present; its inner value is returned, B is not evaluated) |

The `Some(None)` case means `or` does not flatten nested optionals. To collapse
`optional[optional[T]]` all the way to `T`, apply `or` twice:

```policy
let inner = Some(Some(1)) or Some(0)  // optional[int]
let value = inner or 0    // int
```

## Operator Precedence

| Priority | Op |
|----------|----|
| 1        | `.` |
| 2        | `substruct`, `as` |
| 3        | `-` (prefix), `!`, `unwrap`, `check_unwrap` |
| 4        | `+`, `-` (infix) |
| 5        | `>`, `<`, `>=`, `<=`, `is` |
| 6        | `==`, `!=` |
| 7        | `&&`, `\|\|` |
| 8        | `or` |
