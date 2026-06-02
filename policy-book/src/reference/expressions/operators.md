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

### Coalescing `or`

The `or` operator requires the LHS to be `optional[T]` and the RHS to be of type `T`.
The result type is `T`. The RHS is only evaluated when the LHS is None (short-circuit evaluation).

```policy
let a = Some(5) or foo() // c = 5, foo() not called
let b = None or Some(0)  // b = Some(0), RHS not unwraped
```

#### Associativity and evaluation order

`or` is right-associative, so `a or b or c` is parsed as `a or (b or c)`. Evaluation order is
left-to-right, meaning if both sides are non-None, the left side is chosen.

```policy
let one = None or Some(1) or 42 
// None or (Some(1) or 42) -> None or 1 -> 1
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
