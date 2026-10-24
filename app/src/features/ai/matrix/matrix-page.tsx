import type { Entitlement } from '@/api-client';
import {
  getEntitlementOptions,
  getLicenseOptions,
} from '@/api-client/@tanstack/react-query.gen';
import {
  AiAvailability,
  BackToEntitlement,
  useAiAccess,
  useAiNavigationContext,
} from '@/domains/ai-credits';
import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Page } from '@/functionals/page';
import { TableCard, type ColumnDef } from '@/functionals/table';
import { matrixQueryOptions } from '../queries/ai-query-options';
import { RuleForm } from './rule-form';
import { MatrixCell, type MatrixEdit } from './matrix-cell';
import { AiLoading, AiQueryError } from '../ai-section';

type Version = NonNullable<AiMatrixQuery['licenseFamily']>['versions'][number];
function FamilyMatrix({
  familySlug,
  entitlement,
  mayEdit,
}: {
  familySlug: string;
  entitlement?: Entitlement;
  mayEdit: boolean;
}) {
  const { t } = useTranslation();
  const query = useQuery(matrixQueryOptions(familySlug));
  const [edit, setEdit] = useState<MatrixEdit | null>(null);
  const origin = useRef<string | undefined>(undefined);
  const matrix = useRef<HTMLDivElement>(null);
  const editor = useRef<HTMLDivElement>(null);
  function handleEdit(value: MatrixEdit, trigger: HTMLElement) {
    origin.current = trigger.dataset.aiEditorTrigger;
    setEdit(value);
  }
  function closeEditor() {
    setEdit(null);
  }
  useEffect(() => {
    if (edit) {
      const heading = editor.current?.querySelector<HTMLElement>('h2');
      heading?.focus();
      heading?.scrollIntoView?.({ block: 'nearest' });
      return;
    }
    if (!origin.current) return;
    const trigger = Array.from(
      matrix.current?.querySelectorAll<HTMLElement>(
        '[data-ai-editor-trigger]',
      ) ?? [],
    ).find((element) => element.dataset.aiEditorTrigger === origin.current);
    trigger?.focus();
  }, [edit]);
  if (query.isPending) return <AiLoading label={t('AI.Matrix.loading')} />;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  const data = query.data;
  const family = data.licenseFamily;
  if (!family) return <p>{t('Common.noResults')}</p>;
  const models = data.models;
  function modelColumn(model: {
    slug: string | null;
    name: string;
  }): ColumnDef<Version> {
    return {
      id: model.slug ?? 'ANY',
      header: model.name,
      cell: ({ row }) => (
        <MatrixCell
          version={row.original}
          modelSlug={model.slug}
          onEdit={handleEdit}
          mayEdit={mayEdit}
        />
      ),
    };
  }
  const columns: ColumnDef<Version>[] = [
    {
      id: 'version',
      header: t('AI.Matrix.version'),
      cell: ({ row }) => (
        <div className="min-w-40 space-y-2">
          <p>
            {row.original.versionName ?? row.original.name} ·{' '}
            {row.original.version}
          </p>
          <p className="text-xs text-muted-foreground">{row.original.slug}</p>
          <p className="text-xs">
            {t(`AI.enums.${row.original.lifecycleState}`, {
              defaultValue: row.original.lifecycleState,
            })}
          </p>
        </div>
      ),
    },
    ...[
      ...models.map((model) => ({
        slug: model.slug as string | null,
        name: model.name,
      })),
      { slug: null, name: t('AI.anyModel') },
    ].map(modelColumn),
  ];
  return (
    <div className="space-y-5">
      {edit ? (
        <div ref={editor}>
          <RuleForm
            key={`${edit.licenseSlug}-${edit.rule?.id ?? edit.modelSlug ?? 'ANY'}`}
            {...edit}
            entitlement={entitlement}
            onSaved={closeEditor}
          />
        </div>
      ) : null}
      <details className="space-y-2 text-sm text-muted-foreground">
        <summary className="cursor-pointer">
          {t('AI.Minimal.matchingHelp')}
        </summary>
        <p>{t('AI.Matrix.context')}</p>
        <p>{t('AI.Matrix.precedence')}</p>
        <p>{t('AI.Matrix.wholeRule')}</p>
      </details>
      <div
        ref={matrix}
        role="region"
        aria-label={t('AI.Matrix.title')}
        tabIndex={0}
        className="rounded-lg focus-visible:outline focus-visible:outline-ring [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:z-10 [&_th:first-child]:bg-card [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:z-10 [&_td:first-child]:bg-card"
      >
        <TableCard className="shadow-none">
          <TableCard.Table
            data={
              entitlement
                ? family.versions.map((version) => ({
                    ...version,
                    conversionRules: version.conversionRules.filter(
                      (rule) => rule.entitlementSlug === entitlement.slug,
                    ),
                  }))
                : family.versions
            }
            columns={columns}
            emptyMessage={t('Common.noResults')}
            pagination={false}
          />
        </TableCard>
      </div>
    </div>
  );
}
function MatrixContent() {
  const context = useAiNavigationContext();
  const access = useAiAccess();
  const entitlementQuery = useQuery({
    ...getEntitlementOptions({
      path: { entitlementSlug: context.entitlementSlug ?? '' },
    }),
    enabled:
      Boolean(context.entitlementSlug) && access.allows('getEntitlement'),
  });
  const licenseQuery = useQuery({
    ...getLicenseOptions({ path: { licenseSlug: context.licenseSlug ?? '' } }),
    enabled: Boolean(context.licenseSlug),
  });
  const { t } = useTranslation();
  const query = useQuery(allLicenseFamiliesOptions());
  const data = query.data;
  const [selected, setSelected] = useState('');
  const contextualFamily = data?.items.find(
    (family) => family.id === licenseQuery.data?.familyId,
  );
  const familySlug =
    selected ||
    contextualFamily?.slug ||
    (!context.licenseSlug ? data?.items[0]?.slug : undefined);
  const items = (data?.items ?? []).map((family) => ({
    value: family.slug,
    label: family.currentVersion?.name ?? family.slug,
  }));
  function renderFamily(item: (typeof items)[number]) {
    return (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    );
  }
  return (
    <Page>
      <Page.Header>
        <Page.Title>{t('AI.Matrix.title')}</Page.Title>
        <Page.Actions>
          <Button
            nativeButton={false}
            variant="outline"
            render={<Link to="/catalog/models" search={context} />}
          >
            {t('AI.Models.title')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <p className="mb-5 text-sm text-muted-foreground">
        {t('AI.Matrix.description')}
      </p>
      <div className="max-w-md space-y-2 mb-5">
        <Label htmlFor="matrix-family">{t('AI.Matrix.family')}</Label>
        <Select
          items={items}
          value={familySlug ?? null}
          onValueChange={(value) => setSelected(value ?? '')}
        >
          <SelectTrigger id="matrix-family" className="min-h-11 sm:min-h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{items.map(renderFamily)}</SelectContent>
        </Select>
      </div>
      {entitlementQuery.isError ? (
        <AiQueryError
          error={entitlementQuery.error}
          onRetry={() => entitlementQuery.refetch()}
        />
      ) : licenseQuery.isError ? (
        <AiQueryError
          error={licenseQuery.error}
          onRetry={() => licenseQuery.refetch()}
        />
      ) : (context.entitlementSlug && !entitlementQuery.data) ||
        (context.licenseSlug && !licenseQuery.data) ? (
        <AiLoading label={t('AI.Matrix.loading')} />
      ) : query.isPending ? (
        <AiLoading label={t('AI.Matrix.loadingFamilies')} />
      ) : query.isError ? (
        <AiQueryError error={query.error} onRetry={() => query.refetch()} />
      ) : familySlug ? (
        <FamilyMatrix
          key={familySlug}
          familySlug={familySlug}
          entitlement={entitlementQuery.data}
          mayEdit={
            access.allows('createConversionRule') &&
            access.allows('updateConversionRule') &&
            access.allows('archiveConversionRule') &&
            (Boolean(entitlementQuery.data) ||
              access.allows('listEntitlements'))
          }
        />
      ) : (
        <p className="rounded-lg border p-5">{t('AI.Matrix.emptyFamilies')}</p>
      )}
    </Page>
  );
}

export function MatrixPage() {
  const access = useAiAccess();
  const { t } = useTranslation();
  const context = useAiNavigationContext();
  const mayRead =
    access.allows('listModels') &&
    access.allows('getLicenses') &&
    access.allows('listConversionRules') &&
    (!context.entitlementSlug || access.allows('getEntitlement'));
  return (
    <div className="space-y-5">
      <BackToEntitlement />
      <AiAvailability
        access={access}
        mayRead={mayRead}
        deniedMessage={t('AI.Calculation.matrixReadDenied')}
      >
        <MatrixContent />
      </AiAvailability>
    </div>
  );
}
