import { useSuspenseQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { getModelOptions } from '@/api-client/@tanstack/react-query.gen';
import { ModelForm } from '@/features/ai';
export const Route = createFileRoute('/ai/models/$modelSlug/edit')({
  component: EditModel,
  loader: ({ context, params }) =>
    context.queryClient.ensureQueryData(getModelOptions({ path: params })),
});
function EditModel() {
  const path = Route.useParams();
  const { data } = useSuspenseQuery(getModelOptions({ path }));
  return <ModelForm model={data} />;
}
