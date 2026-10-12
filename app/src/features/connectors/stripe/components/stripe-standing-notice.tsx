import { ExternalLink, ShieldAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import type { ProviderStanding } from '@/domains/billing';
import { SELF_HOSTING_DOCS_URL } from '../constants';

type StripeStandingNoticeProps = {
  /** Where Stripe stands; none while that is not known yet. */
  standing: ProviderStanding | undefined;
};

/**
 * Why Stripe cannot be connected here, when it cannot: a self-hosted deployment
 * with no Vault to store the key in, an organization whose plan leaves the
 * connector out, or an API that does not list Stripe at all. It says what to do
 * about it, and the page leaves the form disabled. A connector that can be
 * connected, or is, has no notice.
 */
export function StripeStandingNotice({ standing }: StripeStandingNoticeProps) {
  const { t } = useTranslation();

  if (
    !standing ||
    (standing.state !== 'unavailable' && standing.state !== 'unlisted')
  ) {
    return null;
  }
  const reason = standing.state === 'unavailable' ? standing.reason : 'UNKNOWN';

  return (
    <Alert data-reason={reason} data-testid="stripe-unavailable">
      <ShieldAlert />
      <AlertTitle>
        {t(`Pages.Integrations.Connectors.Stripe.Unavailable.${reason}.title`)}
      </AlertTitle>
      <AlertDescription>
        <p>
          {t(
            `Pages.Integrations.Connectors.Stripe.Unavailable.${reason}.description`,
          )}
        </p>
        {reason === 'VAULT_NOT_CONFIGURED' ? (
          <a
            className="inline-flex items-center gap-1 underline underline-offset-4"
            href={SELF_HOSTING_DOCS_URL}
            rel="noopener noreferrer"
            target="_blank"
          >
            {t('Pages.Integrations.Connectors.Stripe.Unavailable.vaultDocs')}
            <ExternalLink className="size-3.5" />
          </a>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
