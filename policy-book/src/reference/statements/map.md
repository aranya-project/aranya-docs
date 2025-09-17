# map

<div class="right">

| Scope  | |
|--------|----|
| global | ❌ |
| `action` | ✅ |
| `function` | ❌ |
| `policy`/`recall` | ❌ |
| `seal`/`open` | ❌ |
| `finish` | ❌ |
| `finish function` | ❌ |

</div>

```
map FooCounter[deviceID: ?]=>{count: ?} as counter {
    check counter.count > 0
}
```

`map` executes a fact query, and for each fact found, defines the given
name as a struct containing the bound fields. This can result in zero
or more iterations.

You can think of this kind of like a for loop over all possible matching
facts. The name given after `as` is scoped to the block.

Like `query` and related functions, fact values or the entire value part
of the fact literal can be omitted. And likewise, bind values must
[follow the positioning
rules](../expressions/functions/queries.md#bind-marker).