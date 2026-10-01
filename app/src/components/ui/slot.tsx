import { useRender } from '@base-ui/react/use-render';
import { Children, type HTMLAttributes, type ReactElement, type Ref } from 'react';

// Existing composition consumers share Base UI's prop and ref merging.
export function Slot({ children, ref, ...props }: HTMLAttributes<HTMLElement> & { ref?: Ref<HTMLElement> }) {
  return useRender({
    render: Children.only(children) as ReactElement,
    ref,
    props,
  });
}
