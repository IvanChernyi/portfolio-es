// composition: the only place that names a file, the clock, env vars, or a vendor

import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import express from 'express';
import { SqlEventStore } from './storage/sqlEventStore';
import { AlpacaPriceSource } from './marketdata/alpacaPriceSource';
import { FixedPriceSource } from './marketdata/fixedPriceSource';
import { PriceSource } from './domain/priceSource';
import { SqlPositionsReport } from './projections/positionsReport';
import { Deps } from './commands/account';
import { createApp } from './http/app';

// Alpaca when both keys are in .env, otherwise fixed demo prices so the app still runs.
function choosePriceSource(): PriceSource {
    const keyId = process.env.APCA_API_KEY_ID;
    const secretKey = process.env.APCA_API_SECRET_KEY;
    if (keyId && secretKey) return new AlpacaPriceSource(keyId, secretKey);
    return new FixedPriceSource({ AAPL: 18500, MSFT: 41000, AMZN: 19000, GOOGL: 17000, META: 55000, NVDA: 13500, TSLA: 24000, JPM: 21000, JNJ: 15500, XOM: 11000 });
}

function main(): void {
    const prices = choosePriceSource();
    const deps: Deps = {
        store: new SqlEventStore(new DatabaseSync('data/events.sqlite')),
        prices,
        now: () => new Date().toISOString(),
    };
    const report = new SqlPositionsReport(new DatabaseSync('data/reports.sqlite'));

    const app = createApp(deps, report);
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const port = Number(process.env.PORT ?? 3000);
    app.listen(port, () => console.log(`portfolio-es at http://localhost:${port} (prices: ${prices instanceof AlpacaPriceSource ? 'Alpaca' : 'fixed demo table'})`));
}

main();

// npm run dev
