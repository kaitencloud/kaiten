import type { TFunction } from 'i18next';
import { describe, expect, it } from 'vite-plus/test';
import {
  getLifecycleStageLabel,
  getLifecycleStageSuggestions,
  isDefaultLifecycleStage,
  LIFECYCLE_STAGE_DEFAULTS,
} from '../instance-lifecycle-stage';

const translateFallback = ((_: string, fallback?: string) =>
  fallback) as TFunction;

describe('instance lifecycle stage utils', () => {
  it('exposes the default commercial stages in order', () => {
    expect(LIFECYCLE_STAGE_DEFAULTS).toEqual([
      'TRIAL',
      'ACTIVE',
      'AT_RISK',
      'CHURNED',
    ]);
  });

  it('recognizes default stages and rejects custom ones', () => {
    expect(isDefaultLifecycleStage('AT_RISK')).toBe(true);
    expect(isDefaultLifecycleStage('PILOT')).toBe(false);
  });

  it('translates default stages and echoes custom values verbatim', () => {
    expect(getLifecycleStageLabel(translateFallback, 'AT_RISK')).toBe(
      'At risk',
    );
    expect(getLifecycleStageLabel(translateFallback, 'PILOT')).toBe('PILOT');
  });

  it('builds translated suggestions for the combobox', () => {
    expect(getLifecycleStageSuggestions(translateFallback)).toEqual([
      { label: 'Trial', value: 'TRIAL' },
      { label: 'Active', value: 'ACTIVE' },
      { label: 'At risk', value: 'AT_RISK' },
      { label: 'Churned', value: 'CHURNED' },
    ]);
  });
});
