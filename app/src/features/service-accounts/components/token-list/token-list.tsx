import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import type { Token } from '../../types';
import { TokenListItem } from './token-list-item';

interface TokenListProps {
  tokens: Token[];
  onRevokeToken: (tokenId: string) => void;
}

type TokenFilter = 'all' | 'active' | 'revoked';

export function TokenList({ tokens, onRevokeToken }: TokenListProps) {
  const { t } = useTranslation();
  const [tokenFilter, setTokenFilter] = useState<TokenFilter>('active');

  const filteredTokens = useMemo(() => {
    switch (tokenFilter) {
      case 'active':
        return tokens.filter((token) => !token.revokedBy);
      case 'revoked':
        return tokens.filter((token) => !!token.revokedBy);
      default:
        return tokens;
    }
  }, [tokens, tokenFilter]);

  const tokenCounts = useMemo(() => {
    const all = tokens.length;
    const revoked = tokens.filter((t) => !!t.revokedBy).length;
    const active = all - revoked;
    return { all, active, revoked };
  }, [tokens]);

  if (tokens.length === 0) {
    return (
      <div className="text-center py-6 border rounded-md">
        <p className="text-sm text-muted-foreground">
          {t('Pages.Integrations.ServiceAccounts.noTokens')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <ToggleGroup
          value={[tokenFilter]}
          onValueChange={([value]) => {
            if (value) setTokenFilter(value as TokenFilter);
          }}
          variant="outline"
          size="sm"
        >
          <ToggleGroupItem value="all">
            {t('Pages.Integrations.ServiceAccounts.Token.filterAll')} (
            {tokenCounts.all})
          </ToggleGroupItem>
          <ToggleGroupItem value="active">
            {t('Pages.Integrations.ServiceAccounts.Token.filterActive')} (
            {tokenCounts.active})
          </ToggleGroupItem>
          <ToggleGroupItem value="revoked">
            {t('Pages.Integrations.ServiceAccounts.Token.filterRevoked')} (
            {tokenCounts.revoked})
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <div className="space-y-2">
        {filteredTokens.length === 0 ? (
          <div className="text-center py-6 border rounded-md">
            <p className="text-sm text-muted-foreground">
              {tokenFilter === 'active' && tokenCounts.revoked > 0
                ? t('Pages.Integrations.ServiceAccounts.noActiveTokens')
                : tokenFilter === 'active'
                  ? t('Pages.Integrations.ServiceAccounts.noTokens')
                  : t('Pages.Integrations.ServiceAccounts.noRevokedTokens')}
            </p>
          </div>
        ) : (
          filteredTokens.map((token) => (
            <TokenListItem
              key={token.id}
              token={token}
              onRevoke={() => onRevokeToken(token.slug!)}
            />
          ))
        )}
      </div>
    </div>
  );
}
