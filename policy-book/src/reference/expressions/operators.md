# Operators

In addition to these operators, parentheses (`()`) can be used to set
precedence explicitly. All overflow, underflow, range violations, and
type mismatches are errors and will produce a compile error or runtime
exception.

## Mathematical Operators

The only mathematical operators allowed are addition, subtraction, and
negation of integers.

| Operator | Meaning |
|----------|---------|
| `+`      | `A + B` adds A and B |
| `-`      | `A - B` subtracts B from A |
| `-` (unary prefix) | `-A` is the numerical negation of A |

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
| `substruct` | `A substruct B` creates a `struct B` from the fields of `A` |

## Optional Operators

| Operator | Meaning |
|----------|---------|
| `unwrap` | `unwrap A` is the value inside A if the option is Some, or else stop with a runtime exception |
| `check_unwrap` | Same as `unwrap`, but stop with a check failure instead of a runtime exception |
| `is None` | `A is None` is true if there is no value inside the optional A |
| `is Some` | `A is Some` is true if there is a value inside the optional A |

Using `is` on a non-optional value will fail with a compile error or
runtime exception.

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
