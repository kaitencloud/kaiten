import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  type RowActionAppearance,
  useBillingCapabilities,
  VersionLifecycleAction,
} from '@/domains/billing';
import { useLicenseLifecycleTransition } from '../hooks/use-license-lifecycle-transition';
import { LIFECYCLE_ACTION_KEYS } from '../utils/license-lifecycle-keys';
import { isLifecycleTransitionBlocked } from '../utils/license-lifecycle.utils';

type LicenseLifecycleActionProps = {
  appearance: RowActionAppearance;
  license: Pick<
    License,
    'isDefault' | 'lifecycleState' | 'name' | 'slug' | 'version'
  >;
};

// What publishing changes for what the version sells, where there is something
// sold: its prices stop being editable, its grants freeze once a subscription
// bills it, and nothing else is touched.
function PublishBillingNote() {
  const { t } = useTranslation();

  return (
    <ul className="list-disc space-y-1 pl-5 text-left text-sm text-muted-foreground">
      <li>{t('Pages.Licenses.LifecycleActions.publish.Billing.prices')}</li>
      <li>{t('Pages.Licenses.LifecycleActions.publish.Billing.grants')}</li>
      <li>{t('Pages.Licenses.LifecycleActions.publish.Billing.others')}</li>
    </ul>
  );
}

// Publish, archive or unarchive a version: the one transition its state
// accepts, confirmed first, since each changes what the family serves and
// notifies webhook subscribers.
export function LicenseLifecycleAction({
  appearance,
  license,
}: LicenseLifecycleActionProps) {
  const { isPending, run, transition } = useLicenseLifecycleTransition(license);
  const { isEnabled: hasBilling } = useBillingCapabilities();

  return (
    <VersionLifecycleAction
      appearance={appearance}
      blocked={isLifecycleTransitionBlocked(license)}
      blockedKey="Pages.Licenses.LifecycleActions.archiveDefaultUnavailable"
      isPending={isPending}
      keys={LIFECYCLE_ACTION_KEYS}
      name={license.name}
      onConfirm={({ slug, transition: asked }) =>
        run({ licenseSlug: slug, transition: asked })
      }
      publishNote={hasBilling ? <PublishBillingNote /> : undefined}
      slug={license.slug}
      transition={transition}
      version={license.version}
    />
  );
}
