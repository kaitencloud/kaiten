import {
  Ban,
  ChevronDown,
  CircleCheck,
  CloudDownload,
  FileX,
  LoaderCircle,
  LockOpen,
  RefreshCw,
  Send,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  formatUtcDate,
  type InvoiceAction,
  type InvoiceActionState,
  type InvoiceActionUnavailable,
  type PushVariant,
} from '@/domains/billing';
import { cn } from '@/lib/utils';

const ACTION_ICONS = {
  markPaid: CircleCheck,
  recompose: RefreshCw,
  releaseHold: LockOpen,
  retryPush: Send,
  sync: CloudDownload,
  void: Ban,
  writeOff: FileX,
} as const satisfies Record<InvoiceAction, ComponentType>;

const ACTION_LABEL_KEYS = {
  markPaid: 'Pages.Billing.Invoices.Detail.Actions.markPaid',
  recompose: 'Pages.Billing.Invoices.Detail.Actions.recompose',
  releaseHold: 'Pages.Billing.Invoices.Detail.Actions.releaseHold',
  retryPush: 'Pages.Billing.Invoices.Detail.Actions.retryPush',
  sync: 'Pages.Billing.Invoices.Detail.Actions.sync',
  void: 'Pages.Billing.Invoices.Detail.Actions.void',
  writeOff: 'Pages.Billing.Invoices.Detail.Actions.writeOff',
} as const satisfies Record<InvoiceAction, string>;

// Pushing again reads as what it does to this invoice: a push that failed is retried,
// a draft the queue has not pushed is pushed now, and a draft Stripe holds for a
// person is finalized.
const PUSH_LABEL_KEYS = {
  finalize: 'Pages.Billing.Invoices.Detail.Actions.finalize',
  push: 'Pages.Billing.Invoices.Detail.Actions.push',
  retry: 'Pages.Billing.Invoices.Detail.Actions.retryPush',
} as const satisfies Record<PushVariant, string>;

const getLabelKey = (state: InvoiceActionState) =>
  state.action === 'retryPush' && state.variant
    ? PUSH_LABEL_KEYS[state.variant]
    : ACTION_LABEL_KEYS[state.action];

/** Why an action the status allows cannot be run, in words; nothing when it can. */
function useUnavailableText(unavailable: InvoiceActionUnavailable | undefined) {
  const { i18n, t } = useTranslation();

  if (!unavailable) {
    return undefined;
  }

  return unavailable.reason === 'purged-usage'
    ? t('Pages.Billing.Invoices.Detail.Actions.purgedUsage', {
        date: formatUtcDate(
          unavailable.retentionStart.toISOString(),
          i18n.language,
        ),
      })
    : t('Pages.Billing.Invoices.Detail.Actions.instanceDeleted');
}

/** Voiding and writing off cannot be undone: they read as the destructive actions they are. */
const isDestructive = (action: InvoiceAction) =>
  action === 'void' || action === 'writeOff';

type InvoiceActionButtonProps = {
  /** The first action is the one the status leads to; the others are beside it. */
  isPrimary: boolean;
  onRun: (action: InvoiceAction) => void;
  /** Whether the action is running: its button waits, with a spinner, until it is done. */
  pending: boolean;
  state: InvoiceActionState;
};

function InvoiceActionButton({
  isPrimary,
  onRun,
  pending,
  state,
}: InvoiceActionButtonProps) {
  const { t } = useTranslation();
  const unavailableText = useUnavailableText(state.unavailable);
  const Icon = pending ? LoaderCircle : ACTION_ICONS[state.action];
  const button = (
    <Button
      className={cn(
        !isPrimary &&
          isDestructive(state.action) &&
          'text-destructive-subtle-foreground',
      )}
      data-action={state.action}
      disabled={Boolean(state.unavailable) || pending}
      onClick={() => onRun(state.action)}
      type="button"
      variant={isPrimary ? 'default' : 'outline'}
    >
      <Icon className={pending ? 'animate-spin' : undefined} />
      {t(getLabelKey(state))}
    </Button>
  );

  // A disabled button swallows pointer events, so a focusable wrapper carries the
  // reason, which a keyboard reaches as well.
  if (!unavailableText) {
    return button;
  }

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span className="inline-flex" tabIndex={0}>
            {button}
          </span>
        }
      />
      <TooltipContent className="max-w-64 whitespace-normal">
        {unavailableText}
      </TooltipContent>
    </Tooltip>
  );
}

type InvoiceActionMenuItemProps = {
  onRun: (action: InvoiceAction) => void;
  pending: boolean;
  state: InvoiceActionState;
};

/** One action in the menu a phone gets: the reason it cannot be run is written under its name. */
function InvoiceActionMenuItem({
  onRun,
  pending,
  state,
}: InvoiceActionMenuItemProps) {
  const { t } = useTranslation();
  const reason = useUnavailableText(state.unavailable);
  const Icon = ACTION_ICONS[state.action];

  return (
    <DropdownMenuItem
      data-action={state.action}
      disabled={Boolean(state.unavailable) || pending}
      onClick={() => onRun(state.action)}
      variant={isDestructive(state.action) ? 'destructive' : 'default'}
    >
      <Icon />
      <span className="grid">
        {t(getLabelKey(state))}
        {reason ? (
          <span className="max-w-56 text-xs whitespace-normal text-muted-foreground">
            {reason}
          </span>
        ) : null}
      </span>
    </DropdownMenuItem>
  );
}

type InvoiceActionButtonsProps = {
  onRun: (action: InvoiceAction) => void;
  /** The actions that are running: their buttons wait. */
  pending?: readonly InvoiceAction[];
  states: InvoiceActionState[];
};

/**
 * The actions of an invoice, as buttons from the width of a tablet, and folded
 * into one menu below it: three buttons do not fit beside a title on a phone.
 * An action that the status allows and that cannot be run now is shown disabled,
 * with why.
 */
export function InvoiceActionButtons({
  onRun,
  pending = [],
  states,
}: InvoiceActionButtonsProps) {
  const { t } = useTranslation();

  function renderButton(state: InvoiceActionState, index: number) {
    return (
      <InvoiceActionButton
        isPrimary={index === 0}
        key={state.action}
        onRun={onRun}
        pending={pending.includes(state.action)}
        state={state}
      />
    );
  }

  function renderMenuItem(state: InvoiceActionState) {
    return (
      <InvoiceActionMenuItem
        key={state.action}
        onRun={onRun}
        pending={pending.includes(state.action)}
        state={state}
      />
    );
  }

  return (
    <>
      <div
        className="hidden flex-wrap items-center gap-2 sm:flex"
        data-testid="invoice-actions"
      >
        {states.map(renderButton)}
      </div>
      <div className="sm:hidden" data-testid="invoice-actions-menu">
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button type="button" variant="outline">
                {t('Pages.Billing.Invoices.Detail.Actions.menu')}
                <ChevronDown />
              </Button>
            }
          />
          <DropdownMenuContent align="start">
            {states.map(renderMenuItem)}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
