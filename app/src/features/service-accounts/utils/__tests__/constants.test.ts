import { describe, expect, it } from 'vite-plus/test';

import { API_SCOPE_RESOURCES, API_SCOPES } from '@/lib/api/scopes.gen';
import en from '@/lib/i18n/locales/en';
import fr from '@/lib/i18n/locales/fr';

import { accessLevelsToScopes } from '../access-levels';
import {
  AVAILABLE_RESOURCES,
  SCOPE_GROUP_IDS,
  TOKEN_PRESET_IDS,
  TOKEN_PRESETS,
} from '../constants';

type Described = { label: string; description: string };
type ScopesDict = {
  Groups: Record<string, Described>;
  Presets: Record<string, Described>;
  Resources: Record<string, Described>;
};

// `unknown` rather than `typeof en`: each locale infers its own string-literal
// types, so fr is not assignable to en's shape even though the trees match.
const scopeTranslations = (locale: unknown): ScopesDict =>
  (
    locale as {
      Pages: { Integrations: { ServiceAccounts: { Scopes: ScopesDict } } };
    }
  ).Pages.Integrations.ServiceAccounts.Scopes;

const LOCALES = { en, fr } as const;

const segmentOf = (key: string) => key.split('.').at(-2)!;

describe('service-account scope vocabulary', () => {
  // AVAILABLE_RESOURCES used to be a hand-written mirror of the backend's scopes
  // and drifted both ways; then it was read off the Core operations, which left
  // out webhooks, enforced by the webhooks service on the same tokens.
  it('offers every scope an organization credential can carry', () => {
    expect(AVAILABLE_RESOURCES.map((r) => r.id)).toEqual([
      ...API_SCOPE_RESOURCES,
    ]);
    expect(API_SCOPES).toContain('write:webhooks');
  });

  it('derives camelCase i18n keys from snake_case scope names', () => {
    const zones = AVAILABLE_RESOURCES.find(
      (r) => r.id === 'deployment_zones',
    )!;

    expect(zones.labelKey).toBe(
      'Pages.Integrations.ServiceAccounts.Scopes.Resources.deploymentZones.label',
    );
    expect(zones.fallbackLabel).toBe('Deployment zones');
  });

  it('places every resource in a group the page shows', () => {
    for (const resource of AVAILABLE_RESOURCES) {
      expect(SCOPE_GROUP_IDS).toContain(resource.group);
    }
  });

  // A resource the page cannot name is a checkbox nobody can judge. The
  // generated list brings a new scope in on its own; this is what asks for the
  // words to go with it, in both locales, in the same change.
  it.each(Object.entries(LOCALES))(
    'describes every resource, group and preset in %s',
    (_name, locale) => {
      const scopes = scopeTranslations(locale);

      for (const { id, labelKey } of AVAILABLE_RESOURCES) {
        const entry = scopes.Resources[segmentOf(labelKey)];
        expect(entry?.label, `resource "${id}" has no label`).toBeTruthy();
        expect(
          entry?.description,
          `resource "${id}" has no description`,
        ).toBeTruthy();
      }
      for (const group of SCOPE_GROUP_IDS) {
        expect(scopes.Groups[group]?.label, `group "${group}"`).toBeTruthy();
      }
      for (const preset of TOKEN_PRESET_IDS) {
        expect(scopes.Presets[preset]?.label, `preset "${preset}"`).toBeTruthy();
        expect(
          scopes.Presets[preset]?.description,
          `preset "${preset}"`,
        ).toBeTruthy();
      }
    },
  );

  it('leaves no orphaned resource translations behind', () => {
    const segments = new Set(
      AVAILABLE_RESOURCES.map((r) => segmentOf(r.labelKey)),
    );

    for (const locale of Object.values(LOCALES)) {
      for (const segment of Object.keys(scopeTranslations(locale).Resources)) {
        expect(
          segments,
          `"${segment}" is translated, but no longer a scope a token can carry`,
        ).toContain(segment);
      }
    }
  });
});

describe('token presets', () => {
  // The `users` bug in its other form: a preset naming a scope the API does not
  // offer renders access that grants nothing.
  it('grant only scopes a token can carry', () => {
    for (const preset of TOKEN_PRESET_IDS) {
      for (const scope of accessLevelsToScopes(TOKEN_PRESETS[preset])) {
        expect(API_SCOPES, `preset "${preset}"`).toContain(scope);
      }
    }
  });

  // What an SDK inside the product calls: OFREP evaluation, and usage reports,
  // which the API files under an instance. Reading the catalog is enough; editing
  // it is a control-plane job.
  it('give the data plane what the SDK runtime calls, and no catalog writes', () => {
    const scopes = accessLevelsToScopes(TOKEN_PRESETS.dataPlane);

    expect(scopes).toEqual(
      expect.arrayContaining(['read:feature_flags', 'write:instances']),
    );
    expect(scopes).not.toContain('write:entitlements');
    expect(scopes).not.toContain('write:feature_flags');
  });
});
