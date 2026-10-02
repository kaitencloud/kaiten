import type { KeyboardEvent, MouseEvent } from 'react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import type { Entitlement } from '@/api-client';
import { useEntitlementFormMutations } from '../../hooks';
import { EntitlementGroupBadges } from './entitlement-group-badges';
import { EntitlementGroupSelector } from './entitlement-group-selector';
import { entitlementToUpdateBody } from '../../utils/entitlement-writable';

type EntitlementGroupsInlineEditorCellProps = {
  entitlement: Entitlement;
};

const getDisplayGroups = (entitlement: Entitlement) =>
  entitlement.entitlementGroups?.map((group) => ({
    name: group.name,
    slug: group.slug,
  })) ?? [];

const getGroupSlugs = (entitlement: Entitlement) =>
  entitlement.entitlementGroups?.flatMap((group) =>
    group.slug ? [group.slug] : [],
  ) ?? [];

function stopEventPropagation(
  event: MouseEvent<HTMLDivElement> | KeyboardEvent<HTMLDivElement>,
) {
  event.stopPropagation();
}

export function EntitlementGroupsInlineEditorCell({
  entitlement,
}: EntitlementGroupsInlineEditorCellProps) {
  const { updateMutation } = useEntitlementFormMutations();
  const currentDisplayGroups = useMemo(
    () => getDisplayGroups(entitlement),
    [entitlement],
  );
  const currentGroupSlugs = useMemo(
    () => getGroupSlugs(entitlement),
    [entitlement],
  );
  const [draftDisplayGroups, setDraftDisplayGroups] =
    useState(currentDisplayGroups);
  const [draftGroupSlugs, setDraftGroupSlugs] = useState(currentGroupSlugs);
  const [isEditing, setIsEditing] = useState(false);

  const [prevDisplayGroups, setPrevDisplayGroups] =
    useState(currentDisplayGroups);
  if (currentDisplayGroups !== prevDisplayGroups) {
    setPrevDisplayGroups(currentDisplayGroups);
    setDraftDisplayGroups(currentDisplayGroups);
  }
  const [prevGroupSlugs, setPrevGroupSlugs] = useState(currentGroupSlugs);
  if (currentGroupSlugs !== prevGroupSlugs) {
    setPrevGroupSlugs(currentGroupSlugs);
    setDraftGroupSlugs(currentGroupSlugs);
  }

  async function handleGroupSlugsChange(nextGroupSlugs: string[]) {
    const previousDisplayGroups = draftDisplayGroups;
    const previousGroupSlugs = draftGroupSlugs;

    setDraftGroupSlugs(nextGroupSlugs);

    if (!entitlement.slug) {
      return;
    }

    try {
      // PUT is full-replace: build the body from the complete entitlement so
      // the group edit cannot wipe the other writable fields.
      await updateMutation.mutateAsync({
        path: {
          entitlementSlug: entitlement.slug,
        },
        body: entitlementToUpdateBody(entitlement, {
          groupSlugs: nextGroupSlugs,
        }),
      });
    } catch (error) {
      setDraftDisplayGroups(previousDisplayGroups);
      setDraftGroupSlugs(previousGroupSlugs);
      toast.error(getApiErrorMessage(error));
    }
  }

  function handleStartEdit() {
    if (!entitlement.slug || updateMutation.isPending) {
      return;
    }

    setIsEditing(true);
  }

  return (
    <div
      role="none"
      onClick={stopEventPropagation}
      onKeyDown={stopEventPropagation}
    >
      {isEditing ? (
        <EntitlementGroupSelector
          autoFocusSearch
          open={isEditing}
          interactionMode="inline"
          disabled={updateMutation.isPending || !entitlement.slug}
          value={draftGroupSlugs}
          onOpenChange={(nextOpen) => {
            if (!nextOpen) {
              setIsEditing(false);
            }
          }}
          onSelectionResolvedChange={setDraftDisplayGroups}
          onChange={(nextGroupSlugs) => {
            void handleGroupSlugsChange(nextGroupSlugs);
          }}
        />
      ) : (
        <button
          type="button"
          className="w-full text-left"
          onClick={handleStartEdit}
          disabled={updateMutation.isPending || !entitlement.slug}
        >
          <EntitlementGroupBadges groups={draftDisplayGroups} />
        </button>
      )}
    </div>
  );
}
