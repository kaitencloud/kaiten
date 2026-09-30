import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useTranslation } from 'react-i18next';
import type { TokenCreateFormApi } from './use-token-create-form';

const I18N = 'Pages.Integrations.ServiceAccounts.NewToken.Details';

export function TokenDetailsCard({ form }: { form: TokenCreateFormApi }) {
  const { t } = useTranslation();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t(`${I18N}.title`)}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-6 md:grid-cols-2">
        <form.AppField name="name">
          {(field) => (
            <field.TextField
              label={t(`${I18N}.nameLabel`)}
              required
              placeholder={t(`${I18N}.namePlaceholder`)}
              description={t(`${I18N}.nameDescription`)}
            />
          )}
        </form.AppField>
        <form.AppField name="expiresAt">
          {(field) => (
            <field.DatePickerField
              useISOString
              label={t(`${I18N}.expirationLabel`)}
              description={t(`${I18N}.expirationDescription`)}
            />
          )}
        </form.AppField>
      </CardContent>
    </Card>
  );
}
