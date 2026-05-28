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

The policy data section is encoded using CBOR. The top level is a map with two fields:

| Field | Type | Description |
| - | - | - |
| `program` | `ModuleProgram` | Program code and execution information |
| `contract` | `ModuleContract` | Metadata defining the capabilities and expectations of the module |

#### `ModuleProgram`

`ModuleProgram` describes operational parts of the module. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `progmem` | array of `Instruction` | "Program Memory" containing all of the instructions for the module |
| `labels` | map of `Label` -> `usize` | Maps entry point names to addresses in `progmem` |
| `globals` | map of `Identifier` -> `ConstValue` | globally defined constant values |
| `codemap` | `Option<CodeMap>` | Contains a copy of the source and maps instruction ranges to source lines |

#### `ModuleContract`

`ModuleContract` describes metadata used for module and execution validation. It is a map with these fields:

| Field | Type | Description |
| - | - | - |
| `serial` | 32-bit unsigned integer | A sequential identifier for policies |
| `actions` | array of `ActionDef` | All defined action signatures |
| `commands` | array of `CommandDef` | All defined command signatures |
| `facts` | array of `FactDefinition` | All defined fact signatures |
| `structs` | map of `Identifier` -> (array of `FieldDefinition`) | All defined struct signatures |
| `enums` | map of `Identifier` -> (map of `Identifier` -> `i64`) | All defined enum signatures |
| `ffis` | array of `FfiContract` | FFI schema to compare against VM implementation |

### Checksum

| Field | Size | Description |
| - | - | - |
| Checksum | 32 | SHA-2-256 checksum of all prior bytes |

The checksum is a quick data integrity check over the module. It is positioned at the end so that the calculated checksum is ready when a sequential read arrives at it. Because the header gives the module size, we know when the checksummed bytes end and the checksum begins. No stream seeking should be necessary.

## Implementation

Everything in `ModuleProgram` and `ModuleContract` already exists in the V1 module format, except for `serial`. This is mostly a reorganization of those parts.

The serial number should be specified in the module source, in the front matter.

```
---
policy-version: 2
policy-serial: 25
---
```

An absent `policy-serial` field is equivalent to 0.