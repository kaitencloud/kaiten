import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage } from '@/api-client';
import {
  type AiRequestType,
  type PricingRule,
  type RateKey,
  type Specificity,
} from './engine';
import { formatCount, formatRate } from './pricing-format';

const RATE_KEYS: readonly RateKey[] = [
  'perRequest',
  'perInputToken',
  'perCachedInputToken',
  'perCacheWriteToken',
  'perOutputToken',
  'perUnit',
  'perSecond',
];

const RATE_UNIT_KEYS = {
  perRequest: 'AI.Pricing.rateUnits.perRequest',
  perInputToken: 'AI.Pricing.rateUnits.perInputToken',
  perCachedInputToken: 'AI.Pricing.rateUnits.perCachedInputToken',
  perCacheWriteToken: 'AI.Pricing.rateUnits.perCacheWriteToken',
  perOutputToken: 'AI.Pricing.rateUnits.perOutputToken',
  perUnit: 'AI.Pricing.rateUnits.perUnit',
  perSecond: 'AI.Pricing.rateUnits.perSecond',
} as const satisfies Record<RateKey, string>;

const TYPE_KEYS = {
  COMPLETION: 'AI.Pricing.types.COMPLETION',
  EMBEDDING: 'AI.Pricing.types.EMBEDDING',
  IMAGE_GENERATION: 'AI.Pricing.types.IMAGE_GENERATION',
  AUDIO: 'AI.Pricing.types.AUDIO',
  VIDEO: 'AI.Pricing.types.VIDEO',
} as const satisfies Record<AiRequestType, string>;

const MS_PER_SECOND = 1000;

/**
 * The words the rate card and its panel share: a request type, where a price
 * comes from, a rule's rates on one line and a usage on one line.
 */
export function usePricingLabels() {
  const { t } = useTranslation();

  return useMemo(() => {
    const typeLabel = (type: AiRequestType) => t(TYPE_KEYS[type]);
    const typeInSentence = (type: AiRequestType) =>
      typeLabel(type).toLocaleLowerCase();

    /** `Own rule`, or `Via any model · completion`. */
    const provenance = (specificity: Specificity, type: AiRequestType) => {
      switch (specificity) {
        case 'EXACT_TYPED':
          return t('AI.Pricing.cell.ownRule');
        case 'EXACT_ALL':
          return t('AI.Pricing.cell.ownRuleAnyType');
        case 'ANY_TYPED':
          return t('AI.Pricing.cell.viaAnyTyped', {
            type: typeInSentence(type),
          });
        default:
          return t('AI.Pricing.cell.viaAnyAll');
      }
    };

    /** `Any model · completion`, the name of a wildcard. */
    const wildcardName = (rule: Pick<PricingRule, 'requestType'>) =>
      rule.requestType
        ? t('AI.Pricing.wildcard.anyTyped', {
            type: typeInSentence(rule.requestType),
          })
        : t('AI.Pricing.wildcard.anyAll');

    /** `0.0005 / input token · 0.0025 / output token`. */
    const rateSummary = (rule: Pick<PricingRule, 'rates'>) =>
      RATE_KEYS.flatMap((key) => {
        const rate = rule.rates[key];

        return rate == null
          ? []
          : [`${formatRate(rate)} ${t(RATE_UNIT_KEYS[key])}`];
      }).join(' · ') || t('AI.Pricing.wildcard.noRate');

    /** `1,500 input tokens · 500 output tokens`. */
    const usageLabel = (usage: AiUsage) => {
      const parts: string[] = [];
      const tokens = (
        value: number | undefined,
        key:
          | 'AI.Pricing.usage.inputTokens'
          | 'AI.Pricing.usage.cacheReadTokens'
          | 'AI.Pricing.usage.cacheWriteTokens'
          | 'AI.Pricing.usage.outputTokens',
      ) => {
        if (value != null) {
          parts.push(t(key, { count: value, formatted: formatCount(value) }));
        }
      };
      tokens(usage.inputTokens, 'AI.Pricing.usage.inputTokens');
      tokens(usage.cacheReadInputTokens, 'AI.Pricing.usage.cacheReadTokens');
      tokens(usage.cacheWriteInputTokens, 'AI.Pricing.usage.cacheWriteTokens');
      tokens(usage.outputTokens, 'AI.Pricing.usage.outputTokens');
      if (usage.durationMs != null) {
        const seconds = usage.durationMs / MS_PER_SECOND;
        parts.push(
          t('AI.Pricing.usage.seconds', {
            count: seconds,
            formatted: formatRate(String(seconds)),
          }),
        );
      } else if (usage.units != null) {
        const count = Number(usage.units);
        const formatted = formatRate(usage.units);
        parts.push(
          usage.unitType === 'image'
            ? t('AI.Pricing.usage.images', { count, formatted })
            : usage.unitType === 'second'
              ? t('AI.Pricing.usage.seconds', { count, formatted })
              : t('AI.Pricing.usage.units', { count, formatted }),
        );
      }

      return parts.join(' · ') || t('AI.Pricing.usage.none');
    };

    return {
      provenance,
      rateSummary,
      typeLabel,
      typeInSentence,
      usageLabel,
      wildcardName,
    };
  }, [t]);
}

export type PricingLabels = ReturnType<typeof usePricingLabels>;
