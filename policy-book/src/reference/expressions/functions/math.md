# Math Functions

Addition and subtraction come in two varieties, one which returns an
optional indicating overflow/underflow conditions, and a "saturating"
version which clamps the value at the minimum/maximum values for an
[`int`](../../types/basic.md#int) (-9223372036854775808 to
9223372036854775807). There are no "wrapping" versions of these
operations.

# `add(x int, y int) option[int]`

`add` calculates `x + y`, returning the sum as an `optional[int]`. The
optional is `Some(x + y)` if addition succeeds without overflow or
underflow, or `None` if it does not.

# `saturating_add(x int, y int) int`

`saturating_add` calculates `x + y`, returning the sum as an `int`.
Instead of overflowing or overflowing, it clamps the result to the
bounds of what can be represented in an `int`.

# `sub(x int, y int) option[int]`

`sub` calculates `x - y`, returning the difference as an
`optional[int]`. The optional is `Some(x - y)` if subtraction succeeds
without overflow or underflow, or `None` if it does not.

# `saturating_sub(x int, y int) int`

`saturating_sub` calculates `x - y`, returning the difference as an
`int`. Instead of overflowing or underflowing, it clamps the result to
the bounds of what can be represented in an `int`.