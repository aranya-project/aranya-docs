# Basic Syntax

## Whitespace

Whitespace is not significant in Aranya Policy Language. Whitespace is
any sequence of spaces, tabs, and newlines (which includes `\n`, `\r\n`,
and `\r`).

<img src="basic-syntax-whitespace.svg">

## Comments

Comments are C99-style, supporting both block comments(`/* */`) and
line comments (`//`).

```policy
/* This is a block comment
   It can span multiple lines
 */
function foo() {
    // This is a line comment
    let x = query Foo[]=>{x: 3}
}
```

<img src="basic-syntax-comments.svg">

## Identifiers

Identifiers are the names of items in the language - commands, actions,
variables, etc. An identifier must start with an ASCII alphabetic
character, followed by zero or more ASCII alphanumeric characters or
underscore.

<img src="basic-syntax-identifiers.svg">

## Reserved words

Identifiers cannot use names defined by the language, including types
(`int`, `string`, etc.), top-level declarations (`command`, `emit`,
etc.), statements (`check`, `let`, etc.), and expressions (`query`,
`if`, etc.).