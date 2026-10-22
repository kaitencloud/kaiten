import { createFileRoute } from '@tanstack/react-router';
import {
  AccessPage,
  parseAccessSearch,
  type AccessSearch,
} from '@/features/user-management';
import i18n from '@/lib/i18n/config';

export const Route = createFileRoute('/settings/access')({
  component: AccessRoute,
  validateSearch: parseAccessSearch,
  beforeLoad: () => ({ getTitle: () => i18n.t('Pages.Access.title') }),
});

function AccessRoute() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  function changeSearch(next: AccessSearch) {
    const editorChanged =
      next.manageUser !== search.manageUser ||
      next.manageRole !== search.manageRole ||
      next.createRole !== search.createRole;
    void navigate({ search: next, replace: !editorChanged });
  }
  return <AccessPage search={search} onSearchChange={changeSearch} />;
}
