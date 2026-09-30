import type { Meta, StoryObj } from '@storybook/react-vite';
import { Activity, Shield } from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from '../chart';

const meta = {
  title: 'Components/UI/Chart',
  component: ChartContainer,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof ChartContainer>;

export default meta;
type Story = StoryObj<typeof ChartContainer>;

const monthlyUsage = [
  { month: 'Jan', storage: 42, requests: 210 },
  { month: 'Feb', storage: 58, requests: 260 },
  { month: 'Mar', storage: 63, requests: 330 },
  { month: 'Apr', storage: 81, requests: 390 },
  { month: 'May', storage: 76, requests: 420 },
  { month: 'Jun', storage: 92, requests: 510 },
];

const usageConfig = {
  storage: {
    label: 'Storage',
    color: 'var(--chart-1)',
    icon: Shield,
  },
  requests: {
    label: 'Requests',
    color: 'var(--chart-2)',
    icon: Activity,
  },
} satisfies ChartConfig;

export const LineComparison: Story = {
  render: () => (
    <ChartContainer config={usageConfig} className="max-h-[320px] max-w-3xl">
      <LineChart data={monthlyUsage} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Line
          type="monotone"
          dataKey="storage"
          stroke="var(--color-storage)"
          strokeWidth={2}
          dot={false}
        />
        <Line
          type="monotone"
          dataKey="requests"
          stroke="var(--color-requests)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  ),
};

export const BarBreakdown: Story = {
  render: () => (
    <ChartContainer config={usageConfig} className="max-h-[320px] max-w-3xl">
      <BarChart data={monthlyUsage} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip
          content={<ChartTooltipContent indicator="dashed" />}
          cursor={false}
        />
        <Bar dataKey="storage" fill="var(--color-storage)" radius={4} />
        <Bar dataKey="requests" fill="var(--color-requests)" radius={4} />
      </BarChart>
    </ChartContainer>
  ),
};

export const AreaTrend: Story = {
  render: () => (
    <ChartContainer config={usageConfig} className="max-h-[320px] max-w-3xl">
      <AreaChart data={monthlyUsage} margin={{ left: 12, right: 12 }}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="month" tickLine={false} axisLine={false} />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="line" />} />
        <Area
          type="monotone"
          dataKey="storage"
          stroke="var(--color-storage)"
          fill="var(--color-storage)"
          fillOpacity={0.22}
        />
      </AreaChart>
    </ChartContainer>
  ),
};
