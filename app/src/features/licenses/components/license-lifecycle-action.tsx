import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  type RowActionAppearance,
  useBillingCapabilities,
  useCanPerform,
  VersionLifecycleAction,
} from '@/domains/billing';
import { useLicenseLifecycleTransition } from '../hooks/use-license-lifecycle-transition';
import { LIFECYCLE_ACTION_KEYS } from '../utils/license-lifecycle-keys';
import {
  isLifecycleTransitionBlocked,
  type LicenseLifecycleTransition,
} from '../utils/license-lifecycle.utils';

// The scope of each transition is the contract's, and the three happen to share
// one, but each is its own operation, so each is asked for by its own name.
const TRANSITION_ACTIONS = {
  archive: 'license.archive',
  publish: 'license.publish',
  unarchive: 'license.unarchive',
} as const satisfies Record<LicenseLifecycleTransition, string>;

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
  const allowed = useCanPerform(TRANSITION_ACTIONS[transition]);

  return (
    <VersionLifecycleAction
      appearance={appearance}
      available={allowed}
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
