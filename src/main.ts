// composition: the only place that names a file, the clock, or the id generator

import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import express from 'express';
import { SqlEventStore } from './storage/sqlEventStore';
import { SqlPositionsReport } from './projections/positionsReport';
import { Deps } from './commands/account';
import { createApp } from './http/app';

function main(): void {
    const deps: Deps = {
        store: new SqlEventStore(new DatabaseSync('data/events.sqlite')),
        now: () => new Date().toISOString(),
        newId: () => randomUUID(),
    };
    const report = new SqlPositionsReport(new DatabaseSync('data/reports.sqlite'));

    const app = createApp(deps, report);
    app.use(express.static(path.join(__dirname, '..', 'public')));

    const port = Number(process.env.PORT ?? 3000);
    app.listen(port, () => console.log(`portfolio-es at http://localhost:${port}`));
}

main();

// npm run dev
