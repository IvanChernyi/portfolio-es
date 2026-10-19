// No mocks: the pure projection is tested on hand-written events,
// the SQL report against a real in-memory database. ! GENERATED !

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountEvent, buyStock, foldAccountEvents } from '../src/domain/account';
import { positionsFrom, SqlPositionsReport } from '../src/projections/positionsReport';
import { SqlEventStore } from '../src/storage/sqlEventStore';

const at = '2026-10-18T10:00:00.000Z';

const events: AccountEvent[] = [
    { id: 'e1', at, type: 'DepositCollected', amountCents: 100_000 },
    { id: 'e2', at, type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 10_000 },
    { id: 'e3', at, type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 20_000 },
    { id: 'e4', at, type: 'StockBought', symbol: 'MSFT', quantity: 1, priceCents: 30_000 },
];

describe('positionsFrom', () => {
    it('averages the cost across buys of the same symbol', () => {
        assert.deepEqual(positionsFrom(events), [
            { symbol: 'AAPL', quantity: 4, avgCostCents: 15_000 },
            { symbol: 'MSFT', quantity: 1, avgCostCents: 30_000 },
        ]);
    });

    it('ignores cash events and an empty stream gives no positions', () => {
        assert.deepEqual(positionsFrom([events[0]]), []);
        assert.deepEqual(positionsFrom([]), []);
    });
});

describe('fold with StockBought', () => {
    it('a buy spends cash', () => {
        const account = foldAccountEvents('main', events);
        assert.equal(account.ok && account.value.balanceCents, 100_000 - 20_000 - 40_000 - 30_000);
    });
});

describe('buyStock', () => {
    const account = { id: 'main', balanceCents: 50_000 };
    it('returns a StockBought event when the symbol is known and cash suffices', () => {
        const result = buyStock(account, { symbol: 'AAPL', quantity: 2, priceCents: 20_000 }, at, 'e9');
        assert.deepEqual(result, { ok: true, value: { id: 'e9', type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 20_000, at } });
    });
    it('refuses an unknown symbol, a bad quantity, and a cost above cash', () => {
        assert.equal(buyStock(account, { symbol: 'ZZZZ', quantity: 1, priceCents: 100 }, at, 'x').ok, false);
        assert.equal(buyStock(account, { symbol: 'AAPL', quantity: 1.5, priceCents: 100 }, at, 'x').ok, false);
        assert.equal(buyStock(account, { symbol: 'AAPL', quantity: 3, priceCents: 20_000 }, at, 'x').ok, false);
    });
});

describe('SqlPositionsReport', () => {
    it('rebuild from the store matches the pure projection, and rebuilding twice is the same', () => {
        const store = new SqlEventStore(new DatabaseSync(':memory:'));
        for (const e of events) assert.equal(store.append('main', e), true);

        const report = new SqlPositionsReport(new DatabaseSync(':memory:'));
        report.rebuild(store.read('main'));
        report.rebuild(store.read('main'));
        assert.deepEqual(report.list(), positionsFrom(events));
    });
});
