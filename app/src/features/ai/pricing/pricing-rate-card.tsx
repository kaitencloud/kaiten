import { useNavigate } from '@tanstack/react-router';
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AiUsage } from '@/api-client';
import {
  setLocalCreditValue,
  setLocalReferenceCall,
  useAiAccess,
} from '@/domains/ai-credits';
import { cn } from '@/lib/utils';
import { type AiRequestType, readDecimalInput } from './engine';
import {
  DiscardChangesDialog,
  PricingCellPanel,
  useCellPanelTarget,
} from './panel';
import { PricingControls } from './pricing-controls';
import type { PricingSearch } from './pricing-search.schema';
import { PricingToolbar } from './pricing-toolbar';
import { PoolSetup } from './rate-card-empty';
import { RateCardGrid } from './rate-card-grid';
import { type CellRef, formatCell, parseCell } from './rate-card-model';
import { ReferenceCallBar } from './reference-call-bar';
import { focusCell, revealCell } from './reveal-cell';
import { RequestTypeTabs } from './request-type-tabs';
import { useDirtyGuard } from './use-dirty-guard';
import { usePricingLabels } from './use-pricing-labels';
import type { RateCardView } from './use-rate-card';

type PricingRateCardProps = {
  search: PricingSearch;
  view: RateCardView & { pool: NonNullable<RateCardView['pool']> };
};

/**
 * The rate card of one pool: its controls, the grid and, beside it, the panel
 * of the cell the URL names. Everything that says which view this is lives in
 * the URL; what is folded away and what the open form holds is local.
 */
