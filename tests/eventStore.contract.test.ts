// Contract test: one suite, every implementation of EventStore.
// The SQL store runs on an in-memory database; nothing is mocked.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { AccountEvent } from '../src/domain/account';
import { EventStore } from '../src/domain/eventStore';
import { InMemoryEventStore } from '../src/storage/inMemoryEventStore';
import { SqlEventStore } from '../src/storage/sqlEventStore';

const implementations: Array<[string, () => EventStore]> = [
    ['sql', () => new SqlEventStore(new DatabaseSync(':memory:'))],
    ['memory', () => new InMemoryEventStore()],
];

const at = '2026-10-27T10:00:00.000Z';
const deposit: AccountEvent = { id: 'main', at, type: 'DepositCollected', amountCents: 10000 };
const buy: AccountEvent = { id: 'main', at, type: 'StockBought', symbol: 'AAPL', quantity: 1, priceCents: 5000 };

for (const [name, make] of implementations) {
    describe(`EventStore contract (${name})`, () => {
        it('an unknown stream reads as empty', () => {
            assert.deepEqual(make().read('nobody'), []);
        });

        it('append then read gives the events back unchanged, in order', () => {
            const store = make();
            assert.equal(store.append('main', deposit), true);
            assert.equal(store.append('main', buy), true);
            assert.deepEqual(store.read('main'), [{ ...deposit, seq: 1 }, { ...buy, seq: 2 }]);
        });

        it('seq counts from 1 per stream', () => {
            const store = make();
            store.append('main', deposit);
            store.append('other', buy);
            assert.deepEqual(store.read('other').map((e) => e.seq), [1]);
        });

        it('the same account id on every event is allowed', () => {
            const store = make();
            store.append('main', deposit);
            store.append('main', deposit);
            assert.equal(store.read('main').length, 2);
        });

        it('streams do not leak into each other', () => {
            const store = make();
            store.append('main', deposit);
            store.append('other', buy);
            assert.deepEqual(store.read('main'), [{ ...deposit, seq: 1 }]);
            assert.deepEqual(store.read('other'), [{ ...buy, seq: 1 }]);
        });

        it('what the caller mutates after reading does not reach storage', () => {
            const store = make();
            store.append('main', deposit);
            const copy = store.read('main');
            copy.pop();
            assert.equal(store.read('main').length, 1);
        });
    });
}
