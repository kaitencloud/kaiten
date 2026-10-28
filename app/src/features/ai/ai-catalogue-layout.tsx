import { useTranslation } from 'react-i18next';
import type { PropsWithChildren } from 'react';
import {
  AiAvailability,
  AiNavigationProvider,
  BackToEntitlement,
  useAiAccess,
  type AiNavigationContext,
} from '@/domains/ai-credits';

export function AiCatalogueLayout({
  children,
  context,
}: PropsWithChildren<{ context: AiNavigationContext }>) {
  const access = useAiAccess();
  const { t } = useTranslation();
  if (!access.available) return null;
  return (
    <AiNavigationProvider context={context}>
      <div className="space-y-5">
        <BackToEntitlement />
        <AiAvailability
          access={access}
          mayRead={access.allows('listModels')}
          deniedMessage={t('AI.Calculation.modelsReadDenied')}
        >
          {children}
        </AiAvailability>
      </div>
    </AiNavigationProvider>
  );
}
