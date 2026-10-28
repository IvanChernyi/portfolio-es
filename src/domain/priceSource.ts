// price comes from outside the account. the domain - socket only. the plug lives in the infrastructure layer.

import { Result } from './account';

export interface PriceSource {
    latestPriceCents(symbol: string): Promise<Result<number>>;   // async - the network takes time. failures are values
}
