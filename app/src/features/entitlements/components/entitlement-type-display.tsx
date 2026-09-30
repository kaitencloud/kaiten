import { useTranslation } from 'react-i18next';

export type EntitlementType =
  | 'BOOLEAN'
  | 'NUMBER'
  | 'CONFIG'
  | 'NUMBER_AI_CREDIT';

interface EntitlementTypeDisplayProps {
  entitlementType: EntitlementType;
  className?: string;
}

export function EntitlementTypeDisplay({
  entitlementType,
  className = 'text-sm font-medium',
}: EntitlementTypeDisplayProps) {
  const { t } = useTranslation();

  return (
    <span className={className}>
      {t(`Pages.Entitlements.EntitlementTypes.${entitlementType}`)}
    </span>
  );
}
