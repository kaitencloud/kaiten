import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { CelEditor, CelEditorDialog, CelRulePreview } from '..';
import type { CelContextNode, CelIssue } from '..';

const meta: Meta<typeof CelEditor> = {
  title: 'Functionals/CelEditor',
  component: CelEditor,
  args: {
    disableValidation: true,
  },
  decorators: [
    (Story) => (
      <div className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground p-8">
        <Story />
      </div>
    ),
  ],
  parameters: {
    layout: 'fullscreen',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CelEditor>;

/**
 * The shape the server actually serves, abbreviated. Kept faithful on purpose:
 * a story that invents `license.plan` is how the console ended up shipping an
 * autocomplete for names that do not exist.
 */
const KAITEN_CONTEXT_ROOTS: CelContextNode[] = [
  {
    name: '__kaiten',
    type: 'object',
    description: 'Facts the server computes for every evaluation.',
    fields: [
      {
        name: 'license',
        type: 'object',
        description: 'The license the organization holds.',
        fields: [
          {
            name: 'slug',
            type: 'string',
            description: "Slug of the license, e.g. 'scale'",
          },
          {
            name: 'type',
            type: 'string',
            description: "Whether the license is paid, e.g. 'PAID'",
          },
        ],
      },
      {
        name: 'entitlements',
        type: 'map',
        description:
          "Entitlement usage, keyed by slug. Readable as entitlements['seats'] or entitlements.seats.",
        knownKeys: ['seats', 'customers', 'instances'],
        values: {
          name: '',
          type: 'object',
          fields: [
            {
              name: 'remaining',
              type: 'number',
              description: 'Ceiling minus usage.',
            },
            {
              name: 'percentage',
              type: 'number',
              description: 'Share of the ceiling consumed, between 0 and 1.',
            },
            {
              name: 'unlimited',
              type: 'boolean',
              description: 'True when the entitlement has no ceiling.',
            },
          ],
        },
      },
      {
        name: 'instance',
        type: 'object',
        description: 'The instance being evaluated.',
        fields: [
          { name: 'slug', type: 'string', description: 'Instance slug.' },
          {
            name: 'status',
            type: 'string',
            description: "Operational status, e.g. 'HEALTHY'.",
          },
          {
            name: 'lifecycleStage',
            type: 'string',
            optional: true,
            description: 'Lifecycle stage, when one is set.',
          },
          {
            name: 'metadata',
            type: 'map',
            description: 'Free-form metadata. Any key is allowed.',
            values: { name: '', type: 'dyn' },
          },
        ],
      },
    ],
  },
  {
    name: 'targetingKey',
    type: 'string',
    description: 'The key this evaluation is bucketed on. Always present.',
  },
];

const CelEditorWithState = (args: any) => {
  const [value, setValue] = useState(
    args.value ?? "__kaiten.license.slug == 'scale'",
  );

  return (
    <div className="w-full max-w-4xl space-y-4">
      <div className="p-4 bg-card rounded-lg shadow border border-border text-card-foreground">
        <h3 className="text-lg font-medium mb-2">CEL Editor</h3>
        <CelEditor {...args} value={value} onChange={setValue} />
      </div>

      <div className="p-4 bg-muted/50 rounded-lg border border-border">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">
          Current Value:
        </h3>
        <pre className="text-sm font-mono bg-muted p-2 rounded border border-border overflow-x-auto">
          {value}
        </pre>
      </div>
    </div>
  );
};

export const Default: Story = {
  render: (args) => <CelEditorWithState {...args} />,
  args: {
    contextRoots: KAITEN_CONTEXT_ROOTS,
    height: '300px',
  },
};

/**
 * No schema — a caller without the scope to read it, or an editor used outside
 * Kaiten. CEL's own vocabulary is still completed, and a host's attributes are
 * still legitimate; the editor simply has nothing to say about them.
 */
export const WithoutContext: Story = {
  render: (args) => <CelEditorWithState {...args} />,
  args: {
    value: "user.cohort == 'beta' && device.os == 'ios'",
    contextRoots: [],
    height: '200px',
  },
};

export const ComplexExpression: Story = {
  render: (args) => <CelEditorWithState {...args} />,
  args: {
    value: `__kaiten.license.slug == 'scale' &&
__kaiten.entitlements['seats'].remaining < 5 &&
__kaiten.instance.status == 'HEALTHY' &&
has(__kaiten.instance.lifecycleStage) &&
user.cohort == 'beta'`,
    contextRoots: KAITEN_CONTEXT_ROOTS,
    height: '400px',
  },
};

/**
 * The verdict that matters, stubbed. The real one is a round trip to the
 * server, which is the only place that knows this organization's entitlement
 * slugs — so this is the one thing a story cannot honestly fake beyond
 * showing where the marks land.
 */
export const WithServerLint: Story = {
  render: (args) => <CelEditorWithState {...args} />,
  args: {
    value: "__kaiten.entitlements['sieges'].percentage >= 0.9",
    contextRoots: KAITEN_CONTEXT_ROOTS,
    height: '200px',
    lint: async (rule: string): Promise<CelIssue[]> => {
      const at = rule.indexOf("'sieges'");
      if (at < 0) return [];

      return [
        {
          message:
            'rule targets the entitlement "sieges", which this organization does not have',
          line: 1,
          column: at + 1,
          endLine: 1,
          endColumn: at + "'sieges'".length + 1,
        },
      ];
    },
  },
};

/**
 * The composition the targeting form uses: a colored, clickable preview —
 * no Monaco mounted — opening the full-size editor dialog, which works on a
 * draft and commits on Apply.
 */
const PreviewToDialogDemo = () => {
  const [value, setValue] = useState(
    "__kaiten.license.slug == 'scale' && __kaiten.entitlements['sieges'].remaining > 0",
  );
  const [open, setOpen] = useState(false);

  // A stand-in for the server lint, so the story shows the verdict surface:
  // it flags the misspelt slug the way the real catalogue check would.
  const lint = async (rule: string): Promise<CelIssue[]> => {
    const at = rule.indexOf("'sieges'");
    if (at < 0) return [];

    return [
      {
        message:
          'rule targets the entitlement "sieges", which this organization does not have',
        line: 1,
        column: at + 1,
        endLine: 1,
        endColumn: at + "'sieges'".length + 1,
      },
    ];
  };

  return (
    <div className="w-full max-w-2xl space-y-3">
      <CelRulePreview value={value} onOpen={() => setOpen(true)} />
      <CelEditorDialog
        open={open}
        onOpenChange={setOpen}
        initialValue={value}
        onApply={setValue}
        contextRoots={KAITEN_CONTEXT_ROOTS}
        lint={lint}
      />
    </div>
  );
};

export const PreviewToDialog: Story = {
  render: () => <PreviewToDialogDemo />,
};
