// Command tests: real implementations of the sockets, no mocks.
// In-memory store, a fixed price table, a constant clock.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ACCOUNT_ID, buy, deposit, Deps, loadAccount, reverseDeposit, reverseWithdrawal, sell, withdraw } from '../src/commands/account';
import { FixedPriceSource } from '../src/marketdata/fixedPriceSource';
import { InMemoryEventStore } from '../src/storage/inMemoryEventStore';

function fakeDeps(): Deps {
    return {
        store: new InMemoryEventStore(),
        prices: new FixedPriceSource({ AAPL: 10000, MSFT: 40000 }),
        now: () => '2026-10-27T10:00:00.000Z',
    };
}

describe('deposit and withdraw', () => {
    it('round-trip through the store and fold back to the right balance', () => {
        const deps = fakeDeps();
        assert.equal(deposit(deps, 50000).ok, true);
        assert.equal(withdraw(deps, 20000).ok, true);
        assert.deepEqual(loadAccount(deps), { ok: true, value: { id: ACCOUNT_ID, balanceCents: 30000, positions: [], reversedSeqs: [] } });
    });

    it('a refused withdrawal appends nothing', () => {
        const deps = fakeDeps();
        assert.equal(withdraw(deps, 1).ok, false);
        assert.deepEqual(deps.store.read(ACCOUNT_ID), []);
    });
});

describe('buy and sell at the market price', () => {
    it('buy records the fetched price on the event and spends that much cash', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        assert.deepEqual(await buy(deps, { symbol: 'AAPL', quantity: 3 }), { ok: true, value: undefined });

        const events = deps.store.read(ACCOUNT_ID);
        assert.deepEqual(events[1], { seq: 2, id: ACCOUNT_ID, at: '2026-10-27T10:00:00.000Z', type: 'StockBought', symbol: 'AAPL', quantity: 3, priceCents: 10000 });
        assert.deepEqual(loadAccount(deps), { ok: true, value: { id: ACCOUNT_ID, balanceCents: 20000, positions: [{ symbol: 'AAPL', quantity: 3, avgCostCents: 10000 }], reversedSeqs: [] } });
    });

    it('sell records the fetched price and returns the cash', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        await buy(deps, { symbol: 'AAPL', quantity: 3 });
        deps.prices = new FixedPriceSource({ AAPL: 12000 });   // the market moved

        assert.equal((await sell(deps, { symbol: 'AAPL', quantity: 2 })).ok, true);
        assert.deepEqual(loadAccount(deps), { ok: true, value: { id: ACCOUNT_ID, balanceCents: 20000 + 24000, positions: [{ symbol: 'AAPL', quantity: 1, avgCostCents: 10000 }], reversedSeqs: [] } });
    });

    it('a symbol the price source does not know fails with the provider message and appends nothing', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        assert.deepEqual(await buy(deps, { symbol: 'TSLA', quantity: 1 }), { ok: false, error: 'no price for TSLA' });
        assert.equal(deps.store.read(ACCOUNT_ID).length, 1);
    });

    it('the fetched price can make an order unaffordable', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        assert.deepEqual(await buy(deps, { symbol: 'MSFT', quantity: 2 }), { ok: false, error: 'insufficient cash' });
    });

    it('selling what is not held fails after the price was fetched', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        assert.deepEqual(await sell(deps, { symbol: 'MSFT', quantity: 1 }), { ok: false, error: 'not enough MSFT shares to sell' });
    });
});

describe('reversals', () => {
    it('reversing a deposit nets the balance and the original stays in the stream', () => {
        const deps = fakeDeps();
        deposit(deps, 30000);
        deposit(deps, 20000);
        assert.deepEqual(reverseDeposit(deps, 1), { ok: true, value: undefined });

        const events = deps.store.read(ACCOUNT_ID);
        assert.equal(events.length, 3);
        assert.equal(events[0].type, 'DepositCollected');
        assert.deepEqual(loadAccount(deps), { ok: true, value: { id: ACCOUNT_ID, balanceCents: 20000, positions: [], reversedSeqs: [1] } });
    });

    it('reversing twice fails and appends nothing the second time', () => {
        const deps = fakeDeps();
        deposit(deps, 30000);
        reverseDeposit(deps, 1);
        assert.deepEqual(reverseDeposit(deps, 1), { ok: false, error: 'deposit #1 was already reversed' });
        assert.equal(deps.store.read(ACCOUNT_ID).length, 2);
    });

    it('a position that is not a deposit, or does not exist, cannot be reversed as one', async () => {
        const deps = fakeDeps();
        deposit(deps, 50000);
        await buy(deps, { symbol: 'AAPL', quantity: 1 });
        assert.deepEqual(reverseDeposit(deps, 2), { ok: false, error: 'no deposit at position 2' });
        assert.deepEqual(reverseWithdrawal(deps, 9), { ok: false, error: 'no withdrawal at position 9' });
    });

    it('reversing a withdrawal returns the cash', () => {
        const deps = fakeDeps();
        deposit(deps, 30000);
        withdraw(deps, 10000);
        assert.equal(reverseWithdrawal(deps, 2).ok, true);
        const account = loadAccount(deps);
        assert.equal(account.ok && account.value.balanceCents, 30000);
    });
});
