import { useSuspenseQuery } from '@tanstack/react-query';
import { handoffQueryOptions } from '../../queries';
import type { HandoffQueueStatus } from '../../schemas/handoff-search.schema';
import { HandoffList } from './handoff-list';

type HandoffViewProps = {
  /** Which part of the queue the URL asks for. */
  status: HandoffQueueStatus;
};

/**
 * The queue the organization's accounting system reads: the invoices issued with no
 * payment provider behind them, oldest first, as they wait to be booked and once
 * they were. A job or the CLI takes them and acknowledges them; this view shows
 * where that stands, and lets a person acknowledge one they booked by hand. The
 * part of the queue shown is in the URL, so that a link to the waiting invoices
 * survives a reload, and the route loads every invoice of it, like the other list
 * pages load theirs.
 */
export function HandoffView({ status }: HandoffViewProps) {
  const { data } = useSuspenseQuery(handoffQueryOptions(status));

  // Each part of the queue is a list of its own: its search and its filters do not
  // follow the person from one tab to the other.
  return <HandoffList invoices={data.items} key={status} status={status} />;
}
