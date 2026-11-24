import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { getSessionIdentity } from '@/lib/session-identity';
import type { ChoosableColumn } from '../../logic/column-chooser';
import {
  readHiddenColumns,
  tableColumnsStorageKey,
  writeHiddenColumns,
} from '../../logic/column-visibility-storage';

export type ColumnChooserContextValue = {
  /** The columns the table lets the person hide, as its `DataTable` reports them. */
  columns: readonly ChoosableColumn[];
  /** The ids the person hid, as stored: some may name no column of the table. */
  hidden: readonly string[];
  /** Called by the `DataTable` inside, whenever its choosable columns change. */
  registerColumns: (columns: readonly ChoosableColumn[]) => void;
  reset: () => void;
  setColumnVisible: (id: string, visible: boolean) => void;
};

const ColumnChooserContext = createContext<ColumnChooserContextValue | null>(
  null,
);

/** The chooser of the layout around a table, or null when it has none. */
export function useColumnChooser(): ColumnChooserContextValue | null {
  return useContext(ColumnChooserContext);
}

const sameColumns = (
  left: readonly ChoosableColumn[],
  right: readonly ChoosableColumn[],
) =>
  left.length === right.length &&
  left.every(
    (column, index) =>
      column.id === right[index]?.id && column.label === right[index]?.label,
  );

type ColumnChooserProviderProps = PropsWithChildren<{
  /** Names the table in the stored choice: `instances`, `deployment-zones`. */
  tableId: string;
}>;

/**
 * Holds which columns of one table the person hid, read from this browser at
 * mount and written back on each change, for the organization signed in. The
 * `DataTable` inside reports its columns and applies the choice; the Columns
 * button lists them.
 */
export function ColumnChooserProvider({
  tableId,
  children,
}: ColumnChooserProviderProps) {
  const storageKey = tableColumnsStorageKey(
    getSessionIdentity()?.organizationId ?? '',
    tableId,
  );
  const [stored, setStored] = useState(() => ({
    key: storageKey,
    hidden: readHiddenColumns(storageKey),
  }));
  // Another table or another organization: read its own choice.
  if (stored.key !== storageKey) {
    setStored({ key: storageKey, hidden: readHiddenColumns(storageKey) });
  }
  const { hidden } = stored;
  const [columns, setColumns] = useState<readonly ChoosableColumn[]>([]);

  const registerColumns = useCallback(
    (next: readonly ChoosableColumn[]) =>
      setColumns((current) => (sameColumns(current, next) ? current : next)),
    [],
  );

  const setColumnVisible = useCallback(
    (id: string, visible: boolean) => {
      const others = stored.hidden.filter((hiddenId) => hiddenId !== id);
      const next = visible ? others : [...others, id];
      writeHiddenColumns(stored.key, next);
      setStored({ key: stored.key, hidden: next });
    },
    [stored],
  );

  const reset = useCallback(() => {
    writeHiddenColumns(stored.key, []);
    setStored({ key: stored.key, hidden: [] });
  }, [stored.key]);

  const value = useMemo<ColumnChooserContextValue>(
    () => ({ columns, hidden, registerColumns, reset, setColumnVisible }),
    [columns, hidden, registerColumns, reset, setColumnVisible],
  );

  return (
    <ColumnChooserContext.Provider value={value}>
      {children}
    </ColumnChooserContext.Provider>
  );
}
