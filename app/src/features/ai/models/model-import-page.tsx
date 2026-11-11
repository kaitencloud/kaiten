import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ModelWritable } from '@/api-client';
import {
  AiLoading,
  AiQueryError,
  modelsQueryOptions,
  useAiAccess,
  useAiNavigationContext,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Page } from '@/functionals/page';
import { ModelForm, MODEL_MODALITIES } from './model-form';
import { OpenRouterBrowser, SourceEntryDetails } from './openrouter-browser';
import {
  createOpenRouterImportDraft,
  type OpenRouterEntry,
} from './openrouter-catalogue';

type Modality = ModelWritable['modality'];

function ModalityPicker({
  value,
  onChange,
}: {
  value: Modality | undefined;
  onChange: (value: Modality | undefined) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const items = MODEL_MODALITIES.map((modality) => ({
    value: modality,
    label: t(`AI.enums.${modality}`),
  }));
  function renderItem(item: (typeof items)[number]) {
    return (
      <SelectItem key={item.value} value={item.value}>
        {item.label}
      </SelectItem>
    );
  }
  return (
    <div className="grid max-w-xs grid-cols-1 gap-2">
      <Label htmlFor={id}>{t('AI.OpenRouter.chooseModality')}</Label>
      <Select
        items={items}
        value={value ?? null}
        onValueChange={(next) => onChange(next ?? undefined)}
      >
        <SelectTrigger id={id} className="min-h-11 sm:min-h-9">
          <SelectValue placeholder={t('AI.OpenRouter.chooseModality')} />
        </SelectTrigger>
        <SelectContent>{items.map(renderItem)}</SelectContent>
      </Select>
    </div>
  );
}

export function ModelImportPage() {
  const access = useAiAccess();
  const { t } = useTranslation();
  const context = useAiNavigationContext();
  const [selected, setSelected] = useState<{
    entry: OpenRouterEntry;
    checkedAt: string;
  }>();
  const [manualModality, setManualModality] =
    useState<ModelWritable['modality']>();
  const mayRead = access.allows('listModels');
  const query = useQuery({ ...modelsQueryOptions, enabled: mayRead });
  if (!access.available) return null;
  if (access.isPending || (mayRead && query.isPending))
    return <AiLoading label={t('AI.Models.loading')} />;
  if (!mayRead || !access.allows('createModel'))
    return <p role="status">{t('AI.Access.modelDenied')}</p>;
  if (query.isError)
    return <AiQueryError error={query.error} onRetry={() => query.refetch()} />;
  const source =
    selected && (selected.entry.modality || manualModality)
      ? {
          ...selected,
          entry: {
            ...selected.entry,
            modality: selected.entry.modality ?? manualModality!,
          },
        }
      : undefined;
  return selected ? (
    <div className="space-y-5">
      {!source ? <SourceEntryDetails entry={selected.entry} /> : null}
      {!source ? (
        <div className="space-y-3">
          <ModalityPicker value={manualModality} onChange={setManualModality} />
          <Button
            type="button"
            variant="outline"
            onClick={() => setSelected(undefined)}
          >
            {t('Common.cancel')}
          </Button>
        </div>
      ) : (
        <ModelForm
          key={source.entry.id}
          initialDraft={createOpenRouterImportDraft(source.entry)}
          sourceOrigin={source}
          onCancel={() => {
            setSelected(undefined);
            setManualModality(undefined);
          }}
        />
      )}
    </div>
  ) : (
    <Page>
      <Page.Header>
        <Page.Title>{t('AI.OpenRouter.importTitle')}</Page.Title>
        <Page.Actions>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/ai/models/new" search={context} />}
          >
            {t('AI.OpenRouter.manualCreate')}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/ai/models" search={context} />}
          >
            {t('Common.cancel')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <p className="mb-4 text-sm text-muted-foreground">
        {t('AI.OpenRouter.vendorOnly')}
      </p>
      <OpenRouterBrowser
        models={query.data!.items}
        onSelect={(entry, checkedAt) => {
          setSelected({ entry, checkedAt });
          setManualModality(undefined);
        }}
      />
    </Page>
  );
}
