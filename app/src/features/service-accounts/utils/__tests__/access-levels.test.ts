import { describe, expect, it } from 'vite-plus/test';

import {
  accessLevelsToScopes,
  applyPreset,
  getAccessLevel,
  includesPreset,
  removePreset,
  setAccessLevel,
} from '../access-levels';

describe('access levels', () => {
  // The page says "Read & write": the token says it too, although the API
  // would take write alone for both.
  it('turns levels into sorted scopes, read & write sending both', () => {
    expect(
      accessLevelsToScopes({
        instances: 'write',
        customers: 'read',
        feature_flags: 'read',
      }),
    ).toEqual([
      'read:customers',
      'read:feature_flags',
      'read:instances',
      'write:instances',
    ]);
    expect(accessLevelsToScopes({})).toEqual([]);
  });

  it('drops a resource set back to no access', () => {
    const levels = setAccessLevel({ licenses: 'read' }, 'licenses', 'none');

    expect(levels).toEqual({});
    expect(getAccessLevel(levels, 'licenses')).toBe('none');
  });

  it('raises the resources a preset names and never lowers one', () => {
    const levels = applyPreset(
      { instances: 'write', webhooks: 'read' },
      { instances: 'read', customers: 'read' },
    );

    expect(levels).toEqual({
      instances: 'write',
      customers: 'read',
      webhooks: 'read',
    });
  });

  it('reads a preset as included once every resource reaches its level', () => {
    const preset = { instances: 'write', customers: 'read' } as const;

    expect(includesPreset({ instances: 'write', customers: 'write' }, preset)).toBe(
      true,
    );
    expect(includesPreset({ instances: 'read', customers: 'read' }, preset)).toBe(
      false,
    );
    expect(includesPreset({}, {})).toBe(true);
  });

  it('takes a preset back out down to what the other presets still need', () => {
    const data = { instances: 'write', feature_flags: 'read' } as const;
    const control = { instances: 'write', releases: 'write' } as const;
    const both = applyPreset(applyPreset({ webhooks: 'read' }, data), control);

    expect(removePreset(both, data, [control])).toEqual({
      instances: 'write',
      releases: 'write',
      webhooks: 'read',
    });
    expect(removePreset(both, control, [])).toEqual({
      feature_flags: 'read',
      webhooks: 'read',
    });
  });
});
