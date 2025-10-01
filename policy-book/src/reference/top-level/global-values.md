# Global Values

```
let x = 3
let default_name = "default"
```

Using `let` in global scope defines a global value. The value can be
used like a `let` in any other scope, and the same rules about
redefining names applies - `let` in a more specific scope cannot
redefine a name defined in global scope.

Values defined this way can only be `int`, `string`, `bool`, or `enum`
constants; a `struct`; or a field reference to a previously defined
global struct. Struct fields must be restricted to these types as well.
The initializer expression cannot access facts.

```
let x = 3               // OK
let xx = 3 + 5          // Not OK; not a constant
let y = query Fact[]    // Not OK; accesses facts
let z = f()             // Not OK; cannot call functions
let a = MyEnum::B       // OK
let s = MyStruct {
    a: 3,               // struct fields are allowed types
    b: MyEnum::A,
}
let v = s.a             // reference to previously defined
                        // global struct
```