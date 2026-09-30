import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vite-plus/test';
import { TableJsonDialog } from '..';

describe('TableJsonDialog', () => {
  it('renders a compact trigger and opens the JSON dialog', async () => {
    const user = userEvent.setup();

    render(
      <TableJsonDialog
        description="Metadata preview"
        title="Instance metadata"
        triggerAriaLabel="Open instance metadata"
        value={{ owner: 'team-platform', tier: 'gold' }}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Open instance metadata' }));

    expect(await screen.findByText('Instance metadata')).toBeInTheDocument();
    expect(screen.getByText('Metadata preview')).toBeInTheDocument();
    expect(screen.getByText(/"owner": "team-platform"/)).toBeInTheDocument();
    expect(screen.getByText(/"tier": "gold"/)).toBeInTheDocument();
  });

  it('renders a fallback marker when the JSON object is empty', () => {
    render(
      <TableJsonDialog
        title="Instance metadata"
        triggerAriaLabel="Open instance metadata"
        value={{}}
      />,
    );

    expect(screen.getByText('-')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
