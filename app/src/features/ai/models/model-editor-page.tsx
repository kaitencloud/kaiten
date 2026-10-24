import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getModelOptions } from '@/api-client/@tanstack/react-query.gen';
import { AiLoading, AiQueryError, useAiAccess } from '@/domains/ai-credits';
import { ModelForm } from './model-form';
export function ModelEditorPage({ modelSlug }: { modelSlug?: string }) {
  const access = useAiAccess();
  const { t } = useTranslation();
  const mayWrite =
    access.allows(modelSlug ? 'updateModel' : 'createModel') &&
    (!modelSlug || access.allows('getModel'));
  const query = useQuery({
    ...getModelOptions({ path: { modelSlug: modelSlug ?? '' } }),
    enabled: Boolean(modelSlug) && mayWrite,
  });
  if (access.isPending)
    return <AiLoading label={t('AI.Calculation.loadingAccess')} />;
  if (!mayWrite) return <p role="status">{t('AI.Calculation.modelDenied')}</p>;
  if (!modelSlug) return <ModelForm />;
  if (query.isPending) return <AiLoading label={t('AI.Models.loading')} />;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  return <ModelForm model={query.data} />;
}
