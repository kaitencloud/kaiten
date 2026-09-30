import { formatDate } from '@/lib/format-date';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DeleteConfirmationDialog } from '@/components/dialog';
import type { Token, User } from '../../types';
import { getScopeBadgeVariant } from '../../utils/constants';

interface TokenListItemProps {
  token: Token;
  onRevoke: () => void;
}

function TokenStatusBadges({
  isExpired,
  isRevoked,
  token,
}: {
  isExpired: boolean;
  isRevoked: boolean;
  token: Token;
}) {
  const { t } = useTranslation();

  return (
    <>
      {isRevoked && (
        <Badge variant="destructive" className="text-xs">
          {t('Pages.Integrations.ServiceAccounts.Token.revoked')}
        </Badge>
      )}
      {isExpired && !isRevoked && (
        <Badge variant="destructive" className="text-xs">
          {t('Pages.Integrations.ServiceAccounts.Token.expired')}
        </Badge>
      )}
      {token.expiresAt && !isExpired && !isRevoked && (
        <Badge variant="outline" className="text-xs">
          {t('Pages.Integrations.ServiceAccounts.Token.expires')}{' '}
          {formatDate(token.expiresAt)}
        </Badge>
      )}
    </>
  );
}

function renderScope(scope: string) {
  return (
    <Badge
      key={scope}
      variant={getScopeBadgeVariant(scope)}
      className="text-xs font-mono"
    >
      {scope}
    </Badge>
  );
}

function TokenScopeBadges({ scopes }: { scopes: string[] }) {
  return <div className="flex gap-1 flex-wrap">{scopes.map(renderScope)}</div>;
}

function TokenAuditInfo({ token }: { token: Token }) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      {token.createdBy && (
        <UserActionInfo
          label={t('Pages.Integrations.ServiceAccounts.Token.createdBy')}
          user={token.createdBy}
          date={token.createdAt}
        />
      )}
      {token.revokedBy && (
        <UserActionInfo
          label={t('Pages.Integrations.ServiceAccounts.Token.revokedOn')}
          user={token.revokedBy}
          date={token.revokedAt}
        />
      )}
    </div>
  );
}

function TokenRevokeAction({
  disabled,
  onRevoke,
  tokenName,
}: {
  disabled: boolean;
  onRevoke: () => void;
  tokenName: string;
}) {
  const { t } = useTranslation();

  if (disabled) {
    return null;
  }

  return (
    <DeleteConfirmationDialog
      trigger={
        <Button
          variant="outline"
          size="sm"
          className="gap-2 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
        >
          <XCircle className="size-3" />
          {t('Pages.Integrations.ServiceAccounts.Token.revoke')}
        </Button>
      }
      title={t('Pages.Integrations.ServiceAccounts.Token.revokeConfirmTitle')}
      description={t(
        'Pages.Integrations.ServiceAccounts.Token.revokeConfirmDescription',
        { name: tokenName },
      )}
      cancelLabel={t('Common.cancel')}
      confirmLabel={t('Pages.Integrations.ServiceAccounts.Token.revoke')}
      onConfirm={onRevoke}
    />
  );
}

function UserActionInfo({
  label,
  user,
  date,
}: {
  label: string;
  user: User;
  date?: string;
}) {
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <span>{label}</span>
      <span className="font-medium text-foreground/70">{user.name}</span>
      {date && (
        <>
          <span>·</span>
          <span>{formatDate(date)}</span>
        </>
      )}
    </span>
  );
}

export function TokenListItem({ token, onRevoke }: TokenListItemProps) {
  const { t } = useTranslation();
  const isExpired = Boolean(
    token.expiresAt && new Date(token.expiresAt) < new Date(),
  );
  const isRevoked = !!token.revokedBy;
  const isDisabled = isExpired || isRevoked;

  return (
    <Card className={isDisabled ? 'opacity-60' : ''}>
      <CardContent className="px-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="font-medium text-sm">{token.name}</span>
              <TokenStatusBadges
                isExpired={isExpired}
                isRevoked={isRevoked}
                token={token}
              />
            </div>

            {token.scopes && token.scopes.length > 0 && (
              <div className="mb-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  {t('Pages.Integrations.ServiceAccounts.Token.scopes')}:
                </p>
                <TokenScopeBadges scopes={token.scopes} />
              </div>
            )}

            <TokenAuditInfo token={token} />
          </div>
          <TokenRevokeAction
            disabled={isDisabled}
            onRevoke={onRevoke}
            tokenName={token.name}
          />
        </div>
      </CardContent>
    </Card>
  );
}
