import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseEllipsisParams {
  onEllipsisChange?: (isEllipsis: boolean) => void;
}

const ELLIPSIS_CLASS = 'whitespace-nowrap overflow-hidden text-ellipsis';

export const useEllipsis = (params: UseEllipsisParams = {}) => {
  const { onEllipsisChange } = params;
  const ref = useRef<HTMLElement>(null);
  const [isEllipsis, setIsEllipsis] = useState(false);

  const checkEllipsis = useCallback(() => {
    if (ref.current) {
      const newIsEllipsis = ref.current.offsetWidth < ref.current.scrollWidth;
      setIsEllipsis(newIsEllipsis);

      // Call the callback if provided
      if (onEllipsisChange) {
        onEllipsisChange(newIsEllipsis);
      }
    }
  }, [onEllipsisChange]);

  useEffect(() => {
    // Check ellipsis when the component mounts
    checkEllipsis();

    // Create observers to detect changes in the element
    const resizeObserver = new ResizeObserver(() => {
      checkEllipsis();
    });

    const mutationObserver = new MutationObserver(() => {
      checkEllipsis();
    });

    // Start observing the element if it exists
    if (ref.current) {
      resizeObserver.observe(ref.current);
      mutationObserver.observe(ref.current, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    }

    // Clean up the observers when the component unmounts
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, [checkEllipsis]);

  return {
    className: ELLIPSIS_CLASS,
    ref,
    isEllipsis,
  };
};
