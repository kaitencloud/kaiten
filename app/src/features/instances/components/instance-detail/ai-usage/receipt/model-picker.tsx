import { Check, ChevronsUpDown } from 'lucide-react';
import { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Model } from '@/api-client';
import {
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxPanel,
  ComboboxSearch,
  useComboboxFilter,
} from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

type ModelPickerProps = {
  models: readonly Model[];
  value: Model | null;
  onChange: (model: Model) => void;
};

function ModelLine({ model }: { model: Model }) {
  return (
    <span className="flex min-w-0 flex-col text-left">
      <span className="truncate text-sm font-medium">{model.name}</span>
      <span className="truncate font-mono text-xs text-muted-foreground">
        {model.slug} · {model.vendor}
      </span>
    </span>
  );
}

/** One catalogue model, searched by name, slug or vendor. */
export function ModelPicker({ models, value, onChange }: ModelPickerProps) {
  const { t } = useTranslation();
  const id = useId();
  const [open, setOpen] = useState(false);
  const { contains } = useComboboxFilter();

  function renderModel(model: Model) {
    return (
      <ComboboxItem
        key={model.slug}
        value={model}
        className="items-center justify-between gap-2"
      >
        <ModelLine model={model} />
        {value?.slug === model.slug ? (
          <Check
            aria-hidden="true"
            className="size-4 shrink-0 text-primary-subtle-foreground"
          />
        ) : null}
      </ComboboxItem>
    );
  }

  return (
    <div className="space-y-1.5">
      <Label id={id}>{t('AI.Receipt.externalId.model')}</Label>
      {/* modal: the picker opens inside a dialog, whose scroll lock would
          otherwise swallow wheel events in the portaled list. */}
      <Popover open={open} onOpenChange={setOpen} modal>
        <PopoverTrigger
          render={
            <button
              type="button"
              aria-labelledby={id}
              aria-haspopup="listbox"
              aria-expanded={open}
              className="inline-flex min-h-11 w-full items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
            >
              {value ? (
                <ModelLine model={value} />
              ) : (
                <span className="text-muted-foreground">
                  {t('AI.Receipt.externalId.choose')}
                </span>
              )}
              <ChevronsUpDown
                aria-hidden="true"
                className="size-4 shrink-0 text-muted-foreground"
              />
            </button>
          }
        />
        <PopoverContent align="start" className="w-[22rem] p-0" sideOffset={4}>
          <ComboboxPanel<Model>
            items={models}
            value={value}
            filter={(model, query) =>
              [model.name, model.slug, model.vendor].some((text) =>
                contains(text, query),
              )
            }
            itemToStringLabel={(model) => model.name}
            onValueChange={(model) => {
              if (model) {
                onChange(model);
                setOpen(false);
              }
            }}
          >
            <ComboboxSearch
              aria-label={t('AI.Receipt.externalId.search')}
              placeholder={t('AI.Receipt.externalId.search')}
            />
            <ComboboxEmpty>{t('AI.Receipt.externalId.empty')}</ComboboxEmpty>
            <ComboboxList className="max-h-72">{renderModel}</ComboboxList>
          </ComboboxPanel>
        </PopoverContent>
      </Popover>
    </div>
  );
}
