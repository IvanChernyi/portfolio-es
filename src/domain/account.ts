// account domain

import { z } from 'zod';

export type Result<T> = { ok: true, value: T } | { ok: false, error: string };

// export const DepositSchema = z.object({
//     type: z.literal('DepositMade'),
//     amountCents: z.number().int().positive()
// });

// export const WithdrawalSchema = z.object({
//     type: z.literal('WithdrawalMade'),
//     amountCents: z.number().int().positive()
// });

// export type Deposit = z.infer<typeof DepositSchema>;
// export type Withdrawal = z.infer<typeof WithdrawalSchema>;

// // what a decide function returns
// export const AccountIntentSchema = z.discriminatedUnion('type', [
//     DepositSchema,
//     WithdrawalSchema
// ]);

// export type AccountIntent = z.infer<typeof AccountIntentSchema>;

export const AccountEventBase = z.object({
    id: z.string(),
    at: z.string(),
    type: z.string(),
});

export const DepositEventSchema = AccountEventBase.extend({
    type: z.literal('DepositMade'),
    amountCents: z.number().int().positive(),
});

export const WithdrawalEventSchema = AccountEventBase.extend({
    type: z.literal('WithdrawalMade'),
    amountCents: z.number().int().positive(),
});

// zod - same two shapes. JSON goes through this before the domain is allowed to see it
export const AccountEventSchema = z.discriminatedUnion('type', [
    DepositEventSchema,
    WithdrawalEventSchema
]);

export type DepositCollectedEvent = z.infer<typeof DepositEventSchema>;
export type WithdrawalSentEvent = z.infer<typeof WithdrawalEventSchema>;
export type AccountEvent = z.infer<typeof AccountEventSchema>;

export function collectDeposit(account: Account, amountCents: number, now: string): Result<DepositCollectedEvent> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the deposit amount is incorrect' }
    else
        return { ok: true, value: { id: account.id, amountCents: amountCents, type: 'DepositMade', at: now } }
}

export function sendWithdrawal(account: Account, amountCents: number): Result<Withdrawal> {
    if (!(Number.isSafeInteger(amountCents) && amountCents > 0))
        return { ok: false, error: 'the withdrawal amount is incorrect' }
    if (amountCents > account.balanceCents)
        return { ok: false, error: 'insufficient cash' }
    else
        return { ok: true, value: { amountCents: amountCents, type: 'WithdrawalMade' } }
}


export interface Account {
    balanceCents: number,
    id: string
} // aggregate

export function foldAccountEvents(id: string, events: AccountEvent[]): Result<Account> {
    let balance = 0;
    for (const event of events) {
        if (event.type === 'DepositMade') balance += event.amountCents;
        else if (event.type === 'WithdrawalMade') balance -= event.amountCents;
        else return { ok: false, error: 'unknown event type' };
    }
    return { ok: true, value: { balanceCents: balance, id: id } };
}
