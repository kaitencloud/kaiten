import { describe, expect, it } from 'vite-plus/test';
import { createActionsColumn } from '..';

describe('table utils', () => {
  describe('createActionsColumn', () => {
    it('should create a column definition with id "actions"', () => {
      const renderActions = () => <div>Actions</div>;
      const column = createActionsColumn(renderActions);

      expect(column.id).toBe('actions');
    });

    it('should have a header function', () => {
      const renderActions = () => <div>Actions</div>;
      const column = createActionsColumn(renderActions);

      expect(column.header).toBeDefined();
      expect(typeof column.header).toBe('function');
    });

    it('should have a cell function', () => {
      const renderActions = () => <div>Actions</div>;
      const column = createActionsColumn(renderActions);

      expect(column.cell).toBeDefined();
      expect(typeof column.cell).toBe('function');
    });

    it('should call renderActions with row.original in cell', () => {
      const mockItem = { id: 1, name: 'Test' };
      let capturedItem: typeof mockItem | null = null;

      const renderActions = (item: typeof mockItem) => {
        capturedItem = item;
        return <div>Actions for {item.name}</div>;
      };

      const column = createActionsColumn(renderActions);

      if (typeof column.cell === 'function') {
        column.cell({
          row: { original: mockItem },
        } as any);
      }

      expect(capturedItem).toEqual(mockItem);
    });

    it('should work with different item types', () => {
      type CustomItem = { uuid: string; title: string };

      const renderActions = (item: CustomItem) => <button>{item.title}</button>;
      const column = createActionsColumn<CustomItem>(renderActions);

      expect(column.id).toBe('actions');
      expect(typeof column.cell).toBe('function');
    });
  });
});
