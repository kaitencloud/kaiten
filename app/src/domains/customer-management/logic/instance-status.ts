import type { TFunction } from 'i18next';
import type { Instance } from '@/api-client';

export type InstanceStatus = NonNullable<Instance['status']>;

export const DEFAULT_INSTANCE_STATUS: InstanceStatus = 'HEALTHY';

export const resolveInstanceStatus = (
  status: Instance['status'],
): InstanceStatus => status ?? DEFAULT_INSTANCE_STATUS;

export const INSTANCE_STATUS_VALUES = [
  'HEALTHY',
  'DEGRADED',
  'INCIDENT',
  'MAINTENANCE',
] as const satisfies readonly InstanceStatus[];

const STATUS_LABEL_KEYS = {
  HEALTHY: 'Pages.Customers.Instances.Detail.status.healthy',
  DEGRADED: 'Pages.Customers.Instances.Detail.status.degraded',
  INCIDENT: 'Pages.Customers.Instances.Detail.status.incident',
  MAINTENANCE: 'Pages.Customers.Instances.Detail.status.maintenance',
} satisfies Record<InstanceStatus, string>;

const STATUS_FALLBACK_LABELS = {
  HEALTHY: 'Healthy',
  DEGRADED: 'Degraded',
  INCIDENT: 'Incident',
  MAINTENANCE: 'Maintenance',
} satisfies Record<InstanceStatus, string>;

export const getInstanceStatusLabel = (
  t: TFunction,
  status: Instance['status'],
) => {
  const resolvedStatus = resolveInstanceStatus(status);
  return t(
    STATUS_LABEL_KEYS[resolvedStatus],
    STATUS_FALLBACK_LABELS[resolvedStatus],
  );
};

export const getInstanceStatusFilterOptions = (t: TFunction) =>
  INSTANCE_STATUS_VALUES.map((status) => ({
    label: getInstanceStatusLabel(t, status),
    value: status,
  }));
