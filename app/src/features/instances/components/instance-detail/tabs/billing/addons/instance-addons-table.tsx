import { Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PriceAmount } from '@/domains/billing';
import {
  type ColumnDef,
  createActionsColumn,
  DataTable,
} from '@/functionals/table';
import {
  getFlatFee,
  type HeldAddon,
} from '../../../../../utils/instance-addons.utils';
import { formatDate } from '../../../../../utils/instance-detail-overview.utils';
import { useInstanceAddonActionsContext } from './instance-addon-actions-context';
import { QuantityStepper } from './quantity-stepper';
import { RemoveAddonDialog } from './remove-addon-dialog';

type InstanceAddonsTableProps = {
  /** Whether the session may take an add-on off the instance. */
  mayDetach: boolean;
  /** Whether the session may change the quantity of an add-on. */
  maySetQuantity: boolean;
  rows: readonly HeldAddon[];
};

// Written out in full, so that a key that does not exist fails the check of the keys.
const KEYS = {
  addon: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.Columns.addon',
  decrease: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.decrease',
  free: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.free',
  group: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.group',
  increase: 'Pages.Customers.Instances.Detail.Billing.Addons.Quantity.increase',
  notBilled: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.notBilled',
  onRequest: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.onRequest',
  price: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.Columns.price',
  quantity:
    'Pages.Customers.Instances.Detail.Billing.Addons.Table.Columns.quantity',
  removeAction: 'Pages.Customers.Instances.Detail.Billing.Addons.Remove.action',
  removeAria: 'Pages.Customers.Instances.Detail.Billing.Addons.Remove.aria',
  since: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.Columns.since',
  withdrawn: 'Pages.Customers.Instances.Detail.Billing.Addons.Table.withdrawn',
  withdrawnHint:
    'Pages.Customers.Instances.Detail.Billing.Addons.Table.withdrawnHint',
} as const;

function AddonCell({ row }: { row: HeldAddon }) {
  const { t } = useTranslation();

  return (
    <div className="space-y-0.5 whitespace-normal">
      <div className="flex flex-wrap items-center gap-2">
        <p className="font-medium">{row.held.name}</p>
        {row.addon?.lifecycleState === 'ARCHIVED' ? (
          <Badge title={t(KEYS.withdrawnHint)} variant="outline">
            {t(KEYS.withdrawn)}
          </Badge>
        ) : null}
      </div>
      <p className="font-mono text-xs text-muted-foreground">
        {row.held.addonSlug}
      </p>
    </div>
  );
}

function QuantityCell({
  maySetQuantity,
  row,
}: {
  maySetQuantity: boolean;
  row: HeldAddon;
}) {
  const { t } = useTranslation();
  const actions = useInstanceAddonActionsContext();
  const { held } = row;
  const label = held.name;
  // The quantity a change is asking for stays on the stepper until the API answers,
  // and goes back to the one it holds if the change is refused.
  const shown =
    actions.pending?.kind === 'quantity' && actions.pending.held.id === held.id
      ? actions.pending.quantity
      : held.quantity;

  if (!maySetQuantity) {
    return <span className="tabular-nums">{held.quantity}</span>;
  }

  return (
    <QuantityStepper
      disabled={actions.pending !== null}
      labels={{
        decrease: t(KEYS.decrease, { name: label }),
        group: t(KEYS.group, { name: label }),
        increase: t(KEYS.increase, { name: label }),
      }}
      max={held.maxQuantity}
      onChange={(quantity) =>
        void actions.perform({ held, kind: 'quantity', label, quantity })
      }
      value={shown}
    />
  );
}

// What one unit costs: the flat fee of the period of the subscription, as the API
// gives it for the instance. An instance nobody bills has none, and neither has an
// add-on that is free or sold on request.
function PriceCell({ row }: { row: HeldAddon }) {
  const { t } = useTranslation();
  const fee = getFlatFee(row.held.prices);

  if (fee) {
    return <PriceAmount price={fee} />;
  }
  switch (row.addon?.pricingType) {
    case 'FREE':
      return <span>{t(KEYS.free)}</span>;
    case 'CUSTOM':
      return <span>{t(KEYS.onRequest)}</span>;
    default:
      return <span className="text-muted-foreground">{t(KEYS.notBilled)}</span>;
  }
}

function RemoveCell({ row }: { row: HeldAddon }) {
  const { t } = useTranslation();
  const actions = useInstanceAddonActionsContext();
  const [confirming, setConfirming] = useState(false);
  const label = row.held.name;

  return (
    <div className="flex h-8 items-center justify-end gap-1" data-row-actions>
      <Button
        aria-label={t(KEYS.removeAria, { name: label })}
        className="gap-1"
        disabled={actions.pending !== null}
        onClick={() => setConfirming(true)}
        size="sm"
        type="button"
        variant="ghost"
      >
        <Trash2 className="size-3" />
        {t(KEYS.removeAction)}
      </Button>
      {confirming ? (
        <RemoveAddonDialog
          onClose={() => setConfirming(false)}
          onConfirm={() =>
            void actions.perform({ held: row.held, kind: 'remove', label })
          }
          row={row}
        />
      ) : null}
    </div>
  );
}

/**
 * The add-ons an instance holds, one row each: which one, the quantity, stepped one
 * unit at a time within what the version allows, what a unit costs, since when it is
 * held, and the way to take it off. A session that may not change them reads the
 * same rows with no controls. The cells read the change being made from the card
 * (`InstanceAddonActionsProvider`), so the columns stay the same from one render to
 * the next.
 */
export function InstanceAddonsTable({
  mayDetach,
  maySetQuantity,
  rows,
}: InstanceAddonsTableProps) {
  const { i18n, t } = useTranslation();
  const columns = useMemo<ColumnDef<HeldAddon>[]>(
    () => [
      {
        cell: ({ row }) => <AddonCell row={row.original} />,
        enableSorting: false,
        header: t(KEYS.addon),
        id: 'addon',
      },
      {
        cell: ({ row }) => (
          <QuantityCell maySetQuantity={maySetQuantity} row={row.original} />
        ),
        enableSorting: false,
        header: t(KEYS.quantity),
        id: 'quantity',
      },
      {
        cell: ({ row }) => <PriceCell row={row.original} />,
        enableSorting: false,
        header: t(KEYS.price),
        id: 'price',
      },
      {
        cell: ({ row }) =>
          formatDate(row.original.held.attachedAt, i18n.language),
        enableSorting: false,
        header: t(KEYS.since),
        id: 'since',
      },
      ...(mayDetach
        ? [createActionsColumn<HeldAddon>((row) => <RemoveCell row={row} />)]
        : []),
    ],
    [i18n.language, mayDetach, maySetQuantity, t],
  );

  return (
    <DataTable
      columns={columns}
      data={[...rows]}
      getRowId={(row) => row.held.id}
      pagination={false}
      variant="simple"
    />
  );
}
