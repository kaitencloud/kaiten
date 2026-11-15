import { getModel, type Model } from '@/api-client';
import { FRESH_READ_OPTIONS } from '@/lib/api/fresh-write';
import { OpenRouterError } from './openrouter-catalogue';
import { useEffect, useRef } from 'react';

/** A fresh setup controller also survives StrictMode's setup/cleanup/setup cycle. */
export function useSourceAbortSignal() {
  const controller = useRef(new AbortController());
  useEffect(() => {
    const current = new AbortController();
    controller.current = current;
    return () => current.abort();
  }, []);
  return controller;
}

export async function readSourceModel(model: Model, signal: AbortSignal) {
  const { data } = await getModel({
    ...FRESH_READ_OPTIONS,
    signal,
    path: { modelSlug: model.slug },
    throwOnError: true,
  });
  if (data.id !== model.id || data.slug !== model.slug)
    throw new OpenRouterError('modelRecreated');
  return data;
}
