import { createFileRoute } from '@tanstack/react-router';

// The page of the customer, as `index.tsx` is: the layout draws it. It exists for the
// customer whose slug a static route of `/customers` takes (`checkout-sessions`, `new`),
// whose own address is that route's; nothing links here for any other.
export const Route = createFileRoute('/customers/$customerSlug/overview')({});
