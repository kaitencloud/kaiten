import { useCallback, useState } from 'react';
import { DeletionRefusalDialog } from '../components/deletion-refusal-dialog';
import { type DeletionRefusal, readDeletionRefusal } from '../logic';

type ShownRefusal = { refusal: DeletionRefusal; slug?: string };

/**
 * What a place that deletes a record needs to explain a refusal of billing in
 * place of a toast. `showRefusal(error)` is called with the failure of the
 * deletion: when it is one of the refusals that say what stands in the way, it
 * opens the dialog and answers true, and the caller shows nothing else; any other
 * failure answers false and keeps the message it had. `dialog` is what to render
 * beside the action, nothing while there is no refusal.
 *
 * `slug` is the record the refusal is about, for the links to what to do next. A
 * row that asks for the deletion of its own record gives it here. A list whose rows
 * leave it before the API has answered holds the hook above them instead, since a
 * dialog kept by a row goes with the row when it unmounts, and names the record on
 * each call: `showRefusal(error, slug)`.
 */
export function useDeletionRefusal(slug?: string) {
  const [shown, setShown] = useState<ShownRefusal | null>(null);

  const showRefusal = useCallback(
    (error: unknown, recordSlug: string | undefined = slug): boolean => {
      const read = readDeletionRefusal(error);
      if (read) {
        setShown({ refusal: read, slug: recordSlug });
      }

      return read !== undefined;
    },
    [slug],
  );

  return {
    dialog: shown ? (
      <DeletionRefusalDialog
        onClose={() => setShown(null)}
        refusal={shown.refusal}
        slug={shown.slug}
      />
    ) : null,
    showRefusal,
  };
}
