// the pure store

import { AccountEvent, AccountIntent } from './account';

export interface EventStore {
    append(stream: string, intent: AccountIntent): boolean,
    read(stream: string): AccountEvent[]
}
