// account domain

import { z } from 'zod';
import { isKnownStock } from './instruments';

export type Result<T> = { ok: true, value: T } | { ok: false, error: string };

// Events: past-tense facts. id and at are declared once in the base.
export const AccountEventBase = z.object({
    id: z.string(),      // the account the event belongs to; an event's own identity is its (stream, seq)
    at: z.string(),      // when it happened — passed in, not "now"
    type: z.string(),
});

export const DepositCollectedSchema = AccountEventBase.extend({
    type: z.literal('DepositCollected'),
    amountCents: z.number().int().positive(),
});

export const WithdrawalSentSchema = AccountEventBase.extend({
    type: z.literal('WithdrawalSent'),
    amountCents: z.number().int().positive(),
});

export const StockBoughtSchema = AccountEventBase.extend({
    type: z.literal('StockBought'),
    symbol: z.string(),
    quantity: z.number().int().positive(),
    priceCents: z.number().int().positive(),
});

export const StockSoldSchema = AccountEventBase.extend({
    type: z.literal('StockSold'),
    symbol: z.string(),
    quantity: z.number().int().positive(),
    priceCents: z.number().int().positive(),
});

// JSON from disk goes through this before the domain is allowed to see it
export const AccountEventSchema = z.discriminatedUnion('type', [
    DepositCollectedSchema,
    WithdrawalSentSchema,
    StockBoughtSchema,
    StockSoldSchema
]);

export type DepositCollectedEvent = z.infer<typeof DepositCollectedSchema>;
export type WithdrawalSentEvent = z.infer<typeof WithdrawalSentSchema>;
export type StockBoughtEvent = z.infer<typeof StockBoughtSchema>;
export type StockSoldEvent = z.infer<typeof StockSoldSchema>;
export type AccountEvent = z.infer<typeof AccountEventSchema>;

// What the account holds of one stock. Part of the aggregate because
// "cannot sell what you do not hold" needs it.
export interface Position {
    symbol: string,
    quantity: number,
    avgCostCents: number
}

export interface Account {
    id: string,
    balanceCents: number,
    positions: Position[]
} // aggregate

// left fold: events in, aggregate out. the id comes from the events themselves
export function foldAccountEvents(events: AccountEvent[]): Result<Account> {
    const first = events[0];
    if (!first) return { ok: false, error: 'no events' };
    let balance = 0;
    const held: Record<string, Position> = {};
    for (const event of events) {
        if (event.type === 'DepositCollected') balance += event.amountCents;
        else if (event.type === 'WithdrawalSent') balance -= event.amountCents;
        else if (event.type === 'StockBought') {
            balance -= event.quantity * event.priceCents;
            const p = held[event.symbol] ?? { symbol: event.symbol, quantity: 0, avgCostCents: 0 };
            const quantity = p.quantity + event.quantity;
            const avgCostCents = Math.round((p.quantity * p.avgCostCents + event.quantity * event.priceCents) / quantity);
            held[event.symbol] = { symbol: event.symbol, quantity, avgCostCents };
        }
        else if (event.type === 'StockSold') {
            balance += event.quantity * event.priceCents;
            const p = held[event.symbol] ?? { symbol: event.symbol, quantity: 0, avgCostCents: 0 };
            held[event.symbol] = { symbol: p.symbol, quantity: p.quantity - event.quantity, avgCostCents: p.avgCostCents };   // selling does not change the average cost of what remains
        }
        else return { ok: false, error: 'unknown event type' };
    }
    const positions = Object.values(held).filter((p) => p.quantity > 0);
    return { ok: true, value: { id: first.id, balanceCents: balance, positions } };
}

// business verbs: (aggregate, input, time) -> the events that happened

export function collectDeposit(account: Account, amountCents: number, now: string): Result<AccountEvent[]> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the deposit amount is incorrect' }
    else
        return { ok: true, value: [{ id: account.id, type: 'DepositCollected', amountCents: amountCents, at: now }] }
}

export function sendWithdrawal(account: Account, amountCents: number, now: string): Result<AccountEvent[]> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the withdrawal amount is incorrect' }
    if (amountCents > account.balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: [{ id: account.id, type: 'WithdrawalSent', amountCents: amountCents, at: now }] }
}

export interface StockOrder {
    symbol: string,
    quantity: number,
    priceCents: number
}

export function buyStock(account: Account, order: StockOrder, now: string): Result<AccountEvent[]> {
    if (!isKnownStock(order.symbol))
        return { ok: false, error: `unknown symbol ${order.symbol}` }
    if (!(Number.isSafeInteger(order.quantity) && order.quantity > 0))
        return { ok: false, error: 'the quantity must be a positive whole number' }
    if (!(Number.isSafeInteger(order.priceCents) && order.priceCents > 0))
        return { ok: false, error: 'the price must be a positive whole number of cents' }
    if (order.quantity * order.priceCents > account.balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: [{ id: account.id, type: 'StockBought', symbol: order.symbol, quantity: order.quantity, priceCents: order.priceCents, at: now }] }
}

export function sellStock(account: Account, order: StockOrder, now: string): Result<AccountEvent[]> {
    if (!isKnownStock(order.symbol))
        return { ok: false, error: `unknown symbol ${order.symbol}` }
    if (!(Number.isSafeInteger(order.quantity) && order.quantity > 0))
        return { ok: false, error: 'the quantity must be a positive whole number' }
    if (!(Number.isSafeInteger(order.priceCents) && order.priceCents > 0))
        return { ok: false, error: 'the price must be a positive whole number of cents' }
    const held = account.positions.find((p) => p.symbol === order.symbol);
    if (!held || held.quantity < order.quantity)
        return { ok: false, error: `not enough ${order.symbol} shares to sell` }
    else
        return { ok: true, value: [{ id: account.id, type: 'StockSold', symbol: order.symbol, quantity: order.quantity, priceCents: order.priceCents, at: now }] }
}
