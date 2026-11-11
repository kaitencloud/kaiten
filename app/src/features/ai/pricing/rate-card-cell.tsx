import { TrendingDown } from 'lucide-react';
import { memo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { addonGrantLabel } from '@/domains/ai-credits';
import { cn } from '@/lib/utils';
import {
  type AiRequestType,
  buildRateCardCell,
  isOwnRule,
  type RateCardCell,
} from './engine';
import { PricingChip } from './pricing-chip';
import {
  formatCredits,
  formatMargin,
  formatUsd,
  isNegativeDecimal,
} from './pricing-format';
import {
  type CellRef,
  formatCell,
  type RateCardVersion,
} from './rate-card-model';
import { type PricingLabels, usePricingLabels } from './use-pricing-labels';

const HATCHED =
  'bg-[repeating-linear-gradient(135deg,var(--warning-subtle),var(--warning-subtle)_6px,transparent_6px,transparent_12px)]';

type CellButtonProps = {
  cell: CellRef;
  children: ReactNode;
  /** Hatched: the version grants the pool and nothing prices the call. */
  flagged?: boolean;
  label: string;
  onSelect: (cell: CellRef) => void;
  selected: boolean;
};

/**
 * One cell of the grid: a button that opens the panel beside it. Its accessible
 * name says the model, the version and the price, since the grid is read cell
 * by cell.
 */
export function RateCardCellButton({
  cell,
  children,
  flagged = false,
  label,
  onSelect,
  selected,
}: CellButtonProps) {
  return (
    <Button
      aria-label={label}
      aria-pressed={selected}
      className={cn(
        'h-full min-h-16 w-full flex-col items-start justify-start gap-1 rounded-none px-3 py-2 text-left font-normal whitespace-normal',
        'focus-visible:ring-inset',
        flagged && HATCHED,
        selected && 'bg-accent ring-2 ring-primary ring-inset hover:bg-accent',
      )}
      data-cell={formatCell(cell)}
      onClick={() => onSelect(cell)}
      type="button"
      variant="ghost"
    >
      {children}
    </Button>
  );
}

export function CellAmount({ credits }: { credits: string }) {
  const { t } = useTranslation();

  return (
    <span className="text-sm font-semibold tabular-nums">
      {formatCredits(credits)}{' '}
      <span className="text-xs font-medium text-muted-foreground">
        {t('AI.Pricing.cell.credits')}
      </span>
    </span>
  );
}

export function CellNote({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn('text-xs text-muted-foreground tabular-nums', className)}
    >
      {children}
    </span>
  );
}

export function CellAction({ children }: { children: ReactNode }) {
  return (
    <span className="text-xs font-semibold text-primary-subtle-foreground">
      {children}
    </span>
  );
}

/** A margin: the sign and an icon say it is negative, not the colour alone. */
export function MarginValue({ margin }: { margin: string }) {
  const { t } = useTranslation();
  const negative = isNegativeDecimal(margin);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 font-semibold',
        negative && 'text-destructive-subtle-foreground',
      )}
    >
      {negative ? (
        <TrendingDown
          aria-label={t('AI.Pricing.cell.negativeMargin')}
          className="size-3"
          role="img"
        />
      ) : null}
      {formatMargin(margin)}
    </span>
  );
}

type PricedProps = {
  cell: RateCardCell;
  labels: PricingLabels;
  type: AiRequestType;
  /** The licence does not grant the pool and an add-on can: said in its place. */
  throughAddon: string | null;
};

function PricedContent({ cell, labels, type, throughAddon }: PricedProps) {
  const { t } = useTranslation();
  if (!cell.price?.ok || cell.specificity === null) {
    return (
      <>
        <CellNote className="text-sm">{t('AI.Pricing.cell.invalid')}</CellNote>
        <CellNote>{t('AI.Pricing.cell.invalidHint')}</CellNote>
      </>
    );
  }
  const own = isOwnRule(cell.specificity);

  return (
    <>
      <CellAmount credits={cell.price.charged} />
      <CellNote className="flex flex-wrap items-center gap-x-1">
        {cell.costPartial
          ? t('AI.Pricing.cell.costPartial')
          : cell.costPerCredit === null
            ? t('AI.Pricing.cell.costUnknown')
            : t('AI.Pricing.cell.perCredit', {
                cost: formatUsd(cell.costPerCredit),
              })}
        {cell.margin === null ? null : (
          <>
            <span aria-hidden="true">·</span>
            <MarginValue margin={cell.margin} />
          </>
        )}
      </CellNote>
      <span className="flex flex-wrap gap-1">
        <PricingChip tone={own ? 'accent' : 'neutral'}>
          {labels.provenance(cell.specificity, type)}
        </PricingChip>
        {cell.state !== 'POOL_NOT_GRANTED' ? null : throughAddon ? (
          <PricingChip tone="accent">{throughAddon}</PricingChip>
        ) : (
          <PricingChip tone="warning">
            {t('AI.Pricing.cell.notGrantedChip')}
          </PricingChip>
        )}
      </span>
    </>
  );
}

