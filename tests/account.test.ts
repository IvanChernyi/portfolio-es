// pure domain tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Account, AccountEvent, collectDeposit, foldAccountEvents, sellStock, sendWithdrawal } from '../src/domain/account';

const at = '2026-10-19T10:00:00.000Z';

const empty: Account = { id: 'main', balanceCents: 0, positions: [] };
const funded: Account = { id: 'main', balanceCents: 50000, positions: [] };

describe('collectDeposit', () => {
    it('returns a DepositCollected event stamped with the account and the time', () => {
        const result = collectDeposit(empty, 20000, at);
        assert.deepEqual(result, {
            ok: true,
            value: [{ id: 'main', type: 'DepositCollected', amountCents: 20000, at }],
        });
    });

    it('refuses zero, negative, fractional and NaN amounts', () => {
        for (const bad of [0, -5, 10.5, NaN]) {
            const result = collectDeposit(empty, bad, at);
            assert.equal(result.ok, false, `amount ${bad} should be refused`);
        }
    });

    it('does not care about the balance', () => {
        assert.equal(collectDeposit(empty, 1, at).ok, true);
        assert.equal(collectDeposit(funded, 1, at).ok, true);
    });
});

describe('sendWithdrawal', () => {
    it('returns a WithdrawalSent event when cash suffices', () => {
        const result = sendWithdrawal(funded, 30000, at);
        assert.deepEqual(result, {
            ok: true,
            value: [{ id: 'main', type: 'WithdrawalSent', amountCents: 30000, at }],
        });
    });

    it('allows withdrawing exactly the balance', () => {
        assert.equal(sendWithdrawal(funded, 50000, at).ok, true);
    });

    it('refuses one cent more than the balance, with the reason', () => {
        const result = sendWithdrawal(funded, 50001, at);
        assert.deepEqual(result, { ok: false, error: 'insufficient cash' });
    });

    it('refuses a bad amount before looking at the balance', () => {
        const result = sendWithdrawal(funded, -5, at);
        assert.equal(result.ok, false);
        if (!result.ok) assert.notEqual(result.error, 'insufficient cash');
    });
});

describe('foldAccountEvents', () => {
    it('takes the account id from the events and nets deposits against withdrawals', () => {
        const events: AccountEvent[] = [
            { id: 'main', at, type: 'DepositCollected', amountCents: 20000 },
            { id: 'main', at, type: 'WithdrawalSent', amountCents: 3000 },
        ];
        assert.deepEqual(foldAccountEvents(events), { ok: true, value: { id: 'main', balanceCents: 17000, positions: [] } });
    });

    it('cannot build an account from no events', () => {
        assert.equal(foldAccountEvents([]).ok, false);
    });

    // the lead's chain: fold -> verb -> fold again with the new events -> next verb
    it('chains deposit, withdrawal, deposit through the fold', () => {
        let events: AccountEvent[] = [];
        let account: Account = empty;

        const steps = [
            (a: Account) => collectDeposit(a, 10000, at),
            (a: Account) => sendWithdrawal(a, 4000, at),
            (a: Account) => collectDeposit(a, 500, at),
        ];

        for (const step of steps) {
            const produced = step(account);
            assert.equal(produced.ok, true);
            if (!produced.ok) return;
            events = [...events, ...produced.value];
            const folded = foldAccountEvents(events);
            assert.equal(folded.ok, true);
            if (!folded.ok) return;
            account = folded.value;
        }

        assert.equal(account.balanceCents, 6500);
        assert.equal(events.length, 3);
    });
});

describe('sellStock', () => {
    const holding: Account = { id: 'main', balanceCents: 0, positions: [{ symbol: 'AAPL', quantity: 3, avgCostCents: 10000 }] };

    it('returns a StockSold event when enough shares are held', () => {
        const result = sellStock(holding, { symbol: 'AAPL', quantity: 2, priceCents: 12000 }, at);
        assert.deepEqual(result, {
            ok: true,
            value: [{ id: 'main', type: 'StockSold', symbol: 'AAPL', quantity: 2, priceCents: 12000, at }],
        });
    });

    it('allows selling exactly what is held, refuses one share more', () => {
        assert.equal(sellStock(holding, { symbol: 'AAPL', quantity: 3, priceCents: 100 }, at).ok, true);
        assert.deepEqual(sellStock(holding, { symbol: 'AAPL', quantity: 4, priceCents: 100 }, at), { ok: false, error: 'not enough AAPL shares to sell' });
    });

    it('refuses a stock that is not held at all', () => {
        assert.equal(sellStock(holding, { symbol: 'MSFT', quantity: 1, priceCents: 100 }, at).ok, false);
    });
});

describe('foldAccountEvents with trades', () => {
    it('a buy opens a position and a sell shrinks it; cash moves the other way', () => {
        const events: AccountEvent[] = [
            { id: 'main', at, type: 'DepositCollected', amountCents: 100000 },
            { id: 'main', at, type: 'StockBought', symbol: 'AAPL', quantity: 4, priceCents: 10000 },
            { id: 'main', at, type: 'StockSold', symbol: 'AAPL', quantity: 1, priceCents: 15000 },
        ];
        assert.deepEqual(foldAccountEvents(events), {
            ok: true,
            value: { id: 'main', balanceCents: 100000 - 40000 + 15000, positions: [{ symbol: 'AAPL', quantity: 3, avgCostCents: 10000 }] },
        });
    });

    it('a fully sold position leaves the aggregate', () => {
        const events: AccountEvent[] = [
            { id: 'main', at, type: 'DepositCollected', amountCents: 100000 },
            { id: 'main', at, type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 10000 },
            { id: 'main', at, type: 'StockSold', symbol: 'AAPL', quantity: 2, priceCents: 10000 },
        ];
        const folded = foldAccountEvents(events);
        assert.deepEqual(folded.ok && folded.value.positions, []);
    });
});

// npm test
