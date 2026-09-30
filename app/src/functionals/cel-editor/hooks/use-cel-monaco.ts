import { type Monaco } from '@monaco-editor/react';
import { useEffect } from 'react';
import type { editor } from 'monaco-editor';
import { bindCelModelContext, ensureCelLanguage } from '../logic/cel-monaco';
import type { CelContextNode } from '../types/cel-context.types';

/**
 * Connects one mounted editor to the CEL language services: the language and
 * its providers exist once per Monaco runtime, and what this editor's rules
 * may read is bound to its own model — see cel-monaco.ts for why the split
 * runs along that line.
 */
export function useCelMonaco(
  monaco: Monaco | null,
  model: editor.ITextModel | null,
  contextRoots: CelContextNode[],
) {
  useEffect(() => {
    if (monaco) ensureCelLanguage(monaco);
  }, [monaco]);

  useEffect(() => {
    if (!model) return;

    return bindCelModelContext(model, contextRoots);
  }, [model, contextRoots]);
}
