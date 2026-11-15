import { ConversionRuleSummary } from '@/domains/ai-credits';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import type { ConversionRule } from '@/api-client';
import type { AiMatrixQuery } from '@/api-client/graphql/graphql';
import { archiveConversionRuleMutation } from '@/api-client/@tanstack/react-query.gen';
import { Button } from '@/components/ui/button';
import { DeleteConfirmationDialog } from '@/components/dialog';
import { getApiErrorMessage } from '@/lib/errors';
import { invalidateAiQueries } from '../queries/ai-query-options';

type Version = NonNullable<AiMatrixQuery['licenseFamily']>['versions'][number];
export type MatrixEdit = {
  licenseSlug: string;
  modelSlug?: string | null;
  rule?: ConversionRule;
};
export function MatrixCell({
  version,
  modelSlug,
  onEdit,
  mayEdit = true,
}: {
  version: Version;
  modelSlug: string | null;
  mayEdit?: boolean;
  onEdit: (edit: MatrixEdit, trigger: HTMLElement) => void;
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
      <div key={rule.id} className="space-y-3 border-b py-3">
        <p className="font-medium wrap-anywhere">
          {rule.entitlementSlug} /{' '}
          {rule.requestType ? t(`AI.enums.${rule.requestType}`) : t('AI.any')}
        </p>
        <ConversionRuleSummary rule={rule} />
        {mayEdit ? (
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              className="min-h-11 sm:min-h-8"
              variant="outline"
              data-ai-editor-trigger={`${version.slug}-${rule.id}`}
              onClick={(event) =>
                onEdit({ licenseSlug: version.slug, rule }, event.currentTarget)
              }
            >
              {t('Common.edit')}
            </Button>
            <DeleteConfirmationDialog
              trigger={
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="min-h-11 text-destructive-subtle-foreground sm:min-h-8"
                  disabled={archive.isPending}
                >
                  {t('AI.Matrix.archive')}
                </Button>
              }
              title={t('AI.Matrix.archiveTitle')}
              description={
                <>
                  {rule.entitlementSlug} · {version.slug}.{' '}
                  {t('AI.Matrix.archiveWarning')}
                </>
              }
              cancelLabel={t('Common.cancel')}
              confirmLabel={t('Common.confirm')}
              confirmDisabled={archive.isPending}
              onConfirm={() => handleArchive(rule)}
            />
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div className="min-w-64 space-y-2">
      {version.conversionRules
        .filter((rule) => rule.modelSlug === modelSlug)
        .map(renderRule)}
      {!version.conversionRules.some((rule) => rule.modelSlug === modelSlug) ? (
        <p className="text-xs text-muted-foreground">{t('AI.Matrix.noRule')}</p>
      ) : null}
      {mayEdit ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 sm:min-h-8"
          data-ai-editor-trigger={`${version.slug}-${modelSlug ?? 'ANY'}-new`}
          onClick={(event) =>
            onEdit(
              { licenseSlug: version.slug, modelSlug },
              event.currentTarget,
            )
          }
        >
          {t('AI.Matrix.create')}
        </Button>
      ) : null}
    </div>
  );
}
