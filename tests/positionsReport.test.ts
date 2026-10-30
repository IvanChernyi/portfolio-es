// No mocks: the pure projection is tested on hand-written events,
// the SQL report against a real in-memory database. ! GENERATED !

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountEvent, buyStock, foldAccountEvents, Stored } from '../src/domain/account';
import { positionsFrom, SqlPositionsReport } from '../src/projections/positionsReport';
import { SqlEventStore } from '../src/storage/sqlEventStore';

const at = '2026-10-18T10:00:00.000Z';

const events: Stored<AccountEvent>[] = [
    { seq: 1, id: 'main', at, type: 'DepositCollected', amountCents: 100_000 },
    { seq: 2, id: 'main', at, type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 10000 },
    { seq: 3, id: 'main', at, type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 20000 },
    { seq: 4, id: 'main', at, type: 'StockBought', symbol: 'MSFT', quantity: 1, priceCents: 30000 },
];

describe('positionsFrom', () => {
    it('averages the cost across buys of the same symbol', () => {
        assert.deepEqual(positionsFrom(events), [
            { symbol: 'AAPL', quantity: 4, avgCostCents: 15_000, realizedPnlCents: 0 },
            { symbol: 'MSFT', quantity: 1, avgCostCents: 30_000, realizedPnlCents: 0 },
        ]);
    });

    it('ignores cash events and an empty stream gives no positions', () => {
        assert.deepEqual(positionsFrom([events[0]]), []);
        assert.deepEqual(positionsFrom([]), []);
    });
});

describe('fold with StockBought', () => {
    it('a buy spends cash', () => {
        const account = foldAccountEvents(events);
        assert.equal(account.ok && account.value.balanceCents, 100000 - 20000 - 40000 - 30000);
    });
});

describe('buyStock', () => {
    const account = { id: 'main', balanceCents: 50_000, positions: [], reversedSeqs: [] };
    it('returns a StockBought event when the symbol is known and cash suffices', () => {
        const result = buyStock(account, { symbol: 'AAPL', quantity: 2, priceCents: 20_000 }, at);
        assert.deepEqual(result, { ok: true, value: [{ id: 'main', type: 'StockBought', symbol: 'AAPL', quantity: 2, priceCents: 20_000, at }] });
    });
    it('refuses an unknown symbol, a bad quantity, and a cost above cash', () => {
        assert.equal(buyStock(account, { symbol: 'ZZZZ', quantity: 1, priceCents: 100 }, at).ok, false);
        assert.equal(buyStock(account, { symbol: 'AAPL', quantity: 1.5, priceCents: 100 }, at).ok, false);
        assert.equal(buyStock(account, { symbol: 'AAPL', quantity: 3, priceCents: 20000 }, at).ok, false);
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

describe('positionsFrom with sells', () => {
    it('realizes profit against the average cost and keeps a closed row', () => {
        const sold: AccountEvent[] = [
            ...events,
            { id: 'main', at, type: 'StockSold', symbol: 'AAPL', quantity: 4, priceCents: 20000 },
        ];   // positionsFrom takes plain events; a Stored event is also a plain event
        assert.deepEqual(positionsFrom(sold), [
            { symbol: 'AAPL', quantity: 0, avgCostCents: 15_000, realizedPnlCents: (20000 - 15000) * 4 },
            { symbol: 'MSFT', quantity: 1, avgCostCents: 30_000, realizedPnlCents: 0 },
        ]);
    });
});

describe('SqlPositionsReport.summary', () => {
    it('sums cost basis over open rows, realized P&L over all rows, and counts open positions', () => {
        const report = new SqlPositionsReport(new DatabaseSync(':memory:'));
        report.rebuild([
            ...events,
            { id: 'main', at, type: 'StockSold', symbol: 'AAPL', quantity: 4, priceCents: 20000 },   // closes AAPL at +20000
        ]);
        assert.deepEqual(report.summary(), { investedCents: 1 * 30_000, realizedPnlCents: 20_000, openPositions: 1 });
    });

    it('an empty report sums to zeros', () => {
        const report = new SqlPositionsReport(new DatabaseSync(':memory:'));
        report.rebuild([]);
        assert.deepEqual(report.summary(), { investedCents: 0, realizedPnlCents: 0, openPositions: 0 });
    });
});
