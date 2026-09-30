import { useForm } from '@tanstack/react-form';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  useFormField,
} from '../tanstack-form';

const meta = {
  title: 'Components/UI/TanStackForm',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

function TextControl({ placeholder }: { placeholder?: string }) {
  const { field } = useFormField();

  return (
    <Input
      value={(field.state.value as string | undefined) ?? ''}
      onBlur={field.handleBlur}
      onChange={(event) => {
        field.handleChange(event.target.value);
      }}
      placeholder={placeholder}
    />
  );
}

function LowLevelFormStory() {
  const form = useForm({
    defaultValues: {
      name: 'Enterprise Pro',
      owner: 'ops@acme.test',
    },
    onSubmit: async () => {},
  });

  return (
    <div
      className="max-w-lg space-y-5 rounded-lg border bg-card p-5 shadow-sm"
    >
      <FormField form={form as never} name="name">
        <FormItem>
          <FormLabel>Name</FormLabel>
          <FormControl>
            <TextControl placeholder="Plan name" />
          </FormControl>
          <FormDescription>
            Display name shown in license and entitlement workflows.
          </FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField form={form as never} name="owner">
        <FormItem>
          <FormLabel>Owner</FormLabel>
          <FormControl>
            <TextControl placeholder="Team owner" />
          </FormControl>
          <FormDescription>
            Operational contact for changes on this contract.
          </FormDescription>
          <FormMessage />
        </FormItem>
      </FormField>

      <Button
        type="button"
        onClick={() => {
          void form.handleSubmit();
        }}
      >
        Save
      </Button>
    </div>
  );
}

export const Default: Story = {
  render: () => <LowLevelFormStory />,
};
