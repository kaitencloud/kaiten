import type { Meta, StoryObj } from '@storybook/react-vite';
import { AnimatedThemeToggler } from '../animated-theme-toggler';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const meta = {
  title: 'Components/UI/AnimatedThemeToggler',
  component: AnimatedThemeToggler,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof AnimatedThemeToggler>;

export default meta;
type Story = StoryObj<typeof AnimatedThemeToggler>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>Appearance</CardTitle>
        <CardDescription>Theme switcher using view transitions.</CardDescription>
      </CardHeader>
      <CardContent>
        <AnimatedThemeToggler className="inline-flex size-10 items-center justify-center rounded-md border bg-background text-foreground transition-colors hover:bg-accent [&_svg]:size-4" />
      </CardContent>
    </Card>
  ),
};

export const SlowTransition: Story = {
  render: () => (
    <AnimatedThemeToggler
      duration={900}
      className="inline-flex size-12 items-center justify-center rounded-full border bg-secondary text-secondary-foreground shadow-sm transition-colors hover:bg-accent [&_svg]:size-5"
    />
  ),
};
