import { useState } from 'react';

export function useSideNavIntegrationsState(isIntegrationsActive: boolean) {
  const [isIntegrationsOpen, setIsIntegrationsOpen] =
    useState(isIntegrationsActive);
  const [isIntegrationsPopoverOpen, setIsIntegrationsPopoverOpen] =
    useState(false);
  const [isIntegrationsTooltipSuppressed, setIsIntegrationsTooltipSuppressed] =
    useState(false);
  const [prevIsIntegrationsActive, setPrevIsIntegrationsActive] =
    useState(isIntegrationsActive);

  if (isIntegrationsActive !== prevIsIntegrationsActive) {
    setPrevIsIntegrationsActive(isIntegrationsActive);
    if (isIntegrationsActive) {
      setIsIntegrationsOpen(true);
    }
    setIsIntegrationsPopoverOpen(false);
  }

  const handleTriggerPointerLeave = () => {
    setIsIntegrationsTooltipSuppressed(false);
  };

  const handleSubItemClick = () => {
    setIsIntegrationsTooltipSuppressed(true);
    setIsIntegrationsPopoverOpen(false);
  };

  const toggleIntegrationsMenu = () => {
    setIsIntegrationsOpen((open) => !open);
  };

  return {
    handleSubItemClick,
    handleTriggerPointerLeave,
    isIntegrationsOpen,
    isIntegrationsPopoverOpen,
    isIntegrationsTooltipSuppressed,
    setIsIntegrationsPopoverOpen,
    toggleIntegrationsMenu,
  };
}
