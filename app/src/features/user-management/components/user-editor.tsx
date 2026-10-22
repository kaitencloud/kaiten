import { UserAccessForm } from './user-access-form';
import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { ManagedUser } from '@/api-client';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import type { Role } from '../user-management.api';
import { AccessConfirmation } from './access-confirmation';
import { UserStatus } from './user-status';
import { AccessSummary } from './access-summary';
import { ProfileForm } from './profile-form';
import { useIsMutating } from '@tanstack/react-query';

export function UserEditor({
  user,
  roles,
  available,
  currentId,
  onClose,
  canWrite = true,
  actorScopes = ['write:*'],
  grantablePermissions = available,
}: {
  user: ManagedUser;
  roles: Role[];
  available: string[];
  currentId?: string;
  onClose: () => void;
  canWrite?: boolean;
  actorScopes?: string[];
  grantablePermissions?: string[];
}) {
  const { t } = useTranslation();
  const [profileState, setProfileState] = useState({
    dirty: false,
    pending: false,
  });
  const [accessState, setAccessState] = useState({
    dirty: false,
    pending: false,
  });
  const [discard, setDiscard] = useState(false);
  const profileChange = useCallback(
    (dirty: boolean, pending: boolean) => setProfileState({ dirty, pending }),
    [],
  );
  const accessChange = useCallback(
    (dirty: boolean, pending: boolean) => setAccessState({ dirty, pending }),
    [],
  );
  const inFlight = useIsMutating({ mutationKey: ['access-management'] });
  const pending = profileState.pending || accessState.pending || inFlight > 0;
  function close() {
    if (pending) return;
    if (profileState.dirty || accessState.dirty) {
      setDiscard(true);
      return;
    }
    onClose();
  }
  return (
    <Sheet open onOpenChange={(open) => !open && close()}>
      <SheetContent
        className="w-full sm:max-w-xl motion-reduce:animate-none motion-reduce:transition-none"
        showCloseButton={false}
      >
        <SheetHeader className="border-b p-6">
          <SheetTitle>{user.name}</SheetTitle>
          <SheetDescription>
            {t('Pages.Access.userEditorDescription')}
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 pb-6">
          <div className="rounded-md bg-muted px-3 py-2 text-xs">
            <span className="text-muted-foreground">
              {t('Pages.Access.identity')}{' '}
            </span>
            <span className="break-all font-mono">{user.externalId}</span>
          </div>
          {canWrite ? (
            <ProfileForm user={user} onStateChange={profileChange} />
          ) : (
            <div className="space-y-2 text-sm">
              <p>{user.email}</p>
              <p className="text-muted-foreground">
                {t('Pages.Access.readOnlyAccess')}
              </p>
              <AccessSummary
                slugs={user.authorization.roles}
                permissions={user.authorization.permissions}
                roles={roles}
                available={available}
              />
            </div>
          )}
          {canWrite && <UserStatus user={user} currentId={currentId} />}
          {canWrite && (
            <UserAccessForm
              user={user}
              roles={roles}
              available={grantablePermissions}
              actorScopes={actorScopes}
              currentId={currentId}
              onStateChange={accessChange}
            />
          )}
        </div>
        <div className="border-t px-6 py-4">
          <Button variant="outline" disabled={pending} onClick={close}>
            {t('Common.close')}
          </Button>
        </div>
        <AccessConfirmation
          open={discard}
          pending={pending}
          title={t('Pages.Access.discardChanges')}
          description={t('Pages.Access.discardDescription')}
          confirmLabel={t('Pages.Access.discard')}
          destructive
          onCancel={() => setDiscard(false)}
          onConfirm={onClose}
        />
      </SheetContent>
    </Sheet>
  );
}
