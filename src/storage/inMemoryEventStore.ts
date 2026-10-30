// storage: a second plug for the EventStore socket, over an array. Same contract, no database.
// For command tests; not a mock, a real implementation that happens to forget on exit.

import { AccountEvent, Stored } from '../domain/account';
import { EventStore } from '../domain/eventStore';

export class InMemoryEventStore implements EventStore {
    private readonly streams = new Map<string, AccountEvent[]>();

    append(stream: string, event: AccountEvent): boolean {
        const events = this.streams.get(stream) ?? [];
        events.push(event);
        this.streams.set(stream, events);
        return true;
    }

    read(stream: string): Stored<AccountEvent>[] {
        return (this.streams.get(stream) ?? []).map((event, i) => ({ ...event, seq: i + 1 }));   // copies, with their position
    }
}
