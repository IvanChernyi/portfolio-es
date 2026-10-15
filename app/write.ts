import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';

type Result<T> = { ok: true, value: T } | { ok: false, error: string };

interface Deposit {
    amountCents: number,
    type: 'DepositMade'
}

interface Withdrawal {
    amountCents: number,
    type: 'WithdrawalMade'
}

// zod - same two shapes. JSON goes through this before the domain is allowed to see it
const AccountEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('DepositMade'), amountCents: z.number().int().positive() }),
    z.object({ type: z.literal('WithdrawalMade'), amountCents: z.number().int().positive() }),
]);

interface StoredEvent {
    id: string,
    at: string,
    event: AccountEvent
}

function decideDeposit(amountCents: number): Result<Deposit> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the deposit amount is incorrect' }
    else
        return { ok: true, value: { amountCents: amountCents, type: 'DepositMade' } }
}

function decideWithdrawal(account: Account, amountCents: number): Result<Withdrawal> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the withdrawal amount is incorrect' }
    if (amountCents > account.balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: { amountCents: amountCents, type: 'WithdrawalMade' } }
}


type AccountEvent = Deposit | Withdrawal;


interface Account {
    balanceCents: number,
    id: string
} // aggregate

function accountBalance(id: string, events: AccountEvent[]): Result<Account> {
    let balance = 0;
    for (const event of events) {
        if (event.type === 'DepositMade') balance += event.amountCents;
        else if (event.type === 'WithdrawalMade') balance -= event.amountCents;
        else return { ok: false, error: 'unknown event type' };
    }
    return { ok: true, value: { balanceCents: balance, id: id } };
}

// ES

interface EventStore {
    append(stream: string, event: AccountEvent): boolean,
    read(stream: string): AccountEvent[],
    readStored(stream: string): StoredEvent[]
}

interface EventRow {
    seq: number;
    id: string;
    at: string;
    payload: string;
}

class SqlEventStore implements EventStore {
    constructor(private readonly db: DatabaseSync, private readonly newId: () => string, private readonly now: () => string) {
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

    append(stream: string, event: AccountEvent): boolean {
        try {
            this.db.prepare(
                `INSERT INTO events (stream, seq, id, type, at, payload)
                 VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE stream = ?), ?, ?, ?, ?)`
            ).run(stream, stream, this.newId(), event.type, this.now(), JSON.stringify(event));
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    private rows(stream: string): EventRow[] {
        return this.db.prepare(`SELECT seq, id, at, payload FROM events WHERE stream = ? ORDER BY seq`).all(stream) as unknown as EventRow[];
    }

    private toEvent(row: EventRow): AccountEvent {
        return AccountEventSchema.parse(JSON.parse(row.payload));
    }

    read(stream: string): AccountEvent[] {
        return this.rows(stream).map((row) => this.toEvent(row));
    }

    readStored(stream: string): StoredEvent[] {
        return this.rows(stream).map((row) => ({ id: row.id, at: row.at, event: this.toEvent(row) }));
    }
}

// commands

interface Deps {
    store: EventStore;
}

const ACCOUNT_ID = 'main';

function deposit(deps: Deps, amountCents: number): Result<void> {
    const decided = decideDeposit(amountCents);
    if (!decided.ok) return decided;
    if (!deps.store.append(ACCOUNT_ID, decided.value)) return { ok: false, error: 'could not store the deposit' };
    return { ok: true, value: undefined };
}

function withdraw(deps: Deps, amountCents: number): Result<void> {

    const account = accountBalance(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    if (!account.ok) return account;

    const decided = decideWithdrawal(account.value, amountCents);
    if (!decided.ok) return decided;
    if (!deps.store.append(ACCOUNT_ID, decided.value)) return { ok: false, error: 'could not store the withdrawal' };
    return { ok: true, value: undefined };
}

// composition

function main(): void {
    const deps: Deps = {
        store: new SqlEventStore(
            new DatabaseSync('data/events.sqlite'),
            () => randomUUID(),
            () => new Date().toISOString(),
        ),
    };

    const show = (label: string, result: Result<void>) =>
        console.log(label.padEnd(22), result.ok ? 'ok' : `FAILED: ${result.error}`);

    show('deposit 200.00', deposit(deps, 20000));
    show('withdraw 30.00', withdraw(deps, 3000));
    show('withdraw 200.00', withdraw(deps, 20000));
    show('deposit -5', deposit(deps, -5));
    show('deposit 1.5 cents', deposit(deps, 1.5));

    console.log(`\nevents in stream "${ACCOUNT_ID}":`);
    for (const s of deps.store.readStored(ACCOUNT_ID)) console.log(' ', s.at, s.id.slice(0, 8), s.event.type.padEnd(15), s.event.amountCents);

    const account = accountBalance(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    console.log('\nbalance:', account.ok ? `${account.value.balanceCents} cents` : `FAILED: ${account.error}`);
}

main();

// npm run write