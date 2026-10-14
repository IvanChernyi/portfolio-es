# Build instructions — event-sourced portfolio (hand-written)

You type every file under `src/` and `tests/`. The UI is generated at the end.
Each module ends with tests green. Do not start a module until the previous
one's tests pass.

Rules in force: the trading-tool rulebook (pure core, thin edges, Result
errors, opaque ids, composition root last) plus the lead's event-sourcing
stance: **events are never edited or deleted; mistakes are fixed by
compensating events.**

## Decisions already made (change them if the answers to the questions say so)

| Topic | Decision |
|---|---|
| Streams | Three: `cash`, `portfolio`, `prices`. One table, one row per event, payload as JSON text |
| Compensation | In the same stream as the thing it corrects, with a `corrects` field holding the original event id |
| Event store | SQLite file `data/events.sqlite` |
| Reports | A second SQLite file `data/reports.sqlite` (swap for MySQL later, see module 8) |
| Projections | Run in-process right after every append; checkpoint per projector; `rebuild` wipes and replays |
| Cash check on buy | Fold the `cash` stream at command time. A policy, not a hard invariant across streams |
| Ids | `crypto.randomUUID()` from `deps.newId()`; events carry their own id |

## Vocabulary

- **Event**: a fact, past tense, JSON payload. `DepositMade`, not `Deposit`.
- **Stream**: all events of one aggregate, ordered by `seq`.
- **Fold**: a pure function from a list of events to a value (`cashBalance`).
- **Decide**: a pure function from (current facts, input) to `Result<event>`.
  It is the event-sourcing shape of last month's transition functions:
  instead of returning the new state, it returns the event; the state is
  `fold(history + event)`.
- **Projector**: applies events to a report table. Idempotent per event.
- **Checkpoint**: the last global position a projector has applied.

---

## Module 0 — setup (15 min, commands only)

```
mkdir C:\Users\IVAN\portfolio-es && cd C:\Users\IVAN\portfolio-es
git init
npm init -y
npm install better-sqlite3 express
npm install -D typescript tsx @types/node @types/better-sqlite3 @types/express
mkdir src\domain src\commands src\storage src\projections src\queries src\marketdata src\http tests public data
```

Copy `tsconfig.json` from the trading tool. Add to `package.json` scripts:
`"dev": "tsx watch --env-file=.env src/main.ts"`, `"test": "tsx --test tests/*.test.ts"`,
`"typecheck": "tsc --noEmit"`. Create `.gitignore` with `node_modules/`, `data/`, `.env`.
Create `.env` with `APCA_API_KEY_ID=` and `APCA_API_SECRET_KEY=` (fill in later).

**Expect:** `npx tsc --noEmit` prints nothing.

---

## Module 1 — events and folds (pure)

### 1.1 `src/domain/events.ts` — the event shapes

```ts
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

// What a command produces. No seq/position yet: the store assigns those.
export interface NewEvent<TType extends string, TPayload> {
    id: string;
    type: TType;
    at: string;          // ISO-8601 UTC
    payload: TPayload;
}

// cash stream
export type DepositMade      = NewEvent<'DepositMade',      { amountCents: number }>;
export type DepositReversed  = NewEvent<'DepositReversed',  { corrects: string; amountCents: number }>;
export type CashEvent = DepositMade | DepositReversed;

// portfolio stream
export type StockBought   = NewEvent<'StockBought',   { symbol: string; quantity: number; priceCents: number }>;
export type TradeReversed = NewEvent<'TradeReversed', { corrects: string }>;
export type TradeEvent = StockBought | TradeReversed;

// prices stream
export type PriceFetched = NewEvent<'PriceFetched', { symbol: string; priceCents: number; source: string }>;
export type PriceEvent = PriceFetched;

export type AnyEvent = CashEvent | TradeEvent | PriceEvent;
```

Why `corrects` carries `amountCents` too: a human reading the stream sees the
amount without looking up the original. The fold may use either.

### 1.2 `src/domain/cash.ts`

```ts
export function cashBalance(events: CashEvent[]): number
export function reversedIds(events: CashEvent[]): Set<string>     // every `corrects` value
```

`cashBalance`: deposits add, reversals subtract. **Test:** one deposit of
10 000 and its reversal → 0. Reversal of an unknown id still subtracts (the
decide function is what prevents it; the fold stays simple).

### 1.3 `src/domain/portfolio.ts`

```ts
export interface Position { symbol: string; quantity: number; avgCostCents: number }

export function activeTrades(events: TradeEvent[]): StockBought[]   // buys whose id is not in any TradeReversed.corrects
export function positions(events: TradeEvent[]): Position[]         // fold over activeTrades only
export function position(events: TradeEvent[], symbol: string): Position | undefined
```

**Test:** buy 2 at 100, buy 2 at 200 → quantity 4, avg 150. Reverse the
second buy → quantity 2, avg 100. Reversing twice changes nothing.

### 1.4 `src/domain/prices.ts`

