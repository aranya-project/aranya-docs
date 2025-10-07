# Enumerations

```
enum Foo {
    A,
    B,
    C,
}

function is_a(v enum Foo) {
    match v {
        Foo::A => return true,
        _ => return false,
    }
}
```

Enumerations are a set of unique identifiers grouped under a single
name. They are defined in a top level [`enum` declaration](#enumerations-1).
An enumeration literal is the name of the enumeration and the name of the
item separated by `::`. So `Foo::A` is the `A` value of `Foo`, and is
distinct from `Bar::A`.

The only valid operation you can perform with an enumeration is
equality, either through the `==` operator, or via the `match`
statement. This comparison is only valid for enums of the same type.
Comparing `Foo::A` to `Bar::A` should be a compile-time error or
run-time exception.

See also the [`enum` top-level declaration](../top-level/enums.md).

<img src="enum-declaration.svg">
<img src="enum-literal.svg">