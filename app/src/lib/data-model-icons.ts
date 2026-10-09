import {
  Boxes,
  Braces,
  Coins,
  FileText,
  Flag,
  KeySquare,
  type LucideIcon,
  MapPinned,
  Package,
  Puzzle,
  Receipt,
  ReceiptText,
  Repeat,
  Rocket,
  Server,
  Tag,
  Ticket,
  UserKey,
  Users,
} from 'lucide-react';

// `billing` is not an entity but the area of billing as a whole (its settings, its
// Stripe connector, the page that says it is off): it keeps the receipt with a
// dollar sign, so that these do not read as one invoice. An invoice itself is the
// receipt with its lines of text.
export const dataModelIcons = {
  customer: Users,
  instance: Server,
  entitlement: Boxes,
  featureFlag: Flag,
  license: FileText,
  version: Tag,
  release: Rocket,
  component: Package,
  deploymentZone: MapPinned,
  serviceAccount: UserKey,
  token: Braces,
  billing: Receipt,
  invoice: ReceiptText,
  subscription: Repeat,
  price: Coins,
  addon: Puzzle,
  voucher: Ticket,
  publishableKey: KeySquare,
} as const satisfies Record<string, LucideIcon>;

export type DataModelIconKey = keyof typeof dataModelIcons;