```ts
export interface LatestPrice { priceCents: number; at: string }
export function latestPrices(events: PriceEvent[]): Record<string, LatestPrice>   // last one per symbol wins
```

**Checkpoint after 1.4** (I ask, you answer): predict the output of a fold
over a hand-written list; explain why the fold ignores unknown `corrects`.

---

## Module 2 — decide functions (pure)

`src/domain/decide.ts`. Each returns the event to append, or a failure.
`Stamp` is `{ id: string; at: string }` handed in from outside.

```ts
export function decideDeposit(stamp: Stamp, amountCents: number): Result<DepositMade>
//   positive safe integer, else fail

export function decideReverseDeposit(stamp: Stamp, history: CashEvent[], depositId: string): Result<DepositReversed>
//   the id must be a DepositMade in history, not already reversed
//   (reversal may push the balance negative — the lead's stance: the fact is the fact)

export function decideBuy(stamp: Stamp, cashBalanceCents: number, input: { symbol: string; quantity: number; priceCents: number }): Result<StockBought>
//   symbol non-empty, quantity/price positive safe ints, quantity*price <= cash

export function decideReverseTrade(stamp: Stamp, history: TradeEvent[], tradeId: string): Result<TradeReversed>
//   the id must be a StockBought in history, not already reversed

export function decidePriceFetched(stamp: Stamp, symbol: string, priceCents: number): Result<PriceFetched>
//   price positive safe int; source 'alpaca'
```

**Tests:** one happy and one failing case per function. For the reversals,
test "already reversed" explicitly.

---

## Module 3 — the event store (storage edge)

### 3.1 `src/storage/eventStore.ts` — the interface and the stored shape

```ts
export interface StoredEvent {
    position: number;    // global order across all streams (projectors use this)
    stream: string;
    seq: number;         // order inside the stream, starts at 1
    id: string;
    type: string;
    at: string;
    payload: unknown;    // parsed JSON; the domain narrows it by `type`
}

export interface EventStore {
    append(stream: string, event: NewEvent<string, unknown>): boolean;
    read(stream: string): StoredEvent[];                    // whole stream, by seq
    readAfter(position: number, limit: number): StoredEvent[];   // all streams, by position
}
```

### 3.2 `src/storage/sqlEventStore.ts`

```sql
CREATE TABLE IF NOT EXISTS events (
    position INTEGER PRIMARY KEY AUTOINCREMENT,
    id       TEXT NOT NULL UNIQUE,
    stream   TEXT NOT NULL,
    seq      INTEGER NOT NULL,
    type     TEXT NOT NULL,
    at       TEXT NOT NULL,
    payload  TEXT NOT NULL,           -- JSON.stringify(event.payload)
    UNIQUE (stream, seq)
);
```

`append`: inside one `db.transaction`: `seq = (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE stream = ?)`, then INSERT. Return `false` on any error (log it). An id that already exists is a duplicate append: return `false`, append nothing.
`read` / `readAfter`: SELECT, then `JSON.parse(row.payload)` in a private `toDomain`.

### 3.3 `src/storage/inMemoryEventStore.ts` — array of StoredEvent, same contract.

### 3.4 `tests/eventStore.contract.test.ts` — one suite × both implementations:
append then read round-trips the payload exactly · seq starts at 1 per stream ·
position is global across streams · duplicate id → false and nothing stored ·
readAfter(0, 10) returns everything in order · readAfter(lastPosition, 10) → [].

---

## Module 4 — commands

### 4.1 `src/commands/deps.ts`

```ts
export interface QuoteSource { latestPriceCents(symbol: string): Promise<Result<number>> }

export interface Deps {
    store: EventStore;
    quotes: QuoteSource;
    project: () => void;        // run the projectors; wired in main, a no-op in tests
    newId: () => string;
    now: () => string;
}
```

### 4.2 `src/commands/cash.ts` and `src/commands/trading.ts`

```ts
export function deposit(deps: Deps, amountCents: number): Result<void>
export function reverseDeposit(deps: Deps, depositId: string): Result<void>
export function buyStock(deps: Deps, input: { symbol: string; quantity: number; priceCents: number }): Result<void>
export function reverseTrade(deps: Deps, tradeId: string): Result<void>
export async function refreshPrices(deps: Deps, symbols: string[]): Promise<Result<{ updated: number; failed: string[] }>>
```

Shape of every command: read the stream(s) it needs → cast rows to the
domain event type via a small `asCashEvents(stored)` helper → `decide*` →
`store.append` → `deps.project()` → `{ ok: true, value: undefined }`.
`buyStock` folds `cash` for the balance and reads `portfolio` only if the
decide needs it (it does not, for a buy).

**Tests (`tests/commands.test.ts`):** in-memory store, `project: () => {}`,
counter ids, fixed clock. Deposit then reverse → balance 0 · buy over cash
fails and appends nothing · reverse an unknown trade fails · refreshPrices
with one failing symbol appends the others.

---

## Module 5 — projections and reports

