import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, waitFor, within } from 'storybook/test';
import { useState } from 'react';
import { Combobox } from '../combobox';

const meta = {
  title: 'Components/Combobox',
  component: Combobox,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Combobox>;

export default meta;
type Story = StoryObj<typeof Combobox>;

type Framework = {
  value: string;
  label: string;
};

const frameworks: Framework[] = [
  { value: 'next', label: 'Next.js' },
  { value: 'react', label: 'React' },
  { value: 'vue', label: 'Vue' },
  { value: 'svelte', label: 'Svelte' },
  { value: 'remix', label: 'Remix' },
  { value: 'astro', label: 'Astro' },
];

function ComboboxExample() {
  const [value, setValue] = useState('');

  return (
    <div className="w-[300px]">
      <Combobox
        placeholder="Select framework..."
        searchPlaceholder="Search framework..."
        options={frameworks}
        value={value}
        onSelect={setValue}
        getOptionLabel={(option) => option.label}
        getOptionValue={(option) => option.value}
      />
    </div>
  );
}

export const Default: Story = {
  render: () => <ComboboxExample />,
};

type Country = {
  code: string;
  name: string;
};

const countries: Country[] = [
  { code: 'us', name: 'United States' },
  { code: 'ca', name: 'Canada' },
  { code: 'mx', name: 'Mexico' },
  { code: 'gb', name: 'United Kingdom' },
  { code: 'fr', name: 'France' },
  { code: 'de', name: 'Germany' },
  { code: 'it', name: 'Italy' },
  { code: 'es', name: 'Spain' },
  { code: 'jp', name: 'Japan' },
  { code: 'cn', name: 'China' },
];

function CountryComboboxExample() {
  const [value, setValue] = useState('');

  return (
    <div className="w-[300px]">
      <Combobox
        placeholder="Select country..."
        searchPlaceholder="Search country..."
        options={countries}
        value={value}
        onSelect={setValue}
        getOptionLabel={(option) => option.name}
        getOptionValue={(option) => option.code}
      />
    </div>
  );
}

export const WithManyOptions: Story = {
  render: () => <CountryComboboxExample />,
};

export const InteractiveSelect: Story = {
  name: 'Interactive / Select',
  render: () => <ComboboxExample />,
  parameters: {
    docs: {
      description: {
        story:
          'Interactive flow: opening the popover, searching an option and confirming updates the trigger with the selected label.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const body = within(document.body);

    const trigger = canvas.getByRole('button', { name: /select framework/i });
    await userEvent.click(trigger);

    const searchInput = await body.findByPlaceholderText('Search framework...');
    await userEvent.type(searchInput, 'svelte');

    const option = await body.findByRole('option', { name: /svelte/i });
    await userEvent.click(option);
    await waitFor(() => expect(body.queryByRole('dialog')).not.toBeInTheDocument());

    await expect(
      canvas.getByRole('button', { name: /svelte/i }),
    ).toBeInTheDocument();
  },
};
