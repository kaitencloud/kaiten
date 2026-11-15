import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { DEFAULT_REFERENCE_CALLS } from '../engine';
import { RateCardGrid, type RateCardGridProps } from '../rate-card-grid';
import type { CellRef } from '../rate-card-model';
import {
  manyModels,
  storyGroups,
  storyModels,
  storyVersions,
} from './rate-card-story-fixtures';

/** The grid with the state the page holds for it: the open cell, the folded vendors. */
function GridHarness(props: Partial<RateCardGridProps>) {
  const [selected, setSelected] = useState<CellRef | null>(
    props.selected ?? null,
  );
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());

  return (
    <RateCardGrid
      collapsed={collapsed}
      creditValue={null}
      emptyMessage="No model takes this request type."
      groups={storyGroups()}
      models={storyModels}
      onSelect={setSelected}
      poolName="AI credits"
      onToggleVendor={(vendor) =>
        setCollapsed((current) => {
          const next = new Set(current);
          if (!next.delete(vendor)) next.add(vendor);

          return next;
        })
      }
      reference={DEFAULT_REFERENCE_CALLS.COMPLETION}
      type="COMPLETION"
      versions={storyVersions()}
      {...props}
      selected={selected}
    />
  );
}

const meta = {
  title: 'Features/AI/Pricing/RateCardGrid',
  component: GridHarness,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof GridHarness>;

export default meta;
type Story = StoryObj<typeof meta>;

const cell = (canvasElement: HTMLElement, id: string) => {
  const button = canvasElement.querySelector<HTMLElement>(
    `[data-cell="${id}"]`,
  );
  if (!button) throw new Error(`No cell ${id}`);

  return button;
};

/** The current version of each family: wildcards, own rules, a version with no rule. */
export const CurrentVersions: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByRole('columnheader')).toHaveLength(5);
    await expect(
      cell(canvasElement, 'starter-v2~claude-sonnet-4-5'),
    ).toHaveTextContent('1.00');
    await expect(
      cell(canvasElement, 'enterprise-v2~claude-sonnet-4-5'),
    ).toHaveTextContent('1.60');
    await expect(
      cell(canvasElement, 'business~claude-sonnet-4-5'),
    ).toHaveTextContent('2.40');

    const opus = cell(canvasElement, 'starter-v2~claude-opus-4-1');
    await userEvent.click(opus);
    await expect(opus).toHaveAttribute('aria-pressed', 'true');

    const [firstGroup] = canvas.getAllByRole('button', { expanded: true });
    await userEvent.click(firstGroup!);
    await expect(firstGroup).toHaveAttribute('aria-expanded', 'false');
    await expect(
      canvasElement.querySelector('[data-cell="starter-v2~claude-opus-4-1"]'),
    ).toBeNull();
  },
};

/** With a value of a credit: the margin, and a negative one marked by more than colour. */
export const WithCreditValue: Story = {
  args: { creditValue: '0.01' },
  play: async ({ canvasElement }) => {
    await expect(
      cell(canvasElement, 'starter-v2~claude-haiku-4-5'),
    ).toHaveTextContent('60%');
    const opus = cell(canvasElement, 'starter-v2~claude-opus-4-1');
    await expect(opus).toHaveTextContent('-500%');
    await expect(within(opus).getByRole('img')).toBeVisible();
  },
};

/** Every version of one family, a draft and an archived one among them. */
export const OneFamily: Story = {
  args: { versions: storyVersions('ai-credits', 'starter') },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getAllByRole('columnheader'),
    ).toHaveLength(4);
    await expect(
      cell(canvasElement, 'starter-v3~claude-sonnet-4-5'),
    ).toHaveTextContent('1.50');
  },
};

/** Image generation: a deprecated model keeps its rule and takes no new one. */
export const DeprecatedModel: Story = {
  args: {
    groups: storyGroups('IMAGE_GENERATION'),
    reference: DEFAULT_REFERENCE_CALLS.IMAGE_GENERATION,
    type: 'IMAGE_GENERATION',
    versions: storyVersions('ai-credits', 'enterprise'),
  },
  play: async ({ canvasElement }) => {
    await expect(
      cell(canvasElement, 'enterprise-v2~gpt-image-1'),
    ).toHaveTextContent('5.00');
  },
};

