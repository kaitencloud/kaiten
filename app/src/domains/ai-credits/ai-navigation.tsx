import { createContext, use, type PropsWithChildren } from 'react';
import { Link } from '@tanstack/react-router';
import { z } from 'zod';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

export const aiNavigationSearchSchema = z.object({
  entitlementSlug: z.string().optional(),
  licenseSlug: z.string().optional(),
});
export type AiNavigationContext = z.infer<typeof aiNavigationSearchSchema>;
const NavigationContext = createContext<AiNavigationContext>({});
export function AiNavigationProvider({
  children,
  context,
}: PropsWithChildren<{ context: AiNavigationContext }>) {
  return (
    <NavigationContext.Provider value={context}>
      {children}
    </NavigationContext.Provider>
  );
}
export function useAiNavigationContext() {
  return use(NavigationContext);
}
export function BackToEntitlement() {
  const { t } = useTranslation();
  const { entitlementSlug, licenseSlug } = useAiNavigationContext();
  if (!entitlementSlug) return null;
  return (
    <Button
      nativeButton={false}
      variant="outline"
      render={
        <Link
          to="/catalog/entitlements/$entitlementSlug/calculation"
          params={{ entitlementSlug }}
          search={{ licenseSlug }}
        />
      }
    >
      {t('AI.Calculation.back')}
    </Button>
  );
}
