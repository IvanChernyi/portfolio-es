import Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

type Result<T> = { ok: true, value: T } | { ok: false, error: string };

interface Deposit {
    id: string,
    amountCents: number,
    type: 'DepositMade',
    at: string
}

interface Withdrawal {
    id: string,
    amountCents: number,
    type: 'WithdrawalMade',
    at: string
}

function decideDeposit(id: string, amountCents: number, at: string): Result<Deposit> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the deposit amount is incorrect' }
    else
        return { ok: true, value: { id: id, amountCents: amountCents, type: 'DepositMade', at: at } }
}

function decideWithdrawal(id: string, amountCents: number, balanceCents: number, at: string): Result<Withdrawal> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the withdrawal amount is incorrect' }
    if (amountCents > balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: { id: id, amountCents: amountCents, type: 'WithdrawalMade', at: at } }
}


type CashEvent = Deposit | Withdrawal;

function cashBalance(events: CashEvent[]): number {
    let balance = 0;
    for (const event of events) {
        if (event.type === 'DepositMade') balance += event.amountCents;
        if (event.type === 'WithdrawalMade') balance -= event.amountCents;
    }
    return balance;
}

// ES

interface EventStore {
    append(stream: string, event: CashEvent): boolean;
    read(stream: string): CashEvent[];
}

interface EventRow {
    seq: number;
    payload: string;
}

class SqlEventStore implements EventStore {
    constructor(private readonly db: Database.Database) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS events (
                stream  TEXT NOT NULL,
                seq     INTEGER NOT NULL,
                id      TEXT NOT NULL UNIQUE,
                type    TEXT NOT NULL,
                at      TEXT NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (stream, seq)
            )
        `);
    }

    append(stream: string, event: CashEvent): boolean {
        try {
            this.db.prepare(
                `INSERT INTO events (stream, seq, id, type, at, payload)
                 VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE stream = ?), ?, ?, ?, ?)`
            ).run(stream, stream, event.id, event.type, event.at, JSON.stringify(event));
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    read(stream: string): CashEvent[] {
        const rows = this.db.prepare(`SELECT seq, payload FROM events WHERE stream = ? ORDER BY seq`).all(stream) as EventRow[];
        return rows.map((row) => JSON.parse(row.payload) as CashEvent);   // zod will replace this cast later
    }
}

// commands

interface Deps {
    store: EventStore;
    newId: () => string;
    now: () => string;
}

const CASH = 'cash';

function deposit(deps: Deps, amountCents: number): Result<void> {
    const decided = decideDeposit(deps.newId(), amountCents, deps.now());
    if (!decided.ok) return decided;
    if (!deps.store.append(CASH, decided.value)) return { ok: false, error: 'could not store the deposit' };
    return { ok: true, value: undefined };
}

function withdraw(deps: Deps, amountCents: number): Result<void> {
    const balance = cashBalance(deps.store.read(CASH));
    const decided = decideWithdrawal(deps.newId(), amountCents, balance, deps.now());
    if (!decided.ok) return decided;
    if (!deps.store.append(CASH, decided.value)) return { ok: false, error: 'could not store the withdrawal' };
    return { ok: true, value: undefined };
}

// composition

function main(): void {
    const deps: Deps = {
        store: new SqlEventStore(new Database('data/events.sqlite')),
        newId: () => randomUUID(),
        now: () => new Date().toISOString(),
    };

    const show = (label: string, result: Result<void>) =>
        console.log(label.padEnd(22), result.ok ? 'ok' : `FAILED: ${result.error}`);

    show('deposit 200.00', deposit(deps, 20000));
    show('withdraw 30.00', withdraw(deps, 3000));
    show('withdraw 200.00', withdraw(deps, 20000));
    show('deposit -5', deposit(deps, -5));
    show('deposit 1.5 cents', deposit(deps, 1.5));

    const events = deps.store.read(CASH);
    console.log('\nevents in stream "cash":');
    for (const e of events) console.log(' ', e.at, e.type.padEnd(15), e.amountCents);
    console.log('\nbalance:', cashBalance(events), 'cents');
}

main();

// npm run write

