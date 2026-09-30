import type { Meta, StoryObj } from '@storybook/react-vite';
import { BarChart3 } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import { Button } from '@/components/ui/button';
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../chart';
import { ChartShell } from '../chart-shell';

const meta = {
  title: 'Components/UI/ChartShell',
  component: ChartShell,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ChartShell>;

export default meta;
type Story = StoryObj<typeof ChartShell>;

const chartData = [
  { label: 'Storage', value: 82 },
  { label: 'Seats', value: 67 },
  { label: 'Requests', value: 54 },
  { label: 'Exports', value: 38 },
];

const chartConfig = {
  value: {
    label: 'Usage',
    color: 'var(--chart-3)',
  },
} satisfies ChartConfig;

const usageChart = (
  <ChartContainer config={chartConfig} className="h-[260px] w-full">
    <BarChart data={chartData} margin={{ left: 12, right: 12 }}>
      <CartesianGrid vertical={false} />
      <XAxis dataKey="label" tickLine={false} axisLine={false} />
      <YAxis tickLine={false} axisLine={false} />
      <ChartTooltip
        cursor={false}
        content={<ChartTooltipContent hideLabel />}
      />
      <Bar dataKey="value" fill="var(--color-value)" radius={4} />
    </BarChart>
  </ChartContainer>
);

export const Default: Story = {
  render: () => (
    <ChartShell
      title="Entitlement usage"
      description="Current usage across monitored limits."
      titleIcon={<BarChart3 />}
      className="max-w-3xl"
    >
      {usageChart}
    </ChartShell>
  ),
};

export const WithHeaderActions: Story = {
  render: () => (
    <ChartShell
      title="Operational trend"
      description="Shared shell with header actions and chart content."
      titleIcon={<BarChart3 />}
      headerActions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            7 days
          </Button>
          <Button variant="secondary" size="sm">
            30 days
          </Button>
        </div>
      }
      className="max-w-3xl"
    >
      {usageChart}
    </ChartShell>
  ),
};
