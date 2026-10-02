import type { Meta, StoryObj } from '@storybook/react-vite';
import { Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { dataModelIcons } from '@/lib/data-model-icons';
import { Page } from '../page';

const meta = {
  title: 'Functionals/Page/DetailPageHeader',
  component: Page.Header,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Page.Header>;

export default meta;
type Story = StoryObj<typeof Page.Header>;

const InstanceIcon = dataModelIcons.instance;

export const Default: Story = {
  render: () => (
    <Page>
      <Page.Header>
        <Page.Leading>
          <Page.Icon>
            <InstanceIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.TitleRow>
              <Page.Title>Acme Corp - Production</Page.Title>
              <Badge variant="default">Active</Badge>
            </Page.TitleRow>
            <Page.Subtitle>Acme Corp · Enterprise Pro</Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
        <Page.Actions>
          <Button variant="destructive" className="gap-2">
            <Trash2 className="size-4" />
            Delete
          </Button>
        </Page.Actions>
      </Page.Header>
      <Page.Divider />
    </Page>
  ),
};
