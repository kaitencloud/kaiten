import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { getModelOptions } from '@/api-client/@tanstack/react-query.gen';
import { FRESH_READ_OPTIONS } from '@/lib/api/fresh-write';
import { useAiAccess } from '@/domains/ai-credits';
import { AiLoading, AiQueryError } from '../ai-section';
import { SourcePanel } from './model-source-panel';

export function ModelSourcePage({ modelSlug }: { modelSlug: string }) {
  const access = useAiAccess();
  const { t } = useTranslation();
  const mayRead = access.allows('getModel');
  const query = useQuery({
    ...getModelOptions({ ...FRESH_READ_OPTIONS, path: { modelSlug } }),
    enabled: mayRead,
    refetchOnWindowFocus: false,
  });
  if (!access.available) return null;
  if (access.isPending || (mayRead && query.isPending))
    return <AiLoading label={t('AI.Models.loading')} />;
  if (!mayRead)
    return <p role="status">{t('AI.Calculation.modelsReadDenied')}</p>;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  return (
    <SourcePanel
      key={query.data!.id}
      initialModel={query.data!}
      mayWrite={access.allows('updateModel')}
    />
  );
}
