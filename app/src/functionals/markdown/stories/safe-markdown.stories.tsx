import type { Meta, StoryObj } from '@storybook/react-vite';
import { SafeMarkdown } from '../safe-markdown';

const meta = {
  title: 'Functionals/SafeMarkdown',
  component: SafeMarkdown,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof SafeMarkdown>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ReleaseNotes: Story = {
  args: {
    children: [
      '# What changed',
      '',
      'Start-up is **twice as fast**, and the `--verbose` flag is back.',
      '',
      '## Fixes',
      '',
      '- Retries a failed upload once before reporting it',
      '- Keeps the last selected tab after a reload',
      '',
      '> Upgrading from 1.x? Read the [migration guide](https://example.com/migrate).',
      '',
      '```',
      'helm upgrade my-release ./chart',
      '```',
      '',
      'Questions: [releases@example.com](mailto:releases@example.com).',
    ].join('\n'),
  },
};

// What the renderer refuses: raw HTML stays text, an unsafe link keeps its
// text and loses its href, and an image is not drawn.
export const UnsafeInput: Story = {
  args: {
    children: [
      '<script>alert(1)</script>',
      '',
      'Inline <img src=x onerror="alert(1)"> HTML.',
      '',
      '[A javascript: link](javascript:alert(1)) and [a relative one](/settings).',
      '',
      '![A remote image](https://example.com/pixel.png)',
    ].join('\n'),
  },
};
