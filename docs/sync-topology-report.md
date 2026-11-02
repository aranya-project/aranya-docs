---
layout: page
title: "Sync Topology Report"
permalink: "/sync-topology-report/"
---

# Hello sync topology report

> **Snapshot:** generated on 2026-10-02 by `cargo make topology-report` from
> aranya-core commit `f99a60d6` (branch `dsl-hello-topologies`, not yet
> merged). Release build, rustc 1.97.0, on an 8-vCPU Intel Xeon Platinum
> 8488C. The round-based tables are deterministic; the wall-time numbers in
> the throughput section vary by about 10% between runs. See the sync
> explainer (aranya-docs#212) for background on the topologies.

> **Note:** the simulation runs serially in one process, so it is CPU
> constrained. Wall time measures how fast the simulator runs, not how fast
> a network would deliver commands, so results are reported in rounds. The
> throughput section is the exception: it reports wall time to show how fast
> the runtime itself writes and syncs.

Hello sync simulated in rounds, where a round stands in for one network
round trip. In each round, writers add their commands, every client whose
graph changed sends a hello to each of its subscribers, and then clients
pair up to sync. A client takes part in at most one sync per round, as
puller or as responder, so a hub serves only one spoke per round.

- **Rounds**: rounds until every client holds every command.
- **Lag**: rounds after the last write until every client holds every command.
- **Cmd/round**: commands delivered to every client per round.
- **Hellos**, **Syncs**: totals across all clients.
- **Busiest**: the most hellos sent, and the most syncs served, by any one client.

Command counts grow by 10x up to 10000. A run is abandoned after 30 s of
wall time, or earlier once its estimated time passes 30 s, and larger runs
for that client count are skipped. Only finished
runs are listed. Equal writer runs with fewer commands than clients are
skipped, since the commands cannot be split equally.

## Throughput

Wall time on this machine, unlike the rest of the report. Each round, the writers add one command each, then client 0 pulls from every client whose hello shows something new, and every client then pulls back from client 0 if its hello shows something new. Every round ends with all clients in sync.

### Two clients for 30 s

| Writers | Commands | Cmd/s |
|---|---:|---:|
| One | 622,186 | 20,739 |
| Both | 612,660 | 20,422 |

### Equal writers for 100,000 commands

At most **9** equal writers write 100,000 commands within 30 s.

| Writers | Commands | Time | Cmd/s | Within 30 s |
|---:|---:|---:|---:|---|
| 2 | 100,000 | 4.7 s | 21,101 | yes |
| 4 | 100,000 | 9.9 s | 10,074 | yes |
| 8 | 100,000 | 24.3 s | 4,119 | yes |
| 9 | 100,008 | 29.7 s | 3,368 | yes |
| 10 | 84,120 | 30.0 s | 2,803 | no |
| 12 | 62,388 | 30.0 s | 2,079 | no |
| 16 | 45,280 | 30.0 s | 1,509 | no |

## Single command propagation

One command written by the last client.

### 100 clients

| Topology | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---|---:|---:|---:|---:|---:|---:|---:|
| Hub and spoke | 99 | 98 | 0.01 | 198 | 99 | 99 | 98 |
| Ring | 99 | 98 | 0.01 | 100 | 99 | 1 | 1 |
| Two-way ring | 50 | 49 | 0.02 | 200 | 99 | 2 | 2 |
| Clique | 7 | 6 | 0.14 | 9,900 | 99 | 99 | 6 |
| Hierarchy (3 children) | 17 | 16 | 0.06 | 198 | 99 | 4 | 3 |
| Random (3 links) | 9 | 8 | 0.11 | 380 | 99 | 7 | 5 |
| Small world (1 long link) | 12 | 11 | 0.08 | 300 | 99 | 6 | 3 |

### 300 clients

| Topology | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---|---:|---:|---:|---:|---:|---:|---:|
| Hub and spoke | 299 | 298 | 0.00 | 598 | 299 | 299 | 298 |
| Ring | 299 | 298 | 0.00 | 300 | 299 | 1 | 1 |
| Two-way ring | 150 | 149 | 0.01 | 600 | 299 | 2 | 2 |
| Clique | 9 | 8 | 0.11 | 89,700 | 299 | 299 | 8 |
| Hierarchy (3 children) | 23 | 22 | 0.04 | 598 | 299 | 4 | 3 |
| Random (3 links) | 11 | 10 | 0.09 | 1,154 | 299 | 7 | 5 |
| Small world (1 long link) | 14 | 13 | 0.07 | 900 | 299 | 7 | 4 |

## Single writer

The last client writes one command per round.

### Hub and spoke

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 18 | 8 | 0.56 | 52 | 18 | 27 | 15 |
| 10 | 100 | 108 | 8 | 0.93 | 376 | 108 | 189 | 87 |
| 10 | 1,000 | 1,008 | 8 | 0.99 | 3,616 | 1,008 | 1,809 | 807 |
| 10 | 10,000 | 10,008 | 8 | 1.00 | 36,016 | 10,008 | 18,009 | 8,007 |
| 100 | 10 | 197 | 187 | 0.05 | 403 | 197 | 198 | 195 |
| 100 | 100 | 198 | 98 | 0.51 | 592 | 198 | 297 | 195 |
| 100 | 1,000 | 1,098 | 98 | 0.91 | 4,156 | 1,098 | 2,079 | 1,077 |
| 100 | 10,000 | 10,098 | 98 | 0.99 | 39,796 | 10,098 | 19,899 | 9,897 |
| 1,000 | 10 | 1,997 | 1,987 | 0.01 | 4,003 | 1,997 | 1,998 | 1,995 |
| 1,000 | 100 | 1,997 | 1,897 | 0.05 | 4,093 | 1,997 | 1,998 | 1,995 |
| 1,000 | 1,000 | 1,998 | 998 | 0.50 | 5,992 | 1,998 | 2,997 | 1,995 |

### Ring

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 18 | 8 | 0.56 | 56 | 46 | 10 | 6 |
| 10 | 100 | 108 | 8 | 0.93 | 551 | 451 | 100 | 51 |
| 10 | 1,000 | 1,008 | 8 | 0.99 | 5,501 | 4,501 | 1,000 | 501 |
| 10 | 10,000 | 10,008 | 8 | 1.00 | 55,001 | 45,001 | 10,000 | 5,001 |
| 100 | 10 | 109 | 99 | 0.09 | 604 | 594 | 10 | 6 |
| 100 | 100 | 198 | 98 | 0.51 | 5,051 | 4,951 | 100 | 51 |
| 100 | 1,000 | 1,098 | 98 | 0.91 | 50,501 | 49,501 | 1,000 | 501 |
| 100 | 10,000 | 10,098 | 98 | 0.99 | 505,001 | 495,001 | 10,000 | 5,001 |
| 1,000 | 10 | 1,009 | 999 | 0.01 | 6,004 | 5,994 | 10 | 6 |
| 1,000 | 100 | 1,099 | 999 | 0.09 | 51,049 | 50,949 | 100 | 51 |
| 1,000 | 1,000 | 1,998 | 998 | 0.50 | 500,501 | 499,501 | 1,000 | 501 |

### Two-way ring

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 14 | 4 | 0.71 | 114 | 47 | 20 | 11 |
| 10 | 100 | 104 | 4 | 0.96 | 1,068 | 434 | 200 | 101 |
| 10 | 1,000 | 1,004 | 4 | 1.00 | 10,608 | 4,304 | 2,000 | 1,001 |
| 10 | 10,000 | 10,004 | 4 | 1.00 | 106,008 | 43,004 | 20,000 | 10,001 |
| 100 | 10 | 59 | 49 | 0.17 | 1,118 | 549 | 20 | 11 |
| 100 | 100 | 149 | 49 | 0.67 | 10,104 | 4,952 | 200 | 101 |
| 100 | 1,000 | 1,049 | 49 | 0.95 | 100,158 | 49,079 | 2,000 | 1,001 |
| 100 | 10,000 | 10,049 | 49 | 1.00 | 1,000,698 | 490,349 | 20,000 | 10,001 |
| 1,000 | 10 | 509 | 499 | 0.02 | 11,018 | 5,499 | 20 | 11 |
| 1,000 | 100 | 599 | 499 | 0.17 | 101,198 | 50,499 | 200 | 101 |
| 1,000 | 1,000 | 1,499 | 499 | 0.67 | 1,001,004 | 499,502 | 2,000 | 1,001 |

### Clique

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 13 | 3 | 0.77 | 504 | 46 | 90 | 12 |
| 10 | 100 | 103 | 3 | 0.97 | 4,734 | 426 | 900 | 102 |
| 10 | 1,000 | 1,003 | 3 | 1.00 | 46,854 | 4,206 | 9,000 | 1,002 |
| 10 | 10,000 | 10,003 | 3 | 1.00 | 468,054 | 42,006 | 90,000 | 10,002 |
| 100 | 10 | 20 | 10 | 0.50 | 23,760 | 230 | 990 | 18 |
| 100 | 100 | 106 | 6 | 0.94 | 409,464 | 4,036 | 9,900 | 104 |
| 100 | 1,000 | 1,007 | 7 | 0.99 | 4,101,075 | 40,425 | 99,000 | 1,004 |
| 1,000 | 10 | 23 | 13 | 0.43 | 1,168,830 | 1,160 | 9,990 | 21 |
| 1,000 | 100 | 135 | 35 | 0.74 | 8,380,611 | 8,289 | 99,900 | 133 |

### Hierarchy (3 children)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 17 | 7 | 0.59 | 65 | 28 | 16 | 9 |
| 10 | 100 | 107 | 7 | 0.93 | 533 | 208 | 160 | 63 |
| 10 | 1,000 | 1,007 | 7 | 0.99 | 5,213 | 2,008 | 1,600 | 603 |
| 10 | 10,000 | 10,007 | 7 | 1.00 | 52,013 | 20,008 | 16,000 | 6,003 |
| 100 | 10 | 29 | 19 | 0.34 | 628 | 300 | 24 | 10 |
| 100 | 100 | 116 | 16 | 0.86 | 3,972 | 1,911 | 176 | 59 |
| 100 | 1,000 | 1,016 | 16 | 0.98 | 37,983 | 18,228 | 1,760 | 563 |
| 100 | 10,000 | 10,016 | 16 | 1.00 | 378,093 | 181,398 | 17,600 | 5,603 |
| 1,000 | 10 | 37 | 27 | 0.27 | 4,070 | 2,004 | 24 | 9 |
| 1,000 | 100 | 127 | 27 | 0.79 | 6,807 | 3,194 | 204 | 53 |
| 1,000 | 1,000 | 1,026 | 26 | 0.97 | 343,731 | 171,044 | 1,776 | 559 |

### Random (3 links)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 15 | 5 | 0.67 | 239 | 42 | 36 | 9 |
| 10 | 100 | 105 | 5 | 0.95 | 2,096 | 372 | 300 | 62 |
| 10 | 1,000 | 1,005 | 5 | 1.00 | 20,816 | 3,702 | 3,000 | 602 |
| 10 | 10,000 | 10,005 | 5 | 1.00 | 208,016 | 37,002 | 30,000 | 6,002 |
| 100 | 10 | 18 | 8 | 0.56 | 1,478 | 374 | 36 | 12 |
| 100 | 100 | 109 | 9 | 0.92 | 4,663 | 1,127 | 300 | 102 |
| 100 | 1,000 | 1,009 | 9 | 0.99 | 42,697 | 10,244 | 3,000 | 993 |
| 100 | 10,000 | 10,009 | 9 | 1.00 | 423,037 | 101,414 | 30,000 | 9,903 |
| 1,000 | 10 | 22 | 12 | 0.45 | 10,193 | 2,555 | 48 | 13 |
| 1,000 | 100 | 112 | 12 | 0.89 | 47,825 | 11,977 | 415 | 103 |
| 1,000 | 1,000 | 1,013 | 13 | 0.99 | 1,013,606 | 258,277 | 4,000 | 1,000 |

### Small world (1 long link)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 13 | 3 | 0.77 | 142 | 40 | 24 | 10 |
| 10 | 100 | 103 | 3 | 0.97 | 1,321 | 355 | 245 | 73 |
| 10 | 1,000 | 1,003 | 3 | 1.00 | 13,111 | 3,505 | 2,495 | 703 |
| 10 | 10,000 | 10,003 | 3 | 1.00 | 131,011 | 35,005 | 24,995 | 7,003 |
| 100 | 10 | 21 | 11 | 0.48 | 1,255 | 415 | 30 | 11 |
| 100 | 100 | 111 | 11 | 0.90 | 9,769 | 3,211 | 200 | 101 |
| 100 | 1,000 | 1,011 | 11 | 0.99 | 95,799 | 31,494 | 2,000 | 1,001 |
| 100 | 10,000 | 10,011 | 11 | 1.00 | 950,079 | 312,384 | 20,000 | 10,001 |
| 1,000 | 10 | 25 | 15 | 0.40 | 12,062 | 3,997 | 50 | 14 |
| 1,000 | 100 | 115 | 15 | 0.87 | 114,313 | 38,098 | 500 | 104 |
| 1,000 | 1,000 | 1,016 | 16 | 0.98 | 1,043,637 | 347,138 | 5,000 | 1,003 |

## Equal writers

Every client writes one command per round until each has written an equal share.

### Hub and spoke

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 69 | 68 | 0.14 | 159 | 69 | 90 | 60 |
| 10 | 100 | 77 | 67 | 1.30 | 320 | 77 | 171 | 68 |
| 10 | 1,000 | 167 | 67 | 5.99 | 1,940 | 167 | 981 | 149 |
| 100 | 100 | 6,699 | 6,698 | 0.01 | 16,599 | 6,699 | 9,900 | 6,600 |

### Ring

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 10 | 9 | 1.00 | 60 | 50 | 6 | 5 |
| 10 | 100 | 19 | 9 | 5.26 | 150 | 95 | 15 | 10 |
| 10 | 1,000 | 109 | 9 | 9.17 | 1,050 | 545 | 105 | 55 |
| 10 | 10,000 | 1,009 | 9 | 9.91 | 10,050 | 5,045 | 1,005 | 505 |
| 100 | 100 | 100 | 99 | 1.00 | 5,100 | 5,000 | 51 | 50 |

### Two-way ring

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 10 | 9 | 1.00 | 108 | 44 | 12 | 5 |
| 10 | 100 | 20 | 10 | 5.00 | 292 | 91 | 30 | 11 |
| 10 | 1,000 | 110 | 10 | 9.09 | 2,092 | 541 | 210 | 65 |
| 10 | 10,000 | 1,010 | 10 | 9.90 | 20,092 | 5,041 | 2,010 | 605 |
| 100 | 100 | 100 | 99 | 1.00 | 7,848 | 3,824 | 102 | 50 |

### Clique

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 19 | 18 | 0.53 | 450 | 55 | 63 | 16 |
| 10 | 100 | 24 | 14 | 4.17 | 1,197 | 102 | 126 | 19 |
| 10 | 1,000 | 114 | 14 | 8.77 | 9,297 | 552 | 936 | 100 |
| 10 | 10,000 | 1,014 | 14 | 9.86 | 90,297 | 5,052 | 9,036 | 910 |
| 100 | 100 | 199 | 198 | 0.50 | 178,398 | 6,552 | 2,475 | 196 |

### Hierarchy (3 children)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 22 | 21 | 0.45 | 118 | 46 | 32 | 14 |
| 10 | 100 | 31 | 21 | 3.23 | 271 | 65 | 64 | 21 |
| 10 | 1,000 | 121 | 21 | 8.26 | 1,891 | 281 | 424 | 102 |
| 100 | 100 | 36 | 35 | 2.78 | 1,406 | 525 | 48 | 16 |

### Random (3 links)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 18 | 17 | 0.56 | 274 | 62 | 40 | 14 |
| 10 | 100 | 27 | 17 | 3.70 | 673 | 98 | 98 | 23 |
| 10 | 1,000 | 123 | 23 | 8.13 | 4,872 | 484 | 735 | 108 |
| 100 | 100 | 54 | 53 | 1.85 | 6,067 | 1,759 | 174 | 31 |

### Small world (1 long link)

| Clients | Commands | Rounds | Lag | Cmd/round | Hellos | Syncs | Busiest: hellos | Busiest: served |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 | 10 | 14 | 13 | 0.71 | 175 | 56 | 30 | 9 |
| 10 | 100 | 20 | 10 | 5.00 | 415 | 88 | 70 | 17 |
| 10 | 1,000 | 110 | 10 | 9.09 | 3,115 | 538 | 520 | 98 |
| 10 | 10,000 | 1,010 | 10 | 9.90 | 30,115 | 5,038 | 5,020 | 908 |
| 100 | 100 | 35 | 34 | 2.86 | 3,788 | 1,293 | 78 | 22 |
