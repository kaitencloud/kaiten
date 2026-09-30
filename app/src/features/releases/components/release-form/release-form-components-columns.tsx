import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TFunction } from 'i18next';
import { Pencil, Trash2, Undo2 } from 'lucide-react';
import { useMemo } from 'react';
import type { Component } from '@/api-client';
import type { ColumnDef } from '@/functionals/table';
import type { ReleaseFormValues } from '../../schemas/release.schema';
import type { ReleaseManagementOverviewRelease } from '../../types';
import {
  getAddedComponentDrafts,
  getInheritedComponentDraft,
  getInheritedComponentViewModels,
} from './component-changes/release-component-changes.utils';

export type ComponentRowSource = 'added' | 'catalog' | 'inherited';

const SOURCE_BADGE_VARIANTS: Record<
  ComponentRowSource,
  'default' | 'outline' | 'secondary'
> = {
  added: 'default',
  catalog: 'secondary',
  inherited: 'outline',
};

export type ComponentRow = {
  description: string;
  id: string;
  name: string;
  source: ComponentRowSource;
  status?: 'edited' | 'removed';
  version: string;
};

export function buildComponentRows(
  values: ReleaseFormValues,
  previousRelease: ReleaseManagementOverviewRelease | undefined,
  availableComponents: Component[],
): ComponentRow[] {
  const rows: ComponentRow[] = [];

  if (previousRelease) {
    const viewModels = getInheritedComponentViewModels(
      previousRelease.components ?? [],
      values.componentPatches,
    );
    for (const vm of viewModels) {
      const draft = getInheritedComponentDraft(vm.component, vm.patch);
      rows.push({
        description: draft.description,
        id: `inherited-${vm.component.id}`,
        name: draft.name,
        source: 'inherited',
        status: vm.status === 'unchanged' ? undefined : vm.status,
        version: draft.version,
      });
    }
  }

  const catalogMap = new Map(availableComponents.map((c) => [c.id, c]));
  for (const cid of values.selectedComponentIds) {
    const c = catalogMap.get(cid);
    if (!c) continue;
    rows.push({
      description: c.description ?? '',
      id: `catalog-${c.id}`,
      name: c.name,
      source: 'catalog',
      version: c.version,
    });
  }

  const added = getAddedComponentDrafts(values.componentPatches);
  for (let i = 0; i < added.length; i++) {
    rows.push({
      description: added[i].description,
      id: `added-${i}`,
      name: added[i].name || `New component ${i + 1}`,
      source: 'added',
      version: added[i].version,
    });
  }

  return rows;
}

function SourceBadge({
  source,
  t,
}: {
  source: ComponentRowSource;
  t: TFunction;
}) {
  const labels: Record<ComponentRowSource, string> = {
    added: t('Pages.Releases.Deployments.Form.sources.new'),
    catalog: t('Pages.Releases.Deployments.Form.sources.catalog'),
    inherited: t('Pages.Releases.Deployments.Form.sources.inherited'),
  };
  return (
    <Badge variant={SOURCE_BADGE_VARIANTS[source]}>{labels[source]}</Badge>
  );
}

export function useComponentColumns({
  onDelete,
  onEdit,
  t,
}: {
  onDelete: (row: ComponentRow) => void;
  onEdit: (row: ComponentRow) => void;
  t: TFunction;
}) {
  return useMemo<ColumnDef<ComponentRow>[]>(
    () => [
      {
        accessorKey: 'name',
        header: t('Pages.Releases.Deployments.Form.Columns.name'),
        cell: ({ row }) => (
          <span className="truncate">{row.original.name || '—'}</span>
        ),
      },
      {
        accessorKey: 'version',
        header: t('Pages.Releases.Deployments.Form.Columns.version'),
        cell: ({ row }) => (
          <Badge variant="outline" className="font-mono">
            {row.original.version || '—'}
          </Badge>
        ),
      },
      {
        accessorKey: 'source',
        header: t('Pages.Releases.Deployments.Form.Columns.source'),
        cell: ({ row }) => (
          <div className="flex items-center gap-1.5">
            <SourceBadge source={row.original.source} t={t} />
            {row.original.status === 'edited' ? (
              <Badge variant="secondary">
                {t('Pages.Releases.Deployments.Form.statuses.edited')}
              </Badge>
            ) : null}
            {row.original.status === 'removed' ? (
              <Badge variant="destructive">
                {t('Pages.Releases.Deployments.Form.statuses.removed')}
              </Badge>
            ) : null}
          </div>
        ),
      },
      {
        id: 'actions',
        header: () => (
          <div className="text-right">
            {t('Pages.Releases.Deployments.Form.Columns.actions')}
          </div>
        ),
        cell: ({ row }) => {
          const r = row.original;
          if (r.status === 'removed') {
            return (
              <div className="flex items-center justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(r)}
                >
                  <Undo2 className="size-4" />
                </Button>
              </div>
            );
          }
          return (
            <div className="flex items-center justify-end gap-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onEdit(r)}
              >
                <Pencil className="size-4" />
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                onClick={() => onDelete(r)}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          );
        },
      },
    ],
    [onDelete, onEdit, t],
  );
}
