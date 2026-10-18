// commands: read - fold - business verb - append

import { collectDeposit, foldAccountEvents, Result, sendWithdrawal } from '../domain/account';
import { EventStore } from '../domain/eventStore';

export interface Deps {
    store: EventStore;
    now: () => string;   // the clock lives in main; the command passes the time to the domain
}

export const ACCOUNT_ID = 'main';

export function deposit(deps: Deps, amountCents: number): Result<void> {
    const account = foldAccountEvents(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    if (!account.ok) return account;

    const collected = collectDeposit(account.value, amountCents, deps.now());
    if (!collected.ok) return collected;
    if (!deps.store.append(ACCOUNT_ID, collected.value)) return { ok: false, error: 'could not store the deposit' };
    return { ok: true, value: undefined };
}

export function withdraw(deps: Deps, amountCents: number): Result<void> {
    const account = foldAccountEvents(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    if (!account.ok) return account;

    const sent = sendWithdrawal(account.value, amountCents, deps.now());
    if (!sent.ok) return sent;
    if (!deps.store.append(ACCOUNT_ID, sent.value)) return { ok: false, error: 'could not store the withdrawal' };
    return { ok: true, value: undefined };
}
