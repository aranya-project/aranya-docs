# Todo

```policy
action foo(type enum Bar) {
    let x = if type == Bar::Done {
        1
    } else {
        todo()
    }
}
```

`todo()` simply exits with a runtime error. It is intended to be used
during development to stub out things you haven't finished. It can only
be compiled in debug mode. It produces a compile error otherwise.