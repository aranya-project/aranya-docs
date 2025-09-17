# Opaque Types

Some operations (primarily ones imported from FFI) may have "opaque"
types which can only be referenced but not directly manipulated. These
might be concrete types under the hood, but a well-written policy should
not depend on knowledge of their internal structure. A good example of
this is the `Envelope` type, use in `seal` and `open` blocks. It can
only be accessed via FFI methods.

```
command Foo {
    ...

    open {
        // `envelope` is auto-defined in `open` but cannot be used directly. Here
        // it is processed through an FFI function to produce a usable object.
        let obj = envelope::do_open(envelope)
        // `deserialize` is a built-in that turns a serialized `bytes` object into a
        // struct.
        return deserialize(obj)
    }

    ...
}
```