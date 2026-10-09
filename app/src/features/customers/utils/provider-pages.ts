/**
 * Where a customer comes back to from a page the payment provider hosts: its own page
 * in the console. The provider appends what it needs (`kaiten_setup_session` for a
 * setup page), and the API accepts https, or http on localhost.
 */
export const getCustomerReturnUrl = (customerSlug: string) =>
  `${window.location.origin}/customers/${encodeURIComponent(customerSlug)}`;

/** Sends the whole page to one the provider hosts: a setup page or the portal, which come back to the console. */
export const leaveToProvider = (url: string) => {
  window.location.assign(url);
};
