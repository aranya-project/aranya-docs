# Obligations Checker

This note captures some of the high level ideas about the obligations checker proposal.

## Motivation

While the design of the Policy Language prevents many types of errors, there is still lots of room for improvement towards supporting policy writers. This work intends to make two improvements to the static guarantees the policy compiler provides.

 1. The first improvement will be to guarantee that runtime exceptions can not exist in a policy.
 2. Later work will continue by statically ensuring relational invariants between different facts.

While these seem like they are orthogonal work, they will use the same mechanisms of Obligations and Observations to reason about policies.

## Exceptions
In the policy language exceptions are distinct from check failures. They do not invoke error handling through `recall` instead causing the runtime to panic. If a policy triggers a panic, it is assumed that system is in a state the developers did not consider and it is therefore unsafe to continue forward. In this situation the client must stop working with the graph.

Avoiding exceptions is therefore highly important for any policy. Today it is up to the developers to ensure that guards are in place to avoid exceptions, but there is no way to check this requirement.

Conceptually, any operation that could fail with a runtime exception creates an obligation that developers must add a guard statement which protects against the exception occurring. This proposal intends to formalize these obligations and add an analyzer that statically ensures that all guards are in place.

> **Note:** There are two classes of obligations, ones on the program flow and ones on the runtime. This work does not cover obligations on the runtime such as ensuring there is enough memory or other resources to execute a command. That is important work but out of scope for this proposal.

### Obligations
 | Operation | Obligation |
 |----------- | ----------- |
 | Insert Fact | There must currently be no fact with the same key as the key used in the insert statement. 
 | Update Fact | There must exist a fact with the key provided. |
 | Delete Fact | The provided key must exist in the FactDB. |
 | Single Mutation | Any key in the FactDB may be mutated only once in any finish block. |
 | `unwrap` | The option to be unwrapped must not be `None`. |

Each of the obligations are due prior to the operation being executed.

> **DISCUSSION**: After thinking implementing checks on update where would be extra work and I wonder if it's worth it. Does putting the invariant in the update as well as a check help?

> **Note:** The current language also has runtime exceptions from arithmetic underflow and overflow but these are being addressed in other work by moving to checked arithmetic.

## Analysis
The analyzer must make observations about the control flow allow it to ensure that all obligations are satisfied before they are due or issue an error.

An observation is any `check` expression or branch where the operation which creates the obligation is only reachable if the test passes. Ex:

### Check Observation
```policy
command SetBalance {
    fields {
        user id,
        amount int,
    }

    policy {
        let maby_account = query Account[id: this.user]

        // Provieds observation that `Account[id: this.user]` exists
        check maby_account is Some 
        
        finish {
            update Account[id: this.user] to {balance: this.amount}
        }
    }
    ...
}
```

The observation needs to be about the query but the check is on the result of the query. To enable this I prepose we extend the type of the result during analysis to include the queried key. In the above this would change the type of `maby_account` from `Option<Account>` to `Option<Account> where key [id: this.user]`. Then we make the observation that `Account[id: this.user] exists` and `maby_account is Some` past the check of `maby_account`. If `check_unwarap` had been used:

```policy
    let account = check_unwrap maby_account
```

We could also observe that `Account[id: this.user] exists` and by inference that ``Account[id: account.id] exists`.

In the initial implementation we should track these observations over symbols and not values. That means we can not track observations though assignments. For example:

```policy
    let account = check_unwrap maby_account
    let account_id = account.id
```

would **not** lead to the observation that ``Account[id: account_id] exists`

This limitation may be removed in the future but will reduce the complexity of the initial implementation.

> When we want to do this we could do it by giving each *value* and name and track the names. This would mean that `account_id` and `account.id` resolve to the same value name and the observation would be about the value and not the symbol that contains it. 

### Branch Observation

The `if` and `match` statements when tested against `val is Some` or `val is None` produce the observation much like check but can also produce inverse observations for false branches.

### Observations

| Operation | Truth | Observation |
| --------- | ----- | ----------- |
| `value is Some` | true |`value is Some`, If value is result of query `exists Fact[...]` |
| `value is Some` | false | If value is result of query `no Fact[...]` |
| `value is None` | true | If value is result of query `no Fact[...]` |
| `value is None` | false | `value is Some`, If value is result of query `exists Fact[...]` |
| `check_unwrap value` | true | `value is Some`, If value is result of query `exists Fact[...]` |

In addition any mutations of fact (`insert`, `update`, `delete`)  creates a `mutated Fact[...]` observation.


## "monomorphism"
To simplify the analysis we also "monomorphism" over flow control. This is possible because we don't allow recursion or iteration in policy so something like:
```policy

if (a == true) {
    check a
} else {
    check b
}

do_something()
```
becomes two different executions with no branching:

```policy
check a
do_something()
```
and 
```policy
check b
do_something()
```
which are each analyzed independently.

> **Note:** We don't have to do the expansion and then analyze we can instead checkpoint the analysis at each branching point and role back to there once one side of the branch is checked and continue down the other branch.

**BUG**: 
This simple analysis my explore branches which are not reachable and if any of those have unmet obligations then the analyzer will produce a false negative. 

 ```policy
if (a == true) {
    check a
} else {
    check b
}

if (a == true) {
    obglation on a
} else {
    oblagation on b
}
```
With this approach if you have two `if else` block where one has checks that create observations and the second set has the oblations this will not pass check because the analyses will see this as four possible paths instead to two. (With two of them failing)

We should implement this approach and see how hard it is to work around as a way to make the initial implementation easier to ship.

## Relational Invariants

This is future work so is only lightly described here.

This feature adds new syntax to the description of the fact schema as well as creating new obligations. The goal is to allow the policy writer to express invariants of the data model and extend the obligations analyzer to ensure that they are maintained.

The initial implementation will support expressing "one to one" and "many to one" relations between the full key value pair of one fact, and the key of another.

For this discussion I will use the preposed new keyword `implies`:

```policy
fact Foo[foo_id id]=>{bar_id id} implies Bar[bar_id: bar_id, foo_id: foo_id]
```
This statement would create a oblation that if a `Foo` is inserted or updated that by the end of the finish block there must be an observation `exists Bar[bar_id: bar_id, foo_id: foo_id]`. I want to emphasize that the oblation is due at the end of the finish block and not at the time of the mutation of `Foo`.

The analyses would also be extended to cause mutation of facts to make `exists Fact[...]` and  `no Fact[...]` observations.

If we wanted to make the above a "one to one" relation we would have to put `bar_id` in the key of `Foo` and create in inverse implication:

```policy
fact Foo[foo_id id, bar_id id]=>{} implies Bar[bar_id: bar_id, foo_id: foo_id]
fact  Bar[bar_id: bar_id, foo_id: foo_id] => {...} implies Foo[foo_id id, bar_id id]
```

> **Note:** This is kind of annoyingly limited because our observation stack as preposed can only make observations about the existence or non existence of fact keys. Where this is still useful it is worth considering if we can reason about other fact values as well as keys.
>
> This might be possible if we made additional observations about values:
> `exists Foo[...]=>{value1 = _value_}, exists Foo[...]=>{value2 = _value_}`
>
>I think to make this work we would have to do the value analysis vs the var analysis as we would need to handle constant values and not just labeled values.
