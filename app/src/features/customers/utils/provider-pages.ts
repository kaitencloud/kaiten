import { getCustomerDetailPath } from './customer-path';

/**
 * Where a customer comes back to from a page the payment provider hosts: its own page
 * in the console, at the address that reaches it even when its slug is one a static
 * route of `/customers` takes. The provider appends what it needs (`kaiten_setup_session` for a
 * setup page), and the API accepts https, or http on localhost.
 */
export const getCustomerReturnUrl = (customerSlug: string) =>
  `${window.location.origin}${getCustomerDetailPath(customerSlug)}`;

/** Sends the whole page to one the provider hosts: a setup page or the portal, which come back to the console. */
export const leaveToProvider = (url: string) => {
  window.location.assign(url);
};
