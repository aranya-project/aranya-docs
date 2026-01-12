# Effects

```
effect FooEffect {
    a int,
    b string dynamic,
}
```

An effect is a specific kind of struct declaration for information sent
to the application. Effects are used in `emit` statements in `finish`
blocks inside command `policy`.

Effect field types can be any type except for opaque values, the [same
as for the value side of Facts](facts.md). Struct fields must obey the
same restriction. You can use [Struct Definition Field
Insertion](structs.md#struct-definition-field-insertion) to define the
fields of an effect with a previously defined struct.

Effects delivered through the application API report the ID and recall
status of the Command that emitted them. Because commands may be
reevaluated after syncing and merging, effects can be issued multiple
times. An application might use the command ID and recall status to
filter out duplicate effects.

The `dynamic` keyword is an annotation used to indicate to the effect
consumer that the value is not based on static data and may change in
future evaluations. It has no effect on policy execution.