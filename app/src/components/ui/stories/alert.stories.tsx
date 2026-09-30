import type { Meta, StoryObj } from '@storybook/react-vite';
import { AlertCircle, Terminal } from 'lucide-react';
import { Alert, AlertTitle, AlertDescription } from '../alert';

const meta = {
  title: 'Components/UI/Alert',
  component: Alert,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof Alert>;

export const Default: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <Terminal className="h-4 w-4" />
      <AlertTitle>Heads up!</AlertTitle>
      <AlertDescription>
        You can add components to your app using the cli.
      </AlertDescription>
    </Alert>
  ),
};

export const Destructive: Story = {
  render: () => (
    <Alert variant="destructive" className="w-[400px]">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        Your session has expired. Please log in again.
      </AlertDescription>
    </Alert>
  ),
};

export const Simple: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <AlertDescription>
        This is a simple alert without a title.
      </AlertDescription>
    </Alert>
  ),
};

export const WithoutIcon: Story = {
  render: () => (
    <Alert className="w-[400px]">
      <AlertTitle>Information</AlertTitle>
      <AlertDescription>
        This alert doesn't have an icon.
      </AlertDescription>
    </Alert>
  ),
};
