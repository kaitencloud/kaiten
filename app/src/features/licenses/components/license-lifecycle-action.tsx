import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore, type LucideIcon, Send } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  type TransitionVariables,
  useLicenseLifecycleTransition,
} from '../hooks/use-license-lifecycle-transition';
import {
  isLifecycleTransitionBlocked,
  type LicenseLifecycleTransition,
} from '../utils/license-lifecycle.utils';

const TRANSITION_ICONS: Record<LicenseLifecycleTransition, LucideIcon> = {
  archive: Archive,
  publish: Send,
  unarchive: ArchiveRestore,
};

// The same two looks as the set-as-default action: a compact ghost button in
// the versions table, an outline one in the detail card's header.
const APPEARANCES = {
  card: {
    className: 'gap-1',
    disabledClassName: 'gap-1',
    variant: 'outline',
    wrapperClassName: 'inline-flex rounded-md',
  },
  row: {
    className:
      'gap-1 px-0 text-primary-subtle-foreground hover:text-primary-subtle-foreground',
    disabledClassName: 'gap-1 px-0',
    variant: 'ghost',
    wrapperClassName: 'inline-flex rounded-sm',
  },
} as const;

type LicenseLifecycleActionProps = {
  appearance: keyof typeof APPEARANCES;
  license: Pick<
    License,
    'isDefault' | 'lifecycleState' | 'name' | 'slug' | 'version'
  >;
};

// A versions table row opens its version when clicked; this button is not a
// click on the row. The dialog it opens renders in a portal, which the row
// already ignores.
function keepClickOffTheRow(event: MouseEvent) {
  event.stopPropagation();
}

// What an open confirmation asks about, taken when it opened.
type Confirmation = TransitionVariables &
  Pick<LicenseLifecycleActionProps['license'], 'name' | 'version'>;

// Publish, archive or unarchive a version: the one transition its state
// accepts, confirmed first, since each changes what the family serves and
// notifies webhook subscribers.
export function LicenseLifecycleAction({
  appearance,
  license,
}: LicenseLifecycleActionProps) {
  const { t } = useTranslation();
  const { isPending, run, transition } = useLicenseLifecycleTransition(license);
  // The dialog shows and confirms what was asked when it opened. The license
  // may be refetched while it is open -- moved on by someone else, or, in the
  // versions table, replaced by another version at this row -- and "confirm"
  // must not quietly become a different action.
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const asked = confirmation ?? {
    licenseSlug: license.slug ?? '',
    name: license.name,
    transition,
    version: license.version,
  };
  const Icon = TRANSITION_ICONS[transition];
  const look = APPEARANCES[appearance];
  const label = t(`Pages.Licenses.LifecycleActions.${transition}.label`);

  // The family's default cannot be archived. The action stays visible but
  // disabled, with the way out on hover and focus, as set-as-default does for
  // an unpublished version. An open confirmation stays open until answered,
  // even if the version became the default meanwhile: the API then refuses.
  if (!open && isLifecycleTransitionBlocked(license)) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          {/* A disabled button emits no pointer events, so the wrapper is
              what the tooltip listens to; focusable so keyboard users get
              the reason too. */}
          <span tabIndex={0} className={look.wrapperClassName}>
            <Button
              type="button"
              variant={look.variant}
              size="sm"
              className={look.disabledClassName}
              disabled
            >
              <Icon className="size-3" />
              {label}
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          {t('Pages.Licenses.LifecycleActions.archiveDefaultUnavailable')}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (nextOpen && license.slug) {
          setConfirmation({
            licenseSlug: license.slug,
            name: license.name,
            transition,
            version: license.version,
          });
        }
        setOpen(nextOpen);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={look.variant}
          size="sm"
          className={look.className}
          disabled={isPending || !license.slug}
          onClick={keepClickOffTheRow}
        >
          <Icon className="size-3" />
          {label}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(`Pages.Licenses.LifecycleActions.${asked.transition}.title`, {
              name: asked.name,
              version: asked.version,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(
              `Pages.Licenses.LifecycleActions.${asked.transition}.description`,
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            variant={asked.transition === 'archive' ? 'destructive' : 'default'}
            onClick={() =>
              run({
                licenseSlug: asked.licenseSlug,
                transition: asked.transition,
              })
            }
          >
            {t(`Pages.Licenses.LifecycleActions.${asked.transition}.confirm`)}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
