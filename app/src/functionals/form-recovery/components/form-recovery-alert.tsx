import { TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CreatedRef, FormRecovery, FormRecoveryNotice } from '../types';
import { Actions, Offer, StatusAlert } from './form-recovery-offers';
import { useRecoveryText } from './use-recovery-text';

export type FormRecoveryAlertProps = {
  recovery: FormRecovery<any, any>;
  /** Labels of the steps, in order: "step 3 of 4 (Eligibility)". */
  stepLabels?: readonly string[];
  /** Readable names of the omitted paths: `{ code: t('...code') }`. */
  fieldLabels?: Partial<Record<string, string>>;
  /**
   * Composition: the actions and sentences of the feature, shown when a send
   * may have gone through or went out elsewhere ("View the list").
   */
  children?: ReactNode;
  /** The link that finishes an object created whose next step failed. */
  finishLink?: (created: CreatedRef) => ReactNode;
  className?: string;
};

function NoticeLine({
  icon,
  children,
  actions,
}: {
  icon?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <StatusAlert>
      {icon ?? <TriangleAlert aria-hidden="true" />}
      <AlertDescription className="text-foreground">
        {children}
      </AlertDescription>
      {actions && <Actions>{actions}</Actions>}
    </StatusAlert>
  );
}

function Notice({
  notice,
  recovery,
  children,
  finishLink,
}: Pick<FormRecoveryAlertProps, 'recovery' | 'children' | 'finishLink'> & {
  notice: FormRecoveryNotice;
}) {
  const text = useRecoveryText();
  const { t } = text;
  const dismiss = (kind: FormRecoveryNotice['kind']) => (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={() => recovery.dismiss(kind)}
    >
      {t('Functionals.FormRecovery.dismiss')}
    </Button>
  );

  switch (notice.kind) {
    case 'lost':
      return (
        <NoticeLine actions={dismiss('lost')}>
          <p>
            {t('Functionals.FormRecovery.lost.description', {
              date: text.date(notice.savedAt),
            })}
          </p>
        </NoticeLine>
      );
    case 'followUp':
      return (
        <NoticeLine
          actions={
            <>
              {finishLink?.(notice.created)}
              {dismiss('followUp')}
            </>
          }
        >
          <p>
            {t('Functionals.FormRecovery.followUp.later', {
              name: notice.created.label ?? notice.created.id,
            })}
          </p>
        </NoticeLine>
      );
    case 'openElsewhere':
      return (
        <NoticeLine actions={dismiss('openElsewhere')}>
          <p>{t('Functionals.FormRecovery.openElsewhere.description')}</p>
        </NoticeLine>
      );
    case 'notKept':
      return (
        <NoticeLine
          actions={
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={recovery.keepHere}
            >
              {t('Functionals.FormRecovery.notKept.keepHere')}
            </Button>
          }
        >
          <p>
            {notice.reason === 'otherTab'
              ? t('Functionals.FormRecovery.notKept.otherTab')
              : notice.reason === 'discarded'
                ? t('Functionals.FormRecovery.notKept.discarded')
                : t('Functionals.FormRecovery.notKept.unknown')}
          </p>
        </NoticeLine>
      );
    case 'sentElsewhere':
      return (
        <NoticeLine actions={children}>
          <p>{t('Functionals.FormRecovery.sentElsewhere.description')}</p>
        </NoticeLine>
      );
    default:
      return null;
  }
}

/** The notices that belong at the head of the form, outside what scrolls. */
const HEAD_NOTICES = new Set<FormRecoveryNotice['kind']>([
  'lost',
  'followUp',
  'openElsewhere',
  'notKept',
  'sentElsewhere',
]);

/**
 * At the head of the form, under the title and before the steps and fields:
 * the offer to resume, and what concerns the send (an input kept by another
 * tab, one sent from another, a send that may have gone through). Renders
 * nothing when it has nothing to say. Every button is `type="button"`: the
 * Alert is inside the `<form>`.
 */
export function FormRecoveryAlert(props: FormRecoveryAlertProps) {
  const { recovery, className } = props;
  const notices = recovery.notices.filter((notice) =>
    HEAD_NOTICES.has(notice.kind),
  );

  if (!recovery.persistent || (!recovery.offer && notices.length === 0)) {
    return null;
  }

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      {recovery.offer && <Offer {...props} offer={recovery.offer} />}
      {notices.map((notice) => (
        <Notice
          key={notice.kind}
          notice={notice}
          recovery={recovery}
          finishLink={props.finishLink}
        >
          {props.children}
        </Notice>
      ))}
    </div>
  );
}
