// infrastructure: a second plug for the same socket. Answers from a fixed
// table, so the app runs without keys and tests need no network. Not a mock:
// a real implementation of the interface that happens to be simple.

import { Result } from '../domain/account';
import { PriceSource } from '../domain/priceSource';

export class FixedPriceSource implements PriceSource {
    constructor(private readonly pricesCents: Record<string, number>) {}

    async latestPriceCents(symbol: string): Promise<Result<number>> {
        const price = this.pricesCents[symbol];
        if (price === undefined) return { ok: false, error: `no price for ${symbol}` };
        return { ok: true, value: price };
    }
}
