import type { PropsWithChildren } from 'react';

export const TableActions = (props: PropsWithChildren) => (
  <div
    className="flex justify-end space-x-2"
    onClick={(event) => event.stopPropagation()}
  >
    {props.children}
  </div>
);
