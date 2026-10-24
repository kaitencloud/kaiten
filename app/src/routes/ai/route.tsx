import { createFileRoute, Outlet } from '@tanstack/react-router';
import i18n from '@/lib/i18n/config';
export const Route = createFileRoute('/ai')({
  component: Outlet,
  beforeLoad: () => ({ getTitle: () => i18n.t('AI.title') }),
});
