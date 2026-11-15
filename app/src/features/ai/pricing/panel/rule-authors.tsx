import { useTranslation } from 'react-i18next';
import { formatDateTime } from '@/lib/format-date';
import type { CardRule } from '../rate-card-model';

const DATE: Intl.DateTimeFormatOptions = {
  dateStyle: 'medium',
  timeStyle: 'short',
};

/**
 * Who last edited a rule and who created it, with when. One line when the
 * rule has not been edited since it was created, by the same person.
 */
export function RuleAuthors({ rule }: { rule: CardRule }) {
  const { t } = useTranslation();
  const { createdAt, createdBy, updatedAt, updatedBy } = rule;
  if (!createdBy && !updatedBy) {
    return null;
  }
  const nameOf = (user: CardRule['createdBy']) =>
    user?.name || t('AI.Panel.authors.unknown');
  const untouched = createdAt === updatedAt && createdBy?.id === updatedBy?.id;

  return (
    <div className="text-xs text-muted-foreground">
      {updatedBy && updatedAt && !untouched ? (
        <p>
          {t('AI.Panel.authors.edited', {
            date: formatDateTime(updatedAt, DATE),
            name: nameOf(updatedBy),
          })}
        </p>
      ) : null}
      {createdBy && createdAt ? (
        <p>
          {t('AI.Panel.authors.created', {
            date: formatDateTime(createdAt, DATE),
            name: nameOf(createdBy),
          })}
        </p>
      ) : null}
    </div>
  );
}
