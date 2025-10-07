# Structs

```
struct MyStruct {
    a int,
    b string,
}
```

Arbitrary struct types can be defined in `struct` blocks. To use these
types in parameters, fields, or return types, use `struct ❮name❯`. e.g.

```
function foo(s struct MyStruct) { ... }
function makeStruct() struct MyStruct { ... }
struct InteriorStruct { thing struct MyStruct }
```

Any type may be used for struct fields except opaque types, though
further restrictions may be enforced when the structs are used with
`publish` and `emit` statements.

## Struct Definition Field Insertion

When defining a struct, you can refer to a previously defined struct to
insert those field definitions into your struct. For example, this:

```
struct Foo {
    a int,
    b bool,
}

struct Bar {
    +Foo,
    c string,
}
```

Defines `Bar` equivalently to specifying fields `a`, `b`, and `c`
explicitly. This also works in command fields:

```
command Baz {
    fields {
        +Bar,
        d optional bytes,
    }
    ...
}
```

As well as effects. Fields are inserted in the order specified by the
referenced struct. Expansion happens as the struct is compiled. You can
only refer to a struct that has been previously defined (though because
commands may be compiled in a later pass, all structs may be defined at
that point). Multiple references can be made, and they can be inserted
anywhere in the struct.

Duplicate fields from referenced struct definitions are a
compile error, e.g.

```
struct A { x int }
struct B { +A, x int }
```

Struct `B` will cause an error because `x` is already defined in `A`.