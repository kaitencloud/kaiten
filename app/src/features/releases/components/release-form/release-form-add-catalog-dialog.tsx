import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Component } from '@/api-client';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { dataModelIcons } from '@/lib/data-model-icons';
import { cn } from '@/lib/utils';

type ReleaseFormAddCatalogDialogProps = {
  availableComponents: Component[];
  excludedComponentIds: string[];
  onAdd: (componentIds: string[]) => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
};

function matchesSearch(component: Component, search: string) {
  if (search === '') return true;
  const normalized = search.toLocaleLowerCase();
  return [component.name, component.version, component.description ?? ''].some(
    (v) => v.toLocaleLowerCase().includes(normalized),
  );
}

export function ReleaseFormAddCatalogDialog({
  availableComponents,
  excludedComponentIds,
  onAdd,
  onOpenChange,
  open,
}: ReleaseFormAddCatalogDialogProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const ComponentIcon = dataModelIcons.component;

  const excludedSet = useMemo(
    () => new Set(excludedComponentIds),
    [excludedComponentIds],
  );

  const filterable = useMemo(
    () =>
      availableComponents
        .filter((c) => !excludedSet.has(c.id))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [availableComponents, excludedSet],
  );

  const filtered = useMemo(
    () => filterable.filter((c) => matchesSearch(c, search)),
    [filterable, search],
  );

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  const handleAdd = () => {
    onAdd(selectedIds);
    setSelectedIds([]);
    setSearch('');
    onOpenChange(false);
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      setSelectedIds([]);
      setSearch('');
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg" variant="form">
        <DialogHeader>
          <DialogTitle>
            {t('Pages.Releases.Deployments.Form.addCatalogDialog.title')}
          </DialogTitle>
          <DialogDescription>
            {t('Pages.Releases.Deployments.Form.addCatalogDialog.description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-6">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t(
              'Pages.Releases.Deployments.Form.searchComponentsPlaceholder',
            )}
          />

          {filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t('Pages.Releases.Deployments.Form.noMatchingComponents')}
            </p>
          ) : (
            <div className="space-y-3">
              {filtered.map((component) => {
                const checkboxId = `catalog-dialog-${component.id}`;
                const isSelected = selectedIds.includes(component.id);

                return (
                  <div
                    key={component.id}
                    className={cn(
                      'rounded-lg border border-border/60 px-4 py-3 transition-colors',
                      isSelected && 'border-primary bg-primary/5',
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <Checkbox
                        id={checkboxId}
                        checked={isSelected}
                        onCheckedChange={() => toggle(component.id)}
                      />
                      <div className="min-w-0 flex-1 space-y-1">
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
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => handleOpenChange(false)}
          >
            {t('Common.cancel')}
          </Button>
          <Button
            type="button"
            onClick={handleAdd}
            disabled={selectedIds.length === 0}
          >
            {t('Pages.Releases.Deployments.Form.addCatalogDialog.addButton', {
              count: selectedIds.length,
            })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
