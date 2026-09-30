import { createFileRoute } from '@tanstack/react-router';
import { globalAuditTrailQueryOptions } from '@/domains/audit-trail';
import { AuditTrailPageContent } from '@/features/audit-trail';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/audit-trail/')({
  component: AuditTrailPageContent,
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(globalAuditTrailQueryOptions()),
  beforeLoad: () => ({
    getTitle: () => i18n.t('Pages.AuditTrail.title', 'Audit trail'),
  }),
});
