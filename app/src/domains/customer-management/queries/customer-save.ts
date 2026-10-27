import { getCustomer, updateCustomer } from '@/api-client';
import type { CustomerWritable } from '@/api-client';
import { FRESH_READ_OPTIONS, writeOnFresh } from '@/lib/api/fresh-write';
import { customerToUpdateBody } from '../logic';

export type SaveCustomerVariables = {
  customerSlug: string;
  /** What the form sends, built from the customer it opened with. */
  edited: CustomerWritable;
  /** What the form opened with, built by the function that built `edited`. */
  opened: CustomerWritable;
};

/**
 * Updates a customer without overwriting what changed since the form opened.
 * The update replaces the customer as a whole, so the customer is read again
 * first and the form's changes are applied on top of it: see `writeOnFresh`. A
 * customer deleted meanwhile is refused by the read, and nothing is written.
 */
export function saveCustomerOnFresh({
  customerSlug,
  edited,
  opened,
}: SaveCustomerVariables) {
  return writeOnFresh({
    edited,
    opened,
    read: async () => {
      const { data } = await getCustomer({
        ...FRESH_READ_OPTIONS,
        path: { customerSlug },
        throwOnError: true,
      });

      return data;
    },
    restate: customerToUpdateBody,
    write: async (body) => {
      const { data } = await updateCustomer({
        body,
        path: { customerSlug },
        throwOnError: true,
      });

      return data;
    },
  });
}
