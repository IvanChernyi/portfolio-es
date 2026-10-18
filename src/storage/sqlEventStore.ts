// storage, impure

import { DatabaseSync } from 'node:sqlite';
import { AccountEvent, AccountEventSchema } from '../domain/account';
import { EventStore } from '../domain/eventStore';

interface EventRow {
    payload: string;
}

export class SqlEventStore implements EventStore {
    constructor(private readonly db: DatabaseSync) {
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS events (
                stream  TEXT NOT NULL,
                seq     INTEGER NOT NULL,
                id      TEXT NOT NULL UNIQUE,
                type    TEXT NOT NULL,
                at      TEXT NOT NULL,
                payload TEXT NOT NULL,
                PRIMARY KEY (stream, seq)
            )
        `);
    }

    append(stream: string, event: AccountEvent): boolean {
        try {
            this.db.prepare(
                `INSERT INTO events (stream, seq, id, type, at, payload)
                 VALUES (?, (SELECT COALESCE(MAX(seq), 0) + 1 FROM events WHERE stream = ?), ?, ?, ?, ?)`
            ).run(stream, stream, event.id, event.type, event.at, JSON.stringify(event));
            return true;
        } catch (err) {
            console.error(err);
            return false;
        }
    }

    read(stream: string): AccountEvent[] {
        const rows = this.db.prepare(`SELECT payload FROM events WHERE stream = ? ORDER BY seq`).all(stream) as unknown as EventRow[];
        return rows.map((row) => AccountEventSchema.parse(JSON.parse(row.payload)));
    }
}
