import { Suspense, useState } from 'react';
import {
  useMutation,
  useQueryClient,
  useSuspenseQuery,
} from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ConversionRule } from '@/api-client';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { archiveConversionRuleMutation } from '@/api-client/@tanstack/react-query.gen';
import { allLicenseFamiliesOptions } from '@/lib/api/all-pages-query-options';
import { Button } from '@/components/ui/button';
import { DestructiveActionButton } from '@/components/destructive-action-button';
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
import { getApiErrorMessage } from '@/lib/errors';
import {
  invalidateAiQueries,
  matrixQueryOptions,
} from '../queries/ai-query-options';
import { RuleForm } from './rule-form';

type Version = NonNullable<AiMatrixQuery['licenseFamily']>['versions'][number];
type Edit = {
  licenseSlug: string;
  modelSlug?: string | null;
  rule?: ConversionRule;
};
function MatrixCell({
  version,
  modelSlug,
  onEdit,
}: {
  version: Version;
  modelSlug: string | null;
  onEdit: (edit: Edit) => void;
}) {
  const { t } = useTranslation();
  const client = useQueryClient();
  const archive = useMutation(archiveConversionRuleMutation());
  async function handleArchive(rule: ConversionRule) {
    try {
      await archive.mutateAsync({
        path: { licenseSlug: version.slug, ruleId: rule.id },
      });
      await invalidateAiQueries(client);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  }
  function renderRule(rule: Version['conversionRules'][number]) {
    return (
      <div key={rule.id} className="space-y-1 border-b py-2">
        <p>
          {rule.entitlementSlug} / {rule.requestType ?? t('AI.any')}
        </p>
        <p className="text-xs text-muted-foreground">
          {Object.entries(rule.rates)
            .filter(([key, value]) => key !== '__typename' && value != null)
            .map(([key, value]) => `${t(`AI.rates.${key}`)}: ${value}`)
            .join(' · ')}
        </p>
        {!rule.grantedByLicense ? (
          <p className="text-warning-subtle-foreground">
            {t('AI.Matrix.notGranted')}
          </p>
        ) : null}
        <div className="flex gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onEdit({ licenseSlug: version.slug, rule })}
          >
            {t('Common.edit')}
          </Button>
          <DestructiveActionButton
            label={t('AI.Matrix.archive')}
            title={t('Common.confirmDeleteTitle')}
            description={t('AI.Matrix.archiveWarning')}
            cancelLabel={t('Common.cancel')}
            confirmLabel={t('Common.confirm')}
            disabled={archive.isPending}
            onConfirm={() => handleArchive(rule)}
          />
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-56">
      {version.conversionRules
        .filter((rule) => rule.modelSlug === modelSlug)
        .map(renderRule)}
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => onEdit({ licenseSlug: version.slug, modelSlug })}
      >
        {t('AI.Matrix.create')}
      </Button>
    </div>
  );
}
function FamilyMatrix({ familySlug }: { familySlug: string }) {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(matrixQueryOptions(familySlug));
  const [edit, setEdit] = useState<Edit | null>(null);
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
          onEdit={setEdit}
        />
      ),
    };
  }
  const columns: ColumnDef<Version>[] = [
    {
      id: 'version',
      header: t('AI.Matrix.version'),
      cell: ({ row }) => (
        <div className="min-w-40">
          <p>
            {row.original.versionName ?? row.original.name} ·{' '}
            {row.original.version}
          </p>
          <p>{row.original.lifecycleState}</p>
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
      <TableCard>
        <TableCard.Table
          data={family.versions}
          columns={columns}
          emptyMessage={t('Common.noResults')}
          pagination={false}
        />
      </TableCard>
      {edit ? (
        <Suspense fallback={null}>
          <RuleForm
            key={`${edit.licenseSlug}-${edit.rule?.id ?? edit.modelSlug ?? 'ANY'}`}
            {...edit}
            onSaved={() => setEdit(null)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
export function MatrixPage() {
  const { t } = useTranslation();
  const { data } = useSuspenseQuery(allLicenseFamiliesOptions());
  const [selected, setSelected] = useState('');
  const familySlug = selected || data.items[0]?.slug;
  const items = data.items.map((family) => ({
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
          <Button render={<Link to="/ai/models" />}>
            {t('AI.Models.title')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <div className="max-w-md space-y-2 mb-5">
        <Label htmlFor="matrix-family">{t('AI.Matrix.family')}</Label>
        <Select
          items={items}
          value={familySlug ?? null}
          onValueChange={(value) => setSelected(value ?? '')}
        >
          <SelectTrigger id="matrix-family">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>{items.map(renderFamily)}</SelectContent>
        </Select>
      </div>
      <Suspense fallback={<p>{t('Common.loading')}</p>}>
        {familySlug ? (
          <FamilyMatrix key={familySlug} familySlug={familySlug} />
        ) : (
          <p>{t('Common.noResults')}</p>
        )}
      </Suspense>
    </Page>
  );
}
