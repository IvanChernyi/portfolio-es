// A price comes from outside the account. The domain only names the socket;
// the plug (Alpaca, a fixed table, ...) lives in the infrastructure layer.

import { Result } from './account';

export interface PriceSource {
    latestPriceCents(symbol: string): Promise<Result<number>>;   // async: the network takes time. Failures are values, never throws.
}
