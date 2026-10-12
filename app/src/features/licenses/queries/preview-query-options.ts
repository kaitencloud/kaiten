import { allInstancesOptions } from '@/lib/api/all-pages-query-options';

// What the preview of an invoice offers to rate: the instances whose usage can be rated.
// The list is read whole, since the dialog searches it in the browser, under the key of
// the operation so that the invalidation of the instances reaches it. It is not retried: a
// refusal is the dialog's to show, with a way to ask again.

/** Every instance of the organization, for the picker of the usage to rate. */
export const previewInstancesQueryOptions = () => ({
  ...allInstancesOptions(),
  retry: false,
  retryOnMount: false,
});
