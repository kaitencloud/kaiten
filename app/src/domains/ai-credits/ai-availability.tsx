import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { useAiAccess } from './use-ai-access';

/** Off, pending, stale and failed rollout checks expose no AI panel or retry UI. */
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
  if (!access.available || access.isPending) return null;
  if (!mayRead)
    return (
      <p role="status" className="rounded-lg border p-5">
        {deniedMessage ?? t('AI.Calculation.denied')}
      </p>
    );
  return children;
}
