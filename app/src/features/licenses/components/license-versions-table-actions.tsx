import { Button } from '@/components/ui/button';
import { Star, StarOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useLicenseDefault } from '../hooks/use-license-default';
import type { LicenseWithInstances } from '../types';
import { canBecomeDefault } from '../utils/license-lifecycle.utils';
import { LicenseDeleteDraftAction } from './license-delete-draft-action';
import { LicenseLifecycleAction } from './license-lifecycle-action';

type LicenseVersionsTableActionsProps = {
  license: LicenseWithInstances;
};

// Moves the family's default: onto this version, or off it when it is the
// default -- the one way out for a default that has to be archived.
function DefaultRowAction({ license }: LicenseVersionsTableActionsProps) {
  const { t } = useTranslation();
  const { isPending, setDefault, unsetDefault } = useLicenseDefault(license);

  if (license.isDefault) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="gap-1 px-0 text-primary-subtle-foreground hover:text-primary-subtle-foreground"
        onClick={unsetDefault}
        disabled={isPending || !license.slug}
      >
        <StarOff className="size-3" />
        {t('Pages.Licenses.DefaultActions.unset')}
      </Button>
    );
  }

  // Only a PUBLISHED version may become the default; the API refuses the rest
  // with UpdateLicense.DefaultMustBePublished. The action stays visible but
  // disabled, with the reason on hover and focus, rather than vanishing: a
  // vendor looking for it on a draft should learn what to do next, not wonder
  // where it went.
  if (!canBecomeDefault(license)) {
    return (
      <Tooltip>
        <TooltipTrigger
          render={
            <span tabIndex={0} className="inline-flex rounded-sm">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="gap-1 px-0"
                disabled
              >
                <Star className="size-3" />
                {t('Pages.Licenses.VersionsTable.setAsDefault')}
              </Button>
            </span>
          }
        />
        <TooltipContent>
          {t('Pages.Licenses.VersionsTable.setDefaultUnavailable')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="gap-1 px-0 text-primary-subtle-foreground hover:text-primary-subtle-foreground"
      onClick={setDefault}
      disabled={isPending || !license.slug}
    >
      <Star className="size-3" />
      {t('Pages.Licenses.VersionsTable.setAsDefault')}
    </Button>
  );
}

// Every version gets its lifecycle transition, in a slot of its own width on
// the right so the column lines up from row to row, next to its default
// action and, for a draft, its deletion.
//
// The area is marked data-row-actions: the row opens its version when clicked,
// and no click in here -- a disabled control's included, which lands on its
// wrapper -- is a click on the row.
export const LicenseVersionsTableActions = ({
  license,
}: LicenseVersionsTableActionsProps) => (
  <div data-row-actions className="flex h-8 items-center justify-end gap-4">
    <LicenseDeleteDraftAction appearance="row" license={license} />
    <DefaultRowAction license={license} />
    <div className="flex w-28 justify-end">
      <LicenseLifecycleAction appearance="row" license={license} />
    </div>
  </div>
);
