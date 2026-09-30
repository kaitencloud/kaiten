import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { CelIssue } from '../types/cel-context.types';
import { CelIssueList } from './cel-issue-list';

/**
 * The verdict, standing in the toolbar with the other tools.
 *
 * Quiet states are words — "checking…", "no issues". A verdict with problems
 * is a control like Context and Templates beside it: the count opens the list,
 * and each entry puts the caret on its mistake. The list used to sit
 * permanently under the editor, which billed every glance at the rule for a
 * detail view only wanted on demand.
 *
 * aria-live sits on the wrapper so the state changes are announced whichever
 * shape they arrive in.
 */
export function CelEditorStatus({
  isChecking,
  issues,
  hasRule,
  onFocusIssue,
}: {
  isChecking: boolean;
  issues: CelIssue[];
  /** No rule yet means nothing to have an opinion about. */
  hasRule: boolean;
  /** Where to send the author when they pick an issue from the list. */
  onFocusIssue?: (issue: CelIssue) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const showIssues = !isChecking && issues.length > 0;

  return (
    <span aria-live="polite" className="inline-flex items-center">
      {isChecking && (
        <span className="text-muted-foreground px-1.5 text-xs">
          {t('Functionals.CelEditor.checking')}
        </span>
      )}
      {!isChecking && issues.length === 0 && hasRule && (
        <span className="text-muted-foreground px-1.5 text-xs">
          {t('Functionals.CelEditor.noIssues')}
        </span>
      )}
      {showIssues && (
        // modal, like every scrollable popover living inside these stacked
        // dialogs: the dialog's scroll lock eats wheel events on anything
        // portaled outside its subtree.
        <Popover open={open} onOpenChange={setOpen} modal>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="text-destructive-subtle-foreground hover:text-destructive-subtle-foreground h-6 gap-1 px-1.5 text-xs"
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              {t('Functionals.CelEditor.issueCount', {
                count: issues.length,
              })}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="max-h-72 w-96 overflow-y-auto p-1.5"
          >
            <CelIssueList
              issues={issues}
              onFocusIssue={(issue) => {
                setOpen(false);
                onFocusIssue?.(issue);
              }}
            />
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}
