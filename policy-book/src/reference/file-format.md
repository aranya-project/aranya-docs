# File Format

The policy document is a Markdown document with YAML front matter (as
defined by [Jekyll](https://jekyllrb.com/docs/front-matter/)). Front
matter is delimited by `---` markers before and after. And, as the name
implies, it must exist at the head of the document. The YAML metadata
must specify a `policy-version` key for the version of the policy
language used.

```
---
policy-version: 2
---
... document follows
```

Only code inside code blocks marked with the `policy`
[info-strings](https://spec.commonmark.org/0.30/#info-string)
are parsed as policy code. Everything else is ignored.

~~~
# Title

Some explanatory text

```policy
// This is policy code
fact Example[]=>{}
```
~~~