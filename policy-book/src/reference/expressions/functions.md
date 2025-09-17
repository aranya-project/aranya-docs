# Functions

Aranya Policy Language can define functions (see [Function
Declarations](../top-level/functions.md)), which can be called inside an
expression in the usual way.

```policy
function increment(x int) int {
    return x + 1
}

function increment_twice(x int) int {
    return increment(increment(x))
}
```

<img src="function-call.svg">

FFI functions can be called similarly, but must be specified with their
library name.

```policy
use math

function increment_twice(x int) int {
    return math::add(x, 2)
}
```

<img src="ffi-function-call.svg">

In addition to these functions, there are operator-like internal functions
that work similarly, described in the next subsections.