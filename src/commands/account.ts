// commands (app layer): read - fold - business verb - append. feeds the deps, no tech concerns.

import { Account, AccountEvent, buyStock, collectDeposit, foldAccountEvents, Result, sendWithdrawal, StockOrder } from '../domain/account';
import { EventStore } from '../domain/eventStore';

export interface Deps {
    store: EventStore;
    now: () => string;   // the clock lives in main; the command hands the time to the domain
}

export const ACCOUNT_ID = 'main';   // the one stream this app has

// A stream nobody has written to yet is a new account with nothing in it.
export function loadAccount(deps: Deps): Result<Account> {
    const events = deps.store.read(ACCOUNT_ID);
    if (events.length === 0) return { ok: true, value: { id: ACCOUNT_ID, balanceCents: 0 } };
    return foldAccountEvents(events);
}

function appendAll(deps: Deps, events: AccountEvent[], what: string): Result<void> {
    for (const event of events) {
        if (!deps.store.append(ACCOUNT_ID, event)) return { ok: false, error: `could not store the ${what}` };
    }
    return { ok: true, value: undefined };
}

export function deposit(deps: Deps, amountCents: number): Result<void> {
    const account = loadAccount(deps);
    if (!account.ok) return account;

    const collected = collectDeposit(account.value, amountCents, deps.now());
    if (!collected.ok) return collected;
    return appendAll(deps, collected.value, 'deposit');
}

export function withdraw(deps: Deps, amountCents: number): Result<void> {
    const account = loadAccount(deps);
    if (!account.ok) return account;

    const sent = sendWithdrawal(account.value, amountCents, deps.now());
    if (!sent.ok) return sent;
    return appendAll(deps, sent.value, 'withdrawal');
}

export function buy(deps: Deps, order: StockOrder): Result<void> {
    const account = loadAccount(deps);
    if (!account.ok) return account;

    const bought = buyStock(account.value, order, deps.now());
    if (!bought.ok) return bought;
    return appendAll(deps, bought.value, 'purchase');
}
