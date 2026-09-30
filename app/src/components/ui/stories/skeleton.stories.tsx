import type { Meta, StoryObj } from '@storybook/react-vite';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '../skeleton';

const meta = {
  title: 'Components/UI/Skeleton',
  component: Skeleton,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof Skeleton>;

export const TextBlock: Story = {
  render: () => (
    <div className="max-w-md space-y-3">
      <Skeleton className="h-5 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  ),
};

export const CardLoading: Story = {
  render: () => (
    <Card className="max-w-md">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Skeleton className="size-10 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
          <Skeleton className="h-14" />
        </div>
      </CardContent>
    </Card>
  ),
};

export const TableRows: Story = {
  render: () => (
    <div className="max-w-3xl space-y-3 rounded-md border p-4">
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={`skeleton-row-${index + 1}`}
          className="grid grid-cols-[1.5fr_1fr_1fr_5rem] items-center gap-4"
        >
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-4" />
          <Skeleton className="h-8" />
        </div>
      ))}
    </div>
  ),
};
