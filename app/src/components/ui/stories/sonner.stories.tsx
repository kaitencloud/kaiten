import type { Meta, StoryObj } from '@storybook/react-vite';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Toaster } from '../sonner';

const meta = {
  title: 'Components/UI/Sonner',
  component: Toaster,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Toaster>;

export default meta;
type Story = StoryObj<typeof Toaster>;

function ToastPreview() {
  useEffect(() => {
    const ids = [
      toast.success('Deployment promoted', {
        description: 'Release 2026.04.1 is now active in production.',
        duration: Infinity,
      }),
      toast.warning('Usage near limit', {
        description: 'Global storage is above 80% for Acme Corp.',
        duration: Infinity,
      }),
    ];

    return () => {
      ids.forEach((id) => {
        toast.dismiss(id);
      });
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button
          onClick={() => {
            toast.info('Sync started', {
              description: 'The webhook delivery history is refreshing.',
            });
          }}
        >
          Info
        </Button>
        <Button
          variant="destructive"
          onClick={() => {
            toast.error('Delivery failed', {
              description: 'The endpoint returned HTTP 500.',
            });
          }}
        >
          Error
        </Button>
      </div>
      <Toaster position="top-right" closeButton />
    </div>
  );
}

export const Default: Story = {
  render: () => <ToastPreview />,
};
