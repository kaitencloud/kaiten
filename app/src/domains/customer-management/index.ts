// An instance's status and lifecycle stage are read on both the customers and
// the instances screens, so their labels and badges live here, beside the
// read models the two features share.
export { InstanceLifecycleStageBadge, InstanceStatusBadge } from './components';
export {
  BILLING_EMAIL_ERROR_KEYS,
  BILLING_EMAIL_MAX_LENGTH,
  billingEmailSchema,
  customerBillingEmailToUpdateBody,
  DEFAULT_INSTANCE_STATUS,
  getInstanceStatusFilterOptions,
  getInstanceStatusLabel,
  INSTANCE_STATUS_VALUES,
  resolveInstanceStatus,
  getLifecycleStageLabel,
  getLifecycleStageSuggestions,
  isDefaultLifecycleStage,
  isValidBillingEmail,
  LIFECYCLE_STAGE_DEFAULTS,
} from './logic';
export type { InstanceStatus, DefaultLifecycleStage } from './logic';
export {
  forgetDeletedCustomerQueries,
  invalidateCustomerQueries,
  forgetDeletedInstanceQueries,
  invalidateInstanceQueries,
  invalidateInstancesListQueries,
  GET_CUSTOMERS_WITH_INSTANCES,
  customersWithInstancesBaseQueryKey,
  customersWithInstancesQueryOptions,
  useCustomersWithInstances,
  GET_INSTANCES_WITH_RELATIONS,
  instancesWithRelationsBaseQueryKey,
  instancesWithRelationsQueryKey,
  useInstancesWithRelations,
} from './queries';
export type { Customer, CustomerLicenseType } from './types';
