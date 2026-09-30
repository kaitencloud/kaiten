import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { createFormSubmitHandler, useAppForm } from '@/hooks/form';
import CheckboxField from '../checkbox-field';
import ComboboxField from '../combobox-field';
import DatePickerField from '../date-picker-field';
import NumberField from '../number-field';
import SelectField from '../select-field';
import TextField from '../text-field';
import TextareaField from '../textarea-field';

const meta = {
  title: 'Components/Form/Fields',
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta;

export default meta;
type Story = StoryObj;

export const AllFields: Story = {
  render: function AllFieldsStory() {
    const form = useAppForm({
      defaultValues: {
        name: '',
        age: 0,
        email: '',
        bio: '',
        country: '',
        framework: '',
        newsletter: false,
        birthdate: undefined as Date | undefined,
      },
      onSubmit: async ({ value }) => {
        alert(JSON.stringify(value, null, 2));
      },
    });

    const countries = [
      { code: 'us', name: 'United States' },
      { code: 'ca', name: 'Canada' },
      { code: 'gb', name: 'United Kingdom' },
      { code: 'fr', name: 'France' },
    ];

    const frameworks = [
      { value: 'react', label: 'React' },
      { value: 'vue', label: 'Vue' },
      { value: 'svelte', label: 'Svelte' },
    ];

    return (
      <div className="max-w-2xl mx-auto space-y-6">
        <h2 className="text-2xl font-bold">Form Fields Example</h2>
        <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <div className="space-y-4">
            <form.AppField name="name">
              {() => (
                <TextField
                  label="Name"
                  placeholder="Enter your name"
                  description="Your full name"
                />
              )}
            </form.AppField>

            <form.AppField name="email">
              {() => (
                <TextField
                  label="Email"
                  placeholder="Enter your email"
                  description="We'll never share your email"
                />
              )}
            </form.AppField>

            <form.AppField name="age">
              {() => (
                <NumberField
                  label="Age"
                  placeholder="Enter your age"
                  description="Must be 18 or older"
                />
              )}
            </form.AppField>

            <form.AppField name="bio">
              {() => (
                <TextareaField
                  label="Bio"
                  placeholder="Tell us about yourself"
                  description="Brief description"
                />
              )}
            </form.AppField>

            <form.AppField name="country">
              {() => (
                <SelectField
                  label="Country"
                  placeholder="Select a country"
                  options={countries}
                  getOptionLabel={(option) => (option as { name: string }).name}
                  getOptionValue={(option) => (option as { code: string }).code}
                  description="Your country of residence"
                />
              )}
            </form.AppField>

            <form.AppField name="framework">
              {() => (
                <ComboboxField
                  label="Favorite Framework"
                  placeholder="Select framework..."
                  searchPlaceholder="Search framework..."
                  options={frameworks}
                  getOptionLabel={(option) =>
                    (option as { label: string }).label
                  }
                  getOptionValue={(option) =>
                    (option as { value: string }).value
                  }
                  description="Choose your preferred framework"
                />
              )}
            </form.AppField>

            <form.AppField name="birthdate">
              {() => (
                <DatePickerField
                  label="Birth Date"
                  description="Your date of birth"
                />
              )}
            </form.AppField>

            <form.AppField name="newsletter">
              {() => (
                <CheckboxField
                  label="Subscribe to newsletter"
                  description="Receive updates and news"
                />
              )}
            </form.AppField>

            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit">Submit</Button>
            </div>
          </div>
        </form>
      </div>
    );
  },
};

export const TextFieldExample: Story = {
  render: function TextFieldExampleStory() {
    const form = useAppForm({
      defaultValues: {
        username: '',
      },
      onSubmit: async ({ value }) => {
        alert(JSON.stringify(value, null, 2));
      },
    });

    return (
      <div className="max-w-md">
        <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="username">
            {() => (
              <TextField
                label="Username"
                placeholder="Enter username"
                description="Choose a unique username"
              />
            )}
          </form.AppField>
          <Button type="submit" className="mt-4">
            Submit
          </Button>
        </form>
      </div>
    );
  },
};

export const NumberFieldExample: Story = {
  render: function NumberFieldExampleStory() {
    const form = useAppForm({
      defaultValues: {
        quantity: 1,
      },
      onSubmit: async ({ value }) => {
        alert(JSON.stringify(value, null, 2));
      },
    });

    return (
      <div className="max-w-md">
        <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="quantity">
            {() => (
              <NumberField
                label="Quantity"
                placeholder="Enter quantity"
                description="Number of items"
              />
            )}
          </form.AppField>
          <Button type="submit" className="mt-4">
            Submit
          </Button>
        </form>
      </div>
    );
  },
};

export const CheckboxFieldExample: Story = {
  render: function CheckboxFieldExampleStory() {
    const form = useAppForm({
      defaultValues: {
        terms: false,
      },
      onSubmit: async ({ value }) => {
        alert(JSON.stringify(value, null, 2));
      },
    });

    return (
      <div className="max-w-md">
        <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="terms">
            {() => (
              <CheckboxField
                label="I agree to the terms and conditions"
                description="You must agree to continue"
              />
            )}
          </form.AppField>
          <Button type="submit" className="mt-4">
            Submit
          </Button>
        </form>
      </div>
    );
  },
};

export const SelectFieldExample: Story = {
  render: function SelectFieldExampleStory() {
    const form = useAppForm({
      defaultValues: {
        role: '',
      },
      onSubmit: async ({ value }) => {
        alert(JSON.stringify(value, null, 2));
      },
    });

    const roles = [
      { id: 'admin', name: 'Administrator' },
      { id: 'user', name: 'User' },
      { id: 'guest', name: 'Guest' },
    ];

    return (
      <div className="max-w-md">
        <form onSubmit={createFormSubmitHandler(form.handleSubmit)}>
          <form.AppField name="role">
            {() => (
              <SelectField
                label="Role"
                placeholder="Select a role"
                options={roles}
                getOptionLabel={(option) => (option as { name: string }).name}
                getOptionValue={(option) => (option as { id: string }).id}
                description="Choose user role"
              />
            )}
          </form.AppField>
          <Button type="submit" className="mt-4">
            Submit
          </Button>
        </form>
      </div>
    );
  },
};
