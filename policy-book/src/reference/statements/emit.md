# emit

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ❌ |
| `function` | ❌ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ❌ |
| `finish` | ✅ |
| `finish function` | ✅ |

</div>

```
emit FooEffect {
    a: 3,
    b: "hello",
}
```

`emit` submits an effect to the application interface. The effect must
be a struct previously defined by an [`effect`
declaration](../top-level/effects.md). Effects are delivered to the
application in the order that they are produced.