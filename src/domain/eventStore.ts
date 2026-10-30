// the pure store

import { AccountEvent, Stored } from './account';

export interface EventStore {
    append(stream: string, event: AccountEvent): boolean,   // stores exactly what it is given
    read(stream: string): Stored<AccountEvent>[]   // with their position in the stream
}
