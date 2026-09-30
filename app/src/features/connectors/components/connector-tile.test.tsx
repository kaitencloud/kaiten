import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { ATTIO_LOGO_ASSETS } from '@/domains/crm-sync';
import { ATTIO_CONNECTOR, CONNECTORS } from '../constants';
import { ConnectorTile } from './connector-tile';

describe('ConnectorTile', () => {
  it('renders the light and dark logo assets when branding is available', () => {
    const { container } = render(<ConnectorTile connector={ATTIO_CONNECTOR} />);
    const tile = container.firstElementChild;
    const images = container.querySelectorAll('img');

    expect(tile).toHaveClass('bg-white', 'dark:bg-black');
    expect(tile).not.toHaveClass('bg-primary/15');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', ATTIO_LOGO_ASSETS.light);
    expect(images[0]).toHaveAttribute('alt', '');
    expect(images[0]).toHaveClass('block', 'dark:hidden');
    expect(images[1]).toHaveAttribute('src', ATTIO_LOGO_ASSETS.dark);
    expect(images[1]).toHaveAttribute('alt', '');
    expect(images[1]).toHaveClass('hidden', 'dark:block');
  });

  it('falls back to the connector initial without branding assets', () => {
    const hubspot = CONNECTORS.find((connector) => connector.id === 'hubspot');

    expect(hubspot).toBeDefined();
    const { container } = render(
      <ConnectorTile connector={hubspot ?? CONNECTORS[0]} />,
    );

    expect(screen.getByText('H')).toBeInTheDocument();
    expect(container.querySelector('img')).not.toBeInTheDocument();
  });
});
