/**
 * The two looks of an action on a version: a compact ghost button in the row of the
 * versions table, an outline one in the header of the detail card. The same look is
 * worn by the lifecycle action and the default flag of a version, so that a row's
 * actions line up.
 */
export const ROW_ACTION_LOOKS = {
  card: {
    className: 'gap-1',
    disabledClassName: 'gap-1',
    variant: 'outline',
    wrapperClassName: 'inline-flex rounded-md',
  },
  row: {
    className:
      'gap-1 px-0 text-primary-subtle-foreground hover:text-primary-subtle-foreground',
    disabledClassName: 'gap-1 px-0',
    variant: 'ghost',
    wrapperClassName: 'inline-flex rounded-sm',
  },
} as const;

/** The same two looks for the deletion of a draft, in the tone of a destructive action. */
export const DELETE_ACTION_LOOKS = {
  card: { className: 'gap-1', variant: 'outline' },
  row: {
    className:
      'gap-1 px-0 text-destructive-subtle-foreground hover:text-destructive-subtle-foreground',
    variant: 'ghost',
  },
} as const;

export type RowActionAppearance = keyof typeof ROW_ACTION_LOOKS;
