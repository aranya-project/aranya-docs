# Basic Types

## `int`

A 64-bit two's complement signed integer.

```
let x = 3
let y = -42
let z = 1048576
```

<img src="int-literal.svg">

## `bool`

A boolean. `true` and `false` are literal bool values.

```
let is_cool = true
```

<img src="bool-literal.svg">

## `string`

A UTF-8 encoded string with no internal null bytes.

Literal string values are surrounded by double-quotes (`"`). String
literals support escapes for `\n`, `\"`, `\\`, and two-digit hex escapes
`\xNN`.

```
let s = "Hello my name is \"Fred\""
let t = "Control Characters:\n STX \x01 BEL \x07"
//let u = "Null-terminated\x00"  // internal null byte not allowed!
```

<img src="string-literal.svg">

## `bytes`

Bytes represents an arbitrary byte sequence. It is similar to a
`string`, but it provides no validation for its contents, nor any way to
specify a literal. The `id` type below is similar, but fixed-length and
should be preferred specifically for identifier types.

## `id`

An opaque type for object identifiers. It is not possible to specify
literal `id`s.