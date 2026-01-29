---
layout: page
title: Observability Analysis Tools
permalink: "/observability/analysis"
---

# Analysis Tools

Reference for the `aranya-debug` CLI used to configure, collect, and analyze Aranya observability data.

## Overview

`aranya-debug` is the main tool for debugging Aranya deployments. It has three subcommands:

1. `configure` - Configure logging without manual config edits
2. `bundle` - Collect logs, state, and metrics for offline analysis
3. `analyze` - Parse and analyze collected data

## Global Options

All `aranya-debug` commands support these options:

```bash
aranya-debug [OPTIONS] <COMMAND>

Options:
  -v, --verbose          Increase verbosity (can repeat: -vv, -vvv)
  -q, --quiet            Suppress non-error output
  -o, --output <FORMAT>  Output format: text (default), json, csv
  --no-color             Disable colored output
  -h, --help             Show help
  --version              Show version
```

## Command usage

TODO

## Possible Capabilities of aranya-debug tool usage

1. Configure daemon logging
2. Show current logging config
3. Collect and bundle logs from multiple devices
4. Summarize all logs
5. Filter logs by time range
6. Focus on specific component logs
7. Focus on specific device logs
8. Get a timeline of peer syncs
9. Detect issues (stall/timeout/authorization failure)
10. Generate sync topology graph
11. Generate performance reports
12. Identify bottlenecks
13. Compare graph state before and after