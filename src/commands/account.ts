// Commands: read → fold → decide → append. No business rules here.

import { decideDeposit, decideWithdrawal, foldAccountEvents, Result } from '../domain/account';
import { EventStore } from '../domain/eventStore';

export interface Deps {
    store: EventStore;
}

export const ACCOUNT_ID = 'main';

export function deposit(deps: Deps, amountCents: number): Result<void> {
    const decided = decideDeposit(amountCents);
    if (!decided.ok) return decided;
    if (!deps.store.append(ACCOUNT_ID, decided.value)) return { ok: false, error: 'could not store the deposit' };
    return { ok: true, value: undefined };
}

export function withdraw(deps: Deps, amountCents: number): Result<void> {

    const account = foldAccountEvents(ACCOUNT_ID, deps.store.read(ACCOUNT_ID));
    if (!account.ok) return account;

    const decided = decideWithdrawal(account.value, amountCents);
    if (!decided.ok) return decided;
    if (!deps.store.append(ACCOUNT_ID, decided.value)) return { ok: false, error: 'could not store the withdrawal' };
    return { ok: true, value: undefined };
}
