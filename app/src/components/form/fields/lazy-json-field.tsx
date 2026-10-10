import { type ComponentProps, lazy, Suspense } from 'react';
import { DialogFormSkeleton } from '@/components/dialog/dialog-form-skeleton';

// CodeMirror is by far the heaviest thing a form field pulls in, so the JSON field
// alone is fetched when a form first draws it. It carries its own boundary: the
// editor arriving must not replace the form around it with a placeholder.
const JsonFieldEditor = lazy(
  () => import('@/components/form/fields/json-field'),
);

type LazyJsonFieldProps = ComponentProps<typeof JsonFieldEditor>;

const LazyJsonField = (props: LazyJsonFieldProps) => (
  <Suspense
    fallback={<DialogFormSkeleton className={props.className} fields={1} />}
  >
    <JsonFieldEditor {...props} />
  </Suspense>
);

export default LazyJsonField;
