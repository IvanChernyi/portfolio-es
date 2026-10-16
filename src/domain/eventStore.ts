// The store's contract. A pure type: it lives with the domain, the SQL class lives at the edge.

import { AccountEvent, AccountIntent } from './account';

export interface EventStore {
    append(stream: string, intent: AccountIntent): boolean,   // the store adds id and at
    read(stream: string): AccountEvent[]                      // full events, envelope included
}
