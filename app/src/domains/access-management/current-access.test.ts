import { describe, expect, it } from 'vite-plus/test';
import { isAdministrator } from './current-access';

const identity = (enabled: boolean, roles: string[]) => ({
  user: { authorization: { enabled, roles } },
});

describe('current stored administrator capability', () => {
  it('requires the enabled administrator role, never a permission group', () => {
    expect(isAdministrator(identity(true, ['administrator']))).toBe(true);
    expect(isAdministrator(identity(false, ['administrator']))).toBe(false);
    expect(isAdministrator(identity(true, ['editor', 'support']))).toBe(false);
    expect(isAdministrator(identity(true, []))).toBe(false);
    expect(isAdministrator(undefined)).toBe(false);
  });
});

import { canDelegateScopes, hasAccessScope } from './current-access';
describe('stored management scope capability', () => {
  it('permits directory reads and management through custom role grants', () => {
    expect(hasAccessScope(['read:users'], 'read:users')).toBe(true);
    expect(hasAccessScope(['read:users'], 'write:users')).toBe(false);
    expect(hasAccessScope(['write:users'], 'read:users')).toBe(true);
    expect(hasAccessScope(['write:users'], 'write:users')).toBe(true);
  });
  it('does not let limited managers delegate Administrator or wider scopes', () => {
    expect(canDelegateScopes(['write:users','read:customers'],['read:customers'])).toBe(true);
    expect(canDelegateScopes(['write:users','read:customers'],['write:customers'])).toBe(false);
    expect(canDelegateScopes(['write:users','read:customers'],['write:*'])).toBe(false);
    expect(canDelegateScopes(['write:*'],['write:*'])).toBe(true);
  });
});
