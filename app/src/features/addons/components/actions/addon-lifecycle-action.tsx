import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import {
  type RowActionAppearance,
  useCanPerform,
  VersionLifecycleAction,
} from '@/domains/billing';
import { useAddonLifecycleTransition } from '../../hooks';
import { TRANSITION_KEYS } from '../../utils/addon-labels';
import {
  type AddonLifecycleTransition,
  isLifecycleTransitionBlocked,
} from '../../utils/addon-lifecycle.utils';

// The scope of each transition is the contract's, and the three happen to share
// one, but each is its own operation, so each is asked for by its own name.
const TRANSITION_ACTIONS = {
  archive: 'addons.archive',
  publish: 'addons.publish',
  unarchive: 'addons.unarchive',
} as const satisfies Record<AddonLifecycleTransition, string>;

type AddonLifecycleActionProps = {
  addon: Pick<
    Addon,
    'isDefault' | 'lifecycleState' | 'name' | 'slug' | 'version'
  >;
  appearance: RowActionAppearance;
};

// What publishing changes for what the version sells: its prices stop being
// editable, its grants freeze once an instance with a live subscription holds it,
// and nothing else is touched.
function PublishNote() {
  const { t } = useTranslation();

  return (
    <ul className="list-disc space-y-1 pl-5 text-left text-sm text-muted-foreground">
      <li>{t('Pages.Addons.LifecycleActions.publish.Notes.prices')}</li>
      <li>{t('Pages.Addons.LifecycleActions.publish.Notes.grants')}</li>
      <li>{t('Pages.Addons.LifecycleActions.publish.Notes.compatibility')}</li>
    </ul>
  );
}

/**
 * Publish, archive or unarchive a version: the one transition its state accepts,
 * confirmed first, since each changes what instances can attach and notifies the
 * webhooks. The action is there for a session that may write add-ons.
 */
export function AddonLifecycleAction({
  addon,
  appearance,
}: AddonLifecycleActionProps) {
  const { isPending, run, transition } = useAddonLifecycleTransition(addon);
  const allowed = useCanPerform(TRANSITION_ACTIONS[transition]);

  return (
    <VersionLifecycleAction
      appearance={appearance}
      available={allowed}
      blocked={isLifecycleTransitionBlocked(addon)}
      blockedKey="Pages.Addons.LifecycleActions.archiveDefaultUnavailable"
      isPending={isPending}
      keys={TRANSITION_KEYS}
      name={addon.name}
      onConfirm={({ slug, transition: asked }) =>
        run({ addonSlug: slug, transition: asked })
      }
      publishNote={<PublishNote />}
      slug={addon.slug}
      transition={transition}
      version={addon.version}
    />
  );
}
