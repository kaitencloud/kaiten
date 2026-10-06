import { useState } from 'react';

/**
 * The state of a collapsible section of the side navigation (Integrations,
 * Billing): open or not when the nav is expanded, and its popover and tooltip
 * when the nav is collapsed to icons. The section opens by itself when the user
 * navigates into it.
 */
export function useSideNavMenuState(isActive: boolean) {
  const [isOpen, setIsOpen] = useState(isActive);
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [isTooltipSuppressed, setIsTooltipSuppressed] = useState(false);
  const [prevIsActive, setPrevIsActive] = useState(isActive);

  if (isActive !== prevIsActive) {
    setPrevIsActive(isActive);
    if (isActive) {
      setIsOpen(true);
    }
    setIsPopoverOpen(false);
  }

  const handleTriggerPointerLeave = () => {
    setIsTooltipSuppressed(false);
  };

  const handleSubItemClick = () => {
    setIsTooltipSuppressed(true);
    setIsPopoverOpen(false);
  };

  const toggle = () => {
    setIsOpen((open) => !open);
  };

  return {
    handleSubItemClick,
    handleTriggerPointerLeave,
    isOpen,
    isPopoverOpen,
    isTooltipSuppressed,
    setIsPopoverOpen,
    toggle,
  };
}
