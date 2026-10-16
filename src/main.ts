// Composition root: the only place that names a file, the clock, or the id generator.

import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { foldAccountEvents, Result } from './domain/account';
import { SqlEventStore } from './storage/sqlEventStore';
import { ACCOUNT_ID, Deps, deposit, withdraw } from './commands/account';

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
    for (const e of deps.store.read(ACCOUNT_ID)) console.log(' ', e.at, e.id.slice(0, 8), e.type.padEnd(15), e.amountCents);

    const account = foldAccountEvents(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    console.log('\nbalance:', account.ok ? `${account.value.balanceCents} cents` : `FAILED: ${account.error}`);
}

main();

// npm run write
