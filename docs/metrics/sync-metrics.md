# Sync Metrics

Throughput measurements for Aranya graph synchronization between two
peers.

## Metric: commands per second

Each command delivered to each receiving client counts:

```
commands per second = (commands × receiving clients) / elapsed seconds
```

Elapsed time is the wall-clock runtime of the workload, which includes
command generation and policy evaluation as well as the sync itself —
numbers are conservative and best used for comparing scenarios, not as
absolute sync throughput.

## Sync method

Both scenarios use hello sync with notifications debounced to one per
100 graph changes, so commands transfer in batches of ~100 per sync.
This is the best configuration for fsync-bound storage: 100 commands
is the most one sync response can carry, so the subscriber commits
once per 100 commands. Immediate notification (sync per write) is
about 2× slower on ext4, and a larger debounce interval showed no
further gain. The trade-off is staleness: the subscriber runs up to
100 commands behind the writer.

## Scenario 1: no branching

One peer writes 1,000 commands; the other only subscribes and receives
them in batched syncs. The graph is a single linear chain with no
merges.

| Storage | Runtime (median of 3) | Commands/sec |
|---|---|---|
| In-memory | 0.13 s | ~7,700 |
| File-backed, tmpfs | 0.25 s | ~4,000 |
| File-backed, ext4 (fsync) | 21.3 s | ~47 |

On ext4 the runtime is dominated by the writer's 1,000 durable
commits; the subscriber's ~10 batched commits add little.

## Scenario 2: small branching

Same as scenario 1, except the second peer also writes once every 100
commands. Each of those writes lands on a head up to 100 commands
stale, opening a branch that is merged on the next sync — 9 branches
across the 1,000-command run.

| Storage | Runtime (median of 3) | Commands/sec |
|---|---|---|
| In-memory | 0.28 s | ~3,600 |
| File-backed, tmpfs | 0.48 s | ~2,100 |
| File-backed, ext4 (fsync) | 22.1 s | ~45 |

Relative to scenario 1, small branching costs ~4% on fsync-bound ext4,
where durable command commits dominate. The relative cost is larger on
fast storage (0.28 s vs 0.13 s in-memory), where merge handling and
the second sync direction are a bigger share of the total.

## Environment

- Intel Xeon Platinum 8488C, 8 vCPUs, 30 GiB RAM (AWS, EBS root volume)
- Linux 6.8.0-1029-aws
- rustc 1.90.0, `release` profile
- Measured 2026-06-11
