// account domain

import { z } from 'zod';

export type Result<T> = { ok: true, value: T } | { ok: false, error: string };

// Events: past-tense facts. id and at are declared once in the base.
export const AccountEventBase = z.object({
    id: z.string(),
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

// JSON from disk goes through this before the domain is allowed to see it
export const AccountEventSchema = z.discriminatedUnion('type', [
    DepositCollectedSchema,
    WithdrawalSentSchema
]);

export type DepositCollectedEvent = z.infer<typeof DepositCollectedSchema>;
export type WithdrawalSentEvent = z.infer<typeof WithdrawalSentSchema>;
export type AccountEvent = z.infer<typeof AccountEventSchema>;

// What a business function returns: the event minus the id the store will mint.
export type NewDepositCollected = Omit<DepositCollectedEvent, 'id'>;
export type NewWithdrawalSent = Omit<WithdrawalSentEvent, 'id'>;
export type NewAccountEvent = NewDepositCollected | NewWithdrawalSent;

export interface Account {
    balanceCents: number,
    id: string
} // aggregate

export function foldAccountEvents(id: string, events: AccountEvent[]): Result<Account> {
    let balance = 0;
    for (const event of events) {
        if (event.type === 'DepositCollected') balance += event.amountCents;
        else if (event.type === 'WithdrawalSent') balance -= event.amountCents;
        else return { ok: false, error: 'unknown event type' };
    }
    return { ok: true, value: { balanceCents: balance, id: id } };
}

// Business verbs. Each takes the aggregate, the input, and the time.

export function collectDeposit(account: Account, amountCents: number, now: string): Result<NewDepositCollected> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the deposit amount is incorrect' }
    else
        return { ok: true, value: { type: 'DepositCollected', amountCents: amountCents, at: now } }
}

export function sendWithdrawal(account: Account, amountCents: number, now: string): Result<NewWithdrawalSent> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the withdrawal amount is incorrect' }
    if (amountCents > account.balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: { type: 'WithdrawalSent', amountCents: amountCents, at: now } }
}
