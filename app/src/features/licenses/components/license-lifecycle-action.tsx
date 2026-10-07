import { Button } from '@/components/ui/button';
import { Archive, ArchiveRestore, type LucideIcon, Send } from 'lucide-react';
import { type MouseEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { License } from '@/api-client';
import {
  AlertDialog,
  AlertDialogClose,
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
import { useBillingCapabilities } from '@/domains/billing';
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

type Look = (typeof APPEARANCES)[keyof typeof APPEARANCES];

// The family's default cannot be archived. The action stays visible but
// disabled, with the way out on hover and focus, as set-as-default does for an
// unpublished version.
function BlockedLifecycleAction({
  Icon,
  label,
  look,
}: {
  Icon: LucideIcon;
  label: string;
  look: Look;
}) {
  const { t } = useTranslation();

  return (
    <Tooltip>
      <TooltipTrigger
        render={
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
        }
      />
      <TooltipContent>
        {t('Pages.Licenses.LifecycleActions.archiveDefaultUnavailable')}
      </TooltipContent>
    </Tooltip>
  );
}

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

// What the confirmation says of the transition it was opened for, and what
// confirming does.
function LifecycleConfirmation({
  asked,
  onConfirm,
}: {
  asked: Confirmation;
  onConfirm: () => void;
}) {
  const { t } = useTranslation();
  const { isEnabled: hasBilling } = useBillingCapabilities();

  return (
    <AlertDialogContent size="sm">
      <AlertDialogHeader>
        <AlertDialogTitle>
          {t(`Pages.Licenses.LifecycleActions.${asked.transition}.title`, {
            name: asked.name,
            version: asked.version,
          })}
        </AlertDialogTitle>
        <AlertDialogDescription>
          {t(`Pages.Licenses.LifecycleActions.${asked.transition}.description`)}
        </AlertDialogDescription>
        {asked.transition === 'publish' && hasBilling ? (
          <PublishBillingNote />
        ) : null}
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel variant="outline">
          {t('Common.cancel')}
        </AlertDialogCancel>
        <AlertDialogClose
          render={
            <AlertDialogAction
              variant={
                asked.transition === 'archive' ? 'destructive' : 'default'
              }
              onClick={onConfirm}
            >
              {t(`Pages.Licenses.LifecycleActions.${asked.transition}.confirm`)}
            </AlertDialogAction>
          }
        />
      </AlertDialogFooter>
    </AlertDialogContent>
  );
}

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

  // An open confirmation stays open until answered, even if the version became
  // the default meanwhile: the API then refuses.
  if (!open && isLifecycleTransitionBlocked(license)) {
    return <BlockedLifecycleAction Icon={Icon} label={label} look={look} />;
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
      <AlertDialogTrigger
        render={
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
        }
      />
      <LifecycleConfirmation
        asked={asked}
        onConfirm={() =>
          run({
            licenseSlug: asked.licenseSlug,
            transition: asked.transition,
          })
        }
      />
    </AlertDialog>
  );
}
