import {
  Boxes,
  Braces,
  FileText,
  Flag,
  type LucideIcon,
  MapPinned,
  Package,
  Rocket,
  Server,
  Tag,
  UserKey,
  Users,
} from 'lucide-react';

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
} as const satisfies Record<string, LucideIcon>;

export type DataModelIconKey = keyof typeof dataModelIcons;
