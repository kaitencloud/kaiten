import { Layers3, Server } from 'lucide-react';
import type { MetadataResourceType } from '../types';

type ResourceTypeIconProps = {
  className?: string;
  resourceType: MetadataResourceType;
};

// A component rather than a helper returning a component: picking the icon into
// a local and rendering it as `<Icon />` reads as a component created during
// render, which is the thing that remounts subtrees when it is not stable.
export function ResourceTypeIcon({
  className,
  resourceType,
}: ResourceTypeIconProps) {
  return resourceType === 'DEPLOYMENT_ZONE' ? (
    <Layers3 className={className} />
  ) : (
    <Server className={className} />
  );
}
