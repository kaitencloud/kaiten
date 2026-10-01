import { formatDate } from '@/lib/format-date';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { CirclePlus, Trash2 } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActionAccordion,
  ActionAccordionActions,
  ActionAccordionContent,
  ActionAccordionHeader,
  ActionAccordionItem,
  ActionAccordionTrigger,
} from '@/components/ui/action-accordion';
import { dataModelIcons } from '@/lib/data-model-icons';
import type { ServiceAccount } from '../../types';
import { TokenList } from '../token-list';

interface ServiceAccountListItemProps {
  sa: ServiceAccount;
  onGenerateToken: (saId: string) => void;
  onDeleteServiceAccount: (saId: string) => void;
  onRevokeToken: (saId: string, tokenId: string) => void;
}

export function ServiceAccountListItem({
  sa,
  onGenerateToken,
  onDeleteServiceAccount,
  onRevokeToken,
}: ServiceAccountListItemProps) {
  const { t } = useTranslation();

  const ServiceAccountIcon = dataModelIcons.serviceAccount;

  const tokenCounts = useMemo(() => {
    const all = sa.tokens?.length ?? 0;
    const revoked = sa.tokens?.filter((t) => !!t.revokedBy).length ?? 0;
    const active = all - revoked;
    return { all, active, revoked };
  }, [sa.tokens]);

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <ActionAccordion className="w-full">
          <ActionAccordionItem value={sa.slug!} className="border-0">
            <ActionAccordionHeader className="px-6">
              <ActionAccordionTrigger className="hover:no-underline">
                <div className="flex items-center gap-3">
                  <ServiceAccountIcon className="size-5 text-primary-subtle-foreground" />
                  <div className="text-left">
                    <div className="font-semibold">{sa.name}</div>
                    <div className="text-sm text-muted-foreground font-normal">
                      {t('Pages.Integrations.ServiceAccounts.tokensCount', {
                        count: tokenCounts.all,
                      })}
                      {sa.createdAt && (
                        <>
                          {' • '}
                          {t(
                            'Pages.Integrations.ServiceAccounts.createdAt',
                          )}{' '}
                          {formatDate(sa.createdAt)}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </ActionAccordionTrigger>
              <ActionAccordionActions>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onGenerateToken(sa.slug!)}
                  className="gap-2"
                >
                  <CirclePlus className="size-4" />
                  {t('Pages.Integrations.ServiceAccounts.generateToken')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  aria-label={t(
                    'Pages.Integrations.ServiceAccounts.deleteServiceAccount',
                  )}
                  onClick={() => onDeleteServiceAccount(sa.slug!)}
                  className="gap-2 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground"
                >
                  <Trash2 className="size-3" />
                </Button>
              </ActionAccordionActions>
            </ActionAccordionHeader>
            <ActionAccordionContent className="px-6 pb-6">
              <div className="pt-2">
                <TokenList
                  tokens={sa.tokens ?? []}
                  onRevokeToken={(tokenSlug) =>
                    onRevokeToken(sa.slug!, tokenSlug)
                  }
                />
              </div>
            </ActionAccordionContent>
          </ActionAccordionItem>
        </ActionAccordion>
      </CardContent>
    </Card>
  );
}
