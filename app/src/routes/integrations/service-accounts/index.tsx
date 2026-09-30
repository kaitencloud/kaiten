import { createFileRoute } from '@tanstack/react-router';
import { ServiceAccountsPageContent } from '@/features/service-accounts';

export const Route = createFileRoute('/integrations/service-accounts/')({
  component: ServiceAccountsPageContent,
});
