import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import type { ModelWritable } from '@/api-client';
import {
  modelsQueryOptions,
  useAiAccess,
  useAiNavigationContext,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { Page } from '@/functionals/page';
import { AiLoading, AiQueryError } from '../ai-section';
import { ModelForm, MODEL_MODALITIES } from './model-form';
import { OpenRouterBrowser, SourceEntryDetails } from './openrouter-browser';
import {
  createOpenRouterImportDraft,
  type OpenRouterEntry,
} from './openrouter-catalogue';

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
    return <p role="status">{t('AI.Calculation.modelDenied')}</p>;
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
          <label className="block text-sm font-medium">
            {t('AI.OpenRouter.chooseModality')}
            <select
              className="mt-2 block min-h-11 rounded-md border bg-card px-3"
              value={manualModality ?? ''}
              onChange={(event) =>
                setManualModality(
                  (event.target.value as ModelWritable['modality']) ||
                    undefined,
                )
              }
            >
              <option value="">{t('AI.OpenRouter.chooseModality')}</option>
              {MODEL_MODALITIES.map((value) => (
                <option key={value} value={value}>
                  {t(`AI.enums.${value}`)}
                </option>
              ))}
            </select>
          </label>
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
            render={<Link to="/catalog/models/new" search={context} />}
          >
            {t('AI.OpenRouter.manualCreate')}
          </Button>
          <Button
            variant="outline"
            nativeButton={false}
            render={<Link to="/catalog/models" search={context} />}
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
