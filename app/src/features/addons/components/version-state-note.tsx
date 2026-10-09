import { Link } from '@tanstack/react-router';
import { CirclePlus, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { Addon } from '@/api-client';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';

type VersionStateNoteProps = {
  addon: Pick<Addon, 'familySlug' | 'lifecycleState'>;
  /** What the tab it sits on says of the state of the version. */
  messages: Record<Addon['lifecycleState'], string>;
};

/**
 * What the state of the version means for what the tab shows, and, where the version
 * has been on sale, the way out the note names: a new version. The refusal of the API
 * says so once a change is tried; the tab offers it before, beside the sentence that
 * explains it, for a session that may write add-ons. A draft is changed in place, so
 * it has no new version to offer.
 */
export function VersionStateNote({ addon, messages }: VersionStateNoteProps) {
  const { t } = useTranslation();
  const mayCreate = useCanPerform('addons.create');

  return (
    <Alert>
      <Lock />
      <AlertDescription className="gap-3">
        <p>{messages[addon.lifecycleState]}</p>
        {addon.lifecycleState !== 'DRAFT' && mayCreate ? (
          <Button
            nativeButton={false}
            render={
              <Link search={{ family: addon.familySlug }} to="/addons/new">
                <CirclePlus className="size-4" />
                {t('Pages.Addons.List.newVersionButton')}
              </Link>
            }
            role="link"
            size="sm"
            variant="outline"
          />
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
