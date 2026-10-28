// infrastructure: a second plug for the same socket. answers from a fixed table

import { Result } from '../domain/account';
import { PriceSource } from '../domain/priceSource';

export class FixedPriceSource implements PriceSource {
    constructor(private readonly pricesCents: Record<string, number>) { }

    async latestPriceCents(symbol: string): Promise<Result<number>> {
        const price = this.pricesCents[symbol];
        if (price === undefined) return { ok: false, error: `no price for ${symbol}` };
        return { ok: true, value: price };
    }
}
