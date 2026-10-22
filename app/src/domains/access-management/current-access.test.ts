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
