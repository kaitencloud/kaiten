import { useMemo, useState } from 'react';

import { cn } from '@/lib/utils';
import { Button } from './button';
import {
  EntityIcon,
  formatIconToken,
  type IconToken,
  lucideIconNameList,
  parseIconToken,
} from './icon';
import { Input } from './input';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

/**
 * Maximum number of icons rendered at once. Searching narrows the list; this cap
 * keeps the grid cheap to render without pulling in a virtualization dependency.
 */
const MAX_RENDERED_ICONS = 60;

export type IconPickerGridLabels = {
  searchPlaceholder?: string;
  clear?: string;
  empty?: string;
};

export type IconPickerGridProps = {
  /** Current token, e.g. `"lucide:rocket"`. */
  value?: string | null;
  /** Called with the picked token, or `null` when cleared. */
  onSelect: (token: IconToken | null) => void;
  /** Overrides the grid sizing (columns, max height). */
  gridClassName?: string;
  /** Overrides the rendered icon size inside cells. */
  iconClassName?: string;
  /** Caps how many icons render at once. */
  maxIcons?: number;
  className?: string;
  /** Labels are passed in so i18n stays in the app layer. */
  labels?: IconPickerGridLabels;
};

/**
 * Searchable icon grid. Composes into any surface (popover, dialog…); the
 * parent owns what happens on selection.
 */
export function IconPickerGrid({
  value,
  onSelect,
  gridClassName,
  iconClassName,
  maxIcons = MAX_RENDERED_ICONS,
  className,
  labels,
}: IconPickerGridProps) {
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
      ? lucideIconNameList.filter((name) => name.includes(normalized))
      : lucideIconNameList;
    return matches.slice(0, maxIcons);
  }, [maxIcons, query]);

  return (
    <div className={cn('space-y-2', className)}>
      <Input
        autoFocus
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder={labels?.searchPlaceholder ?? 'Search icons…'}
      />
      <div
        className={cn(
          'grid max-h-56 grid-cols-8 gap-1 overflow-y-auto',
          gridClassName,
        )}
      >
        {results.map((name) => {
          const token = formatIconToken('lucide', name);
          const selected = token === value;
          return (
            <button
              key={name}
              type="button"
              title={name}
              aria-label={name}
              aria-pressed={selected}
              onClick={() => onSelect(token)}
              className={cn(
                'flex items-center justify-center rounded-md p-1.5 text-foreground hover:bg-accent hover:text-foreground',
                selected && 'bg-accent text-foreground ring-1 ring-ring',
              )}
            >
              <EntityIcon token={token} className={cn('size-4', iconClassName)} />
            </button>
          );
        })}
        {results.length === 0 ? (
          <p className="col-span-full py-4 text-center text-sm text-muted-foreground">
            {labels?.empty ?? 'No icons found'}
          </p>
        ) : null}
      </div>
      {value ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          onClick={() => onSelect(null)}
        >
          {labels?.clear ?? 'Clear'}
        </Button>
      ) : null}
    </div>
  );
}

export type IconPickerProps = {
  /** Current token, e.g. `"lucide:rocket"`. */
  value?: string | null;
  /** Called with the new token, or `null` when cleared. */
  onChange: (token: IconToken | null) => void;
  disabled?: boolean;
  className?: string;
  /** Labels are passed in so i18n stays in the app layer. */
  labels?: IconPickerGridLabels & {
    trigger?: string;
  };
};

export function IconPicker({
  value,
  onChange,
  disabled = false,
  className,
  labels,
}: IconPickerProps) {
  const [open, setOpen] = useState(false);

  const parsed = parseIconToken(value);

  function handleSelect(token: IconToken | null) {
    onChange(token);
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={disabled}
          className={cn('justify-start gap-2', className)}
        >
          <EntityIcon token={value} className="size-4 shrink-0" />
          <span className="truncate">
            {parsed?.name ?? labels?.trigger ?? 'Choose icon'}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <IconPickerGrid value={value} onSelect={handleSelect} labels={labels} />
      </PopoverContent>
    </Popover>
  );
}
