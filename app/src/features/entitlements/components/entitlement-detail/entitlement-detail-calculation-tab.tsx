import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ConversionRule, Entitlement } from '@/api-client';
import { listConversionRulesOptions } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AiAvailability,
  AiLoading,
  AiQueryError,
  ConversionRuleSummary,
  RuleForm,
  useAiAccess,
} from '@/domains/ai-credits';
import { allLicensesOptions } from '@/lib/api/all-pages-query-options';
import { useEntitlementDetailContext } from './entitlement-detail-context';

export type CalculationSelection = { licenseSlug?: string; rule?: string };
type CalculationProps = CalculationSelection & {
  onSelectionChange: (selection: CalculationSelection) => void;
};

function CalculationLinks({
  entitlementSlug,
  licenseSlug,
}: {
  entitlementSlug: string;
  licenseSlug?: string;
}) {
  const { t } = useTranslation();
  const search = { entitlementSlug, licenseSlug };
  return (
    <div className="flex flex-wrap gap-3">
      <Button
        nativeButton={false}
        variant="outline"
        render={<Link to="/catalog/models" search={search} />}
      >
        {t('AI.Models.title')}
      </Button>
      <Button
        nativeButton={false}
        variant="ghost"
        render={<Link to="/ai/matrix" search={search} />}
      >
        {t('AI.Calculation.compare')}
      </Button>
    </div>
  );
}

function CalculationRules({
  entitlement,
  licenseSlug,
  rule: ruleParam,
  onSelectionChange,
  mayEdit,
}: CalculationProps & {
  entitlement: Entitlement;
  licenseSlug: string;
  mayEdit: boolean;
}) {
  const { t } = useTranslation();
  const query = useQuery(
    listConversionRulesOptions({
      path: { licenseSlug },
      query: { entitlementSlug: entitlement.slug!, status: 'ACTIVE' },
    }),
  );
  function closeEditor() {
    onSelectionChange({ licenseSlug });
  }
  if (query.isPending) return <AiLoading label={t('AI.Matrix.loading')} />;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  const rules = query.data ?? [];
  const rule = rules.find((item) => item.id === ruleParam);
  function renderRule(item: ConversionRule) {
    return (
      <li key={item.id} className="space-y-4 border-b py-5 last:border-b-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-medium">
            {item.modelSlug ?? t('AI.anyModel')} /{' '}
            {item.requestType ? t(`AI.enums.${item.requestType}`) : t('AI.any')}
          </h3>
          {mayEdit ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => onSelectionChange({ licenseSlug, rule: item.id })}
            >
              {t('Common.edit')}
            </Button>
          ) : null}
        </div>
        <ConversionRuleSummary rule={item} />
      </li>
    );
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('AI.Calculation.title')}</h2>
        {mayEdit && !ruleParam ? (
          <Button
            type="button"
            onClick={() => onSelectionChange({ licenseSlug, rule: 'new' })}
          >
            {t('AI.Matrix.create')}
          </Button>
        ) : null}
      </div>
      {ruleParam && mayEdit ? (
        ruleParam === 'new' || rule ? (
          <RuleForm
            key={`${licenseSlug}-${ruleParam}`}
            entitlement={entitlement}
            licenseSlug={licenseSlug}
            rule={rule}
            onSaved={closeEditor}
          />
        ) : (
          <div role="status" className="space-y-3">
            <p>{t('AI.Calculation.unknownRule')}</p>
            <Button type="button" variant="outline" onClick={closeEditor}>
              {t('Common.cancel')}
            </Button>
          </div>
        )
      ) : null}
      {!ruleParam ? (
        <details className="text-sm text-muted-foreground">
          <summary className="cursor-pointer">
            {t('AI.Minimal.matchingHelp')}
          </summary>
          <p>{t('AI.Matrix.wholeRule')}</p>
          <p>{t('AI.Matrix.precedence')}</p>
        </details>
      ) : null}
      {rules.length ? (
        <ul>{rules.map(renderRule)}</ul>
      ) : (
        <p className="rounded-lg border p-5">{t('AI.Matrix.noRule')}</p>
      )}
      {!mayEdit ? <p role="status">{t('AI.Calculation.readOnly')}</p> : null}
      {ruleParam && !mayEdit ? (
        <Button type="button" variant="outline" onClick={closeEditor}>
          {t('Common.cancel')}
        </Button>
      ) : null}
    </div>
  );
}

function CalculationContent({
  entitlement,
  licenseSlug,
  rule,
  onSelectionChange,
  mayEdit,
}: CalculationProps & {
  entitlement: Entitlement;
  mayEdit: boolean;
}) {
  const { t } = useTranslation();
  const query = useQuery(allLicensesOptions());
  if (query.isPending)
    return <AiLoading label={t('AI.Calculation.loadingVersions')} />;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  const items = query.data.items.flatMap((license) =>
    license.slug
      ? [
          {
            value: license.slug,
            label: `${license.name} · ${license.versionName ?? license.version} · ${license.slug}`,
          },
        ]
      : [],
  );
  // Keep a contextual slug even when catalogue listing omits it: its scoped read remains authoritative.
  if (licenseSlug && !items.some((item) => item.value === licenseSlug))
    items.push({ value: licenseSlug, label: licenseSlug });
  function renderVersion(item: (typeof items)[number]) {
    return (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    );
  }
  return (
    <section className="space-y-6">
      <p className="text-sm text-muted-foreground">
        {t('AI.Calculation.description')}
      </p>
      <div className="max-w-xl space-y-2">
        <Label htmlFor="calculation-version">
          {t('AI.Calculation.version')}
        </Label>
        <Select
          items={items}
          value={licenseSlug ?? null}
          onValueChange={(value) =>
            onSelectionChange({ licenseSlug: value ?? undefined })
          }
        >
          <SelectTrigger
            id="calculation-version"
            className="min-h-11 sm:min-h-9"
          >
            <SelectValue placeholder={t('AI.Calculation.chooseVersion')} />
          </SelectTrigger>
          <SelectContent>{items.map(renderVersion)}</SelectContent>
        </Select>
      </div>
      <CalculationLinks
        entitlementSlug={entitlement.slug!}
        licenseSlug={licenseSlug}
      />
      {licenseSlug ? (
        <CalculationRules
          key={licenseSlug}
          entitlement={entitlement}
          licenseSlug={licenseSlug}
          rule={rule}
          onSelectionChange={onSelectionChange}
          mayEdit={mayEdit}
        />
      ) : (
        <p role="status">{t('AI.Calculation.chooseVersion')}</p>
      )}
    </section>
  );
}

export function EntitlementDetailCalculationTab(props: CalculationProps) {
  const { entitlement } = useEntitlementDetailContext();
  const access = useAiAccess();
  const { t } = useTranslation();
  if (!access.available) return null;
  if (entitlement.type !== 'NUMBER_AI_CREDIT')
    return <p>{t('AI.Calculation.notCalculated')}</p>;
  const mayRead =
    access.allows('getLicenses') && access.allows('listConversionRules');
  const mayEdit =
    access.allows('createConversionRule') &&
    access.allows('updateConversionRule') &&
    access.allows('listModels');
  return (
    <AiAvailability access={access} mayRead={mayRead}>
      <CalculationContent
        {...props}
        entitlement={entitlement}
        mayEdit={mayEdit}
      />
    </AiAvailability>
  );
}
