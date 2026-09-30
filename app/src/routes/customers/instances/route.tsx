import { createFileRoute, Outlet } from '@tanstack/react-router';
import { Suspense } from 'react';

export const Route = createFileRoute('/customers/instances')({
  component: InstancesLayout,
});

function InstancesLayout() {
  return (
    <Suspense fallback={null}>
      <Outlet />
    </Suspense>
  );
}