export function PricingRateCard({ search, view }: PricingRateCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const access = useAiAccess();
  const labels = usePricingLabels();
  const guard = useDirtyGuard();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const target = useCellPanelTarget(view);
  const { pool } = view;
  const poolSlug = pool.slug ?? '';
  const vendors = view.groups.map((group) => group.vendor);
  const allCollapsed =
    vendors.length > 0 && vendors.every((vendor) => collapsed.has(vendor));

  const setSearch = useCallback(
    (patch: Partial<PricingSearch>, replace = false) =>
      void navigate({
        replace,
        search: (previous) => ({ ...previous, ...patch }),
        to: '/ai/pricing',
      }),
    [navigate],
  );
  // The same function from one render to the next: every cell of the grid is
  // given it, and a new one would draw them all again.
  const { run } = guard;
  const openCell = useCallback(
    (cell: CellRef) => run(() => setSearch({ cell: formatCell(cell) })),
    [run, setSearch],
  );
  const closePanel = (options?: { discard?: boolean }) => {
    const close = () => {
      setSearch({ cell: undefined });
      if (view.cell) focusCell(view.cell);
    };
    if (options?.discard) {
      guard.discard(close);
    } else {
      guard.run(close);
    }
  };

  // A link to a cell this view cannot show (a version of another family, a
  // model that is gone) leads to the rate card, not to a panel left blank.
  const { shouldLeave } = target;
  useEffect(() => {
    if (shouldLeave) {
      void navigate({
        replace: true,
        search: (previous) => ({ ...previous, cell: undefined }),
        to: '/ai/pricing',
      });
    }
  }, [navigate, shouldLeave]);

  // The panel takes its width from the grid: once it is laid out, the cell it
  // is about is brought back into view inside the grid's own scroller.
  const openCellKey = target.isOpen ? formatCell(target.cell) : null;
  useEffect(() => {
    const cell = parseCell(openCellKey ?? undefined);
    if (!cell) {
      return undefined;
    }
    const frame = requestAnimationFrame(() =>
      revealCell(
        cell,
        document.querySelector<HTMLElement>('[data-cell-panel]'),
      ),
    );

    return () => cancelAnimationFrame(frame);
  }, [openCellKey, view.type, view.family]);

  const toggleVendor = useCallback((vendor: string) => {
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(vendor)) next.add(vendor);

      return next;
    });
  }, []);
  const changeView = (patch: Partial<PricingSearch>) =>
    guard.run(() =>
      setSearch({ ...patch, cell: undefined, version: undefined }),
    );
  const firstLive = view.versions.find((item) => item.lifecycle !== 'ARCHIVED');
  const canCreate = access.allows('createConversionRule');

  return (
    <div className="flex flex-col gap-4 pb-6">
      <PricingControls
        creditValueInvalid={
          view.creditValueText !== '' && view.creditValue === null
        }
        creditValueText={view.creditValueText}
        families={view.families}
        family={view.family}
        onCreditValueChange={(value) =>
          setLocalCreditValue(poolSlug, readDecimalInput(value))
        }
        onFamilyChange={(family) => changeView({ family })}
        onPoolChange={(next) => changeView({ pool: next })}
        pool={pool}
        pools={view.pools}
      />
      <RequestTypeTabs
        onChange={(type: AiRequestType) => changeView({ type })}
        tabs={view.tabs}
        type={view.type}
      />
      <ReferenceCallBar
        onChange={(usage: AiUsage | undefined) =>
          setLocalReferenceCall(view.type, usage)
        }
        reference={view.reference}
        type={view.type}
      />
      {view.poolHasRules ? null : (
        <PoolSetup
          activeModels={
            view.models.filter((model) => model.status === 'ACTIVE').length
          }
          grantingVersions={view.grantingVersions}
          liveVersions={view.liveVersions}
          modelCount={view.models.length}
          onAddWildcard={
            canCreate && firstLive
              ? () => openCell({ licenseSlug: firstLive.slug, modelSlug: null })
              : undefined
          }
          pool={pool}
          typeLabel={labels.typeLabel(view.type)}
        />
      )}
      <PricingToolbar
        allCollapsed={allCollapsed}
        modelCount={view.modelCount}
        onQueryChange={(q) => setSearch({ q: q === '' ? undefined : q }, true)}
        onStatusChange={(status) =>
          setSearch({ status: status === 'active' ? undefined : status }, true)
        }
        onToggleAllVendors={() =>
          setCollapsed(allCollapsed ? new Set() : new Set(vendors))
        }
        q={search.q ?? ''}
        status={search.status ?? 'active'}
        versionCount={view.versions.length}
      />
      <div
        className={cn(
          'grid grid-cols-1 items-start gap-4',
          // Wide: the panel is a column beside the grid. Between lg and xl it
          // is laid over the right edge of the page: the grid gives it that
          // room, so that no column sits behind it and every one can be
          // scrolled to.
          target.isOpen &&
            'lg:max-xl:pr-[27.25rem] xl:grid-cols-[minmax(0,1fr)_26.25rem]',
        )}
      >
        <RateCardGrid
          collapsed={collapsed}
          creditValue={view.creditValue}
          emptyMessage={
            view.versions.length === 0
              ? t('AI.Pricing.grid.noVersion')
              : search.q
                ? t('AI.Pricing.grid.noMatch', { q: search.q })
                : t('AI.Pricing.grid.noModel')
          }
          focusVersion={view.focusVersion}
          groups={view.groups}
          models={view.models}
          onSelect={openCell}
          onToggleVendor={toggleVendor}
          poolName={pool.name}
          reference={view.reference}
          selected={target.isOpen ? view.cell : null}
          type={view.type}
          versions={view.versions}
        />
        {target.isOpen ? (
          <PricingCellPanel
            creditValue={view.creditValue}
            key={`${poolSlug}:${view.type}:${formatCell(target.cell)}`}
            model={target.model}
            models={view.models}
            onClose={closePanel}
            onDirtyChange={guard.setDirty}
            onOpenCell={openCell}
            pool={pool}
            reference={view.reference}
            type={view.type}
            version={target.version}
          />
        ) : null}
      </div>
      <DiscardChangesDialog
        onCancel={guard.cancel}
        onConfirm={guard.confirm}
        open={guard.asking}
      />
    </div>
  );
}
