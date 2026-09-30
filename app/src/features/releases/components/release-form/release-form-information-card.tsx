import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import type { TFunction } from 'i18next';
import { generateSlug } from '@/functionals/slug';
import type { useReleaseForm } from '../../hooks/use-release-form';

type ReleaseFormInformationCardProps = {
  form: ReturnType<typeof useReleaseForm>['form'];
  t: TFunction;
};

export function ReleaseFormInformationCard({
  form,
  t,
}: ReleaseFormInformationCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {t('Pages.Releases.Deployments.Form.steps.metadata.title')}
        </CardTitle>
        <CardDescription>
          {t('Pages.Releases.Deployments.Form.steps.metadata.description')}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form.AppField name="version">
          {(field: any) => (
            <field.TextField
              className="w-full"
              label={t('Features.Releases.Form.version')}
              required
              placeholder="v1.0.0"
              onChange={(value: string) =>
                form.setFieldValue('slug', generateSlug(value))
              }
            />
          )}
        </form.AppField>

        <form.AppField name="slug">
          {(field: any) => (
            <field.TextField
              className="w-full"
              label={t('Features.Releases.Form.slug')}
              placeholder={t('Features.Releases.Form.releaseSlugPlaceholder')}
              description={t('Features.Releases.Form.slugDescription')}
            />
          )}
        </form.AppField>

        <form.AppField name="description">
          {(field: any) => (
            <field.TextAreaField
              className="w-full"
              label={t('Features.Releases.Form.description')}
              placeholder={t('Features.Releases.Form.descriptionPlaceholder')}
            />
          )}
        </form.AppField>
      </CardContent>
    </Card>
  );
}
