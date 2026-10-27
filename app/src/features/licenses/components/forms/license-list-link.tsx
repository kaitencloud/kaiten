import { Button } from '@/components/ui/button';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** The way back to the list of licenses, beside an offer to resume an input. */
export function LicenseListLink() {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={<Link to="/catalog/licenses" />}
      size="sm"
      variant="outline"
    >
      {t('Common.viewList')}
    </Button>
  );
}
