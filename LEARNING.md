# Learning: event-sourced portfolio (portfolio-es)

## Goal
Build an event-sourced portfolio app by hand (events in JSON, projections to
report tables, compensating events for mistakes, Alpaca prices) and defend
every design decision in the lead's review without help.

## Learner profile
- Level at start: writes functions, interfaces, classes, Result checks and SQL repositories by hand; has read about CQRS, aggregates, event sourcing, transactions. Shaky: inverted guards, narrowing, async/await, honest casts, discriminated unions beyond Result.
- Time per session: ~60–90 min weeknights (unconfirmed)
- Learns best by: do first, explain after; the lead's review questions as the test (unconfirmed)
- Teaching from: this repo, following docs/BUILD.md; portfolio-tracker and trading tool as reference
- Started: 2026-10-11

## Roadmap
<!-- Mirrors docs/BUILD.md. Keep step numbers stable. -->

### Module 0: setup  [todo]
- 0.1 folders, packages, tsconfig, scripts, .env  — todo

### Module 1: events and folds  [todo]
- 1.1 events.ts — event shapes as discriminated unions  — done (Deposit/Withdrawal, in app/write.ts)
- 1.2 cash.ts — cashBalance + tests  — done (fold written by hand; tests pending)
- 1.3 portfolio.ts — activeTrades, positions + tests  — todo
- 1.4 prices.ts — latestPrices + tests; checkpoint  — todo

### Module 2: decide functions  [todo]
- 2.1 decideDeposit, decideWithdrawal + tests  — done-with-help (guards fixed by Claude)
- 2.2 decideBuy, decideReverseTrade + tests  — todo
- 2.3 decidePriceFetched + tests; checkpoint  — todo

### Module 3: event store  [todo]
- 3.1 StoredEvent + EventStore interface  — todo
- 3.2 SqlEventStore (JSON payload, seq per stream, position global)  — todo
- 3.3 InMemoryEventStore  — todo
- 3.4 contract tests; checkpoint  — todo

### Module 4: commands  [todo]
- 4.1 Deps  — todo
- 4.2 deposit, reverseDeposit, buyStock, reverseTrade, refreshPrices + fake-deps tests  — todo

### Module 5: projections  [todo]
- 5.1 Projector, Checkpoints, runProjectors, rebuild  — todo
- 5.2 BalanceProjector  — todo
- 5.3 PortfolioProjector  — todo
- 5.4 SqlCheckpoints  — todo
- 5.5 ReportQueries + projection tests; checkpoint  — todo

### Module 6: Alpaca  [todo]
- 6.1 AlpacaQuoteSource, FixedQuoteSource  — todo

### Module 7: HTTP, main, UI  [todo]
- 7.1 app.ts routes + reply  — todo
- 7.2 main.ts composition root; curl proof  — todo
- 7.3 UI (generated)  — todo

### Module 8: MySQL reports (optional)  [todo]

## Concept ledger

| Concept | Status | Checked | Misses | Notes |
|---|---|---|---|---|
| Result narrowing (`if (!x.ok) return x`) | practiced | 2026-09-07 | 1 | asked why value not visible before the check; explained with the two-shapes picture |
| Guards as `!(valid)` | shaky | 2026-10-13 | 4 | recurring: missing outer parens; both decide guards inverted again (write.ts) |
| Honest casts (`as T \| undefined`) | practiced | 2026-09-07 | 1 | toDomain(undefined) crash |
| Repository get/save, upsert | practiced | 2026-09-07 | 0 | |
| CQRS read side (SQL queries class) | practiced | 2026-09-07 | 0 | |
| Composition root / Deps injection | seen | 2026-09-07 | 0 | asked "why a Deps interface"; explained as sockets/plugs |
| Class methods (no `function` keyword) | seen | 2026-09-07 | 1 | |
| Ternary | seen | 2026-09-07 | 0 | |
| Discriminated unions beyond Result | seen | 2026-10-11 | 0 | new in module 1 |
| Fold / decide split | seen | 2026-10-11 | 0 | new in module 1–2 |
| async/await in commands | seen | 2026-09-13 | 0 | only read generated code so far |
| Compensating events | seen | 2026-10-07 | 0 | lead's stance recorded |

## Review queue

| Concept | Due | Passes in a row | Last angle tried |
|---|---|---|---|
| Guards as `!(valid)` | next session | 0 | "state the valid case, negate once" |
| Honest casts | next session | 0 | "a cast is a promise; check it against the SQL" |

## Sticking points
- Guards as `!(valid)`: tried the rule statement, tried pointing at NaN. Next: a predict item with three guard variants, pick the one that rejects everything invalid.

## Session log

### 2026-10-13 (session 2, ~20 min)
- Covered: Result, tagged event interfaces, cashBalance fold, two decide functions (hand-written); SqlEventStore, commands, main generated on request
- Checkpoint: none. Miss: both guards inverted (`!a && b` instead of `!(a && b)`)
- Next: guard predict-item at session start, then tests for the fold and decides, then the UI

### 2026-10-11 (session 1, planning)
- Covered: build plan written (docs/BUILD.md); roadmap agreed pending 5 questions
- Checkpoint: none
- Next: Module 0 setup, then 1.1 events.ts
