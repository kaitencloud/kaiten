import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage, Model } from '@/api-client';
import { cn } from '@/lib/utils';
import {
  type AiRequestType,
  type PreviewCallKind,
  previewCalls,
  type PricingTerms,
  priceUsage,
  steerOnCost,
  vendorCost,
} from '../engine';
import { formatCredits, formatUsd } from '../pricing-format';
import { MarginValue } from '../rate-card-cell';
import { usePricingLabels } from '../use-pricing-labels';
import { PanelSection } from './panel-shell';
import { ReferenceCallBreakdown } from './reference-call-breakdown';

const CALL_KEYS = {
  SMALL: 'AI.Panel.preview.calls.SMALL',
  REFERENCE: 'AI.Panel.preview.calls.REFERENCE',
  LARGE: 'AI.Panel.preview.calls.LARGE',
} as const satisfies Record<PreviewCallKind, string>;

const CELL = 'border-b px-1 py-1.5 text-right tabular-nums';
const HEAD =
  'border-b px-1 py-1.5 text-right font-medium text-muted-foreground';
const FIRST = 'text-left';

type RulePreviewProps = {
  /** The models a wildcard prices; empty for the rule of one model. */
  covered: readonly Model[];
  creditValue: string | null;
  /** The rule as saved, for "before → after"; absent for a new rule. */
  before: PricingTerms | null;
  /** What the form says now; null while no rate is typed. */
  draft: PricingTerms | null;
  /** The model the rule names; null for a wildcard. */
  model: Model | null;
  reference: AiUsage;
  type: AiRequestType;
};

const chargedOf = (terms: PricingTerms | null, usage: AiUsage) => {
  const price = terms ? priceUsage(terms, usage, 'SUCCESS') : null;

  return price?.ok ? price.charged : null;
};

function Dash() {
  return <span className="text-muted-foreground">—</span>;
}

/**
 * What the rule being typed would charge for three calls (a small one, the
 * reference, a large one), next to what it charges today, and what that makes
 * of the vendor cost. Priced by the engine on each keystroke; nothing is saved.
 */
export function RulePreview({
  before,
  covered,
  creditValue,
  draft,
  model,
  reference,
  type,
}: RulePreviewProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const calls = previewCalls(type, reference);
  const referencePrice = draft ? priceUsage(draft, reference, 'SUCCESS') : null;
  const referenceCharged = referencePrice?.ok ? referencePrice.charged : null;

  function credits(usage: AiUsage): ReactNode {
    const now = chargedOf(draft, usage);
    const was = chargedOf(before, usage);
    if (now === null) {
      return <Dash />;
    }

    return was !== null && was !== now ? (
      <>
        <span className="text-muted-foreground">{formatCredits(was)} →</span>{' '}
        {formatCredits(now)}
      </>
    ) : (
      formatCredits(now)
    );
  }

  function costCells(costed: Model, usage: AiUsage, charged: string | null) {
    const cost = vendorCost(costed.vendorCosts, usage);
    // A partial cost gives no cost per credit and no margin: see `steerOnCost`.
    const steering = steerOnCost(cost, charged, creditValue);

    return (
      <>
        <td className={CELL}>
          {cost.total === null ? <Dash /> : formatUsd(cost.total)}
          {steering.partial ? (
            <span className="block text-[0.6875rem] font-normal text-muted-foreground">
              {t('AI.Panel.preview.partial')}
            </span>
          ) : null}
        </td>
        <td className={CELL}>
          {steering.costPerCredit === null ? (
            <Dash />
          ) : (
            formatUsd(steering.costPerCredit)
          )}
        </td>
        <td className={CELL}>
          {steering.margin === null ? (
            <Dash />
          ) : (
            <MarginValue margin={steering.margin} />
          )}
        </td>
      </>
    );
  }

  function renderCall(call: { kind: PreviewCallKind; usage: AiUsage }) {
    return (
      <tr
        className={cn(call.kind === 'REFERENCE' && 'font-semibold')}
        key={call.kind}
      >
        <th className={cn(CELL, FIRST, 'font-[inherit]')} scope="row">
          {t(CALL_KEYS[call.kind])}
          <span className="block text-[0.6875rem] font-normal text-muted-foreground">
            {labels.usageLabel(call.usage)}
          </span>
        </th>
        <td className={CELL}>{credits(call.usage)}</td>
        {model
          ? costCells(model, call.usage, chargedOf(draft, call.usage))
          : null}
      </tr>
    );
  }

  function renderCovered(item: Model) {
    return (
      <tr key={item.slug}>
        <th className={cn(CELL, FIRST, 'font-normal')} scope="row">
          {item.name}
        </th>
        {costCells(item, reference, referenceCharged)}
      </tr>
    );
  }

  const costHeads = (
    <>
      <th className={HEAD} scope="col">
        {t('AI.Panel.preview.vendor')}
      </th>
      <th className={HEAD} scope="col">
        {t('AI.Panel.preview.perCredit')}
      </th>
      <th className={HEAD} scope="col">
        {t('AI.Panel.preview.margin')}
      </th>
    </>
  );
  const cost = model ? vendorCost(model.vendorCosts, reference) : null;
  const steering = steerOnCost(cost, referenceCharged, creditValue);

  return (
    <PanelSection title={t('AI.Panel.preview.title')}>
      {draft === null ? (
        <p className="text-xs text-muted-foreground">
          {t('AI.Panel.preview.empty')}
        </p>
      ) : null}
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr>
            <th className={cn(HEAD, FIRST)} scope="col">
              {t('AI.Panel.preview.call')}
            </th>
            <th className={HEAD} scope="col">
              {t('AI.Panel.preview.credits')}
            </th>
            {model ? costHeads : null}
          </tr>
        </thead>
        <tbody>{calls.map(renderCall)}</tbody>
      </table>
      {model && referencePrice ? (
        <ReferenceCallBreakdown
          cost={cost}
          costPerCredit={steering.costPerCredit}
          creditValue={creditValue}
          margin={steering.margin}
          price={referencePrice}
        />
      ) : null}
      {!model && draft !== null && covered.length > 0 ? (
        <>
          <h4 className="mt-2 text-[0.6875rem] font-semibold tracking-wider text-muted-foreground uppercase">
            {t('AI.Panel.preview.covered')}
          </h4>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={cn(HEAD, FIRST)} scope="col">
                  {t('AI.Panel.preview.model')}
                </th>
                {costHeads}
              </tr>
            </thead>
            <tbody>
              {covered.map(renderCovered)}
              <tr>
                <td className="px-1 py-1.5 text-muted-foreground" colSpan={4}>
                  {t('AI.Panel.preview.future')}
                </td>
              </tr>
            </tbody>
          </table>
        </>
      ) : null}
    </PanelSection>
  );
}
