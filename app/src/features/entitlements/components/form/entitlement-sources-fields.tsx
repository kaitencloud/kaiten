import { useStore } from '@tanstack/react-form';
import { useQuery } from '@tanstack/react-query';
import { Info, Plus, Trash2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import FormField from '@/components/form/fields/form-field';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { isAiEntitlement, useAiAccess } from '@/domains/ai-credits';
import { RetryableProblem } from '@/domains/billing';
import {
  haveSameSources,
  isEligibleSource,
  sharedWindow,
} from '@/domains/entitlement-usage';
import { entitlementsQueryOptions } from '../../queries';
import {
  ResetAnchorDisplay,
  ResetPeriodDisplay,
} from '../display/reset-period-display';
import {
  type EntitlementSourceFormValues,
  newSourceRow,
} from './entitlement-form.shared';

const FORM = 'Pages.Entitlements.Mutation.Form';

type SourcesFieldsProps = {
  /** The entitlement being edited; none on the creation page. */
  entitlement?: Entitlement;
  form: any;
};

/**
 * What the usage window of the combined entitlement will be: the one its sources
 * share, which the API derives from them and which cannot be chosen. It is a
 * sentence and not a field, since nothing in it can be edited.
 */
function CombinedWindow({ sources }: { sources: readonly Entitlement[] }) {
  const { t } = useTranslation();
  const window = sharedWindow(sources);

  return (
    <div className="space-y-1 text-sm" data-testid="combined-window">
      <p className="font-medium">{t(`${FORM}.Labels.combinedWindow`)}</p>
      {window ? (
        <p className="flex flex-wrap items-center gap-x-1.5">
          <ResetPeriodDisplay resetPeriod={window.resetPeriod} />
          {window.resetPeriod ? (
            <>
              <span aria-hidden="true">·</span>
              <ResetAnchorDisplay resetAnchor={window.resetAnchor} />
            </>
          ) : null}
        </p>
      ) : (
        <p className="text-muted-foreground">
          {t(`${FORM}.Descriptions.combinedWindowEmpty`)}
        </p>
      )}
      <p className="text-muted-foreground">
        {t(`${FORM}.Descriptions.combinedWindow`)}
      </p>
    </div>
  );
}

/**
 * Saving the sources or a weight of a combined entitlement changes what every
 * customer reads at once: nothing is stored for the sum, so the present is
 * re-valued, the current window included. Said before the button that saves it,
 * as soon as what is sent differs from what is stored.
 */
function RevalueHint() {
  const { t } = useTranslation();

  return (
    <Alert data-testid="combined-revalue-hint" role="status">
      <Info />
      <AlertDescription>
        <p>{t(`${FORM}.Hints.combinedRevalue`)}</p>
      </AlertDescription>
    </Alert>
  );
}

/**
 * The sources of a combined entitlement, one line each: the entitlement that is
 * summed and the weight, the rate one unit of it is worth in the sum. A line offers
 * the entitlements that can be summed with the others (same window, summed or
 * counted, not combined themselves) and none that another line already names, so
 * that the form cannot be sent with a source the API would refuse. The API still has
 * the last word, and its refusals are shown on the list.
 */
export function EntitlementSourcesFields({
  entitlement,
  form,
}: SourcesFieldsProps) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const catalogue = useQuery(entitlementsQueryOptions);
  const rows: EntitlementSourceFormValues[] =
    useStore(form.store, (state: any) => state.values.sources) ?? [];
  const entitlements = catalogue.data?.items ?? [];
  const bySlug = new Map(
    entitlements.flatMap((item) => (item.slug ? [[item.slug, item]] : [])),
  );
  const chosen = rows.flatMap(({ entitlementSlug }) => {
    const source = bySlug.get(entitlementSlug);

    return source ? [source] : [];
  });
  const nameOf = (slug: unknown) =>
    bySlug.get(String(slug))?.name ?? String(slug);

  // The entitlements a line can name: those that can be summed with the sources
  // of the other lines, and that no other line names. The one the line holds stays
  // in its own list, so that it keeps its name even if it no longer qualifies.
  const optionsFor = (index: number) => {
    const others = rows.filter((_, position) => position !== index);
    const named = new Set(others.map(({ entitlementSlug }) => entitlementSlug));
    const othersDefinitions = others.flatMap(({ entitlementSlug }) => {
      const source = bySlug.get(entitlementSlug);

      return source ? [source] : [];
    });
    const offered = entitlements.flatMap((item) =>
      item.slug &&
      !named.has(item.slug) &&
      (access.available || !isAiEntitlement(item.type)) &&
      isEligibleSource(item, othersDefinitions)
        ? [item.slug]
        : [],
    );
    const held = rows[index]?.entitlementSlug;

    return held && !offered.includes(held) ? [held, ...offered] : offered;
  };

  // What the form opened with: the sources that are stored.
  const stored = entitlement?.sources ?? [];
  const sourcesChanged =
    entitlement !== undefined &&
    !haveSameSources(
      stored,
      rows.map(({ entitlementSlug, weight }) => ({ entitlementSlug, weight })),
    );

  if (catalogue.isError) {
    return (
      <RetryableProblem
        error={catalogue.error}
        onRetry={() => void catalogue.refetch()}
      />
    );
  }

  // The window and the re-value notice are siblings of the field and not its children,
  // so that its help text stays under the lines it explains, where `FormField` writes it.
  return (
    <>
      <form.AppField mode="array" name="sources">
        {(list: any) => (
          <FormField<EntitlementSourceFormValues[]>
            label={t(`${FORM}.Labels.sources`)}
            description={t(`${FORM}.Descriptions.sources`)}
            required
          >
            {() => (
              <div className="space-y-3">
                {rows.map((_, index) => (
                  <div
                    aria-label={t(`${FORM}.sourceRow`, { position: index + 1 })}
                    className="grid items-start gap-3 sm:grid-cols-[minmax(0,1fr)_7rem_auto]"
                    data-testid="entitlement-source-row"
                    key={`source-${index}`}
                    role="group"
                  >
                    <form.AppField name={`sources[${index}].entitlementSlug`}>
                      {(field: any) => (
                        <field.ComboboxField
                          getOptionLabel={nameOf}
                          getOptionValue={(slug: unknown) => String(slug)}
                          label={t(`${FORM}.Labels.sourceEntitlement`)}
                          options={optionsFor(index)}
                          placeholder={t(
                            catalogue.isPending
                              ? 'Common.loading'
                              : `${FORM}.Placeholders.sourceEntitlement`,
                          )}
                          searchPlaceholder={t(
                            `${FORM}.Placeholders.sourceEntitlementSearch`,
                          )}
                        />
                      )}
                    </form.AppField>
                    <form.AppField name={`sources[${index}].weight`}>
                      {(field: any) => (
                        <field.TextField
                          autoComplete="off"
                          inputMode="decimal"
                          label={t(`${FORM}.Labels.sourceWeight`)}
                          placeholder={t(`${FORM}.Placeholders.sourceWeight`)}
                        />
                      )}
                    </form.AppField>
                    <Button
                      aria-label={t(`${FORM}.removeSource`, {
                        position: index + 1,
                      })}
                      className="mt-6 justify-self-end"
                      onClick={() => list.removeValue(index)}
                      size="icon"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  onClick={() => list.pushValue(newSourceRow())}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  <Plus className="size-3" />
                  {t(`${FORM}.addSource`)}
                </Button>
              </div>
            )}
          </FormField>
        )}
      </form.AppField>
      <CombinedWindow sources={chosen} />
      {sourcesChanged ? <RevalueHint /> : null}
    </>
  );
}
