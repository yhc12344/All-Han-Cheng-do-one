import { create } from "zustand";

interface PinnedWidgetsState {
  pinnedWidgets: string[];
  togglePinWidget: (widgetId: string) => void;
  isPinned: (widgetId: string) => boolean;
}

const STORAGE_KEY = "fit_pinned_overview_widgets";

export const usePinnedWidgetsStore = create<PinnedWidgetsState>((set, get) => {
  let initialWidgets: string[] = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      initialWidgets = JSON.parse(raw);
    }
  } catch {
    // Ignore invalid persisted data
  }

  return {
    pinnedWidgets: initialWidgets,
    togglePinWidget: (widgetId: string) => {
      set((state) => {
        const next = state.pinnedWidgets.includes(widgetId)
          ? state.pinnedWidgets.filter((id) => id !== widgetId)
          : [...state.pinnedWidgets, widgetId];
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
        return { pinnedWidgets: next };
      });
    },
    isPinned: (widgetId: string) => {
      return get().pinnedWidgets.includes(widgetId);
    },
  };
});
