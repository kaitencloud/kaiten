import { Store, useStore } from '@tanstack/react-store';
import { useCallback, useEffect, useState } from 'react';
import type { FilterToolbarUiState } from '../types/toolbar.types';
import type { UseFilterBuilderResult } from './use-filter-builder';

const INITIAL_UI_STATE: FilterToolbarUiState = {
  filterMenuOpen: false,
  addFilterOpen: false,
  advancedOpen: false,
  isFilterRowVisible: false,
  openNormalFilterId: null,
};

const useFilterToolbarUiStore = () => {
  const [uiStore] = useState(
    () => new Store<FilterToolbarUiState>({ ...INITIAL_UI_STATE }),
  );
  const uiState = useStore(uiStore, (snapshot) => snapshot);

  const setFilterMenuOpen = useCallback(
    (open: boolean) => {
      uiStore.setState((state) =>
        state.filterMenuOpen === open
          ? state
          : { ...state, filterMenuOpen: open },
      );
    },
    [uiStore],
  );

  const setAddFilterOpen = useCallback(
    (open: boolean) => {
      uiStore.setState((state) =>
        state.addFilterOpen === open
          ? state
          : { ...state, addFilterOpen: open },
      );
    },
    [uiStore],
  );

  const setAdvancedOpen = useCallback(
    (open: boolean) => {
      uiStore.setState((state) =>
        state.advancedOpen === open ? state : { ...state, advancedOpen: open },
      );
    },
    [uiStore],
  );

  const setOpenNormalFilterId = useCallback(
    (fieldId: string | null) => {
      uiStore.setState((state) =>
        state.openNormalFilterId === fieldId
          ? state
          : { ...state, openNormalFilterId: fieldId },
      );
    },
    [uiStore],
  );

  return {
    uiState,
    uiStore,
    setAddFilterOpen,
    setAdvancedOpen,
    setFilterMenuOpen,
    setOpenNormalFilterId,
  };
};

const useFilterToolbarUiEffects = <T>({
  activeFilterCount,
  controller,
  setOpenNormalFilterId,
  uiState,
  uiStore,
}: {
  activeFilterCount: number;
  controller: UseFilterBuilderResult<T>;
  setOpenNormalFilterId: (fieldId: string | null) => void;
  uiState: FilterToolbarUiState;
  uiStore: Store<FilterToolbarUiState>;
}) => {
  useEffect(() => {
    if (activeFilterCount > 0) {
      return;
    }

    uiStore.setState((state) => {
      if (
        !state.isFilterRowVisible &&
        state.openNormalFilterId === null &&
        !state.advancedOpen
      ) {
        return state;
      }

      return {
        ...state,
        isFilterRowVisible: false,
        openNormalFilterId: null,
        advancedOpen: false,
      };
    });
  }, [activeFilterCount, uiStore]);

  useEffect(() => {
    if (!uiState.openNormalFilterId) {
      return;
    }

    const openableFilterIds = [
      ...controller.normal.activeFilterIds,
      ...controller.normal.quickAccessFilterIds,
    ];
    if (!openableFilterIds.includes(uiState.openNormalFilterId)) {
      setOpenNormalFilterId(null);
    }
  }, [
    controller.normal.activeFilterIds,
    controller.normal.quickAccessFilterIds,
    setOpenNormalFilterId,
    uiState.openNormalFilterId,
  ]);
};

const useFilterToolbarUiHandlers = <T>({
  activeFilterCount,
  canAddAdvancedFilter,
  controller,
  uiStore,
}: {
  activeFilterCount: number;
  canAddAdvancedFilter: boolean;
  controller: UseFilterBuilderResult<T>;
  uiStore: Store<FilterToolbarUiState>;
}) => {
  const handleSelectFilter = useCallback(
    (fieldId: string) => {
      controller.normal.addFilter(fieldId);
      uiStore.setState((state) => ({
        ...state,
        isFilterRowVisible: true,
        filterMenuOpen: false,
        addFilterOpen: false,
        openNormalFilterId: fieldId,
      }));
    },
    [controller.normal, uiStore],
  );

  const handleOpenAdvancedFromMenu = useCallback(() => {
    if (!canAddAdvancedFilter) {
      return;
    }

    if (controller.advanced.rules.length === 0) {
      controller.advanced.addRule();
    }

    uiStore.setState((state) => ({
      ...state,
      isFilterRowVisible: true,
      advancedOpen: true,
      filterMenuOpen: false,
      addFilterOpen: false,
    }));
  }, [canAddAdvancedFilter, controller.advanced, uiStore]);

  const handleFilterButtonClick = useCallback(() => {
    if (activeFilterCount === 0) {
      return;
    }

    uiStore.setState((state) => {
      const isFilterRowVisible = !state.isFilterRowVisible;
      return {
        ...state,
        isFilterRowVisible,
        // Hiding the row closes any open filter popover in the same update,
        // instead of bouncing through a separate effect after the render.
        openNormalFilterId: isFilterRowVisible
          ? state.openNormalFilterId
          : null,
      };
    });
  }, [activeFilterCount, uiStore]);

  return {
    handleFilterButtonClick,
    handleOpenAdvancedFromMenu,
    handleSelectFilter,
  };
};

export function useFilterToolbarUiState<T>(
  controller: UseFilterBuilderResult<T>,
  showAdvancedOption: boolean,
) {
  const {
    uiState,
    uiStore,
    setAddFilterOpen,
    setAdvancedOpen,
    setFilterMenuOpen,
    setOpenNormalFilterId,
  } = useFilterToolbarUiStore();
  const activeNormalCount = controller.normal.activeFilterIds.length;
  const activeAdvancedCount = controller.advanced.ruleCount;
  const activeFilterCount = activeNormalCount + activeAdvancedCount;
  const hasAvailableNormalFilters =
    controller.normal.availableFields.length > 0;
  const canAddAdvancedFilter =
    showAdvancedOption && controller.advanced.ruleCount === 0;
  const canOpenFilterMenu = hasAvailableNormalFilters || canAddAdvancedFilter;
  const showFilterRow = uiState.isFilterRowVisible && activeFilterCount > 0;
  const showAddFilterButton = showFilterRow && canOpenFilterMenu;

  useFilterToolbarUiEffects({
    activeFilterCount,
    controller,
    setOpenNormalFilterId,
    uiState,
    uiStore,
  });
  const handlers = useFilterToolbarUiHandlers({
    activeFilterCount,
    canAddAdvancedFilter,
    controller,
    uiStore,
  });

  return {
    ...uiState,
    activeAdvancedCount,
    activeFilterCount,
    activeNormalCount,
    canAddAdvancedFilter,
    canOpenFilterMenu,
    ...handlers,
    hasAvailableNormalFilters,
    setAddFilterOpen,
    setAdvancedOpen,
    setFilterMenuOpen,
    setOpenNormalFilterId,
    showAddFilterButton,
    showFilterRow,
  };
}
