import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vite-plus/test';
import { TableActions } from '..';

describe('TableActions', () => {
  it('should render children', () => {
    render(
      <TableActions>
        <button type="button">Action 1</button>
        <button type="button">Action 2</button>
      </TableActions>,
    );

    expect(screen.getByText('Action 1')).toBeInTheDocument();
    expect(screen.getByText('Action 2')).toBeInTheDocument();
  });

  it('should apply correct CSS classes', () => {
    const { container } = render(
      <TableActions>
        <span>Test</span>
      </TableActions>,
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toHaveClass('flex', 'justify-end', 'space-x-2');
  });

  it('should render empty when no children provided', () => {
    const { container } = render(<TableActions />);

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).toBeEmptyDOMElement();
  });
});
