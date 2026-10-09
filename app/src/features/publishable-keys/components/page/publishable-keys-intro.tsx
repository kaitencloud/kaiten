import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBillingCapabilities, useCanPerform } from '@/domains/billing';

const linkClassName = 'font-medium underline underline-offset-4';

/**
 * Says in a few words what a publishable key is for, and where the catalogue it reads is
 * made: the key lets a web page read the public catalogue, and what the catalogue lists
 * is decided by the "Public catalogue" switch of each family of licenses and of add-ons.
 * The links lead to the pages those switches are on, for a session that may open them.
 */
export function PublishableKeysIntro() {
  const { t } = useTranslation();
  const billing = useBillingCapabilities();
  const mayOpenLicenses = useCanPerform('licenseFamilies.list');
  const mayOpenAddons = useCanPerform('addons.list') && billing.has('addons');

  return (
    <div
      className="flex items-start gap-3 rounded-lg border bg-card px-4 py-3 text-sm"
      data-testid="publishable-keys-intro"
    >
      <Info
        aria-hidden
        className="mt-0.5 size-4 shrink-0 text-muted-foreground"
      />
      <div className="space-y-1">
        <p>{t('Pages.Integrations.PublishableKeys.Intro.purpose')}</p>
        <p className="text-muted-foreground">
          {t('Pages.Integrations.PublishableKeys.Intro.listing')}
        </p>
        {mayOpenLicenses || mayOpenAddons ? (
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {mayOpenLicenses ? (
              <li>
                <Link className={linkClassName} to="/licenses">
                  {t('Pages.Integrations.PublishableKeys.Intro.licenses')}
                </Link>
              </li>
            ) : null}
            {mayOpenAddons ? (
              <li>
                <Link className={linkClassName} to="/addons">
                  {t('Pages.Integrations.PublishableKeys.Intro.addons')}
                </Link>
              </li>
            ) : null}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
