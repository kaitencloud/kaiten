import type { TFunction } from 'i18next';
import type { AiUsage } from '@/api-client';
import { formatNumber } from '@/lib/format-date';

/**
 * A usage in words, as reported: tokens by kind ("1,240 input · 3,100 cache
 * read · 380 output tokens"), units of their type ("2 images"), or a duration.
 * Only what was reported is listed; nothing is an em dash.
 */
export function usageLabel(t: TFunction, usage: AiUsage | undefined): string {
  if (!usage) {
    return t('AI.Usage.usage.none');
  }
  const tokens = [
    ['input', usage.inputTokens],
    ['cacheRead', usage.cacheReadInputTokens],
    ['cacheWrite', usage.cacheWriteInputTokens],
    ['output', usage.outputTokens],
  ] as const;
  const parts = tokens
    .filter(([, count]) => count != null)
    .map(([key, count]) =>
      t(`AI.Usage.usage.${key}`, { count: formatNumber(count ?? 0) }),
    );
  if (parts.length) {
    return t('AI.Usage.usage.tokens', { parts: parts.join(' · ') });
  }
  if (usage.units != null) {
    const count = Number(usage.units);

    return t(`AI.Usage.usage.${usage.unitType ?? 'unit'}`, { count });
  }
  if (usage.durationMs != null) {
    return t('AI.Usage.usage.duration', {
      seconds: formatNumber(usage.durationMs / 1000),
    });
  }

  return t('AI.Usage.usage.none');
}
