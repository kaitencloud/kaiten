import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { AiLoading } from './ai-section';
import { useAiAccess } from './use-ai-access';

/** The boolean flag fails closed on evaluation errors, so never call false "disabled". */
export function AiAvailability({
  access,
  children,
  mayRead = true,
  deniedMessage,
}: {
  access: ReturnType<typeof useAiAccess>;
  children: ReactNode;
  mayRead?: boolean;
  deniedMessage?: string;
}) {
  const { t } = useTranslation();
  if (access.isPending)
    return <AiLoading label={t('AI.Calculation.loadingAccess')} />;
  if (!access.available)
    return (
      <div role="status" className="space-y-3 rounded-lg border p-5">
        <p>{t('AI.Calculation.unavailable')}</p>
        <Button
          type="button"
          variant="outline"
          onClick={() => access.flag.refetch()}
        >
          {t('Common.retry')}
        </Button>
      </div>
    );
  if (!mayRead)
    return (
      <p role="status" className="rounded-lg border p-5">
        {deniedMessage ?? t('AI.Calculation.denied')}
      </p>
    );
  return children;
}
