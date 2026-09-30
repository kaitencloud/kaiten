import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import { celLanguageDef } from './cel-language';
import { hoverFor, proposalsFor } from './cel-completions';
import type { CelProposal, CelProposalKind } from './cel-completions';
import { completionTargetAt, hoverPathAt } from './cel-path';
import { formatCEL } from './format-cel';
import type { CelContextNode } from '../types/cel-context.types';

/*
The CEL language services, registered once per Monaco runtime.

They used to be registered per mounted editor and disposed on unmount, which
read tidily and was wrong: Monaco providers are global to a language, not to
an editor, so two CEL editors on one screen each saw the other's provider and
every suggestion appeared twice. What varies per editor is only the context —
so the providers are permanent, and each editor binds its context to its own
model, which is the one thing the provider callbacks are handed that
identifies who is asking.
*/

const contextsByModel = new WeakMap<editor.ITextModel, CelContextNode[]>();
const registeredRuntimes = new WeakSet<object>();

const NO_ROOTS: CelContextNode[] = [];

/**
 * Associates a model with what its rules may read. Returns the unbind, which
 * only clears the entry it wrote — an unmount racing a remount must not strip
 * the context the newer binding just installed.
 */
export function bindCelModelContext(
  model: editor.ITextModel,
  roots: CelContextNode[],
): () => void {
  contextsByModel.set(model, roots);

  return () => {
    if (contextsByModel.get(model) === roots) {
      contextsByModel.delete(model);
    }
  };
}

/** The context bound to a model, for providers and tests. */
function rootsFor(model: editor.ITextModel): CelContextNode[] {
  return contextsByModel.get(model) ?? NO_ROOTS;
}

/**
 * Registers the CEL language and its providers on a Monaco runtime, the first
 * time that runtime is seen. Safe to call from every editor mount.
 */
export function ensureCelLanguage(monaco: Monaco): void {
  if (registeredRuntimes.has(monaco)) return;
  registeredRuntimes.add(monaco);

  monaco.languages.register({ id: 'cel' });
  monaco.languages.setMonarchTokensProvider('cel', celLanguageDef);
  monaco.languages.setLanguageConfiguration('cel', {
    comments: {
      lineComment: '//',
    },
    brackets: [
      ['{', '}'],
      ['[', ']'],
      ['(', ')'],
    ],
    autoClosingPairs: [
      { open: '{', close: '}' },
      { open: '[', close: ']' },
      { open: '(', close: ')' },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });

  monaco.languages.registerCompletionItemProvider(
    'cel',
    completionProvider(monaco),
  );
  monaco.languages.registerHoverProvider('cel', hoverProvider());
  monaco.languages.registerDocumentFormattingEditProvider('cel', {
    provideDocumentFormattingEdits: (model) => [
      {
        range: model.getFullModelRange(),
        text: formatCEL(model.getValue()),
      },
    ],
  });
}

function completionProvider(monaco: Monaco): languages.CompletionItemProvider {
  return {
    // `[`, `'` and `"` are triggers so an index offers its keys as soon as it
    // opens. completionTargetAt knows a quote inside an ordinary string from
    // one opening an index key, and answers `none` for the former — without
    // that, these triggers would pop the root list into every literal.
    triggerCharacters: ['.', '[', "'", '"'],

    provideCompletionItems: (model, position) => {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      const target = completionTargetAt(textUntilPosition);
      const proposals = proposalsFor(target, rootsFor(model));

      // Replace exactly what has been typed of the name. Monaco's own word
      // detection stops at the quote, which would leave a half-typed slug
      // behind when the suggestion is accepted inside an index.
      const typed = 'prefix' in target ? target.prefix.length : 0;

      // Accepting a key swallows the `']` auto-close already put after the
      // caret, so the caret lands past the whole index instead of stranded
      // inside it with two closers still to arrow over.
      const after =
        target.kind === 'key'
          ? (/^(['"]\]?|\])/.exec(
              model
                .getLineContent(position.lineNumber)
                .slice(position.column - 1),
            )?.[0] ?? '')
          : '';

      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: position.column - typed,
        endColumn: position.column + after.length,
      };

      return {
        suggestions: proposals.map((proposal) =>
          toCompletionItem(
            after
              ? { ...proposal, insertText: proposal.insertText + after }
              : proposal,
            range,
            monaco,
          ),
        ),
      };
    },
  };
}

/**
 * Hover documentation for a name in a rule.
 *
 * Reading a rule is most of what anyone does with one — a targeting rule is
 * looked at far more often than it is written — and `entitlements['seats']
 * .percentage >= 0.9` says nothing about whether that is nine tenths or
 * ninety. The descriptions travel with the schema, so this is the same
 * sentence the server would give.
 *
 * A name it does not recognise gets no hover at all rather than an empty box:
 * a host's own attributes are legitimate and undescribed, and saying nothing
 * is the honest answer.
 */
function hoverProvider(): languages.HoverProvider {
  return {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // The chain up to and including the hovered word, so `slug` in
      // `__kaiten.license.slug` is documented as that field rather than as
      // whatever else happens to be called slug.
      const upToWord = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: word.endColumn,
      });

      const path = hoverPathAt(upToWord, word.word);
      if (!path) return null;

      const documented = hoverFor(path, rootsFor(model));
      if (!documented) return null;

      const contents = [
        {
          value: `\`\`\`cel\n${documented.title}: ${documented.type}\n\`\`\``,
        },
      ];
      if (documented.description) {
        contents.push({ value: documented.description });
      }

      return {
        range: {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endColumn: word.endColumn,
        },
        contents,
      };
    },
  };
}

function toCompletionItem(
  proposal: CelProposal,
  range: languages.CompletionItem['range'],
  monaco: Monaco,
): languages.CompletionItem {
  const item: languages.CompletionItem = {
    label: proposal.label,
    kind: completionKind(proposal.kind, monaco),
    insertText: proposal.insertText,
    detail: proposal.detail,
    sortText: proposal.sortText,
    range,
  };

  if (proposal.documentation) {
    item.documentation = { value: proposal.documentation };
  }

  if (proposal.snippet) {
    item.insertTextRules =
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  }

  return item;
}

function completionKind(
  kind: CelProposalKind,
  monaco: Monaco,
): languages.CompletionItemKind {
  const kinds = monaco.languages.CompletionItemKind;

  switch (kind) {
    case 'variable':
      return kinds.Variable;
    case 'field':
      return kinds.Property;
    case 'key':
      return kinds.Value;
    case 'function':
      return kinds.Function;
    case 'macro':
      return kinds.Snippet;
    case 'literal':
      return kinds.Keyword;
  }
}