/** Audio with the archived models shown: an archived model is priced by nothing. */
export const ArchivedModel: Story = {
  args: {
    groups: storyGroups('AUDIO', 'all'),
    reference: DEFAULT_REFERENCE_CALLS.AUDIO,
    type: 'AUDIO',
    versions: storyVersions('ai-credits', 'enterprise'),
  },
  play: async ({ canvasElement }) => {
    await expect(
      cell(canvasElement, 'enterprise-v2~gpt-4o-transcribe'),
    ).toHaveTextContent('1.20');
    await expect(
      within(canvasElement).getAllByRole('rowheader'),
    ).toHaveLength(4);
  },
};

/**
 * A pool an add-on can grant on Business, which does not grant it itself: the
 * head and the cells say "through add-on" with its name, and the head opens
 * which add-on versions, and what that does and does not mean.
 */
export const ThroughAddOn: Story = {
  args: { poolName: 'Partner AI credits', versions: storyVersions('partner-ai-credits') },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const onBusiness = cell(canvasElement, 'business~claude-haiku-4-5');
    await expect(onBusiness).toHaveTextContent('4.00');
    await expect(onBusiness).toHaveTextContent('Through add-on · Partner credit pack');
    await expect(
      cell(canvasElement, 'enterprise-v2~claude-sonnet-4-5'),
    ).toHaveTextContent('5.00');

    await userEvent.click(
      canvas.getByRole('button', { name: 'Through add-on · Partner credit pack' }),
    );
    const details = await within(document.body).findByRole('dialog');
    await expect(details).toHaveTextContent('It does not mean every instance holds it');
    await waitFor(() =>
      expect(within(details).getByText('partner-credit-pack-v2')).toBeVisible(),
    );
    // Closed again before the story ends: an open popover keeps focus guards
    // in the page, which the accessibility check reads as focusable and hidden.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('dialog')).toBeNull(),
    );
  },
};

/** Enterprise's first version prices the partner pool, which nothing grants on it. */
export const PoolNotGranted: Story = {
  args: {
    poolName: 'Partner AI credits',
    versions: storyVersions('partner-ai-credits', 'enterprise'),
  },
  play: async ({ canvasElement }) => {
    await expect(
      cell(canvasElement, 'enterprise~claude-sonnet-4-5'),
    ).toHaveTextContent('Not granted');
  },
};

/** The add-ons cannot be listed (billing off): the head still says one can grant the pool. */
export const AddOnsUnreadable: Story = {
  args: {
    poolName: 'Partner AI credits',
    versions: storyVersions('partner-ai-credits').map((version) => ({
      ...version,
      addons: { status: 'UNREADABLE' as const, reason: 'BILLING_OFF' as const },
    })),
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(
      within(canvasElement).getByRole('button', { name: 'Through add-on' }),
    );
    const reason = await within(document.body).findByText(
      /Billing is off on this deployment/,
    );
    await waitFor(() => expect(reason).toBeVisible());
    // Closed again before the story ends: an open popover keeps focus guards
    // in the page, which the accessibility check reads as focusable and hidden.
    await userEvent.keyboard('{Escape}');
    await waitFor(() =>
      expect(within(document.body).queryByRole('dialog')).toBeNull(),
    );
  },
};

/** A pool that no version grants and no rule prices. */
export const EmptyPool: Story = {
  args: { versions: storyVersions('agent-credits') },
};

/** Forty-five models: the head and the first column stay in place while it scrolls. */
export const ManyModels: Story = {
  args: (() => {
    const models = manyModels(45);

    return { groups: storyGroups('COMPLETION', 'active', models), models };
  })(),
  play: async ({ canvasElement }) => {
    await expect(
      canvasElement.querySelectorAll('[data-cell]').length,
    ).toBeGreaterThanOrEqual(45 * 4);
  },
};

/** No model left after the filters. */
export const NoModel: Story = { args: { groups: [] } };
