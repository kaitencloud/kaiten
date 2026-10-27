import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ConversionRule, Entitlement } from '@/api-client';
import { allEntitlementsOptions } from '@/lib/api/all-pages-query-options';
import { useAiAccess } from './use-ai-access';
import { modelsQueryOptions } from './ai-query-options';
import { AiLoading, AiQueryError } from './ai-section';
import { RuleEditor } from './rule-editor';
export { ruleFormSchema } from './rule-form.schema';

export type RuleFormProps = {
  licenseSlug: string;
  entitlement?: Entitlement;
  modelSlug?: string | null;
  rule?: ConversionRule;
  onSaved: () => void;
};
export function RuleForm(props: RuleFormProps) {
  const { t } = useTranslation();
  const access = useAiAccess();
  const mayWrite = access.allows(
    props.rule ? 'updateConversionRule' : 'createConversionRule',
  );
  const mayReadPools = access.allows('listEntitlements');
  const mayReadModels = access.allows('listModels');
  const entitlements = useQuery({
    ...allEntitlementsOptions(),
    enabled: !props.entitlement && mayReadPools && mayWrite,
  });
  const models = useQuery({
    ...modelsQueryOptions,
    enabled: mayReadModels && mayWrite,
  });
  if (!access.available) return null;
  if (!access.isPending && !mayWrite)
    return <p role="status">{t('AI.Calculation.denied')}</p>;
  if (access.isPending)
    return <AiLoading label={t('AI.Matrix.loadingEditor')} />;
  if (!props.entitlement && !mayReadPools)
    return <p role="status">{t('AI.Calculation.poolReadDenied')}</p>;
  if (!mayReadModels)
    return <p role="status">{t('AI.Calculation.modelsReadDenied')}</p>;
  if (!props.entitlement && entitlements.isError)
    return (
      <AiQueryError
        error={entitlements.error}
        onRetry={() => entitlements.refetch()}
      />
    );
  if (models.isError)
    return (
      <AiQueryError error={models.error} onRetry={() => models.refetch()} />
    );
  if ((!props.entitlement && entitlements.isPending) || models.isPending)
    return <AiLoading label={t('AI.Matrix.loadingEditor')} />;
  return (
    <RuleEditor
      {...props}
      entitlements={
        props.entitlement ? [props.entitlement] : entitlements.data!.items
      }
      models={models.data.items}
    />
  );
}
