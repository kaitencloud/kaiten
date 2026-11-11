import type { Meta, StoryObj } from '@storybook/react-vite';
import type { QueryClient } from '@tanstack/react-query';
import { expect, userEvent, within } from 'storybook/test';
import {
  AI_ACCESS_FRESHNESS_MS,
  aiAccessQueryOptions,
} from '@/domains/ai-credits';
import { grantedScopesQueryKey } from '@/lib/granted-scopes';
import { StorybookRouter } from '@/test-fixtures/storybook-router';
import { DEFAULT_REFERENCE_CALLS } from '../../engine';
import {
  storyModel,
  storyModels,
  storyPool,
  storyVersion,
} from '../../stories/rate-card-story-fixtures';
import {
  PricingCellPanel,
  type PricingCellPanelProps,
} from '../pricing-cell-panel';

/**
 * A session with AI credits on. `scopes` null is a session whose scopes are
 * unknown, which the console lets try everything; a list is what it may do.
 */
const seedAccess =
  (scopes: readonly string[] | null) => (client: QueryClient) => {
    const target = window as Window & { Clerk?: unknown };
    target.Clerk = {
      ...(target.Clerk as object),
      organization: { id: 'story-organization' },
      user: { id: 'story-user' },
    };
    client.setQueryData(aiAccessQueryOptions().queryKey, {
      enabled: true,
      expiresAt: performance.now() + AI_ACCESS_FRESHNESS_MS,
    });
    client.setQueryData(grantedScopesQueryKey, scopes);
  };

type StoryArgs = Partial<PricingCellPanelProps> & {
  scopes?: readonly string[] | null;
};

function PanelStory({ scopes = null, ...props }: StoryArgs) {
  return (
    <StorybookRouter seed={seedAccess(scopes)}>
      <div className="ml-auto w-[26.25rem] max-w-full">
        <PricingCellPanel
          creditValue="0.01"
          model={storyModel('claude-opus-4-1')}
          models={storyModels}
          onClose={() => {}}
          onDirtyChange={() => {}}
          onOpenCell={() => {}}
          pool={storyPool()}
          reference={DEFAULT_REFERENCE_CALLS.COMPLETION}
          type="COMPLETION"
          version={storyVersion('starter-v2')}
          {...props}
        />
      </div>
    </StorybookRouter>
  );
}

const meta = {
  title: 'Features/AI/Pricing/CellPanel',
  component: PanelStory,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof PanelStory>;

export default meta;
type Story = StoryObj<typeof meta>;

const rate = (canvasElement: HTMLElement, key: string) =>
  within(canvasElement).getByRole('textbox', { name: new RegExp(`${key}$`) });

/** A model priced by a wildcard: the ladder, the explanation, the two ways out. */
export const Inherited: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const levels = within(canvas.getByRole('list')).getAllByRole('listitem');
    await expect(levels).toHaveLength(4);
    await expect(levels[3]).toHaveAttribute('aria-current', 'true');
    await expect(canvasElement).toHaveTextContent('-500%');
    await expect(canvas.queryByRole('textbox')).toBeNull();
  },
};

/** "Override for this model" opens an empty rule: nothing to save yet. */
export const OverrideStartsEmpty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const [override] = canvas.getAllByRole('button').filter(
      (item) => !item.getAttribute('aria-label'),
    );
    await userEvent.click(override!);
    const input = await canvas.findByRole('textbox', { name: /perRequest$/ });
    await expect(input).toHaveValue('');
    const save = canvas.getByRole('button', { name: /rule$/i });
    await expect(save).toBeDisabled();
    await userEvent.type(input, '6');
    await expect(save).toBeEnabled();
    await expect(canvasElement).toHaveTextContent('6.00');
  },
};

/** A model with its own rule: its rates, its bounds, and the preview. */
export const OwnRule: Story = {
  args: {
    model: storyModel('claude-sonnet-4-5'),
    version: storyVersion('enterprise-v2'),
  },
  play: async ({ canvasElement }) => {
    await expect(rate(canvasElement, 'perOutputToken')).toHaveValue('0.002');
    await expect(rate(canvasElement, 'perRequest')).toHaveValue('');
    await userEvent.clear(rate(canvasElement, 'perOutputToken'));
    await userEvent.type(rate(canvasElement, 'perOutputToken'), '0.0018');
    await expect(canvasElement).toHaveTextContent('1.60 → 1.50');
  },
};

/**
 * A model the catalogue costs in part only (an input cost, no output cost):
 * the vendor cost is shown as partial, with no cost per credit and no margin.
 */
export const PartialVendorCost: Story = {
  args: {
    model: {
      ...storyModel('claude-sonnet-4-5'),
      vendorCosts: { currency: 'USD', perInputToken: '0.000003' },
    },
    version: storyVersion('enterprise-v2'),
  },
  play: async ({ canvasElement }) => {
    await expect(rate(canvasElement, 'perOutputToken')).toHaveValue('0.002');
    await expect(canvasElement).toHaveTextContent(
      'Partial: the catalogue has no cost for part of this usage',
    );
    await expect(canvasElement).not.toHaveTextContent(/\d%/);
  },
};

/** The wildcard of a version, with the warning of what it reprices. */
export const Wildcard: Story = {
  args: { model: null, version: storyVersion('enterprise-v2') },
  play: async ({ canvasElement }) => {
    await expect(rate(canvasElement, 'perInputToken')).toHaveValue('0.0005');
    await expect(
      within(canvasElement).getAllByRole('note').length,
    ).toBeGreaterThanOrEqual(1);
  },
};

/** A version that grants the pool and has no rule: every call is refused. */
export const NoRuleOnGrantingVersion: Story = {
  args: {
    model: storyModel('claude-sonnet-4-5'),
    version: storyVersion('trial'),
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('textbox'),
    ).toBeNull();
    await expect(
      within(canvasElement).getAllByRole('button').length,
    ).toBeGreaterThanOrEqual(3);
  },
};

/** A deprecated model with no rule: it takes no new one. */
export const DeprecatedModel: Story = {
  args: {
    model: storyModel('gpt-image-1'),
    reference: DEFAULT_REFERENCE_CALLS.IMAGE_GENERATION,
    type: 'IMAGE_GENERATION',
    version: storyVersion('enterprise'),
  },
  play: async ({ canvasElement }) => {
    // Only the close button: no rule can be added.
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(1);
  },
};

/** An archived model: explained, never priced. */
export const ArchivedModel: Story = {
  args: {
    model: storyModel('whisper-large-v3'),
    reference: DEFAULT_REFERENCE_CALLS.AUDIO,
    type: 'AUDIO',
    version: storyVersion('enterprise-v2'),
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole('textbox')).toBeNull();
    // The close button and the way to the models, where it is reactivated.
    await expect(within(canvasElement).getAllByRole('button')).toHaveLength(2);
  },
};

/** A session that reads and may not write: the rule, without a way to save it. */
export const ReadOnly: Story = {
  args: {
    model: storyModel('claude-sonnet-4-5'),
    scopes: ['read:licenses', 'read:models', 'read:entitlements'],
    version: storyVersion('enterprise-v2'),
  },
  play: async ({ canvasElement }) => {
    await expect(rate(canvasElement, 'perOutputToken')).toBeDisabled();
  },
};

/** No value of a credit: cost per credit, and no margin. */
export const WithoutCreditValue: Story = { args: { creditValue: null } };
