# Math Functions

# `add(x int, y int) option[int]`

`add` adds `x` and `y` and returns an `optional[int]`. The optional is
`Some(x + y)` if addition succeeds without overflow, and `None` if it
does not.

# `saturating_add(x int, y int) int`

`saturating_add` adds `x` and `y` and returns an `int`. Instead of
overflowing, it clamps the maximum value at `i64::MAX`
(9223372036854775807).

# `sub(x int, y int) option[int]`

`sub` subtracts `y` from `x` and returns an `optional[int]`. The
optional is `Some(x - y)` if subtraction succeeds without underflow, and
`None` if it does not.

# `saturating_sub(x int, y int) int`

`saturating_sub` subtracts `y` from `x` and returns an `int`. Instead of
underflowing, it clamps the maximum value at `i64::MIN`
(-9223372036854775808).