import { Badge } from '@/components/ui/badge';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import type { AttioSourceField } from '../types';

export function SourceFieldSummary({
  field,
  compact,
  muted,
  subline = 'key',
}: {
  field: AttioSourceField;
  compact?: boolean;
  muted?: boolean;
  /** Secondary line: the mapping key, or the Kaiten table it reads from. */
  subline?: 'key' | 'table';
}) {
  const { t } = useTranslation();
  return (
    <span className="flex min-w-0 flex-col">
      <span className="flex items-center gap-1.5">
        <span
          className={cn(
            'font-medium',
            compact ? 'text-xs' : 'text-sm',
            muted && 'text-muted-foreground',
          )}
        >
          {field.label}
        </span>
        <Badge variant="secondary" className="font-mono text-[10px]">
          {field.kaitenType}
        </Badge>
      </span>
      <span className="truncate font-mono text-[10px] text-muted-foreground">
        {subline === 'table'
          ? t('Pages.Integrations.Connectors.Wizard.Schema.kaitenTable', {
              table: field.kaitenTable,
            })
          : field.key}
      </span>
    </span>
  );
}

export function SourceFieldPicker({
  options,
  selected,
  onSelect,
}: {
  options: AttioSourceField[];
  selected: AttioSourceField | undefined;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    // modal: the picker also opens inside the mapping editor dialog, whose
    // scroll lock would otherwise swallow wheel events in the portaled list.
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="inline-flex w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent"
            aria-haspopup="listbox"
            aria-expanded={open}
          >
            {selected ? (
              <SourceFieldSummary field={selected} compact subline="table" />
            ) : (
              <span className="text-sm text-muted-foreground">
                {t(
                  'Pages.Integrations.Connectors.Wizard.Schema.selectSourceField',
                )}
              </span>
            )}
            <ChevronsUpDown
              className="size-3.5 shrink-0 text-muted-foreground"
              aria-hidden
            />
          </button>
        }
      />
      <PopoverContent align="start" className="w-[320px] p-0" sideOffset={4}>
        <SourceFieldList
          options={options}
          selectedKey={selected?.key}
          onSelect={(key) => {
            onSelect(key);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}

function SourceFieldGroup({
  labelKey,
  fields,
  selectedKey,
  onSelect,
}: {
  labelKey: string;
  fields: AttioSourceField[];
  selectedKey?: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();

  if (fields.length === 0) {
    return null;
  }

  return (
    <CommandGroup
      heading={
        <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {t(labelKey)}
        </span>
      }
    >
      {fields.map((field) => (
        <CommandItem
          key={field.key}
          value={field.key}
          keywords={[field.label, field.kaitenTable, field.kaitenType]}
          onSelect={onSelect}
          className="items-start justify-between gap-2"
        >
          <SourceFieldSummary field={field} compact />
          {selectedKey === field.key && (
            <Check
              className="size-3.5 shrink-0 text-primary-subtle-foreground"
              aria-hidden
            />
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

function SourceFieldList({
  options,
  selectedKey,
  onSelect,
}: {
  options: AttioSourceField[];
  selectedKey?: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const company = options.filter((field) => field.object === 'Company');
  const workspace = options.filter((field) => field.object === 'Workspace');

  return (
    <Command>
      <CommandInput
        placeholder={t(
          'Pages.Integrations.Connectors.Wizard.Schema.searchSourceField',
        )}
      />
      <CommandList className="max-h-72">
        <CommandEmpty>{t('Common.noResults')}</CommandEmpty>
        <SourceFieldGroup
          labelKey="Pages.Integrations.Connectors.Wizard.Schema.SourceFieldGroup.company"
          fields={company}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
        <SourceFieldGroup
          labelKey="Pages.Integrations.Connectors.Wizard.Schema.SourceFieldGroup.workspace"
          fields={workspace}
          selectedKey={selectedKey}
          onSelect={onSelect}
        />
      </CommandList>
    </Command>
  );
}
