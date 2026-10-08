import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { TableEmptyMessage } from '../table-empty-message';

/** The command that takes the invoices of the queue, which the empty queue teaches. */
const HANDOFF_CLAIM_COMMAND = 'kaiten billing handoff claim';

type HandoffEmptyProps = {
  /** Whether a filter of the screen is why there is no row. */
  filtered: boolean;
  /** Takes every filter of the screen off. */
  onClearFilters: () => void;
  status: HandoffQueueStatus;
};

/**
 * What the table says when it has no row. A filter that hides everything says so and
 * clears itself from the message. For what waits an empty queue is the normal state,
 * and the moment to say how the queue is read: invoices nobody collects through a
 * payment provider wait here for a job or a terminal, which claims them with the
 * command, books them in the accounting system and acknowledges them. There is no
 * button for it: claiming is the consumer's, not a person's.
 */
export function HandoffEmpty({
  filtered,
  onClearFilters,
  status,
}: HandoffEmptyProps) {
  const { t } = useTranslation();

  if (filtered) {
    return (
      <TableEmptyMessage
        description={t('Pages.Billing.Handoff.Empty.filteredDescription')}
        testId="handoff-empty"
        title={t('Pages.Billing.Handoff.Empty.filteredTitle')}
      >
        <Button onClick={onClearFilters} size="sm" variant="outline">
          {t('Pages.Billing.Handoff.Empty.clearFilters')}
        </Button>
      </TableEmptyMessage>
    );
  }

  const isPending = status === 'PENDING';

  return (
    <TableEmptyMessage
      description={t(
        isPending
          ? 'Pages.Billing.Handoff.Empty.pendingDescription'
          : 'Pages.Billing.Handoff.Empty.acknowledgedDescription',
      )}
      testId="handoff-empty"
      title={t(
        isPending
          ? 'Pages.Billing.Handoff.Empty.pendingTitle'
          : 'Pages.Billing.Handoff.Empty.acknowledgedTitle',
      )}
    >
      {isPending ? (
        <code className="rounded bg-muted px-2 py-1 font-mono text-xs">
          {HANDOFF_CLAIM_COMMAND}
        </code>
      ) : null}
    </TableEmptyMessage>
  );
}
