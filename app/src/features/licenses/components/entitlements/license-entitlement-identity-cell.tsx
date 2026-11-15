import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { Entitlement } from '@/api-client';
import { EntityIcon } from '@/components/ui/icon';
import type { EditableLicenseEntitlement } from '../../utils';
export function LicenseEntitlementIdentityCell({
  entitlement,
  entitlementSlug,
  definition,
  licenseSlug,
  mayConfigureAi = false,
}: {
  entitlement: EditableLicenseEntitlement;
  entitlementSlug: string;
  definition?: Entitlement;
  licenseSlug?: string;
  mayConfigureAi?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-2">
      <EntityIcon
        token={entitlement.entitlementIcon}
        className="size-4 shrink-0 text-muted-foreground"
      />
      <div className="flex flex-col gap-0.5">
        <span className="font-medium">{entitlement.entitlementName}</span>
        <span className="font-mono text-xs text-muted-foreground">
          {entitlementSlug}
        </span>
        {mayConfigureAi &&
        licenseSlug &&
        definition?.type === 'NUMBER_AI_CREDIT' &&
        definition.slug ? (
          <Link
            to="/catalog/entitlements/$entitlementSlug/calculation"
            params={{ entitlementSlug: definition.slug }}
            search={{ licenseSlug }}
            onClick={(event) => event.stopPropagation()}
            className="text-sm text-primary-subtle-foreground underline underline-offset-4"
          >
            {t('AI.Calculation.configure')}
          </Link>
        ) : null}
      </div>
    </div>
  );
}
