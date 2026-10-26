// read side

import { DatabaseSync } from 'node:sqlite';
import { AccountEvent } from '../domain/account';

// The report keeps closed positions (quantity 0) so their realized P&L stays visible.
export interface PositionReport {
    symbol: string,
    quantity: number,
    avgCostCents: number,
    realizedPnlCents: number
}

// pure, events in, report rows out. testable without a database.
// The read side keeps its own fold: it tracks realized P&L, which no business rule needs.
export function positionsFrom(events: AccountEvent[]): PositionReport[] {
    const bySymbol: Record<string, PositionReport> = {};
    for (const event of events) {
        if (event.type !== 'StockBought' && event.type !== 'StockSold') continue;
        const held = bySymbol[event.symbol] ?? { symbol: event.symbol, quantity: 0, avgCostCents: 0, realizedPnlCents: 0 };
        if (event.type === 'StockBought') {
            const totalCost = held.quantity * held.avgCostCents + event.quantity * event.priceCents;
            const quantity = held.quantity + event.quantity;
            bySymbol[event.symbol] = { ...held, quantity, avgCostCents: Math.round(totalCost / quantity) };
        } else {
            const realized = (event.priceCents - held.avgCostCents) * event.quantity;
            bySymbol[event.symbol] = { ...held, quantity: held.quantity - event.quantity, realizedPnlCents: held.realizedPnlCents + realized };
        }
    }
    return Object.values(bySymbol);
}

interface PositionRow {
    symbol: string,
    quantity: number,
    avg_cost_cents: number,
    realized_pnl_cents: number
}

export class SqlPositionsReport {
    constructor(private readonly db: DatabaseSync) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS positions_report (
                symbol             TEXT PRIMARY KEY,
                quantity           INTEGER NOT NULL,
                avg_cost_cents     INTEGER NOT NULL,
                realized_pnl_cents INTEGER NOT NULL
            )
        `);
    }

    // wipe and rebuild from events. no incremental checkpoints yet
    rebuild(events: AccountEvent[]): void {
        this.db.exec(`DELETE FROM positions_report`);
        const insert = this.db.prepare(`INSERT INTO positions_report (symbol, quantity, avg_cost_cents, realized_pnl_cents) VALUES (?, ?, ?, ?)`);
        for (const p of positionsFrom(events)) insert.run(p.symbol, p.quantity, p.avgCostCents, p.realizedPnlCents);
    }

    list(): PositionReport[] {
        const rows = this.db.prepare(`SELECT symbol, quantity, avg_cost_cents, realized_pnl_cents FROM positions_report ORDER BY symbol`).all() as unknown as PositionRow[];
        return rows.map((r) => ({ symbol: r.symbol, quantity: r.quantity, avgCostCents: r.avg_cost_cents, realizedPnlCents: r.realized_pnl_cents }));
    }
}
