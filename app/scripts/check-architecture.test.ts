import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import {
  analyzeArchitecture,
  type ArchitectureRule,
} from './check-architecture';

const SRC_DIR = resolve('/virtual/app/src');

function source(filePath: string, content = 'export {};') {
  return {
    content,
    filePath: resolve(SRC_DIR, filePath),
  };
}

function rulesFor(files: Array<ReturnType<typeof source>>): ArchitectureRule[] {
  return analyzeArchitecture(SRC_DIR, files).map((violation) => violation.rule);
}

describe('check-architecture', () => {
  test('blocks business dependencies from components with aliases and relative paths', () => {
    const rules = rulesFor([
      source(
        'components/card.tsx',
        [
          "import { order } from '@/domains/orders';",
          "import type { Customer } from '../features/customers/types';",
          "import { cn } from '@/lib/utils';",
        ].join('\n'),
      ),
      source('domains/orders/index.ts'),
      source('features/customers/types/index.ts'),
      source('lib/utils.ts'),
    ]);

    expect(rules).toEqual(['component-boundary', 'component-boundary']);
  });

  test('blocks feature, domain and API dependencies from functionals', () => {
    const rules = rulesFor([
      source(
        'functionals/table/index.ts',
        [
          "import type { Customer } from '@/features/customers/types';",
          "export { order } from '../../domains/orders';",
          "const api = import('@/api-client');",
          "export { Button } from '@/components/button';",
        ].join('\n'),
      ),
      source('features/customers/types/index.ts'),
      source('domains/orders/index.ts'),
      source('api-client/index.ts'),
      source('components/button.tsx'),
    ]);

    expect(rules).toEqual([
      'functional-boundary',
      'functional-boundary',
      'functional-boundary',
    ]);
  });

  test('blocks feature and route dependencies from domains', () => {
    const rules = rulesFor([
      source(
        'domains/orders/index.ts',
        [
          "import { CustomerCard } from '@/features/customers/components/customer-card';",
          "export type RouteType = import('../../routes/orders').RouteType;",
          "import { Table } from '@/functionals/table';",
        ].join('\n'),
      ),
      source('features/customers/components/customer-card.tsx'),
      source('routes/orders.tsx'),
      source('functionals/table/index.ts'),
    ]);

    expect(rules).toEqual(['domain-boundary', 'domain-boundary']);
  });

  test('keeps shared hooks free of business code, functionals, routes and the API client', () => {
    const rules = rulesFor([
      source(
        'hooks/use-orders.ts',
        [
          "import { order } from '@/domains/orders';",
          "import type { Customer } from '../features/customers/types';",
          "export { Route } from '../routes/orders';",
          "import { useFilterBuilder } from '@/functionals/filters';",
          "import { listCustomersOptions } from '@/api-client/@tanstack/react-query.gen';",
          "import { fieldContext } from '@/components/form/form-context';",
          "import { cn } from '@/lib/utils';",
          "import { useTimer } from './use-timer';",
        ].join('\n'),
      ),
      source('hooks/use-timer.ts'),
      source('domains/orders/index.ts'),
      source('features/customers/types/index.ts'),
      source('routes/orders.tsx'),
      source('functionals/filters/index.ts'),
      source('api-client/@tanstack/react-query.gen.ts'),
      source('components/form/form-context.ts'),
      source('lib/utils.ts'),
    ]);

    expect(rules).toEqual(Array(5).fill('hook-boundary'));
  });

  test('keeps lib below every other source layer', () => {
    const rules = rulesFor([
      source(
        'lib/errors/handler.ts',
        [
          "import { Button } from '@/components/ui/button';",
          "import { useModal } from '@/hooks/use-modal';",
          "import { DataTable } from '@/functionals/table';",
          "import { order } from '@/domains/orders';",
          "import type { Customer } from '../../features/customers/types';",
          "import type { RouteType } from '@/routes/orders';",
          "import type { Problem } from '@/api-client/types.gen';",
          "import env from '@/env';",
          "import { logger } from '../logger';",
        ].join('\n'),
      ),
      source('lib/logger.ts'),
      source('components/ui/button.tsx'),
      source('hooks/use-modal.ts'),
      source('functionals/table/index.ts'),
      source('domains/orders/index.ts'),
      source('features/customers/types/index.ts'),
      source('routes/orders.tsx'),
      source('api-client/types.gen.ts'),
      source('env.ts'),
    ]);

    expect(rules).toEqual(Array(6).fill('lib-boundary'));
  });

  test('blocks cross-feature imports, including type-only relative imports', () => {
    const rules = rulesFor([
      source(
        'features/orders/components/order.tsx',
        [
          "import { CustomerCard } from '@/features/customers/components/customer-card';",
          "import type { Customer } from '../../customers/types';",
        ].join('\n'),
      ),
      source('features/customers/components/customer-card.tsx'),
      source('features/customers/types/index.ts'),
    ]);

    expect(rules).toEqual(['cross-feature', 'cross-feature']);
  });

  test('keeps routes out of feature imports while routes may import features', () => {
    const rules = rulesFor([
      source(
        'features/orders/components/order.tsx',
        [
          "import { Route } from '@/routes/orders';",
          "import type { RouteType } from '../../../routes/orders';",
        ].join('\n'),
      ),
      source(
        'routes/orders.tsx',
        "import { OrdersPage } from '@/features/orders';",
      ),
      source('features/orders/index.ts'),
    ]);

    expect(rules).toEqual(['feature-route-boundary', 'feature-route-boundary']);
  });

  test('reserves feature root barrels for routes', () => {
    const rules = rulesFor([
      source(
        'features/orders/components/order.tsx',
        "import { OrdersPage } from '@/features/orders';",
      ),
      source(
        'routes/orders.tsx',
        "import { OrdersPage } from '@/features/orders';",
      ),
      source('features/orders/index.ts'),
    ]);

    expect(rules).toEqual(['feature-root-barrel']);
  });

  test('resolves a real feature directory to its root index', () => {
    const tempDir = mkdtempSync(resolve(tmpdir(), 'kaiten-architecture-'));
    const srcDir = resolve(tempDir, 'src');
    mkdirSync(resolve(srcDir, 'features/orders'), { recursive: true });

    try {
      const violations = analyzeArchitecture(srcDir, [
        {
          content: "import { OrdersPage } from '@/features/orders';",
          filePath: resolve(
            srcDir,
            'features/orders/components/order-card.tsx',
          ),
        },
        {
          content: 'export const OrdersPage = null;',
          filePath: resolve(srcDir, 'features/orders/index.ts'),
        },
      ]);

      expect(violations.map((violation) => violation.rule)).toEqual([
        'feature-root-barrel',
      ]);
    } finally {
      rmSync(tempDir, { recursive: true });
    }
  });

  test('requires the public API for external functional imports', () => {
    const rules = rulesFor([
      source(
        'features/orders/components/order-table.tsx',
        [
          "import { DataTable } from '@/functionals/table';",
          "import { DataTableBody } from '@/functionals/table/components/data-table-body';",
        ].join('\n'),
      ),
      source(
        'functionals/filters/index.ts',
        [
          "import { DataTable } from '@/functionals/table';",
          "import { DataTableBody } from '../table/components/data-table-body';",
        ].join('\n'),
      ),
      source(
        'functionals/table/index.ts',
        "export { DataTableBody } from './components/data-table-body';",
      ),
      source('functionals/table/components/data-table-body.tsx'),
    ]);

    expect(rules).toEqual(['functional-public-api', 'functional-public-api']);
  });

  test('keeps targeting, variants and rollout private to feature-flags', () => {
    const rules = rulesFor([
      source(
        'routes/feature-flags.tsx',
        "import { VariantList } from '@/features/feature-flags/variants';",
      ),
      source(
        'features/feature-flags/components/form.tsx',
        [
          "import { VariantList } from '@/features/feature-flags/variants';",
          "import { TargetingList } from '../targeting';",
          "import { RolloutDateConfig } from '../rollout';",
        ].join('\n'),
      ),
      source('features/feature-flags/variants/index.ts'),
      source('features/feature-flags/targeting/index.ts'),
      source('features/feature-flags/rollout/index.ts'),
    ]);

    // The intra-feature `@/features/feature-flags/variants` import is also
    // flagged as a (warning-level) internal-relative-import: internal imports
    // must be relative so the feature folder stays movable.
    expect(rules).toEqual(['internal-relative-import', 'feature-local-module']);
  });

  test('requires internal module imports to be relative so a folder stays movable', () => {
    const rules = rulesFor([
      source(
        'features/instances/components/instance-card.tsx',
        [
          "import { helper } from '@/features/instances/utils/instance.utils';",
          "import { other } from '../detail/other';",
        ].join('\n'),
      ),
      source('features/instances/utils/instance.utils.ts'),
      source('features/instances/components/detail/other.tsx'),
    ]);

    expect(rules).toEqual(['internal-relative-import']);
  });

  test('requires the public index for external feature/domain imports', () => {
    const rules = rulesFor([
      source(
        'features/customers/components/customer-detail.tsx',
        [
          "import { SyncBadge } from '@/domains/crm-sync/components';",
          "import { sync } from '@/domains/crm-sync';",
        ].join('\n'),
      ),
      source('domains/crm-sync/components/index.ts'),
      source('domains/crm-sync/index.ts'),
    ]);

    expect(rules).toEqual(['module-public-api']);
  });

  test('reports the source line and resolved target', () => {
    const violations = analyzeArchitecture(SRC_DIR, [
      source(
        'domains/orders/index.ts',
        "\n\nexport { CustomerCard } from '@/features/customers/components/customer-card';",
      ),
      source('features/customers/components/customer-card.tsx'),
    ]);

    expect(violations).toEqual([
      expect.objectContaining({
        filePath: 'domains/orders/index.ts',
        line: 3,
        rule: 'domain-boundary',
        target: 'features/customers/components/customer-card.tsx',
      }),
    ]);
  });
});
