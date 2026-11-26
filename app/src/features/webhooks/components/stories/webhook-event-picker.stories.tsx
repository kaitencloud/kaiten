import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { isOfferedType } from '../../utils/webhook-event-selection';
import { WebhookEventPicker } from '../webhook-form/event-picker';
import {
  storyWebhookManyEvents,
  storyWebhookOtherEvents,
} from './webhooks.fixtures';

// The picker alone: it holds no selection, so each story keeps one in state.
// No router, no query: the play functions run in `pnpm run test:stories`.
function PickerStory({ initial = [] }: { initial?: string[] }) {
  const [value, setValue] = useState(initial);
  const retainedTypes = useState(() =>
    initial.filter((type) => !isOfferedType(type)),
  )[0];

  return (
    <div className="mx-auto max-w-3xl p-6">
      <WebhookEventPicker
        value={value}
        onChange={(update) => setValue(update)}
        retainedTypes={retainedTypes}
      />
      <output data-testid="selection" className="sr-only">
        {value.join(',')}
      </output>
    </div>
  );
}

const meta = {
  title: 'Features/Webhooks/WebhookEventPicker',
  component: PickerStory,
  parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof PickerStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const selectionOf = (canvasElement: HTMLElement) =>
  (within(canvasElement).getByTestId('selection').textContent ?? '')
    .split(',')
    .filter(Boolean);

export const Collapsed: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('button', { name: /^Customers\b/ }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(canvas.queryByRole('checkbox', { name: 'Customer created' })).toBeNull();
  },
};

export const Selected: Story = {
  args: { initial: storyWebhookManyEvents.eventTypes },
};

export const OtherEvents: Story = {
  args: { initial: storyWebhookOtherEvents.eventTypes },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await expect(
      canvas.getByRole('button', { name: /^Other events\b/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(
      canvas.getByRole('checkbox', { name: 'com.kaiten.future.v1.created' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

export const Searching: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(
      canvas.getByRole('searchbox', { name: 'Search events' }),
      'invoice paid',
    );

    await waitFor(() =>
      expect(canvas.getAllByRole('checkbox', { name: 'Invoice paid' })).toHaveLength(1),
    );
    await expect(
      canvas.getByRole('button', { name: /^Invoices\b/ }),
    ).toHaveAttribute('aria-expanded', 'true');
    await expect(canvas.queryByRole('button', { name: /^Customers\b/ })).toBeNull();
  },
};

export const NoResults: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.type(
      canvas.getByRole('searchbox', { name: 'Search events' }),
      'zzz',
    );

    await expect(await canvas.findByText('No event matches “zzz”.')).toBeVisible();
  },
};

export const PresetBilling: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    await userEvent.click(canvas.getByRole('button', { name: 'Billing' }));

    await expect(canvas.getByRole('button', { name: 'Billing' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(selectionOf(canvasElement)).toHaveLength(30);
    await expect(
      canvas.getByRole('checkbox', { name: 'Select all Subscriptions events' }),
    ).toHaveAttribute('aria-checked', 'true');
  },
};

export const GroupIndeterminate: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole('button', { name: /^Subscriptions\b/ });

    await userEvent.click(trigger);
    const [firstRow] = await canvas.findAllByRole('checkbox', {
      name: /^(?!Select)/,
    });
    await userEvent.click(firstRow!);

    await expect(
      canvas.getByRole('checkbox', { name: 'Select all Subscriptions events' }),
    ).toHaveAttribute('aria-checked', 'mixed');
    await expect(trigger).toHaveTextContent('1 / 13');
  },
};
