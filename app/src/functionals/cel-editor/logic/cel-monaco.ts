import type { Monaco } from '@monaco-editor/react';
import type { editor, languages } from 'monaco-editor';
import { celLanguageDef } from './cel-language';
import { hoverFor, hoverForValue, proposalsFor } from './cel-completions';
import type { CelProposal, CelProposalKind } from './cel-completions';
import { completionTargetAt, hoverPathAt } from './cel-path';
import type { CelCompletionTarget } from './cel-path';
import { comparedLiteralAt } from './cel-value-position';
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

      const closing = closingAround(
        target,
        model.getLineContent(position.lineNumber).slice(position.column - 1),
      );

      return {
        suggestions: proposals.map((proposal) => {
          // A key that cannot follow a dot takes the dot with it, and Monaco
          // filters on the text the range covers: the dot has to be in what
          // the suggestion is matched against too, or `.ai` would match
          // nothing and the suggestion would vanish as it is typed.
          const dot =
            proposal.replacesDot && target.kind === 'member'
              ? textUntilPosition.slice(
                  textUntilPosition.length - typed - target.dotLength,
                  textUntilPosition.length - typed,
                )
              : '';

          return toCompletionItem(
            { ...proposal, insertText: proposal.insertText + closing.append },
            {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: position.column - typed - dot.length,
              endColumn: position.column + closing.swallow,
            },
            monaco,
            dot ? dot + proposal.label : undefined,
          );
        }),
      };
    },
  };
}

/**
 * What a suggestion has to add after itself, and how much of the line after
 * the caret it replaces, for the delimiters the editor closed on the author's
 * behalf.
 *
 * Accepting a key swallows the `']` auto-close already put after the caret, so
 * the caret lands past the whole index instead of stranded inside it with two
 * closers still to arrow over. A value inside an opened quote does the same
 * with its one quote, and closes it when there is none, so accepting never
 * leaves an unterminated literal nor doubles the quote.
 */
function closingAround(
  target: CelCompletionTarget,
  rest: string,
): { append: string; swallow: number } {
  if (target.kind === 'key') {
    const after = /^(['"]\]?|\])/.exec(rest)?.[0] ?? '';

    return { append: after, swallow: after.length };
  }

  if (target.kind === 'value' && target.quote) {
    return {
      append: target.quote,
      swallow: rest.startsWith(target.quote) ? 1 : 0,
    };
  }

  return { append: '', swallow: 0 };
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
      const literal = comparedLiteralAt(
        model.getLineContent(position.lineNumber),
        position.column - 1,
      );
      if (literal) {
        return valueHover(
          hoverForValue(literal.path, literal.value, rootsFor(model)),
          {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: literal.start + 1,
            endColumn: literal.end + 1,
          },
        );
      }

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

/**
 * The hover of a known value: the name it is compared with, then what the
 * value is. Nothing for a literal that is not known.
 */
function valueHover(
  documented: ReturnType<typeof hoverForValue>,
  range: languages.Hover['range'],
): languages.Hover | null {
  if (!documented) return null;

  const contents = [{ value: `\`\`\`cel\n${documented.title}\n\`\`\`` }];
  if (documented.label) {
    contents.push({ value: `**${documented.label}**` });
  }
  if (documented.description) {
    contents.push({ value: documented.description });
  }

  return { range, contents };
}

function toCompletionItem(
  proposal: CelProposal,
  range: languages.CompletionItem['range'],
  monaco: Monaco,
  filterText?: string,
): languages.CompletionItem {
  const item: languages.CompletionItem = {
    // A value reads as `bronze  Bronze`: the literal, then what it is called.
    label:
      proposal.kind === 'value' && proposal.detail
        ? { label: proposal.label, description: proposal.detail }
        : proposal.label,
    kind: completionKind(proposal.kind, monaco),
    filterText,
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
    case 'value':
      return kinds.EnumMember;
    case 'function':
      return kinds.Function;
    case 'macro':
      return kinds.Snippet;
    case 'literal':
      return kinds.Keyword;
  }
}
