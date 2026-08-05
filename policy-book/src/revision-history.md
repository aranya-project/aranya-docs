# Revision History

This lists major changes to the documentation over time.

## Revision C (August 2026)

- Added [Result Types](reference/types/result.md) and the optional
  [return type of actions](reference/top-level/actions.md#return-type),
  which lets an action report failure to the application.
- Added the optional coalescing operator
  [`or`](reference/types/optional.md#coalescing-with-or).
- [`check`](reference/statements/check.md) now requires an `else`
  clause naming a terminal expression (`return`, `recall`, or `todo()`),
  which decides how the failure is reported.
- [Recall blocks](reference/top-level/commands.md#recall-block) are now
  named and can take parameters, and a command can define more than one.
- Removed the `unwrap` and `check_unwrap` operators, which are replaced
  by `or`.

## Revision B (January 2026)

- Removed math operators and added built-in math functions.

## Revision A (October 2025)

The reference sections makes several changes from the original policy specs:

- What was originally called the "weave" is now the "braid".
- [Operator Precedence](reference/expressions/operators.md) has been
  updated to include new struct operators.
