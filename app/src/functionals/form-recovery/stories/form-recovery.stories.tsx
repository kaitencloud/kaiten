import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import {
  encodePayload,
  FORM_RECOVERY_STORAGE_KEY,
  replaceRecord,
  resyncFormRecovery,
} from '@/lib/form-recovery';
import { buildEntry } from '../logic/entry';
import { RecoveryDemoForm } from './recovery-demo-form';

const meta = {
  title: 'Functionals/FormRecovery',
  component: RecoveryDemoForm,
  parameters: { layout: 'padded' },
  tags: ['autodocs'],
} satisfies Meta<typeof RecoveryDemoForm>;

export default meta;
type Story = StoryObj<typeof RecoveryDemoForm>;

const SCOPE = {
  userId: 'story-user',
  organizationId: 'story-org',
  formId: 'demo.create',
  context: '',
};

type StoredInput = { attemptedAt?: string | null; stepId?: string };

/** Signs a person in and stores, or clears, the input of the demo form. */
function seed(input: StoredInput | null) {
  (window as unknown as { Clerk: unknown }).Clerk = {
    user: { id: SCOPE.userId },
    organization: { id: SCOPE.organizationId },
  };
  window.localStorage.removeItem(FORM_RECOVERY_STORAGE_KEY);
  resyncFormRecovery();
  if (!input) return;

  const stepId = input.stepId ?? 'details';
  const now = new Date();
  replaceRecord(
    buildEntry({
      scope: SCOPE,
      lineageId: 'story-lineage',
      sessionId: 'story-session',
      formVersion: 1,
      snapshot: {
        counts: true,
        payload: encodePayload([
          ['name', 'Gold'],
          ['count', 12],
          ['note', 'for sales'],
        ]),
        omittedFilled: ['secret'],
        labels: {},
        extra: null,
        extraSource: null,
        stepId,
        furthestStepId: stepId,
        stepIds: ['identity', 'details'],
      },
      status: 'editing',
      attempt: 0,
      attemptedAt: input.attemptedAt ?? null,
      createdAt: null,
      // Two hours ago, so that the offer says "2 hours ago".
      now: new Date(now.getTime() - 2 * 3_600_000),
    }),
    { mountedAt: new Date(0).toISOString() },
  );
}

/** A blank form: nothing is stored, nothing is offered. */
export const Blank: Story = {
  loaders: [() => seed(null)],
};

/** An input was kept: the offer is above the steps, the blank form below it. */
export const OfferToResume: Story = {
  loaders: [() => seed({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Pick up where you left off?'),
    ).toBeVisible();
    await expect(canvas.getByRole('button', { name: 'Resume' })).toBeVisible();
  },
};

/** "Resume" mounts the form again on the step it was left on. */
export const ResumeLandsOnTheStep: Story = {
  loaders: [() => seed({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Resume' }));
    await expect(await canvas.findByLabelText('Count')).toHaveValue('12');
    await expect(
      await canvas.findByText(/this field is never kept: Secret/),
    ).toBeVisible();
  },
};

/** A send went out and got no answer: the warning leaves the choice to the person. */
export const MayHaveGoneThrough: Story = {
  loaders: [() => seed({ attemptedAt: new Date().toISOString() })],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(
      await canvas.findByText('Your last submission may have gone through'),
    ).toBeVisible();
    await expect(
      canvas.getByRole('button', { name: 'Resume anyway' }),
    ).toBeVisible();
  },
};

/** Typing under the offer reduces it to a line and keeps both inputs. */
export const OfferShrinksWhenTyping: Story = {
  loaders: [() => seed({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await canvas.findByText('Pick up where you left off?');
    await userEvent.type(canvas.getByLabelText('Name'), 'S');
    await expect(
      await canvas.findByText(/Earlier entries .* are still kept/),
    ).toBeVisible();
    await expect(canvas.queryByText('Pick up where you left off?')).toBeNull();
  },
};

/** "Start over" clears the offer and leaves the blank form to type in. */
export const StartOver: Story = {
  loaders: [() => seed({})],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(await canvas.findByRole('button', { name: 'Start over' }));
    await expect(canvas.queryByText('Pick up where you left off?')).toBeNull();
    await expect(canvas.getByLabelText('Name')).toHaveValue('');
  },
};

/** "Next" only moves to the second step; the form is sent by "Send". */
export const NextThenSend: Story = {
  loaders: [() => seed(null)],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(await canvas.findByLabelText('Name'), 'Gold');
    await userEvent.click(canvas.getByRole('button', { name: 'Next' }));
    await expect(await canvas.findByLabelText('Count')).toBeVisible();
    await expect(canvas.queryByText('Sent')).toBeNull();
    await userEvent.type(canvas.getByLabelText('Count'), '12');
    await userEvent.click(canvas.getByRole('button', { name: 'Send' }));
    await expect(await canvas.findByText('Sent')).toBeVisible();
  },
};
