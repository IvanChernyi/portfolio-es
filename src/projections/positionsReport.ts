// Read side: the positions report. Built from the events, shown by the UI.
// The write side does not read this table; the fold protects invariants on its own.

import { DatabaseSync } from 'node:sqlite';
import { AccountEvent } from '../domain/account';

export interface Position {
    symbol: string,
    quantity: number,
    avgCostCents: number
}

// Pure: events in, positions out. The projector's arithmetic, testable without a database.
export function positionsFrom(events: AccountEvent[]): Position[] {
    const bySymbol: Record<string, Position> = {};
    for (const event of events) {
        if (event.type !== 'StockBought') continue;
        const held = bySymbol[event.symbol] ?? { symbol: event.symbol, quantity: 0, avgCostCents: 0 };
        const totalCost = held.quantity * held.avgCostCents + event.quantity * event.priceCents;
        const quantity = held.quantity + event.quantity;
        bySymbol[event.symbol] = { symbol: event.symbol, quantity, avgCostCents: Math.round(totalCost / quantity) };
    }
    return Object.values(bySymbol);
}

interface PositionRow {
    symbol: string,
    quantity: number,
    avg_cost_cents: number
}

export class SqlPositionsReport {
    constructor(private readonly db: DatabaseSync) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS positions_report (
                symbol         TEXT PRIMARY KEY,
                quantity       INTEGER NOT NULL,
                avg_cost_cents INTEGER NOT NULL
            )
        `);
    }

    // Wipe and rebuild from all events. Simple and always correct; incremental
    // checkpoints come when the stream is long enough to need them.
    rebuild(events: AccountEvent[]): void {
        this.db.exec(`DELETE FROM positions_report`);
        const insert = this.db.prepare(`INSERT INTO positions_report (symbol, quantity, avg_cost_cents) VALUES (?, ?, ?)`);
        for (const p of positionsFrom(events)) insert.run(p.symbol, p.quantity, p.avgCostCents);
    }

    list(): Position[] {
        const rows = this.db.prepare(`SELECT symbol, quantity, avg_cost_cents FROM positions_report ORDER BY symbol`).all() as unknown as PositionRow[];
        return rows.map((r) => ({ symbol: r.symbol, quantity: r.quantity, avgCostCents: r.avg_cost_cents }));
    }
}
