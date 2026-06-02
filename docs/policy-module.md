---
layout: page
title: Policy Module
permalink: "/policy-module/"
---

# Policy Module

This document describes version 1 of the policy module. A "policy module" is a compiled and serialized form of a text policy, which can be loaded into the runtime.

The policy module contains both the compiled VM instructions as well as information that lets the runtime validate that the module meets its requirements.

## Overview

The structure of the module has three main sections:

| Section | Description |
| - | - |
| Header | Magic, Module Version, and Size |
| Policy Data | Compiled policy and related information needed by runtime and VM |
| Checksum | A SHA-2-256 hash over all previous bytes |

Unless otherwise specified, all sizes are in bytes and all integers are big-endian.

## Sections

### Header

| Field | Size | Description |
| - | - | - |
| Magic | 8 | Fixed, [0x50, 0x4d, 0x4f, 0x44, 0xcb, 0xb3, 0xcc, 0xbe] "PMOD˳̾" |
| Version | 4 | Unsigned integer version number of the module format, currently 1 |
| Size | 4 | Unsigned integer size of the module in bytes, including the header and checksum |

The header is intended to minimally describe any data needed to parse other sections. In particular, storing the size allows the policy module to be easily embedded in places that do not have natural bounds, like a raw flash partition or a network stream.

### Policy Data

