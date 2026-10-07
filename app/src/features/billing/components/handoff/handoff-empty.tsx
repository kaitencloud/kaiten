import { useTranslation } from 'react-i18next';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { ListEmptyState } from '../paged-list';

/** The command that takes the invoices of the queue, which the empty queue teaches. */
const HANDOFF_CLAIM_COMMAND = 'kaiten billing handoff claim';

/**
 * What the queue says when it holds nothing. For what waits, that is the normal
 * state, and the moment to say how the queue is read: invoices nobody collects
 * through a payment provider wait here for a job or a terminal, which claims them
 * with the command, books them in the accounting system and acknowledges them.
 * There is no button for it: claiming is the consumer's, not a person's.
 */
export function HandoffEmpty({ status }: { status: HandoffQueueStatus }) {
  const { t } = useTranslation();
  const isPending = status === 'PENDING';

  return (
    <ListEmptyState
      className="mt-4"
      description={t(
        isPending
          ? 'Pages.Billing.Handoff.Empty.pendingDescription'
          : 'Pages.Billing.Handoff.Empty.acknowledgedDescription',
      )}
      icon={dataModelIcons.invoice}
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
    </ListEmptyState>
  );
}
