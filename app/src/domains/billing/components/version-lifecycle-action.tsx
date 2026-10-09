import { Archive, ArchiveRestore, type LucideIcon, Send } from 'lucide-react';
import { type MouseEvent, type ReactNode, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import type { VersionLifecycleTransition } from '../logic';
import { ROW_ACTION_LOOKS, type RowActionAppearance } from './row-action-looks';

const TRANSITION_ICONS: Record<VersionLifecycleTransition, LucideIcon> = {
  archive: Archive,
  publish: Send,
  unarchive: ArchiveRestore,
};

/** The keys of the words a transition says: its button, and its confirmation. */
export type VersionLifecycleKeys = Record<
  VersionLifecycleTransition,
  Record<'confirm' | 'description' | 'label' | 'title', string>
>;

type Confirmation = {
  name: string;
  slug: string;
  transition: VersionLifecycleTransition;
  version: number | string | undefined;
};

type VersionLifecycleActionProps = {
  appearance: RowActionAppearance;
  /** Whether the session may do it; when not, nothing is shown unless a confirmation is open. */
  available?: boolean;
  /** The family's default cannot be archived: the action is shown disabled, with the way out. */
  blocked: boolean;
  /** The key of what the disabled action says on hover and on focus. */
  blockedKey: string;
  isPending: boolean;
  keys: VersionLifecycleKeys;
  name: string;
  /** What confirming does, with the slug and the transition the confirmation was opened for. */
  onConfirm: (asked: {
    slug: string;
    transition: VersionLifecycleTransition;
  }) => void;
  /** What publishing changes for what the version sells, said under its description. */
  publishNote?: ReactNode;
  /** The slug of the version; the action is disabled without one. */
  slug: string | undefined;
  transition: VersionLifecycleTransition;
  version: number | string | undefined;
};

// A versions table row opens its version when clicked; this button is not a click on
// the row. The dialog it opens renders in a portal, which the row already ignores.
function keepClickOffTheRow(event: MouseEvent) {
  event.stopPropagation();
}

// The family's default cannot be archived. The action stays visible but disabled,
// with the way out on hover and focus, as set-as-default does for an unpublished
// version.
function BlockedLifecycleAction({
  appearance,
  blockedKey,
  Icon,
  label,
}: {
  appearance: RowActionAppearance;
  blockedKey: string;
  Icon: LucideIcon;
  label: string;
}) {
  const { t } = useTranslation();
  const look = ROW_ACTION_LOOKS[appearance];

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className={look.wrapperClassName} tabIndex={0}>
            <Button
              className={look.disabledClassName}
              disabled
              size="sm"
              type="button"
              variant={look.variant}
            >
              <Icon className="size-3" />
              {label}
            </Button>
          </span>
        }
      />
      <TooltipContent>{t(blockedKey)}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Publish, archive or unarchive a version: the one transition its state accepts,
 * confirmed first, since each changes what the family serves and notifies the
 * webhooks. The versions of a license and those of an add-on share the dialog, the
 * looks and the guards; each feature brings its words, its permission and the
 * operation confirming runs.
 */
export function VersionLifecycleAction({
  appearance,
  available = true,
  blocked,
  blockedKey,
  isPending,
  keys,
  name,
  onConfirm,
  publishNote,
  slug,
  transition,
  version,
}: VersionLifecycleActionProps) {
  const { t } = useTranslation();
  // The dialog shows and confirms what was asked when it opened. The version may be
  // refetched while it is open -- moved on by someone else, or, in the versions table,
  // replaced by another version at this row -- and "confirm" must not quietly become a
  // different action.
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const asked: Confirmation = confirmation ?? {
    name,
    slug: slug ?? '',
    transition,
    version,
  };
  const Icon = TRANSITION_ICONS[transition];
  const look = ROW_ACTION_LOOKS[appearance];
  const label = t(keys[transition].label);

  if (!available && !open) {
    return null;
  }
  // An open confirmation stays open until answered, even if the version became the
  // default meanwhile: the API then refuses.
  if (!open && blocked) {
    return (
      <BlockedLifecycleAction
        appearance={appearance}
        blockedKey={blockedKey}
        Icon={Icon}
        label={label}
      />
    );
  }

  return (
    <AlertDialog
      onOpenChange={(nextOpen) => {
        if (nextOpen && slug) {
          setConfirmation({ name, slug, transition, version });
        }
        setOpen(nextOpen);
      }}
      open={open}
    >
      <AlertDialogTrigger
        render={
          <Button
            className={look.className}
            disabled={isPending || !slug}
            onClick={keepClickOffTheRow}
            size="sm"
            type="button"
            variant={look.variant}
          >
            <Icon className="size-3" />
            {label}
          </Button>
        }
      />
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t(keys[asked.transition].title, {
              name: asked.name,
              version: asked.version,
            })}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t(keys[asked.transition].description)}
          </AlertDialogDescription>
          {asked.transition === 'publish' ? publishNote : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel variant="outline">
            {t('Common.cancel')}
          </AlertDialogCancel>
          <AlertDialogClose
            render={
              <AlertDialogAction
                onClick={() =>
                  onConfirm({ slug: asked.slug, transition: asked.transition })
                }
                variant={
                  asked.transition === 'archive' ? 'destructive' : 'default'
                }
              >
                {t(keys[asked.transition].confirm)}
              </AlertDialogAction>
            }
          />
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
