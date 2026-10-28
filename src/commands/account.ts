// commands (app layer): read - fold - business verb - append. feeds the deps, no tech concerns.

import { Account, AccountEvent, buyStock, collectDeposit, foldAccountEvents, Result, sellStock, sendWithdrawal, StockOrder } from '../domain/account';
import { EventStore } from '../domain/eventStore';
import { PriceSource } from '../domain/priceSource';

export interface Deps {
    store: EventStore;
    prices: PriceSource;   // where prices come from; main decides which plug
    now: () => string;     // the clock lives in main; the command hands the time to the domain
}

export const ACCOUNT_ID = 'main';   // the one stream this app has

// what the user places. doesn't know if buy or sell
export interface MarketOrder {
    symbol: string,
    quantity: number
}

async function priceOrder(deps: Deps, order: MarketOrder): Promise<Result<StockOrder>> {
    const price = await deps.prices.latestPriceCents(order.symbol);
    if (!price.ok) return price;
    return { ok: true, value: { symbol: order.symbol, quantity: order.quantity, priceCents: price.value } };
}

// an empty streamt is a new account with nothing in it.
export function loadAccount(deps: Deps): Result<Account> {
    const events = deps.store.read(ACCOUNT_ID);
    if (events.length === 0) return { ok: true, value: { id: ACCOUNT_ID, balanceCents: 0, positions: [] } };
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

export async function buy(deps: Deps, order: MarketOrder): Promise<Result<void>> {
    const priced = await priceOrder(deps, order);
    if (!priced.ok) return priced;

    const account = loadAccount(deps);
    if (!account.ok) return account;

    const bought = buyStock(account.value, priced.value, deps.now());
    if (!bought.ok) return bought;
    return appendAll(deps, bought.value, 'purchase');
}

export async function sell(deps: Deps, order: MarketOrder): Promise<Result<void>> {
    const priced = await priceOrder(deps, order);
    if (!priced.ok) return priced;

    const account = loadAccount(deps);
    if (!account.ok) return account;

    const sold = sellStock(account.value, priced.value, deps.now());
    if (!sold.ok) return sold;
    return appendAll(deps, sold.value, 'sale');
}
