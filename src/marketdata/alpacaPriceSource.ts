// infrastructure: the only file that knows Alpaca exists.
// Rules: every call has a timeout; failures are values; the vendor's JSON is
// checked with zod because it comes from outside the world.

import { z } from 'zod';
import { Result } from '../domain/account';
import { PriceSource } from '../domain/priceSource';

// Shape of GET /v2/stocks/{symbol}/trades/latest — Alpaca's naming, private here.
const LatestTradeResponse = z.object({
    symbol: z.string(),
    trade: z.object({ p: z.number().positive(), t: z.string() }).optional(),
});

export class AlpacaPriceSource implements PriceSource {
    constructor(private readonly keyId: string, private readonly secretKey: string) {}

    async latestPriceCents(symbol: string): Promise<Result<number>> {
        const url = `https://data.alpaca.markets/v2/stocks/${encodeURIComponent(symbol)}/trades/latest?feed=iex`;

        let res: Response;
        try {
            res = await fetch(url, {
                headers: { 'APCA-API-KEY-ID': this.keyId, 'APCA-API-SECRET-KEY': this.secretKey },
                signal: AbortSignal.timeout(5_000),
            });
        } catch (err) {
            return { ok: false, error: `could not reach the market data provider (${(err as Error).name})` };
        }

        if (res.status === 401 || res.status === 403) return { ok: false, error: 'the market data provider rejected the API keys' };
        if (!res.ok) return { ok: false, error: `the market data provider answered ${res.status} for ${symbol}` };

        const body = LatestTradeResponse.safeParse(await res.json());
        if (!body.success) return { ok: false, error: `unexpected answer from the market data provider for ${symbol}` };
        if (!body.data.trade) return { ok: false, error: `no recent trade for ${symbol}` };

        return { ok: true, value: Math.round(body.data.trade.p * 100) };
    }
}
