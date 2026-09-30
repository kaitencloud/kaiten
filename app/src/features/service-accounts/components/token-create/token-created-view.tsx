import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Copy } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Page } from '@/functionals/page';
import { dataModelIcons } from '@/lib/data-model-icons';
import { formatDateTime } from '@/lib/format-date';
import type { PlainToken } from '../../types';
import { getScopeBadgeVariant } from '../../utils/constants';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken.Created';

type TokenCreatedViewProps = {
  token: PlainToken;
  serviceAccountName: string;
  onDone: () => void;
};

/**
 * The one moment the token's value exists outside the API, which stores only a
 * hash of it: shown here, copied from here, gone once the page is left.
 */
export function TokenCreatedView({
  token,
  serviceAccountName,
  onDone,
}: TokenCreatedViewProps) {
  const { t } = useTranslation();
  const TokenIcon = dataModelIcons.token;

  const copyToken = async () => {
    if (!token.token) return;
    await navigator.clipboard.writeText(token.token);
    toast.success(t(`${I18N}.copied`));
  };

  return (
    <Page className="h-full min-h-0 overflow-hidden">
      <Page.Header className="pb-4">
        <Page.Leading>
          <Page.Icon>
            <TokenIcon className="size-8 text-primary-subtle-foreground" />
          </Page.Icon>
          <Page.Heading>
            <Page.Title>{t(`${I18N}.title`)}</Page.Title>
            <Page.Subtitle>
              {t(`${I18N}.description`, {
                token: token.name,
                name: serviceAccountName,
              })}
            </Page.Subtitle>
          </Page.Heading>
        </Page.Leading>
      </Page.Header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="space-y-6">
          <Card className="border-success-subtle-foreground/30 bg-success-subtle">
            <CardHeader>
              <CardTitle className="text-success-subtle-foreground">
                {t(`${I18N}.copyTitle`)}
              </CardTitle>
              <CardDescription>{t(`${I18N}.copyWarning`)}</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Input
                value={token.token ?? ''}
                readOnly
                aria-label={token.name}
                className="bg-background font-mono text-sm"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0"
                aria-label={t(`${I18N}.copyToken`)}
                onClick={copyToken}
              >
                <Copy className="size-4" />
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{t(`${I18N}.detailsTitle`)}</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 text-sm sm:grid-cols-[8rem_1fr]">
                <dt className="text-muted-foreground">{t(`${I18N}.scopes`)}</dt>
                <dd className="flex flex-wrap gap-1">
                  {(token.scopes ?? []).map((scope) => (
                    <Badge
                      key={scope}
                      variant={getScopeBadgeVariant(scope)}
                      className="font-mono text-xs"
                    >
                      {scope}
                    </Badge>
                  ))}
                </dd>
                <dt className="text-muted-foreground">
                  {t(`${I18N}.expires`)}
                </dt>
                <dd>
                  {token.expiresAt
                    ? formatDateTime(token.expiresAt)
                    : t(`${I18N}.never`)}
                </dd>
              </dl>
            </CardContent>
          </Card>
        </div>

        <div className="sticky bottom-0 mt-6 flex justify-end border-t bg-app-background py-4">
          <Button type="button" onClick={onDone}>
            {t(`${I18N}.done`)}
          </Button>
        </div>
      </div>
    </Page>
  );
}
