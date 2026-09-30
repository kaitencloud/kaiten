import { createFileRoute } from '@tanstack/react-router';
import { lazy, Suspense } from 'react';

const DashboardPageContent = lazy(() =>
  import('@/features/dashboard').then((m) => ({
    default: m.DashboardPageContent,
  })),
);

export const Route = createFileRoute('/dashboard/')({
  component: () => (
    <Suspense fallback={null}>
      <DashboardPageContent />
    </Suspense>
  ),
});
