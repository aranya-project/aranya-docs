# Serialize and Deserialize

```policy
command Foo {
    ...

    seal {
        let bytes = serialize(this)
        return envelope::new(bytes)
    }

    open {
        let fields = deserialize(envelope::payload(envelope))
        return fields
    }

    ...
}
```

These functions turn command structs into bytes and vice versa.

`serialize()` takes a `struct` argument (of any kind) and produces a
serialized `bytes` representation. It can only be used in a `seal`
block.

`deserialize()` takes a `bytes` argument and produces a `struct`. It can
only be used inside a `open` block.
