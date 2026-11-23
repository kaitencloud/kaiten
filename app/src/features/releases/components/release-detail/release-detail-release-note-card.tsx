import { useTranslation } from 'react-i18next';
import { DetailCard } from '@/functionals/detail-card';
import { SafeMarkdown } from '@/functionals/markdown';

type ReleaseNoteCardProps = {
  releaseNote?: string | null;
};

// The release notes, written when the release was created. A release without
// notes draws no card at all. The text is the author's markdown, so it goes
// through SafeMarkdown and nothing else.
export function ReleaseNoteCard({ releaseNote }: ReleaseNoteCardProps) {
  const { t } = useTranslation();

  if (!releaseNote?.trim()) {
    return null;
  }

  return (
    <DetailCard className="lg:col-span-3">
      <DetailCard.Header>
        <DetailCard.Title>
          {t(
            'Pages.Releases.Detail.Overview.releaseNote.title',
            'Release notes',
          )}
        </DetailCard.Title>
        <DetailCard.Description>
          {t(
            'Pages.Releases.Detail.Overview.releaseNote.description',
            'Written with the release when it was created.',
          )}
        </DetailCard.Description>
      </DetailCard.Header>
      <DetailCard.Content>
        <SafeMarkdown>{releaseNote}</SafeMarkdown>
      </DetailCard.Content>
    </DetailCard>
  );
}