The policy data section is encoded using [postcard 1.x](https://docs.rs/postcard/latest/postcard/). The top level is a map with two fields:

| Field | Type | Description |
| - | - | - |
| `program` | [`Program`](#program) | Program code and execution information |
| `contract` | [`Contract`](#contract) | Metadata defining the capabilities and expectations of the module |

#### `Program`

`Program` describes operational parts of the module. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `progmem` | array of [`Instruction`](#instruction) | "Program Memory" containing all of the instructions for the module |
| `labels` | map of [`Label`](#label) -> [`u32`](#integer-types) | Maps entry point names to addresses in `progmem` |
| `globals` | map of [`Identifier`](#identifier) -> [`ConstValue`](#constvalue) | globally defined constant values |
| `codemap` | `Option<` [`CodeMap`](#codemap) `>` | Contains a copy of the source and maps instruction ranges to source lines |

#### `Contract`

`Contract` describes metadata used for module and execution validation. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `signature` | 32 byte array | A SHA-256 hash over the normalized AST |
| `actions` | array of [`ActionDefinition`](#actiondefinition) | All defined action signatures |
| `commands` | array of [`CommandDefinition`](#commanddefinition) | All defined command signatures |
| `facts` | array of [`FactDefinition`](#factdefinition) | All defined fact signatures |
| `structs` | array of [`StructDefinition`](#structdefinition) | All defined struct signatures |
| `enums` | array of [`EnumDefinition`](#enumdefinition) | All defined enum signatures |
| `ffis` | array of [`Ffi`](#ffi) | Schema for all imported FFI modules |

#### `Instruction`

`Instruction` is an enumerated value of VM instructions, with these variants:

| Variant | Data |
| - | - |
| Const | [`ConstValue`](#constvalue) |
| Identifier | [`Identifier`](#identifier) |
| Def | [`Identifier`](#identifier) |
| Get | [`Identifier`](#identifier) |
| Dup | |
| Pop | |
| Block | |
| End | |
| Jump | [`u32`](#integer-types) |
| Branch | [`u32`](#integer-types) |
| Next | |
| Last | |
| Call | [`u32`](#integer-types) |
| ExtCall | [`u32`](#integer-types), [`u32`](#integer-types) |
| Return | |
| Exit | [`ExitReason`](#exitreason) |
| Add | |
| Sub | |
| SaturatingAdd | |
| SaturatingSub | |
| Not | |
| Gt | |
| Lt | |
| Eq | |
| FactNew | [`Identifier`](#identifier) |
| FactKeySet | [`Identifier`](#identifier) |
| FactValueSet | [`Identifier`](#identifier) |
| StructNew | [`Identifier`](#identifier) |
| StructSet | [`Identifier`](#identifier) |
| StructGet | [`Identifier`](#identifier) |
| MStructSet | [`u32`](#integer-types) |
| MStructGet | [`u32`](#integer-types) |
| Cast | [`Identifier`](#identifier) |
| Wrap | [`WrapType`](#wraptype) |
| Is | [`WrapType`](#wraptype) |
| Unwrap | [`WrapType`](#wraptype) |
| Publish | |
| Create | |
| Delete | |
| Update | |
| Emit | |
| Query | |
| FactCount | [`i64`](#integer-types) |
| QueryStart | |
| QueryNext | [`Identifier`](#identifier) |
| Serialize | |
| Deserialize | |
| SaveSP | |
| RestoreSP | |
| Meta | [`Meta`](#meta) |

#### `ExitReason`

`ExitReason` describes the reasons that the VM has exited. It is an enumeration with these variants:

- Normal
- Yield
- Panic

#### WrapType

`WrapType` describes the nature of a `Wrap`, `Is`, or `Unwrap` operation. It is an enumeration with these variants:

- Ok
- Err
- Some

#### `Label`

`Label` is a struct with two fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the label |
| `ltype` | [`LabelType`](#labeltype) | The type of the label |

#### `LabelType`

`LabelType` describes the type of label and has these values:

- Action
- CommandPolicy
- CommandRecall
- CommandSeal
- CommandOpen
- Temporary
- Function

#### `ConstValue`

`ConstValue` is an enumeration of values used in the VM.

| Variant | Data |
| - | - |
| Int | [`i64`](#integer-types) |
| Bool | `bool` |
| String | [`Text`](#text) |
| Struct | [`ConstStruct`](#conststruct) |
| Enum | [`Identifier`](#identifier), [`i64`](#integer-types) |
| Option | `Option<` [`ConstValue`](#constvalue) `>` |
| Result | `Result<` [`ConstValue`](#constvalue), [`ConstValue`](#constvalue) `>` |

#### `ConstStruct`

A `ConstStruct` represents a named struct and is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the struct |
| `fields` | map of [`Identifier`](#identifier) -> [`ConstValue`](#constvalue) | The fields of the struct |

#### `CodeMap`

`CodeMap` maps between compiled instructions and source code locations. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `text` | [`Text`](#text) | The policy source |
| `mapping` | array of `(` [`u32`](#integer-types), [`Span`](#span) `)` | Maps instruction ranges from the `u32` value to the next mapping, to the span in the source text. |

#### `Span`

A `Span` is a range, represented as a tuple `(u32, u32)`. This describes a range including the first value up to, but not including, the second value. The first value must be less than or equal to the second value.

#### `ActionDefinition`

`ActionDefinition` describes an action signature. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the action |
| `persistence` | [`Persistence`](#persistence) | Whether this action is ephemeral or not |
| `params` | array of [`Field`](#field) | The argument names and types |

#### `TypeKind`

`TypeKind` is an enumeration representing the types in the VM. It has these values:

| Variant | Data |
| - | - |
| String | |
| Bytes | |
| Int | |
| Bool | |
| Id | |
| Struct | [`Identifier`](#identifier) |
| Enum | [`Identifier`](#identifier) |
| Optional | [`TypeKind`](#typekind) |
| Never | |
| Result | [`TypeKind`](#typekind), [`TypeKind`](#typekind) |

#### `CommandDefinition`

`CommandDefinition` defines the signature of a command. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the command |
| `persistence` | [`Persistence`](#persistence) | Whether this command is ephemeral or not |
| `attributes` | array of [`Attribute`](#attribute) | Attributes of the command |
| `fields` | array of [`Field`](#field) | Fields of the command |

#### `Persistence`

`Persistence` is an enumeration describing the action. It has these values:

- Persistent
- Ephemeral

#### `Attribute`

`Attribute` is a value associated with a command. It is a map with these values:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the attribute |
| `value` | [`ConstValue`](#constvalue) | The attribute value |

#### `FactDefinition`

`FactDefinition` defines the signature of a fact. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `immutable` | `bool` | An immutable fact cannot be deleted, only updated |
| `name` | [`Identifier`](#identifier) | The name of the fact |
| `key` | array of [`Field`](#field) | Names and types for the key fields |
| `value` | array of [`Field`](#field) | Names and types for the value fields |

#### `Ffi`

`Ffi` describes the interfact to an FFI module used by the policy. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the FFI module |
| `functions` | array of [`FunctionDefinition`](#functiondefinition) | The functions defined by the module |
| `structs` | array of [`u32`](#integer-types) | Indexes into `structs` in [`Contract`](#contract) |
| `enums` | array of [`u32`](#integer-types) | Indexes into `enums` in [`Contract`](#contract) |

#### `FunctionDefinition`

`FunctionDefinition` defines the signature of a function. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the function |
| `args` | array of [`Field`](#field) | The arguments to the function |
| `return_type` | [`TypeKind`](#typekind) | The return type of the function |

#### `StructDefinition`

`StructDefinition` defines the signature of a named struct. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the struct |
| `fields` | array of [`Field`](#field) | The fields of the struct |

#### `EnumDefinition`

`EnumDefinition` defines the signature of an enum. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the enum |
| `variants` | array of [`Identifier`](#identifier) | The variants of the enum |

#### `Field`

A `Field` describes a name and type. It is used in both function parameters and struct fields. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `name` | [`Identifier`](#identifier) | The name of the field |
| `ty` | [`TypeKind`](#typekind) | The type of the field |

#### `Meta`

`Meta` describes in more detail actions that the VM takes, so that those actions can be analyzed before execution time. It is an enumeration with these variants:

| Variant | Data | Description |
| - | - | - |
| Finish | `bool` | Set finish state |
| FFI | [`Identifier`](#identifier), [`Identifier`](#identifier) | FFI call to the specified module and procedure name |

#### `Text`

`Text` is a UTF-8 string value that must not contain internal null bytes. It is encoded as a postcard string.

#### `Identifier`

`Identifier` is [`Text`](#text) value that must start with a letter in the range `A-Z` or `a-z`, and can be followed by zero or more `A-Z`, `a-z`, or `0-9` characters.

#### Integer Types

Postcard encodes all integers as [`varint`](https://postcard.jamesmunns.com/wire-format#varint-encoded-integers), so the integer type serves as an upper bound for accepted values, not the size of the encoded data.

### Checksum

| Field | Size | Description |
| - | - | - |
| Checksum | 32 | SHA-2-256 checksum of all prior bytes |

The checksum is a quick data integrity check over the module. It is positioned at the end so that the calculated checksum is ready when a sequential read arrives at it. Because the header gives the module size, we know when the checksummed bytes end and the checksum begins. No stream seeking should be necessary.

## Implementation

Everything in `Program` and `Contract` already exists in some form in the V1 module format, except for `signature`. This is mostly a reorganization and formalization of those parts into a neutral format.

### `signature`

The signature describes a checksum over the source code that describes a particular policy compilation. This should be used to determine whether two policy compilations are source-identical.

The signature is a hash over the "normalized" policy AST. This is calculated as follows:

```
create a byte array B
for each element A in the AST, appearing in source order:
    append to B the postcard serialized representation of A
calculate the SHA-256 of B
```

This probably means that the signature calculation will sit somewhere in the parsing machinery, as it has to respect source order (the AST itself does not describe source order, so it cannot be used alone).