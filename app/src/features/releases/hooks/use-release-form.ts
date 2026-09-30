import { useMutation } from '@tanstack/react-query';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { getApiErrorMessage } from '@/lib/errors';
import {
  type ComponentWritable,
  createComponent,
  createRelease,
} from '@/api-client';
import { useAppForm } from '@/hooks/form';
import { invalidateReleaseQueries } from '../queries';
import {
  initialReleaseFormValues,
  normalizeReleaseFormValues,
  type ReleaseFormComponentPatch,
  type ReleaseFormValues,
  releaseFormSchema,
} from '../schemas/release.schema';
import type {
  ReleaseManagementOverviewComponent,
  ReleaseManagementOverviewRelease,
} from '../types';

function matchesInheritedComponent(
  patch: ReleaseFormComponentPatch,
  component: ReleaseManagementOverviewComponent,
) {
  return (
    patch.componentId === component.id ||
    (patch.componentId === '' && patch.componentSlug === component.slug)
  );
}

function findPreviousRelease(
  releases: ReleaseManagementOverviewRelease[],
  previousReleaseId: string,
) {
  return releases.find((release) => release.id === previousReleaseId);
}

const toOptionalValue = (value: string) => {
  const trimmedValue = value.trim();
  return trimmedValue === '' ? undefined : trimmedValue;
};

function requireResponseData<T>(data: T | undefined, message: string): T {
  if (data === undefined) {
    throw new Error(message);
  }

  return data;
}

function buildAddedComponentBody(
  patch: ReleaseFormComponentPatch,
): ComponentWritable {
  return {
    description: toOptionalValue(patch.description),
    name: patch.name.trim(),
    slug: toOptionalValue(patch.slug),
    version: patch.version.trim(),
  };
}

function buildDerivedComponentBody(
  component: ReleaseManagementOverviewComponent,
  patch: ReleaseFormComponentPatch,
): ComponentWritable {
  return {
    description:
      patch.description === ''
        ? (component.description ?? undefined)
        : patch.description,
    name: patch.name === '' ? component.name : patch.name,
    previousComponentId: component.id,
    slug: toOptionalValue(patch.slug),
    version: patch.version.trim(),
  };
}

async function createComponentAndReturnId(component: ComponentWritable) {
  const { data } = await createComponent({
    body: component,
  });

  return requireResponseData(
    data,
    'Component creation succeeded without a response payload',
  ).id;
}

async function resolveReleaseComponentIds(
  value: ReleaseFormValues,
  releases: ReleaseManagementOverviewRelease[],
) {
  const componentIds = new Set<string>();
  const previousRelease =
    value.creationMode === 'existing'
      ? findPreviousRelease(releases, value.previousReleaseId)
      : undefined;

  if (previousRelease) {
    for (const component of previousRelease.components ?? []) {
      const patch = value.componentPatches.find(
        (candidate) =>
          candidate.op !== 'add' &&
          matchesInheritedComponent(candidate, component),
      );

      if (!patch) {
        componentIds.add(component.id);
        continue;
      }

      if (patch.op === 'remove') {
        continue;
      }

      if (patch.op === 'update' && patch.resolvedForkComponentId) {
        componentIds.add(patch.resolvedForkComponentId);
        continue;
      }

      componentIds.add(
        await createComponentAndReturnId(
          buildDerivedComponentBody(component, patch),
        ),
      );
    }
  }

  for (const selectedComponentId of value.selectedComponentIds) {
    componentIds.add(selectedComponentId);
  }

  const addedComponents = value.componentPatches.filter(
    (patch): patch is ReleaseFormComponentPatch => patch.op === 'add',
  );

  for (const addedComponent of addedComponents) {
    componentIds.add(
      await createComponentAndReturnId(buildAddedComponentBody(addedComponent)),
    );
  }

  return [...componentIds];
}

type UseReleaseFormProps = {
  releases: ReleaseManagementOverviewRelease[];
};

export const useReleaseForm = ({ releases }: UseReleaseFormProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { queryClient } = useRouteContext({ from: '__root__' });

  const createMutation = useMutation({
    mutationFn: async (value: ReleaseFormValues) => {
      const componentIds = await resolveReleaseComponentIds(value, releases);

      const { data } = await createRelease({
        body: normalizeReleaseFormValues(value, componentIds),
      });

      return requireResponseData(
        data,
        'Release creation succeeded without a response payload',
      );
    },
    onSuccess: async (createdRelease) => {
      await invalidateReleaseQueries(queryClient);
      // Land on what was just created: the list is one click away.
      if (createdRelease.slug) {
        navigate({
          to: '/releases/$releaseSlug',
          params: { releaseSlug: createdRelease.slug },
        });
        return;
      }
      navigate({ to: '/releases' });
    },
  });

  // Without any existing release to inherit from, the base selection step is
  // meaningless: the form starts directly in "scratch" mode.
  const defaultValues: ReleaseFormValues = {
    ...initialReleaseFormValues,
    creationMode: releases.length > 0 ? '' : 'scratch',
  };

  const form = useAppForm({
    defaultValues,
    validators: {
      onChange: releaseFormSchema as any,
    },
    onSubmit: async ({ value }) => {
      try {
        await createMutation.mutateAsync(value);
        toast.success(t('Features.Releases.Success.releaseCreated'));
      } catch (e) {
        toast.error(getApiErrorMessage(e));
      }
    },
  });

  const handleCancel = () => {
    navigate({ to: '/releases' });
  };

  return { form, handleCancel, isLoading: createMutation.isPending };
};
