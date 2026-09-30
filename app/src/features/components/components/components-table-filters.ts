import type { TFunction } from 'i18next';
import type { FilterFieldDefinition } from '@/functionals/filters';
import type { ComponentCatalogRow } from '../types';

type FilterOption = {
  label: string;
  value: string;
};

const compareText = (left: string, right: string) =>
  left.localeCompare(right, undefined, {
    numeric: true,
    sensitivity: 'base',
  });

function buildVersionOptions(
  components: ComponentCatalogRow[],
): FilterOption[] {
  return [...new Set(components.map((component) => component.version))]
    .sort(compareText)
    .map((version) => ({
      label: version,
      value: version,
    }));
}

function buildReleaseOptions(
  components: ComponentCatalogRow[],
): FilterOption[] {
  return [
    ...new Map(
      components.flatMap((component) =>
        component.releases.map((release) => [release.id, release]),
      ),
    ).values(),
  ]
    .sort((left, right) => compareText(left.version, right.version))
    .map((release) => ({
      label: release.version,
      value: release.version,
    }));
}

export function createComponentCatalogFilterFields(
  components: ComponentCatalogRow[],
  t: TFunction,
): FilterFieldDefinition<ComponentCatalogRow>[] {
  const versionOptions = buildVersionOptions(components);
  const releaseOptions = buildReleaseOptions(components);

  return [
    {
      id: 'name',
      label: t('Pages.Releases.Components.Table.Columns.name', 'Name'),
      type: 'text',
      accessor: (component) => component.name,
      placeholder: t('Pages.Releases.Components.Table.Columns.name', 'Name'),
    },
    {
      id: 'version',
      label: t('Pages.Releases.Components.Table.Columns.version', 'Version'),
      type: 'enum',
      accessor: (component) => component.version,
      options: versionOptions,
    },
    {
      id: 'release',
      label: t('Pages.Releases.Components.Table.Columns.releases', 'Releases'),
      type: 'enum',
      accessor: (component) =>
        component.releases.map((release) => release.version),
      options: releaseOptions,
    },
    {
      id: 'createdAt',
      label: t('Pages.Releases.Components.Table.Columns.createdAt', 'Created'),
      type: 'date',
      accessor: (component) => component.createdAt,
    },
  ];
}
