import { describe, expect, it } from 'vite-plus/test';
import type { ColumnDef } from '../../types/data-table.types';
import { deriveDefaultSortingFromColumns, getColumnSortId } from '../data-table-sorting';

type Row = { id: string; name: string };

describe('getColumnSortId', () => {
  it('prefers id over accessorKey', () => {
    const col: ColumnDef<Row> = {
      id: 'custom',
      accessorKey: 'name',
      header: 'Name',
    };
    expect(getColumnSortId(col)).toBe('custom');
  });

  it('uses accessorKey when id is missing', () => {
    const col: ColumnDef<Row> = {
      accessorKey: 'name',
      header: 'Name',
    };
    expect(getColumnSortId(col)).toBe('name');
  });
});

describe('deriveDefaultSortingFromColumns', () => {
  it('returns the first column with meta.defaultSort', () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: 'id', header: 'ID' },
      {
        accessorKey: 'name',
        header: 'Name',
        meta: { defaultSort: 'asc' },
      },
    ];
    expect(deriveDefaultSortingFromColumns(columns)).toEqual([
      { id: 'name', desc: false },
    ]);
  });

  it('prefers the first matching column in definition order', () => {
    const columns: ColumnDef<Row>[] = [
      {
        id: 'a',
        accessorFn: (row) => row.name,
        header: 'A',
        meta: { defaultSort: 'desc' },
      },
      {
        id: 'b',
        accessorFn: (row) => row.name,
        header: 'B',
        meta: { defaultSort: 'asc' },
      },
    ];
    expect(deriveDefaultSortingFromColumns(columns)).toEqual([
      { id: 'a', desc: true },
    ]);
  });

  it('returns an empty array when no defaultSort is set', () => {
    const columns: ColumnDef<Row>[] = [
      { accessorKey: 'name', header: 'Name' },
    ];
    expect(deriveDefaultSortingFromColumns(columns)).toEqual([]);
  });
});
