import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  getInstanceStatusFilterOptions,
  getInstanceStatusLabel,
  INSTANCE_STATUS_VALUES,
} from '../instance-status';

const translateFallback = ((_: string, fallback?: string) =>
  fallback) as TFunction;

describe('instance status utils', () => {
  it('returns the supported status cycle in API order', () => {
    expect(INSTANCE_STATUS_VALUES).toEqual([
      'HEALTHY',
      'DEGRADED',
      'INCIDENT',
      'MAINTENANCE',
    ]);
  });

  it('builds translated filter options for the instances table', () => {
    expect(getInstanceStatusFilterOptions(translateFallback)).toEqual([
      { label: 'Healthy', value: 'HEALTHY' },
      { label: 'Degraded', value: 'DEGRADED' },
      { label: 'Incident', value: 'INCIDENT' },
      { label: 'Maintenance', value: 'MAINTENANCE' },
    ]);
  });

  it('returns a label for each operational status', () => {
    expect(getInstanceStatusLabel(translateFallback, 'INCIDENT')).toBe(
      'Incident',
    );
  });
});
