import { describe, expect, it } from 'vite-plus/test';
import * as sdk from '@/api-client';
import { OPERATION_SCOPES } from '@/lib/api/operation-scopes.gen';
import { API_SCOPES } from '@/lib/api/scopes.gen';
import {
  BILLING_ACTIONS,
  type BillingAction,
  canPerformAction,
  getActionOperation,
  getActionScopes,
} from '../logic';

const actions = Object.keys(BILLING_ACTIONS) as BillingAction[];

// Three kinds of session: who may do what is the scopes of its token.
const U_ADMIN = ['read:*', 'write:*'];
const U_READER = [
  'read:billing',
  'read:licenses',
  'read:instances',
  'read:customers',
];
const U_SALES = [
  'read:billing',
  'write:billing',
  'read:instances',
  'write:instances',
  'read:licenses',
];

describe('billing actions', () => {
  it('calls only operations the generated SDK exposes', () => {
    const sdkFunctions = new Set(
      Object.entries(sdk).flatMap(([name, value]) =>
        typeof value === 'function' ? [name] : [],
      ),
    );

    expect(
      actions.filter((action) => !sdkFunctions.has(getActionOperation(action))),
    ).toEqual([]);
  });

  it('needs, for every action, a scope a token can carry', () => {
    const carried = new Set<string>(API_SCOPES);

    for (const action of actions) {
      const scopes = getActionScopes(action);

      expect(scopes.length, action).toBeGreaterThan(0);
      expect(
        scopes.filter((scope) => !carried.has(scope)),
        action,
      ).toEqual([]);
    }
  });

  it('takes the scope of an action from the contract, never from here', () => {
    for (const action of actions) {
      expect(getActionScopes(action)).toBe(
        OPERATION_SCOPES[getActionOperation(action)],
      );
    }
    expect(getActionScopes('invoice.markPaid')).toEqual(['write:billing']);
    expect(getActionScopes('invoices.list')).toEqual(['read:billing']);
    expect(getActionScopes('licensePrices.preview')).toEqual(['read:licenses']);
    expect(getActionScopes('licensePrices.create')).toEqual(['write:licenses']);
    expect(getActionScopes('customer.updateBillingEmail')).toEqual([
      'write:customers',
    ]);
  });

  it('offers a reader what it can read, and nothing it can change', () => {
    expect(canPerformAction(U_READER, 'invoices.list')).toBe(true);
    expect(canPerformAction(U_READER, 'invoices.export')).toBe(true);
    expect(canPerformAction(U_READER, 'licensePrices.read')).toBe(true);
    for (const action of [
      'invoice.markPaid',
      'invoice.writeOff',
      'invoice.void',
      'invoice.recompose',
      'invoice.releaseHold',
      'handoff.acknowledge',
      'subscription.subscribe',
      'settings.update',
      'licensePrices.create',
    ] as const) {
      expect(canPerformAction(U_READER, action), action).toBe(false);
    }
  });

  it('offers sales the actions of its scopes, and not the licenses it cannot write', () => {
    expect(canPerformAction(U_SALES, 'invoice.markPaid')).toBe(true);
    expect(canPerformAction(U_SALES, 'subscription.subscribe')).toBe(true);
    expect(canPerformAction(U_SALES, 'licensePrices.create')).toBe(false);
    expect(canPerformAction(U_SALES, 'customer.updateBillingEmail')).toBe(false);
  });

  it('offers an administrator everything', () => {
    expect(actions.filter((action) => !canPerformAction(U_ADMIN, action))).toEqual(
      [],
    );
  });

  it('offers every action while the scopes of the session are unknown', () => {
    expect(actions.filter((action) => !canPerformAction(null, action))).toEqual(
      [],
    );
  });
});
