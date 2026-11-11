import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import type { PricingRule, RateCardCell } from '../engine';
import type { RateCardVersion } from '../rate-card-model';
import { usePricingLabels } from '../use-pricing-labels';
import { PanelCallout } from './panel-callout';
import { PanelSection } from './panel-shell';
import { ReferenceCallBreakdown } from './reference-call-breakdown';

type BreakdownOfCellProps = { cell: RateCardCell; creditValue: string | null };

export function BreakdownOfCell({ cell, creditValue }: BreakdownOfCellProps) {
  const { t } = useTranslation();

  return (
    <PanelSection title={t('AI.Panel.breakdown.title')}>
      <ReferenceCallBreakdown
        cost={cell.vendorCost}
        costPerCredit={cell.costPerCredit}
        creditValue={creditValue}
        margin={cell.margin}
        price={cell.price}
      />
    </PanelSection>
  );
}

/** An archived model: nothing prices it, and the panel says where to change that. */
export function ArchivedModelState({ model }: { model: Model }) {
  const { t } = useTranslation();

  return (
    <>
      <PanelCallout>
        <strong>{t('AI.Panel.archived.title', { model: model.name })}</strong>{' '}
        {t('AI.Panel.archived.body')}
      </PanelCallout>
      <div>
        <Button
          nativeButton={false}
          render={<Link to="/ai/models" />}
          size="sm"
          variant="outline"
        >
          {t('AI.Panel.archived.openModels')}
        </Button>
      </div>
    </>
  );
}

type InheritedStateProps = {
  /** May a rule be added for this model: the session writes, the model is active. */
  canOverride: boolean;
  cell: RateCardCell;
  /** How many models the wildcard prices on this version for this request type. */
  coveredCount: number;
  creditValue: string | null;
  deprecated: boolean;
  model: Model;
  onOpenWildcard: () => void;
  onOverride: () => void;
  wildcard: PricingRule;
};

/**
 * A model priced by a wildcard: which one, what it prices besides this model,
 * and the two ways to change the price, which do not touch the same calls.
 */
export function InheritedState(props: InheritedStateProps) {
  const { t } = useTranslation();
  const labels = usePricingLabels();
  const { coveredCount, model, wildcard } = props;

  return (
    <>
      <PanelCallout tone="accent">
        {t('AI.Panel.inherited.body', {
          count: coveredCount,
          rates: labels.rateSummary(wildcard),
          wildcard: labels.wildcardName(wildcard),
        })}
      </PanelCallout>
      <BreakdownOfCell cell={props.cell} creditValue={props.creditValue} />
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={!props.canOverride}
            onClick={props.onOverride}
            type="button"
          >
            {t('AI.Panel.inherited.override')}
          </Button>
          <Button
            onClick={props.onOpenWildcard}
            type="button"
            variant="outline"
          >
            {t('AI.Panel.inherited.openWildcard')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {props.deprecated
            ? t('AI.Panel.deprecated.noOverride')
            : t('AI.Panel.inherited.help', {
                count: coveredCount,
                model: model.name,
              })}
        </p>
      </div>
    </>
  );
}

type NoRuleStateProps = {
  canCreate: boolean;
  deprecated: boolean;
  model: Model;
  onAddRule: () => void;
  onAddWildcard: () => void;
  version: RateCardVersion;
};

/** No rule prices the call: it is refused, and here is how to price it. */
export function NoRuleState(props: NoRuleStateProps) {
  const { t } = useTranslation();
  const { version } = props;

  return (
    <>
      {version.flagged ? (
        <PanelCallout icon="warning" tone="destructive">
          <strong>{t('AI.Panel.none.flaggedTitle')}</strong>{' '}
          {t('AI.Panel.none.flaggedBody')}
        </PanelCallout>
      ) : (
        <PanelCallout>
          <strong>{t('AI.Panel.none.title')}</strong> {t('AI.Panel.none.body')}
        </PanelCallout>
      )}
      {props.deprecated ? (
        <PanelCallout icon="lock" tone="warning">
          {t('AI.Panel.deprecated.noNewRule')}
        </PanelCallout>
      ) : props.canCreate ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={props.onAddRule} type="button">
            {t('AI.Panel.none.addRule', { model: props.model.name })}
          </Button>
          <Button onClick={props.onAddWildcard} type="button" variant="outline">
            {t('AI.Panel.none.addWildcard')}
          </Button>
        </div>
      ) : null}
    </>
  );
}
