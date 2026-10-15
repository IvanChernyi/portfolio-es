# zod — runtime shape checking

## The problem it solves

TypeScript types exist only at compile time. Once the program runs they are
gone. So this line is a promise with nothing enforcing it:

```ts
JSON.parse(row.payload) as AccountEvent
```

If a row on disk holds `{"type":"DepositMade","amountCents":"lots"}`, the
cast lets it through and the fold does `balance += "lots"`. No error, wrong
balance.

zod lets you write the shape once more as a *value* that exists at runtime,
then check real data against it. A TypeScript interface describes a shape to
the compiler. A zod schema describes the same shape to the running program.

## What we wrote

```ts
import { z } from 'zod';

const AccountEventSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('DepositMade'),    amountCents: z.number().int().positive() }),
    z.object({ type: z.literal('WithdrawalMade'), amountCents: z.number().int().positive() }),
]);
```

Read it against the interfaces:

| TypeScript | zod |
|---|---|
| `type: 'DepositMade'` | `type: z.literal('DepositMade')` |
| `amountCents: number` | `amountCents: z.number().int().positive()` |
| `Deposit \| Withdrawal` | `z.discriminatedUnion('type', [...])` |

zod can say more than the type: `.int().positive()` rejects `1.5` and `-5`,
which `number` cannot.

## Where it is used

One place: the store, when JSON comes off disk.

```ts
private toEvent(row: EventRow): AccountEvent {
    return AccountEventSchema.parse(JSON.parse(row.payload));
}
```

`parse` returns the value, correctly typed, if it matches. If not, it throws
with a message naming the field and what was expected. The cast is gone.

Throwing is acceptable here because a corrupt row is a storage bug, not a
user mistake, and the store is in the impure zone.

## Proof

Run the demo, then corrupt the first row:

```sql
UPDATE events SET payload = '{"type":"DepositMade","amountCents":"lots"}' WHERE seq = 1;
```

Run again:

```
ZodError: expected number, received string, at amountCents
    at SqlEventStore.toEvent (write.ts:113)
```

Without zod the run printed a balance with no error.

## Rules for using it

- zod lives at the boundaries where JSON crosses into the program: reading
  payloads from the store, and (next) reading request bodies in HTTP routes.
  Never inside the domain. The domain trusts its types because the boundary
  checked them.
- Use `parse` where a failure is a bug (corrupt storage). Use `safeParse`
  where a failure is a user error (an HTTP body): it returns
  `{ success, data | error }` instead of throwing, which maps onto `Result`.
- One schema per shape that crosses a boundary. Keep it next to the interface
  it mirrors so the two are changed together.
- Optional: derive the type from the schema with
  `type AccountEvent = z.infer<typeof AccountEventSchema>` so there is one
  definition instead of two. We kept the hand-written interfaces for now.

## Next use

The HTTP body for a deposit:

```ts
const DepositRequest = z.object({ amountCents: z.number().int().positive() });

const parsed = DepositRequest.safeParse(req.body);
if (!parsed.success) return res.status(400).json({ error: 'amountCents must be a positive whole number' });
reply(res, deposit(deps, parsed.data.amountCents));
```
