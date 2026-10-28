// http edge: translate the request, delegate, answer. no business rules here. ! GENERATED !

import express from 'express';
import { z } from 'zod';
import { ACCOUNT_ID, buy, Deps, deposit, loadAccount, sell, withdraw } from '../commands/account';
import { Result } from '../domain/account';
import { STOCKS } from '../domain/instruments';
import { SqlPositionsReport } from '../projections/positionsReport';

// zod at the edge: request bodies come from outside the world
const AmountBody = z.object({ amountCents: z.number().int().positive() });
const OrderBody = z.object({ side: z.enum(['buy', 'sell']), symbol: z.string(), quantity: z.number().int().positive(), priceCents: z.number().int().positive() });

// the one translator from a Result to an HTTP answer
function reply(res: express.Response, result: Result<unknown>): void {
    if (result.ok) res.status(200).json(result.value ?? {});
    else res.status(400).json({ error: result.error });
}

export function createApp(deps: Deps, report: SqlPositionsReport): express.Express {
    const app = express();
    app.use(express.json());

    // write side → commands
    app.post('/api/deposits', (req, res) => {
        const body = AmountBody.safeParse(req.body);
        if (!body.success) return reply(res, { ok: false, error: 'amountCents must be a positive whole number' });
        reply(res, deposit(deps, body.data.amountCents));
    });

    app.post('/api/withdrawals', (req, res) => {
        const body = AmountBody.safeParse(req.body);
        if (!body.success) return reply(res, { ok: false, error: 'amountCents must be a positive whole number' });
        reply(res, withdraw(deps, body.data.amountCents));
    });

    app.post('/api/orders', (req, res) => {
        const body = OrderBody.safeParse(req.body);
        if (!body.success) return reply(res, { ok: false, error: 'side, symbol, quantity and priceCents are required' });
        const order = { symbol: body.data.symbol.toUpperCase(), quantity: body.data.quantity, priceCents: body.data.priceCents };
        reply(res, body.data.side === 'sell' ? sell(deps, order) : buy(deps, order));
    });

    // read side
    app.get('/api/events', (_req, res) => {
        res.json(deps.store.read(ACCOUNT_ID));
    });

    app.get('/api/account', (_req, res) => {
        reply(res, loadAccount(deps));
    });

    app.get('/api/positions', (_req, res) => {
        report.rebuild(deps.store.read(ACCOUNT_ID));   // projection runs on read for now
        res.json(report.list());
    });

    app.get('/api/stocks', (_req, res) => {
        res.json(STOCKS);
    });

    app.get('/api/prices/:symbol', async (req, res) => {
        const symbol = req.params.symbol.toUpperCase();
        const price = await deps.prices.latestPriceCents(symbol);
        if (!price.ok) return reply(res, price);
        res.json({ symbol, priceCents: price.value });
    });

    return app;
}