function pricedLabel(
  cell: RateCardCell,
  names: { model: string; version: string },
  type: AiRequestType,
  labels: PricingLabels,
  t: ReturnType<typeof useTranslation>['t'],
  throughAddon: string | null,
): string {
  if (!cell.price?.ok || cell.specificity === null) {
    return t('AI.Pricing.cell.label.invalid', names);
  }
  const parts = [
    t('AI.Pricing.cell.label.priced', {
      ...names,
      credits: formatCredits(cell.price.charged),
    }),
  ];
  if (cell.costPartial) {
    parts.push(t('AI.Pricing.cell.label.costPartial'));
  }
  if (cell.costPerCredit !== null) {
    parts.push(
      t('AI.Pricing.cell.label.perCredit', {
        cost: formatUsd(cell.costPerCredit),
      }),
    );
  }
  if (cell.margin !== null) {
    parts.push(
      t('AI.Pricing.cell.label.margin', { margin: formatMargin(cell.margin) }),
    );
  }
  parts.push(labels.provenance(cell.specificity, type));
  if (cell.state === 'POOL_NOT_GRANTED') {
    parts.push(throughAddon ?? t('AI.Pricing.cell.notGrantedChip'));
  }

  return parts.join(', ');
}

type ModelCellProps = {
  creditValue: string | null;
  model: Model;
  onSelect: (cell: CellRef) => void;
  reference: AiUsage;
  selected: boolean;
  type: AiRequestType;
  version: RateCardVersion;
};

/**
 * The price of one model on one version, for the reference call. Memoised: a
 * cell resolves its ladder and prices its call, and a grid of forty-five models
 * has some two hundred of them; opening the panel or typing in the search box
 * changes what two of them are given at most.
 */
export const ModelCell = memo(function ModelCell({
  creditValue,
  model,
  onSelect,
  reference,
  selected,
  type,
  version,
}: ModelCellProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const cell = buildRateCardCell({
    rules: version.rules,
    model,
    requestType: type,
    referenceUsage: reference,
    poolGranted: version.grant.granted,
    creditValue,
  });
  const names = { model: model.name, version: version.name };
  const throughAddon = version.addonGranted
    ? addonGrantLabel(version.addons, t)
    : null;
  const ref = { licenseSlug: version.slug, modelSlug: model.slug };
  const button = { cell: ref, onSelect, selected };

  if (cell.state === 'NOT_AUTHORIZED') {
    return (
      <RateCardCellButton
        {...button}
        label={t('AI.Pricing.cell.label.archived', names)}
      >
        <CellNote className="text-sm line-through">
          {t('AI.Pricing.cell.archived')}
        </CellNote>
        <CellNote>{t('AI.Pricing.cell.archivedHint')}</CellNote>
      </RateCardCellButton>
    );
  }
  if (cell.rule !== null) {
    return (
      <RateCardCellButton
        {...button}
        label={pricedLabel(cell, names, type, labels, t, throughAddon)}
      >
        <PricedContent
          cell={cell}
          labels={labels}
          throughAddon={throughAddon}
          type={type}
        />
      </RateCardCellButton>
    );
  }
  if (cell.state === 'POOL_NOT_GRANTED') {
    return (
      <RateCardCellButton
        {...button}
        label={t(
          throughAddon
            ? 'AI.Pricing.cell.label.throughAddon'
            : 'AI.Pricing.cell.label.notGranted',
          names,
        )}
      >
        <CellNote className="text-sm">—</CellNote>
        <CellNote>
          {throughAddon ?? t('AI.Pricing.cell.poolNotGranted')}
        </CellNote>
        {throughAddon && !cell.deprecated ? (
          <CellAction>{t('AI.Pricing.cell.addRule')}</CellAction>
        ) : null}
      </RateCardCellButton>
    );
  }

  return (
    <RateCardCellButton
      {...button}
      flagged={version.flagged}
      label={t(
        version.flagged
          ? 'AI.Pricing.cell.label.flagged'
          : 'AI.Pricing.cell.label.notAuthorized',
        names,
      )}
    >
      <CellNote
        className={cn(
          'text-sm',
          version.flagged && 'font-semibold text-warning-subtle-foreground',
        )}
      >
        {t(
          version.flagged
            ? 'AI.Pricing.cell.noRuleRefused'
            : 'AI.Pricing.cell.notAuthorized',
        )}
      </CellNote>
      {cell.deprecated ? null : (
        <CellAction>{t('AI.Pricing.cell.addRule')}</CellAction>
      )}
    </RateCardCellButton>
  );
});
