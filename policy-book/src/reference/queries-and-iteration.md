# Queries and Iteration

For fact queries that can match or operate on multiple facts, we define
an ordering over their key values. The first key field has priority,
then the second, etc, and fields are sorted in order defined by this
table.

| Type     | Order |
|----------|-------|
| `int`    | ascending numerically |
| `string` | ascending by unicode codepoint, the leftmost character is most significant |
| `bytes`  | ascending by byte value, the leftmost byte is most significant |
| `bool`   | `false`, then `true` |
| `id`     | ascending by byte value, the leftmost byte is most significant |