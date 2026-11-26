import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import { WEBHOOK_EVENTS } from '../../../utils/webhook-event-catalogue';
import { SUBSCRIBABLE_WEBHOOK_EVENTS } from '../../../utils/webhook-events';
import { WebhookSelectionCard } from '../webhook-selection-card';

const CUSTOMER_TYPES = SUBSCRIBABLE_WEBHOOK_EVENTS.find(
  (entry) => entry.group === 'customer',
)!.events.map((event) => event.type as string);
const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const MODEL_DELETED = WEBHOOK_EVENTS.MODEL_DELETED.type;
const UNKNOWN = 'com.kaiten.future.v1.created';

beforeAll(() => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

function CardFrame({
  initial,
  onValue,
}: {
  initial: string[];
  onValue?: (value: string[]) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <WebhookSelectionCard
      value={value}
      onChange={(update) =>
        setValue((current) => {
          const next = update(current);
          onValue?.(next);
          return next;
        })
      }
    />
  );
}

describe('WebhookSelectionCard', () => {
  it('says when nothing is selected, without a Clear all', () => {
    render(<CardFrame initial={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent('0 events selected');
    expect(screen.getByText('No events selected yet.')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Clear all' })).toBeNull();
  });

  it('draws a full group as one chip, and single events by their NAME', () => {
    render(<CardFrame initial={[...CUSTOMER_TYPES, MODEL_CREATED, UNKNOWN]} />);

    expect(screen.getByRole('status')).toHaveTextContent('6 events selected');
    expect(screen.getByText('All 4 events')).toBeVisible();
    expect(screen.getByText('MODEL_CREATED')).toBeVisible();
    expect(screen.getByText(UNKNOWN)).toBeVisible();
    expect(screen.getByText('Other events')).toBeVisible();
  });

  it('says one event in the singular', () => {
    render(<CardFrame initial={[MODEL_CREATED]} />);

    expect(screen.getByRole('status')).toHaveTextContent('1 event selected');
  });

  it('removes one event, then moves the focus to the next chip', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(
      <CardFrame initial={[MODEL_CREATED, MODEL_DELETED]} onValue={onValue} />,
    );

    await user.click(screen.getByRole('button', { name: 'Remove Model created' }));

    expect(onValue).toHaveBeenLastCalledWith([MODEL_DELETED]);
    expect(screen.getByRole('button', { name: 'Remove Model deleted' })).toHaveFocus();
  });

  it('removes a whole group from its chip', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<CardFrame initial={[...CUSTOMER_TYPES, MODEL_CREATED]} onValue={onValue} />);

    await user.click(
      screen.getByRole('button', { name: 'Remove all 4 Customers events' }),
    );

    expect(onValue).toHaveBeenLastCalledWith([MODEL_CREATED]);
    // The removed chip was the last: the focus goes to the previous one.
    expect(screen.getByRole('button', { name: 'Remove Model created' })).toHaveFocus();
  });

  it('clears everything and puts the focus on the title', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<CardFrame initial={[MODEL_CREATED, UNKNOWN]} onValue={onValue} />);

    await user.click(screen.getByRole('button', { name: 'Clear all' }));

    expect(onValue).toHaveBeenLastCalledWith([]);
    const region = screen.getByRole('region', { name: 'Selection' });
    expect(within(region).getByText('Selection')).toHaveFocus();
  });
});
