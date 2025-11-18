# Scope

## Global Scope

Variables can be defined in global scope, which makes them available to
all other expressions in the language. This is commonly used to define
certain operational constants that will be used repeatedly. See [Global
Values](../reference/top-level/global-values.md) for more information on
what is allowed in global scope.

```
let MAX_RETRIES = 3

function retry_thing() bool {
    let state = unwrap_check query State[]=>{retries: ?}
    return state.retries > MAX_RETRIES
}
```

## Blocks

Named values are scoped to blocks. A block is usually anything enclosed
in curly brackets that contains [statements](../reference/statements.md)
&ndash; a function, an action, a command policy block, an `if` statement
block, a block expression, etc.

[`let`](../reference/statements/let.md) in an enclosing block is scoped
to that block. Using such a definition outside of that block will cause
a compile error.

```
action foo(x int) {
    if x == 1 {
        let y = 4
        publish Foo { y: y }
    }
    // This is an error - y does not exist in the outer scope
    publish Foo { y: y }
}
```

Resolving an identifier traverses upwards through enclosing scopes. The
global scope is the last scope in this search and is always present.

`let` assignments cannot assign to any names already resolvable in the
current scope. Shadowing an existing identifier this way is a compile
error.

```
action foo() {
    let x = 1
    if x == 1 {
        // This is an error - x is already defined
        let x = 4
    }
}
```