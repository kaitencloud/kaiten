import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '@/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { dataModelIcons } from '@/lib/data-model-icons';
import { cn } from '@/lib/utils';

const EMPTY_EXCLUDED_COMPONENT_IDS: readonly string[] = [];

type ReleaseExistingComponentsSelectorProps = {
  components: Component[];
  excludedComponentIds?: readonly string[];
  onChange: (componentIds: string[]) => void;
  selectedComponentIds: string[];
};

function compareComponents(left: Component, right: Component) {
  const byName = left.name.localeCompare(right.name, undefined, {
    numeric: true,
    sensitivity: 'base',
  });

  if (byName !== 0) {
    return byName;
  }

  return left.version.localeCompare(right.version, undefined, {
    numeric: true,
    sensitivity: 'base',
  });
}

function matchesSearch(component: Component, searchValue: string) {
  if (searchValue === '') {
    return true;
  }

  const normalizedSearch = searchValue.toLocaleLowerCase();

  return [component.name, component.version, component.description ?? ''].some(
    (value) => value.toLocaleLowerCase().includes(normalizedSearch),
  );
}

export function ReleaseExistingComponentsSelector({
  components,
  excludedComponentIds = EMPTY_EXCLUDED_COMPONENT_IDS,
  onChange,
  selectedComponentIds,
}: ReleaseExistingComponentsSelectorProps) {
  const { t } = useTranslation();
  const [searchValue, setSearchValue] = useState('');
  const ComponentIcon = dataModelIcons.component;
  const excludedIds = useMemo(
    () => new Set(excludedComponentIds),
    [excludedComponentIds],
  );
  const availableComponents = useMemo(
    () =>
      components
        .filter((component) => !excludedIds.has(component.id))
        .sort(compareComponents),
    [components, excludedIds],
  );
  const filteredComponents = useMemo(
    () =>
      availableComponents.filter((component) =>
        matchesSearch(component, searchValue),
      ),
    [availableComponents, searchValue],
  );

  const toggleComponent = (componentId: string) => {
    if (selectedComponentIds.includes(componentId)) {
      onChange(
        selectedComponentIds.filter(
          (selectedComponentId) => selectedComponentId !== componentId,
        ),
      );
      return;
    }

    onChange([...selectedComponentIds, componentId]);
  };

  if (availableComponents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {t('Pages.Releases.Deployments.Form.noAvailableComponents')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="font-medium text-sm">
            {t('Pages.Releases.Deployments.Form.selectComponentsTitle')}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('Pages.Releases.Deployments.Form.selectComponentsDescription')}
          </p>
        </div>
        <Badge variant="outline">
          {t('Pages.Releases.Deployments.Form.selectedComponentsCount', {
            count: selectedComponentIds.length,
          })}
        </Badge>
      </div>

      <Input
        value={searchValue}
        onChange={(event) => setSearchValue(event.target.value)}
        placeholder={t(
          'Pages.Releases.Deployments.Form.searchComponentsPlaceholder',
        )}
      />

      {filteredComponents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {t('Pages.Releases.Deployments.Form.noMatchingComponents')}
        </p>
      ) : (
        <div className="space-y-3">
          {filteredComponents.map((component) => {
            const checkboxId = `release-component-selection-${component.id}`;
            const isSelected = selectedComponentIds.includes(component.id);

            return (
              <div
                key={component.id}
                className={cn(
                  'rounded-lg border border-border/60 px-4 py-4 transition-colors',
                  isSelected && 'border-primary bg-primary/5',
                )}
              >
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={checkboxId}
                    checked={isSelected}
                    onCheckedChange={() => toggleComponent(component.id)}
                  />
                  <div className="min-w-0 flex-1 space-y-2">
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <ComponentIcon className="size-4 shrink-0 text-primary-subtle-foreground" />
                      <Label
                        htmlFor={checkboxId}
                        className="cursor-pointer font-medium"
                      >
                        {component.name}
                      </Label>
                      <Badge variant="outline" className="font-mono">
                        {component.version}
                      </Badge>
                    </div>

                    {component.description ? (
                      <p className="text-sm text-muted-foreground">
                        {component.description}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
