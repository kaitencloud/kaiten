import { Link } from '@tanstack/react-router';
import { CirclePlus, Lock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useCanPerform } from '@/domains/billing';
import type { PriceRules } from '../../utils/license-price.utils';

// What the state of the version says about its prices, so that a price that
// cannot be edited is never a surprise.
const STATE_NOTE_KEYS = {
  ARCHIVED: 'Pages.Licenses.Prices.Notes.archived',
  DRAFT: 'Pages.Licenses.Prices.Notes.draft',
  PUBLISHED: 'Pages.Licenses.Prices.Notes.published',
} as const;

type PriceStateNoteProps = {
  licenseSlug: string;
  state: PriceRules['state'];
};

// What changes a version that can no longer change what it sells: a new version,
// which starts from this one, with its entitlements and its prices, as a draft.
function NewVersionLink({ licenseSlug }: { licenseSlug: string }) {
  const { t } = useTranslation();

  return (
    <Button
      nativeButton={false}
      render={
        <Link
          params={{ licenseSlug }}
          search={{ draft: true }}
          to="/catalog/licenses/versions/$licenseSlug"
        >
          <CirclePlus className="size-4" />
          {t('Pages.Licenses.Version.newVersionButton')}
        </Link>
      }
      role="link"
      size="sm"
      variant="outline"
    />
  );
}

/**
 * What the state of the version says about its prices, and, where they can no
 * longer be changed, the way out the note names: a new version. The refusal of
 * the API says so once a change is tried; the tab offers it before, beside the
 * sentence that explains it, for a session that may write licenses. A draft is
 * changed in place, so it has no new version to offer.
 */
export function PriceStateNote({ licenseSlug, state }: PriceStateNoteProps) {
  const { t } = useTranslation();
  const mayCreateVersion = useCanPerform('license.createVersion');

  return (
    <Alert>
      <Lock />
      <AlertDescription className="gap-3">
        <p>{t(STATE_NOTE_KEYS[state])}</p>
        {state !== 'DRAFT' && mayCreateVersion ? (
          <NewVersionLink licenseSlug={licenseSlug} />
        ) : null}
      </AlertDescription>
    </Alert>
  );
}
