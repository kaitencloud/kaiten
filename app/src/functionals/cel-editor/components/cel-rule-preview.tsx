import { Pencil } from 'lucide-react';
import type React from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { tokenizeCel } from '../logic/cel-highlight';
import type { CelTokenKind } from '../logic/cel-highlight';

const TOKEN_CLASSES: Record<CelTokenKind, string> = {
  string: 'text-amber-600 dark:text-amber-300',
  number: 'text-emerald-600 dark:text-emerald-300',
  keyword: 'text-sky-600 dark:text-sky-300',
  callable: 'text-violet-600 dark:text-violet-300',
  comment: 'text-muted-foreground italic',
  plain: '',
};

/**
 * A rule, colored, without an editor.
 *
 * Every read-only surface a rule appears on — the targeting list, the field
 * preview — used to choose between plain text and mounting Monaco. This is
 * the third option: the same vocabulary the editor highlights, rendered as
 * spans, costing nothing.
 */
export function CelRuleHighlight({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  return (
    <code
      className={cn('font-mono break-words whitespace-pre-wrap', className)}
    >
      {tokenizeCel(value).map((token, index) =>
        token.kind === 'plain' ? (
          token.text
        ) : (
          <span key={index} className={TOKEN_CLASSES[token.kind]}>
            {token.text}
          </span>
        ),
      )}
    </code>
  );
}

/**
 * The rule as a clickable surface: read it here, click to edit it for real.
 *
 * The inline editor this replaces gave the rule 150px inside a crowded form —
 * enough to read, cramped to write. Reading is the common case and needs no
 * editor at all; writing deserves the whole dialog this opens.
 */
export function CelRulePreview({
  value,
  onOpen,
  className,
  ...slotProps
}: {
  value: string;
  onOpen: () => void;
  className?: string;
} & Omit<React.ComponentProps<'button'>, 'value' | 'onClick'>) {
  const { t } = useTranslation();
  const isEmpty = value.trim() === '';

  return (
    // slotProps spread so a form's Slot (FormControl) can hand down its id
    // and aria wiring — this button stands where a plain input would.
    <button
      {...slotProps}
      type="button"
      onClick={onOpen}
      aria-label={t('Functionals.CelEditor.editRule')}
      className={cn(
        'border-input group relative w-full min-w-0 rounded-md border bg-transparent px-3 py-2.5 text-left text-sm transition-colors',
        'hover:border-ring/60 focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] focus-visible:outline-none',
        className,
      )}
    >
      {isEmpty ? (
        <span className="text-muted-foreground">
          {t('Functionals.CelEditor.writeRule')}
        </span>
      ) : (
        <CelRuleHighlight value={value} className="line-clamp-4 text-xs" />
      )}
      <Pencil
        aria-hidden
        className="text-muted-foreground absolute top-2.5 right-2.5 h-3.5 w-3.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
      />
    </button>
  );
}
