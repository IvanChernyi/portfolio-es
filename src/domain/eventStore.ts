// the pure store

import { AccountEvent, NewAccountEvent } from './account';

export interface EventStore {
    append(stream: string, event: NewAccountEvent): boolean,   // the store mints the id
    read(stream: string): AccountEvent[]
}
