import { ShieldCheck, UserRound } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { isAdministrator, useCurrentAccess } from '@/domains/access-management';

/** A local identity label is not a grant: only Core's current answer is shown. */
export function DevAccessBadge() {
  const { t } = useTranslation();
  const access = useCurrentAccess();
  const admin = isAdministrator(access.data);
  const label = access.isPending
    ? t('Pages.Access.local.checking')
    : access.isError
      ? t('Pages.Access.local.unavailable')
      : admin
        ? t('Pages.Access.local.administrator')
        : t('Pages.Access.local.member');
  const Icon = admin ? ShieldCheck : UserRound;

  return (
    <Badge
      variant="outline"
      className={
        admin
          ? 'border-primary/30 bg-primary-subtle text-primary-subtle-foreground'
          : 'text-muted-foreground'
      }
      title={t('Pages.Access.local.description')}
      aria-live="polite"
    >
      <Icon className="size-3" aria-hidden />
      {label}
    </Badge>
  );
}
