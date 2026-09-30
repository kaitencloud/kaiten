import { useTranslation } from 'react-i18next';
import type { CelIssue } from '../types/cel-context.types';

/**
 * The lint's verdict, written out under the editor — compact, and each entry
 * a button that puts the caret on the mistake.
 *
 * This replaces showing the first error through the generic form message: a
 * positioned issue is only useful if the position is one click away, and in
 * the collapsed 150px editor the marker itself may be scrolled out of sight.
 */
export function CelIssueList({
  issues,
  onFocusIssue,
}: {
  issues: CelIssue[];
  onFocusIssue: (issue: CelIssue) => void;
}) {
  const { t } = useTranslation();

  if (issues.length === 0) return null;

  return (
    <ul className="space-y-0.5">
      {issues.map((issue, index) => (
        <li key={`${issue.line}:${issue.column}:${index}`}>
          <button
            type="button"
            onClick={() => onFocusIssue(issue)}
            className="text-destructive-subtle-foreground hover:bg-destructive/10 flex w-full items-start gap-2 rounded px-1.5 py-0.5 text-left text-xs"
          >
            {issue.line > 0 && (
              <span className="shrink-0 font-mono tabular-nums opacity-70">
                {t('Functionals.CelEditor.issueLine', {
                  line: issue.line,
                })}
              </span>
            )}
            <span className="min-w-0 break-words">{issue.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
