// Pure domain tests: no store, no clock, no fakes. Build an account by hand,
// call the business verb, look at the event it returns.

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Account, collectDeposit, sendWithdrawal } from '../src/domain/account';

// The time and the id are inputs, so a test just picks them.
const at = '2026-10-19T10:00:00.000Z';
const id = 'evt-1';

const empty: Account = { id: 'main', balanceCents: 0 };
const funded: Account = { id: 'main', balanceCents: 50_000 };

describe('collectDeposit', () => {
    it('returns a DepositCollected event with the id and time it was given', () => {
        const result = collectDeposit(empty, 20_000, at, id);
        assert.deepEqual(result, {
            ok: true,
            value: { id: 'evt-1', type: 'DepositCollected', amountCents: 20_000, at },
        });
    });

    it('refuses zero, negative, fractional and NaN amounts', () => {
        for (const bad of [0, -5, 10.5, NaN]) {
            const result = collectDeposit(empty, bad, at, id);
            assert.equal(result.ok, false, `amount ${bad} should be refused`);
        }
    });

    it('does not care about the balance', () => {
        assert.equal(collectDeposit(empty, 1, at, id).ok, true);
        assert.equal(collectDeposit(funded, 1, at, id).ok, true);
    });
});

describe('sendWithdrawal', () => {
    it('returns a WithdrawalSent event when cash suffices', () => {
        const result = sendWithdrawal(funded, 30_000, at, id);
        assert.deepEqual(result, {
            ok: true,
            value: { id: 'evt-1', type: 'WithdrawalSent', amountCents: 30_000, at },
        });
    });

    it('allows withdrawing exactly the balance', () => {
        assert.equal(sendWithdrawal(funded, 50_000, at, id).ok, true);
    });

    it('refuses one cent more than the balance, with the reason', () => {
        const result = sendWithdrawal(funded, 50_001, at, id);
        assert.deepEqual(result, { ok: false, error: 'insufficient cash' });
    });

    it('refuses a bad amount before looking at the balance', () => {
        const result = sendWithdrawal(funded, -5, at, id);
        assert.equal(result.ok, false);
        if (!result.ok) assert.notEqual(result.error, 'insufficient cash');
    });
});
