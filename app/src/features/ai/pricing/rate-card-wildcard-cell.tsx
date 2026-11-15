import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Model } from '@/api-client';
import {
  type AiRequestType,
  modelShowsRequestType,
  priceUsage,
  wildcardCoverage,
} from './engine';
import { PricingChip } from './pricing-chip';
import { formatCredits } from './pricing-format';
import {
  CellAction,
  CellAmount,
  CellNote,
  RateCardCellButton,
} from './rate-card-cell';
import {
  type CellRef,
  type RateCardVersion,
  wildcardOf,
} from './rate-card-model';
import { usePricingLabels } from './use-pricing-labels';

type WildcardCellProps = {
  /** The whole catalogue: a wildcard prices models the filters hide too. */
  models: readonly Model[];
  onSelect: (cell: CellRef) => void;
  reference: AiUsage;
  selected: boolean;
  type: AiRequestType;
  version: RateCardVersion;
};

/**
 * The "Any model" cell of a version: its wildcard for this request type (the
 * typed one, else the one for any type), what it charges for the reference call
 * and how many models it prices today.
 */
export const WildcardCell = memo(function WildcardCell({
  models,
  onSelect,
  reference,
  selected,
  type,
  version,
}: WildcardCellProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const wildcard = wildcardOf(version.rules, type);
  const button = {
    cell: { licenseSlug: version.slug, modelSlug: null },
    onSelect,
    selected,
  };

  if (wildcard === null) {
    return (
      <RateCardCellButton
        {...button}
        flagged={version.flagged}
        label={t('AI.Pricing.wildcard.label.none', { version: version.name })}
      >
        {version.flagged ? (
          <CellNote className="text-sm font-semibold text-warning-subtle-foreground">
            {t('AI.Pricing.cell.noRuleRefused')}
          </CellNote>
        ) : (
          <>
            <CellNote className="text-sm">
              {t('AI.Pricing.wildcard.none')}
            </CellNote>
            <CellNote>{t('AI.Pricing.wildcard.noneHint')}</CellNote>
          </>
        )}
        <CellAction>{t('AI.Pricing.wildcard.add')}</CellAction>
      </RateCardCellButton>
    );
  }

  const price = priceUsage(wildcard, reference, 'SUCCESS');
  const covered = wildcardCoverage(
    wildcard,
    version.rules,
    models,
    type,
  ).filter((model) => modelShowsRequestType(model, type)).length;
  const rates = labels.rateSummary(wildcard);

  return (
    <RateCardCellButton
      {...button}
      label={
        price.ok
          ? t('AI.Pricing.wildcard.label.priced', {
              version: version.name,
              credits: formatCredits(price.charged),
              rates,
            })
          : t('AI.Pricing.wildcard.label.rates', {
              version: version.name,
              rates,
            })
      }
    >
      {price.ok ? (
        <CellAmount credits={price.charged} />
      ) : (
        <CellNote className="text-sm">{t('AI.Pricing.cell.invalid')}</CellNote>
      )}
      <CellNote>{rates}</CellNote>
      <span className="flex flex-wrap gap-1">
        <PricingChip tone="neutral">
          {labels.wildcardName(wildcard)}
        </PricingChip>
        <PricingChip tone="neutral">
          {t('AI.Pricing.wildcard.prices', { count: covered })}
        </PricingChip>
      </span>
    </RateCardCellButton>
  );
});
