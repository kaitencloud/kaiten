import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import { expect } from '@playwright/test';

type AxeResults = Awaited<
  ReturnType<InstanceType<typeof AxeBuilder>['analyze']>
>;
type AxeViolation = AxeResults['violations'][number];

export async function expectNoAccessibilityViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();

  expect(results.violations, formatViolations(results.violations)).toEqual([]);
}

function formatViolations(violations: AxeViolation[]) {
  if (violations.length === 0) {
    return '';
  }

  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 3)
        .map((node) => {
          const target = node.target.join(' ');
          const summary =
            node.failureSummary?.replace(/\s+/g, ' ').trim() ??
            'No failure summary';

          return `    - ${target}: ${summary}`;
        })
        .join('\n');

      return [
        `${violation.id} (${violation.impact ?? 'unknown impact'}): ${violation.help}`,
        `  ${violation.helpUrl}`,
        nodes,
      ].join('\n');
    })
    .join('\n\n');
}
