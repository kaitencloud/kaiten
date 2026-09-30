import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';
import { InstanceStatusEditor } from '../instance-status-editor';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('InstanceStatusEditor', () => {
  it('hands over the status it showed, so the change can be undone', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();

    render(<InstanceStatusEditor status="HEALTHY" onSelect={onSelect} />);

    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Customers.Instances.Detail.statusEditor.title',
      }),
    );
    await user.click(
      screen.getByRole('button', {
        name: 'Pages.Customers.Instances.Detail.status.maintenance',
      }),
    );

    expect(onSelect).toHaveBeenCalledWith('MAINTENANCE', 'HEALTHY');
  });
});