### 5.1 `src/projections/projector.ts`

```ts
export interface Projector {
    readonly name: string;
    apply(event: StoredEvent): void;   // must be safe to call twice with the same event
    reset(): void;                     // empty the report table
}

export interface Checkpoints {
    get(projector: string): number;            // 0 when unknown
    set(projector: string, position: number): void;
}

export function runProjectors(store: EventStore, checkpoints: Checkpoints, projectors: Projector[]): void
//   for each projector: from = checkpoints.get(name); loop readAfter(from, 500) → apply → set(name, last position)

export function rebuild(store: EventStore, checkpoints: Checkpoints, projector: Projector): void
//   reset(); set(name, 0); runProjectors(...[projector])
```

### 5.2 `src/projections/balanceProjector.ts` → `reports.sqlite`

```sql
CREATE TABLE IF NOT EXISTS balance_report (
    id             INTEGER PRIMARY KEY CHECK (id = 1),
    balance_cents  INTEGER NOT NULL,
    deposit_count  INTEGER NOT NULL,
    reversal_count INTEGER NOT NULL,
    updated_at     TEXT NOT NULL
);
```

Handles `DepositMade` (+), `DepositReversed` (−). Ignores other types.

### 5.3 `src/projections/portfolioProjector.ts` → `reports.sqlite`

```sql
CREATE TABLE IF NOT EXISTS portfolio_report (
    symbol               TEXT PRIMARY KEY,
    quantity             INTEGER NOT NULL,
    avg_cost_cents       INTEGER NOT NULL,
    last_price_cents     INTEGER,
    price_at             TEXT,
    market_value_cents   INTEGER,
    unrealized_pnl_cents INTEGER
);
```

Handles `StockBought` (add to quantity, recompute average), `TradeReversed`
(needs the original buy: keep a private `trades` side table in reports.sqlite
keyed by event id, or re-fold — your call, name the trade-off), and
`PriceFetched` (set price, recompute value columns).

### 5.4 `src/storage/sqlCheckpoints.ts` — `checkpoints(projector TEXT PRIMARY KEY, position INTEGER)`.

### 5.5 `src/queries/reportQueries.ts`

```ts
export interface ReportQueries {
    balance(): { balanceCents: number; depositCount: number; reversalCount: number; updatedAt: string } | undefined;
    portfolio(): PortfolioRow[];
    events(stream: string): StoredEvent[];     // for the UI's "pick one to reverse" lists — it reads the store
}
```

**Tests (`tests/projections.test.ts`):** after any sequence of appends, the
report rows equal the pure folds (`cashBalance`, `positions`, `latestPrices`)
· `rebuild` from an empty report reaches the same rows · applying the same
event twice changes nothing (idempotency).

---

## Module 6 — Alpaca

`src/marketdata/alpaca.ts`: `AlpacaQuoteSource implements QuoteSource` and
`FixedQuoteSource` for tests. Copy the rules, not the code, from the
portfolio tracker: 5 s timeout, Result errors, never throws, `?feed=iex`.

---

## Module 7 — HTTP, composition root, UI

`src/http/app.ts`, one `reply` translator, routes:

| Method | Path | Calls |
|---|---|---|
| POST | `/api/deposits` `{ amountCents }` | `deposit` |
| POST | `/api/deposits/:id/reverse` | `reverseDeposit` |
| POST | `/api/trades` `{ symbol, quantity, priceCents }` | `buyStock` |
| POST | `/api/trades/:id/reverse` | `reverseTrade` |
| POST | `/api/prices/refresh` | `refreshPrices` with the symbols from `portfolio()` |
| POST | `/api/projections/rebuild` | `rebuild` for every projector |
| GET | `/api/report/balance` | `queries.balance()` |
| GET | `/api/report/portfolio` | `queries.portfolio()` |
| GET | `/api/events/:stream` | `queries.events(stream)` |

`src/main.ts`: open both database files, build store, checkpoints,
projectors, queries, `deps` with `project: () => runProjectors(...)`,
`app.listen`. The UI (`public/index.html`) is generated once the routes answer.

---

## Module 8 — optional: reports in MySQL

Only the projectors and `ReportQueries` touch `reports.sqlite`. A MySQL
version is a second implementation of each (driver `mysql2/promise`, which
makes `apply`, `reset` and the queries `async`). The event store, domain and
commands do not change. Do this last, and only if the lead wants it.

---

## Questions to settle before Module 2 (defaults in bold)

1. Withdrawals: **no** separate `WithdrawalMade` event; cash leaves only by buying or by reversing a deposit. Add it if the lead wants it.
2. Sells: **no** `StockSold` yet. Without sells there is no realized P&L, which keeps module 5 smaller. Add later as one event type plus one fold change.
3. Buy price: **typed by the user**, Alpaca only for valuation. Same as the tracker.
4. Reports database: **second SQLite file now**, MySQL as module 8.
5. Expected version on append: **not yet**. Add `expectedSeq` to `append` as a follow-up once everything runs.
