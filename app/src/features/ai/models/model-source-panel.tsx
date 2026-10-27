import {
  useSourceAbortSignal,
  readSourceModel,
} from './use-source-abort-signal';
import { ModelSourceDiff } from './model-source-diff';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { updateModel, type Model } from '@/api-client';
import { isSameField } from '@/lib/api/fresh-write';
import {
  invalidateAiQueries,
  assertAiRequestAllowed,
  useAiNavigationContext,
} from '@/domains/ai-credits';
import { Button } from '@/components/ui/button';
import { Page } from '@/functionals/page';
import { OpenRouterBrowser, SourceEntryDetails } from './openrouter-browser';
import {
  fetchOpenRouterCatalogue,
  OPENROUTER_PRICE_MAP,
  openRouterDisplayName,
  OpenRouterError,
  normalizeOpenRouterDecimal,
  type OpenRouterEntry,
  type OpenRouterPriceKey,
} from './openrouter-catalogue';
import {
  associateOpenRouterSource,
  modelToOpenRouterWritable,
  readOpenRouterSource,
  syncOpenRouterPrices,
} from './openrouter-sync';
import { openRouterErrorMessage, perMillionDisplay } from './openrouter-ui';
type Preview = { model: Model; entry: OpenRouterEntry; checkedAt: string };
export function SourcePanel({
  initialModel,
  mayWrite,
}: {
  initialModel: Model;
  mayWrite: boolean;
}) {
  const { t } = useTranslation();
  const context = useAiNavigationContext();
  const client = useQueryClient();
  const abort = useSourceAbortSignal();
  const [model, setModel] = useState(initialModel);
  const [preview, setPreview] = useState<Preview>();
  const [choose, setChoose] = useState(false);
  const [prices, setPrices] = useState<OpenRouterPriceKey[]>([]);
  const [fields, setFields] = useState<('name' | 'description')[]>([]);
  const [consent, setConsent] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const [status, setStatus] = useState<string>();
  let source;
  let bindingError;
  try {
    source = readOpenRouterSource(model.metadata);
  } catch (failure) {
    bindingError = openRouterErrorMessage(failure, t);
  }
  async function readFresh() {
    assertAiRequestAllowed(client);
    return readSourceModel(model, abort.current.signal);
  }
  function showPreview(
    fresh: Model,
    entry: OpenRouterEntry,
    checkedAt: string,
  ) {
    readOpenRouterSource(fresh.metadata);
    setModel(fresh);
    setPreview({ model: fresh, entry, checkedAt });
    setPrices([]);
    setFields([]);
    setConsent(false);
    setChoose(false);
    setStatus(undefined);
  }
  async function check() {
    setPreview(undefined);
    setPrices([]);
    setFields([]);
    setConsent(false);
    setStatus(undefined);
    setPending(true);
    setError(undefined);
    try {
      const fresh = await readFresh();
      const binding = readOpenRouterSource(fresh.metadata);
      if (!binding) throw new OpenRouterError('sourceNotAssociated');
      assertAiRequestAllowed(client);
      const entries = await fetchOpenRouterCatalogue(abort.current.signal);
      setModel(fresh);
      const entry = entries.find((item) => item.id === binding.sourceId);
      if (!entry) {
        setPreview(undefined);
        setStatus(t('AI.OpenRouter.sourceGone'));
      } else showPreview(fresh, entry, new Date().toISOString());
    } catch (failure) {
      setError(openRouterErrorMessage(failure, t));
    } finally {
      setPending(false);
    }
  }
  async function select(entry: OpenRouterEntry, checkedAt: string) {
    setPending(true);
    setError(undefined);
    try {
      showPreview(await readFresh(), entry, checkedAt);
    } catch (failure) {
      setError(openRouterErrorMessage(failure, t));
    } finally {
      setPending(false);
    }
  }
  async function apply(linkOnly = false) {
    if (!preview || !mayWrite) return;
    setPending(true);
    setError(undefined);
    try {
      let result;
      if (linkOnly) {
        if (!consent) throw new OpenRouterError('sourceNotAssociated');
        const fresh = await readFresh();
        if (
          !isSameField(
            readOpenRouterSource(preview.model.metadata),
            readOpenRouterSource(fresh.metadata),
          )
        )
          throw new OpenRouterError('sourceMismatch');
        const body = modelToOpenRouterWritable(fresh);
        body.metadata = associateOpenRouterSource(
          fresh.metadata,
          preview.entry.id,
          preview.checkedAt,
        );
        const { data } = await updateModel({
          path: { modelSlug: fresh.slug },
          body,
          throwOnError: true,
        });
        result = { model: data, updated: true };
      } else
        result = await syncOpenRouterPrices({
          openedModel: preview.model,
          sourceEntry: preview.entry,
          checkedAt: preview.checkedAt,
          selectedPriceKeys: prices,
          selectedModelFields: fields,
          sourceLinkConsent: consent,
        });
      setModel(result.model);
      setPreview(undefined);
      setPrices([]);
      setFields([]);
      setConsent(false);
      setStatus(
        t(result.updated ? 'AI.OpenRouter.updated' : 'AI.OpenRouter.unchanged'),
      );
      await invalidateAiQueries(client);
    } catch (failure) {
      setError(openRouterErrorMessage(failure, t));
    } finally {
      setPending(false);
    }
  }
  const changedPrices =
    preview?.entry.pricingStatus === 'fixed'
      ? Object.values(OPENROUTER_PRICE_MAP).filter(
          (key) =>
            preview.entry.mappedVendorCosts[key] != null &&
            normalizeOpenRouterDecimal(preview.model.vendorCosts?.[key]) !==
              normalizeOpenRouterDecimal(preview.entry.mappedVendorCosts[key]),
        )
      : [];
  const unavailablePrices =
    preview?.entry.pricingStatus === 'fixed'
      ? Object.values(OPENROUTER_PRICE_MAP).filter(
          (key) =>
            preview.model.vendorCosts?.[key] != null &&
            preview.entry.mappedVendorCosts[key] == null,
        )
      : [];
  const changedFields = preview
    ? (['name', 'description'] as const).filter((key) => {
        const value =
          key === 'name'
            ? openRouterDisplayName(preview.entry.name)
            : preview.entry.description;
        return value !== undefined && !isSameField(preview.model[key], value);
      })
    : [];
  const needsConsent = preview && !readOpenRouterSource(preview.model.metadata);
  const selected = prices.length + fields.length > 0;
  return (
    <Page>
      <Page.Header>
        <Page.Title>
          {model.name} · {t('AI.OpenRouter.sourcePricing')}
        </Page.Title>
        <Page.Actions>
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <Link
                to="/catalog/models/$modelSlug/edit"
                params={{ modelSlug: model.slug }}
                search={context}
              />
            }
          >
            {t('Common.cancel')}
          </Button>
        </Page.Actions>
      </Page.Header>
      <div className="max-w-3xl space-y-5">
        <p className="text-sm text-muted-foreground">
          {t('AI.OpenRouter.vendorOnly')}
        </p>
        <p className="text-sm tabular-nums">
          {t('AI.OpenRouter.savedPrices', {
            input: perMillionDisplay(model.vendorCosts?.perInputToken),
            output: perMillionDisplay(model.vendorCosts?.perOutputToken),
          })}
        </p>
        {bindingError ? (
          <p role="alert">{bindingError}</p>
        ) : (
          <>
            <p className="text-sm wrap-anywhere">
              {source
                ? `${source.sourceId} · ${t('AI.OpenRouter.lastChecked', { date: source.checkedAt })}`
                : t('AI.OpenRouter.unlinked')}
            </p>
            <Button
              type="button"
              variant="outline"
              disabled={pending}
              onClick={
                source
                  ? check
                  : () => {
                      setChoose(true);
                      setPreview(undefined);
                    }
              }
            >
              {t(source ? 'AI.OpenRouter.check' : 'AI.OpenRouter.chooseSource')}
            </Button>
          </>
        )}
        {choose ? (
          <OpenRouterBrowser
            models={[]}
            checkDuplicates={false}
            onSelect={(entry, checkedAt) => void select(entry, checkedAt)}
          />
        ) : null}
        {pending ? <p role="status">{t('Common.loading')}</p> : null}
        {preview ? (
          <>
            <SourceEntryDetails entry={preview.entry} />
            {!preview.entry.modality ||
            preview.entry.modality !== model.modality ? (
              <p
                role="status"
                className="rounded-md bg-warning-subtle p-3 text-sm text-warning-subtle-foreground"
              >
                {t('AI.OpenRouter.modalityMismatch')}
              </p>
            ) : null}
            <ModelSourceDiff
              model={preview.model}
              entry={preview.entry}
              changedPrices={changedPrices}
              unavailablePrices={unavailablePrices}
              changedFields={changedFields}
              prices={prices}
              fields={fields}
              setPrices={setPrices}
              setFields={setFields}
              mayWrite={mayWrite}
              pending={pending}
            />
            {needsConsent ? (
              <label className="flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={consent}
                  disabled={pending || !mayWrite}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                {t('AI.OpenRouter.linkConsent', { id: preview.entry.id })}
              </label>
            ) : null}
            <div className="flex flex-wrap justify-end gap-3 border-t pt-4">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setPreview(undefined)}
              >
                {t('Common.cancel')}
              </Button>
              {needsConsent && !selected ? (
                <Button
                  type="button"
                  disabled={pending || !mayWrite || !consent}
                  onClick={() => void apply(true)}
                >
                  {t('AI.OpenRouter.linkSource')}
                </Button>
              ) : (
                <Button
                  type="button"
                  disabled={
                    pending ||
                    !mayWrite ||
                    !selected ||
                    Boolean(needsConsent && !consent)
                  }
                  onClick={() => void apply()}
                >
                  {t('AI.OpenRouter.apply')}
                </Button>
              )}
            </div>
          </>
        ) : null}
        {!mayWrite ? <p role="status">{t('AI.OpenRouter.readOnly')}</p> : null}
        {status ? <p role="status">{status}</p> : null}
        {error ? (
          <p
            role="alert"
            className="text-sm text-destructive-subtle-foreground"
          >
            {error}
          </p>
        ) : null}
      </div>
    </Page>
  );
}
