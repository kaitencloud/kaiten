import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { Switch } from '../switch';
import { Label } from '../label';

const meta = {
  title: 'Components/UI/Switch',
  component: Switch,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  render: function DefaultSwitchStory() {
    const [checked, setChecked] = useState(false);
    return <Switch checked={checked} onCheckedChange={setChecked} />;
  },
};

export const WithLabel: Story = {
  render: function WithLabelSwitchStory() {
    const [checked, setChecked] = useState(false);
    return (
      <div className="flex items-center space-x-2">
        <Switch id="airplane-mode" checked={checked} onCheckedChange={setChecked} />
        <Label htmlFor="airplane-mode">Airplane Mode</Label>
      </div>
    );
  },
};

export const Disabled: Story = {
  render: () => (
    <div className="space-y-4">
      <div className="flex items-center space-x-2">
        <Switch id="disabled-off" disabled />
        <Label htmlFor="disabled-off">Disabled (off)</Label>
      </div>
      <div className="flex items-center space-x-2">
        <Switch id="disabled-on" disabled checked />
        <Label htmlFor="disabled-on">Disabled (on)</Label>
      </div>
    </div>
  ),
};

export const Settings: Story = {
  render: function SettingsSwitchStory() {
    const [settings, setSettings] = useState({
      notifications: true,
      marketing: false,
      analytics: true,
    });

    return (
      <div className="space-y-4 w-[300px]">
        <div className="flex items-center justify-between">
          <Label htmlFor="notifications">Notifications</Label>
          <Switch
            id="notifications"
            checked={settings.notifications}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, notifications: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="marketing">Marketing emails</Label>
          <Switch
            id="marketing"
            checked={settings.marketing}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, marketing: checked })
            }
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="analytics">Analytics</Label>
          <Switch
            id="analytics"
            checked={settings.analytics}
            onCheckedChange={(checked) =>
              setSettings({ ...settings, analytics: checked })
            }
          />
        </div>
      </div>
    );
  },
};
