import type { Meta, StoryObj } from '@storybook/react-vite';
import {
  Atlassian,
  Bitbucket,
  type CompanyIcon,
  Facebook,
  GitHub,
  GitLab,
  Google,
  HubSpot,
  Microsoft,
  Notion,
  Slack,
} from '../company-icons';

const icons: { name: string; Icon: CompanyIcon }[] = [
  { name: 'Atlassian', Icon: Atlassian },
  { name: 'Bitbucket', Icon: Bitbucket },
  { name: 'Facebook', Icon: Facebook },
  { name: 'GitHub', Icon: GitHub },
  { name: 'GitLab', Icon: GitLab },
  { name: 'Google', Icon: Google },
  { name: 'HubSpot', Icon: HubSpot },
  { name: 'Microsoft', Icon: Microsoft },
  { name: 'Notion', Icon: Notion },
  { name: 'Slack', Icon: Slack },
];

function CompanyIconGallery({
  className,
  size,
}: {
  className?: string;
  size: string;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
      {icons.map(({ name, Icon }) => (
        <div
          key={name}
          className="flex flex-col items-center gap-2 rounded-md border bg-card p-4 text-card-foreground"
        >
          <Icon className={className ?? size} />
          <span className="text-xs text-muted-foreground">{name}</span>
        </div>
      ))}
    </div>
  );
}

const meta: Meta<typeof CompanyIconGallery> = {
  title: 'Components/CompanyIcons',
  component: CompanyIconGallery,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof CompanyIconGallery>;

export const Default: Story = {
  args: {
    size: 'size-6',
  },
};

export const Large: Story = {
  args: {
    size: 'size-12',
  },
};

export const ColoredAccent: Story = {
  args: {
    className: 'size-8 text-primary-subtle-foreground',
    size: 'size-8',
  },
};
