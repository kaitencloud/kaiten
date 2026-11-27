import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import i18n from 'i18next';
import { useState } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test';
import en from '@/lib/i18n/locales/en';
import { WEBHOOK_EVENTS } from '../../../../utils/webhook-event-catalogue';
import { WEBHOOK_EVENT_PRESETS } from '../../../../utils/webhook-event-presets';
import { WebhookEventPicker } from '../webhook-event-picker';

const CUSTOMER_CREATED = WEBHOOK_EVENTS.CUSTOMER_CREATED.type;
const MODEL_CREATED = WEBHOOK_EVENTS.MODEL_CREATED.type;
const FEATURE_FLAG_EVALUATED = WEBHOOK_EVENTS.FEATURE_FLAG_EVALUATED.type;
const UNKNOWN = 'com.kaiten.future.v1.created';

beforeAll(() => {
  i18n.addResourceBundle('en', 'translation', en, true, true);
});

function PickerFrame({
  initial = [],
  retainedTypes,
  onValue,
}: {
  initial?: string[];
  retainedTypes?: string[];
  onValue?: (value: string[]) => void;
}) {
  const [value, setValue] = useState(initial);

  return (
    <WebhookEventPicker
      value={value}
      retainedTypes={retainedTypes}
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

const groupTrigger = (title: string) =>
  screen.getByRole('button', { name: new RegExp(`^${title}\\b`) });

async function search(user: ReturnType<typeof userEvent.setup>, query: string) {
  await user.type(screen.getByRole('searchbox', { name: 'Search events' }), query);
}

describe('WebhookEventPicker', () => {
  it('opens with every group collapsed, and never offers the high-volume reads', () => {
    render(<PickerFrame />);

    expect(screen.getByRole('group', { name: 'Events' })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Customer created' })).toBeNull();
    expect(groupTrigger('Customers')).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('FEATURE_FLAG_EVALUATED')).toBeNull();
    expect(screen.queryByText('ENTITLEMENT_VALUE_GET')).toBeNull();
  });

  it('opens a group, and a row sends a normalised selection', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<PickerFrame initial={[CUSTOMER_CREATED]} onValue={onValue} />);

    await user.click(groupTrigger('Models'));
    await user.click(screen.getByRole('checkbox', { name: 'Model created' }));

    expect(onValue).toHaveBeenLastCalledWith([MODEL_CREATED, CUSTOMER_CREATED]);
  });

  it('marks a partly selected group as mixed and counts the whole group', async () => {
    const user = userEvent.setup();
    render(<PickerFrame />);

    await user.click(groupTrigger('Customers'));
    await user.click(screen.getByRole('checkbox', { name: 'Customer created' }));

    expect(
      screen.getByRole('checkbox', { name: 'Select all Customers events' }),
    ).toHaveAttribute('aria-checked', 'mixed');
    expect(groupTrigger('Customers')).toHaveTextContent('1 / 4');

    await user.click(
      screen.getByRole('checkbox', { name: 'Select all Customers events' }),
    );

    expect(
      screen.getByRole('checkbox', { name: 'Select all Customers events' }),
    ).toHaveAttribute('aria-checked', 'true');
    expect(groupTrigger('Customers')).toHaveTextContent('4 / 4');
  });

  it('searches by label, NAME and type, opening the groups that match', async () => {
    const user = userEvent.setup();
    render(<PickerFrame />);

    await search(user, 'invoice paid');

    expect(await screen.findByRole('checkbox', { name: 'Invoice paid' })).toBeVisible();
    expect(groupTrigger('Invoices')).toHaveAttribute('aria-expanded', 'true');
    expect(screen.queryByRole('button', { name: /^Customers\b/ })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('1 event matches');

    await user.clear(screen.getByRole('searchbox', { name: 'Search events' }));
    await search(user, 'customer_created');
    expect(await screen.findByRole('checkbox', { name: 'Customer created' })).toBeVisible();

    await user.clear(screen.getByRole('searchbox', { name: 'Search events' }));
    await search(user, 'com.kaiten.model.v1.created');
    expect(await screen.findByRole('checkbox', { name: 'Model created' })).toBeVisible();
  });

  it('ticks only the matching rows from a group checkbox while searching', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<PickerFrame onValue={onValue} />);

    await search(user, 'customer created');
    await user.click(
      await screen.findByRole('checkbox', {
        name: 'Select the matching Customers events',
      }),
    );

    expect(onValue).toHaveBeenLastCalledWith([CUSTOMER_CREATED]);
  });

  it('shows an empty state that clears the search', async () => {
    const user = userEvent.setup();
    render(<PickerFrame />);

    await search(user, 'zzz');

    expect(await screen.findByText('No event matches “zzz”.')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Clear search' }).at(-1)!);
    expect(groupTrigger('Customers')).toBeVisible();
  });

  it('clears the search with Escape and brings back the groups opened by hand', async () => {
    const user = userEvent.setup();
    render(<PickerFrame />);

    await user.click(groupTrigger('Models'));
    await search(user, 'invoice paid');
    await user.keyboard('{Escape}');

    expect(screen.getByRole('searchbox', { name: 'Search events' })).toHaveValue('');
    expect(groupTrigger('Models')).toHaveAttribute('aria-expanded', 'true');
    expect(groupTrigger('Invoices')).toHaveAttribute('aria-expanded', 'false');
  });

  it('applies a preset and takes it off again', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<PickerFrame initial={[CUSTOMER_CREATED]} onValue={onValue} />);
    const billing = screen.getByRole('button', { name: 'Billing' });

    expect(billing).toHaveAttribute('aria-pressed', 'false');
    await user.click(billing);

    expect(billing).toHaveAttribute('aria-pressed', 'true');
    expect(onValue).toHaveBeenLastCalledWith([
      CUSTOMER_CREATED,
      ...WEBHOOK_EVENT_PRESETS.billing,
    ]);

    await user.click(billing);
    expect(onValue).toHaveBeenLastCalledWith([CUSTOMER_CREATED]);
  });

  it('lists the retained types under Other events, open, and lets them be removed', async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(
      <PickerFrame
        initial={[FEATURE_FLAG_EVALUATED, UNKNOWN]}
        retainedTypes={[FEATURE_FLAG_EVALUATED, UNKNOWN]}
        onValue={onValue}
      />,
    );

    expect(groupTrigger('Other events')).toHaveAttribute('aria-expanded', 'true');
    const unknown = screen.getByRole('checkbox', { name: UNKNOWN });
    expect(unknown).toHaveAttribute('aria-checked', 'true');

    await user.click(unknown);

    expect(onValue).toHaveBeenLastCalledWith([FEATURE_FLAG_EVALUATED]);
    // Unticked, the row stays, so it can be ticked again.
    expect(screen.getByRole('checkbox', { name: UNKNOWN })).toHaveAttribute(
      'aria-checked',
      'false',
    );
    expect(
      within(screen.getByRole('group', { name: 'Events' })).getByText(
        'Already subscribed, but not offered by this console. Untick to remove.',
      ),
    ).toBeVisible();
  });

  it('keeps Enter in the search from sending the form', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn((event: SubmitEvent) => event.preventDefault());
    render(
      <form onSubmit={(event) => onSubmit(event.nativeEvent as SubmitEvent)}>
        <PickerFrame />
      </form>,
    );

    await search(user, 'invoice{Enter}');
    await act(async () => {});

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
