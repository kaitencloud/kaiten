import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import { Button } from '@/components/ui/button';
import { useAiAccess, useAiNavigationContext } from '@/domains/ai-credits';
import { formatDecimalQuantity } from '@/lib/decimal';
import { vendorCostSummary } from './model-list-model';
import { ModelRemovalDialog } from './model-removal-dialog';

export function ModelIdentity({ model }: { model: Model }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="font-medium wrap-anywhere">{model.name}</p>
      <p className="text-xs text-muted-foreground wrap-anywhere">
        {model.slug}
      </p>
    </div>
  );
}

export function ModelProvider({ model }: { model: Model }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-1">
      <p>{model.vendor}</p>
      <p className="text-xs text-muted-foreground">
        {t(`AI.enums.${model.modality}`)}
      </p>
    </div>
  );
}

export function ModelStatus({ model }: { model: Model }) {
  const { t } = useTranslation();
  return (
    <span className="inline-flex rounded border bg-muted px-2 py-1 text-xs whitespace-nowrap">
      {t(`AI.enums.${model.status}`)}
    </span>
  );
}

/** What the model costs at the vendor, on one line: per million tokens, or per unit. */
export function ModelVendorCost({ model }: { model: Model }) {
  const { t, i18n } = useTranslation();
  const summary = vendorCostSummary(model.vendorCosts);
  // As the language writes a number ("0,3" in French); the digits are the API's.
  const written = (value: string | null) =>
    value === null ? null : formatDecimalQuantity(value, i18n.language);
  const cost = summary && {
    input: written(summary.input),
    output: written(summary.output),
    unit: written(summary.unit),
  };
  if (!cost) {
    return (
      <span className="text-muted-foreground">{t('AI.Models.cost.none')}</span>
    );
  }
  const tokens =
    cost.input && cost.output
      ? t('AI.Models.cost.tokens', { input: cost.input, output: cost.output })
      : cost.input
        ? t('AI.Models.cost.inputOnly', { input: cost.input })
        : cost.output
          ? t('AI.Models.cost.outputOnly', { output: cost.output })
          : null;

  return (
    <div className="space-y-1 text-sm whitespace-nowrap tabular-nums">
      {tokens ? <p>{tokens}</p> : null}
      {cost.unit ? (
        <p>{t('AI.Models.cost.unit', { unit: cost.unit })}</p>
      ) : null}
    </div>
  );
}

/**
 * How many rules name the model, as a link to the rate card filtered on it.
 * Undefined while the rate card is not read (or may not be): a dash, not a 0.
 */
export function ModelRulesCount({
  count,
  model,
}: {
  count: number | undefined;
  model: Model;
}) {
  const { t } = useTranslation();
  if (count === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }

  return (
    <Button
      nativeButton={false}
      variant="link"
      size="sm"
      className="h-auto min-h-11 px-0 tabular-nums sm:min-h-8"
      aria-label={t('AI.Models.rulesLink', {
        count,
        model: model.name,
      })}
      render={
        <Link
          to="/ai/pricing"
          // An archived model is hidden from the rate card unless asked for.
          search={{
            q: model.slug,
            status: model.status === 'ARCHIVED' ? 'all' : undefined,
          }}
        />
      }
    >
      {t('AI.Models.rulesCount', { count })}
    </Button>
  );
}

export function ModelActions({
  model,
  rulesCount,
}: {
  model: Model;
  rulesCount: number | undefined;
}) {
  const context = useAiNavigationContext();
  const access = useAiAccess();
  const { t } = useTranslation();
  const [removing, setRemoving] = useState(false);
  if (!access.allows('getModel')) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        variant="outline"
        size="sm"
        nativeButton={false}
        render={
          <Link
            to="/ai/models/$modelSlug/source"
            params={{ modelSlug: model.slug }}
            search={context}
          />
        }
      >
        {t('AI.OpenRouter.sourcePricing')}
      </Button>
      <Button
        disabled={!access.allows('updateModel')}
        nativeButton={false}
        variant="outline"
        size="sm"
        className="min-h-11 sm:min-h-8"
        render={
          <Link
            search={context}
            to="/ai/models/$modelSlug/edit"
            params={{ modelSlug: model.slug }}
          />
        }
      >
        {t('Common.edit')}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="min-h-11 text-destructive-subtle-foreground sm:min-h-8"
        disabled={!access.allows('deleteModel')}
        aria-label={t('AI.Models.deleteModel', { model: model.name })}
        onClick={() => setRemoving(true)}
      >
        {t('Common.delete')}
      </Button>
      {removing ? (
        <ModelRemovalDialog
          model={model}
          rulesCount={rulesCount}
          onClose={() => setRemoving(false)}
        />
      ) : null}
    </div>
  );
}
