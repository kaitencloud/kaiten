import { Button } from '@/components/ui/button';
import { AlignLeft } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCelLint } from '../hooks/use-cel-lint';
import type {
  CelContextNode,
  CelIssue,
  CelLinter,
} from '../types/cel-context.types';
import { CelContextPopover } from './cel-context-popover';
import { CelEditor, type CelEditorHandle } from './cel-editor';
import { CelEditorStatus } from './cel-editor-status';
import { CelRuleTemplates } from './cel-rule-templates';

export interface CelEditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The rule as it stands. The dialog edits a draft of it, never it. */
  initialValue: string;
  /** Called with the draft when the author applies it. */
  onApply: (value: string) => void;
  contextRoots?: CelContextNode[];
  /** The authoritative check, run live over the draft. */
  lint?: CelLinter;
  placeholder?: string;
  /** Disable checking (syntax and lint) — tests without a server or WASM. */
  disableValidation?: boolean;
  /**
   * Caller-specific toolbar actions, handed the live draft — a dry-run
   * button, say. The draft rather than the committed value, because that is
   * the rule the author is looking at.
   */
  toolbarExtra?: (draft: string) => ReactNode;
}

/**
 * The editor at full size, opened from a rule's preview.
 *
 * It works on a draft and commits only on Apply: a dialog that edited the
 * form value live would leave a half-edited rule behind every Escape. Cancel
 * and Escape discard deliberately; clicking outside does nothing, so a stray
 * click cannot eat an unfinished rule.
 */
export function CelEditorDialog({
  open,
  onOpenChange,
  ...content
}: CelEditorDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} disablePointerDismissal>
      {/* Mounted per opening, so the draft and its lint state start fresh
          from the current value each time instead of surviving from the
          previous session. */}
      {open && (
        <CelEditorDialogContent
          {...content}
          onClose={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}

function CelEditorDialogContent({
  initialValue,
  onApply,
  onClose,
  contextRoots = [],
  lint,
  placeholder,
  disableValidation = false,
  toolbarExtra,
}: Omit<CelEditorDialogProps, 'open' | 'onOpenChange'> & {
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(initialValue);
  const editorRef = useRef<CelEditorHandle>(null);

  // The live verdict over the draft. The form's own validator only sees the
  // committed value, so while the author is in here, this is the one place
  // the draft gets judged.
  const { issues, isChecking } = useCelLint(
    draft,
    disableValidation ? undefined : lint,
  );

  const apply = () => {
    onApply(draft);
    onClose();
  };

  const focusIssue = (issue: CelIssue) => {
    editorRef.current?.focusPosition(
      Math.max(issue.line, 1),
      Math.max(issue.column, 1),
    );
  };

  return (
    <DialogContent className="sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{t('Functionals.CelEditor.dialogTitle')}</DialogTitle>
        <DialogDescription>
          {t('Functionals.CelEditor.dialogDescription')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="space-y-2">
        <div className="flex items-center justify-end gap-1">
          {!disableValidation && (
            <CelEditorStatus
              isChecking={isChecking}
              issues={issues}
              hasRule={draft.trim() !== ''}
              onFocusIssue={focusIssue}
            />
          )}
          <CelContextPopover roots={contextRoots} />
          <CelRuleTemplates
            roots={contextRoots}
            onInsert={(rule) =>
              setDraft((current) =>
                current.trim() === '' ? rule : `${current} && ${rule}`,
              )
            }
          />
          {toolbarExtra?.(draft)}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-foreground h-6 w-6 p-0"
            onClick={() => editorRef.current?.format()}
            title={t('Common.format')}
          >
            <AlignLeft className="h-4 w-4" />
          </Button>
        </div>
        <div className="border-input focus-within:border-ring focus-within:ring-ring/50 rounded-md border focus-within:ring-[3px] [&_.monaco-editor]:rounded-md">
          <CelEditor
            ref={editorRef}
            value={draft}
            onChange={setDraft}
            contextRoots={contextRoots}
            issues={issues}
            isChecking={isChecking}
            placeholder={placeholder}
            height="min(52vh, 520px)"
            disableValidation={disableValidation}
          />
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {t('Common.cancel')}
        </Button>
        <Button type="button" onClick={apply}>
          {t('Common.apply')}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}
