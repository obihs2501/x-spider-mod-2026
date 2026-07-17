import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';

export interface SavedWindowState {
  width: number;
  height: number;
  x: number;
  y: number;
  maximized: boolean;
}

interface WindowStateStore {
  windowState: SavedWindowState | null;
  setWindowState: (state: SavedWindowState) => void;
}

export const useWindowStateStore = create<WindowStateStore>()(
  persist(
    (set) => ({
      windowState: null,
      setWindowState: (windowState) => set({ windowState }),
    }),
    {
      name: 'window-state',
      storage: createTauriFileStorage(),
      version: 1,
    },
  ),
);
