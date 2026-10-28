// The fixed plug is tested like any implementation of the socket: ask, look at the Result.
// The Alpaca plug is infrastructure and is proven by running the app with a real key.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { FixedPriceSource } from '../src/marketdata/fixedPriceSource';

describe('FixedPriceSource', () => {
    const prices = new FixedPriceSource({ AAPL: 15000, MSFT: 40000 });

    it('answers a known symbol with its price in cents', async () => {
        assert.deepEqual(await prices.latestPriceCents('AAPL'), { ok: true, value: 15000 });
    });

    it('answers an unknown symbol with a failure, not a throw', async () => {
        assert.deepEqual(await prices.latestPriceCents('ZZZZ'), { ok: false, error: 'no price for ZZZZ' });
    });
});
