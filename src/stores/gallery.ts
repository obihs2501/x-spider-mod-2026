import { create } from 'zustand';

export interface GalleryFolder {
  name: string;
  path: string;
}

export interface GalleryMedia {
  path: string;
  name: string;
  isVideo: boolean;
}

export interface GalleryStore {
  folders: GalleryFolder[];
  setFolders: (folders: GalleryFolder[]) => void;
  foldersLoaded: boolean;
  setFoldersLoaded: (v: boolean) => void;

  currentFolder: GalleryFolder | null;
  setCurrentFolder: (f: GalleryFolder | null) => void;
  medias: GalleryMedia[];
  setMedias: (m: GalleryMedia[]) => void;
  visibleCount: number;
  setVisibleCount: (updater: (c: number) => number) => void;
  resetVisibleCount: () => void;

  // 视图设置
  columns: number;
  setColumns: (c: number) => void;
  fitMode: 'cover' | 'contain';
  setFitMode: (m: 'cover' | 'contain') => void;
}

export const GALLERY_PAGE_SIZE = 100;

/** 画廊状态跨页面保留，避免每次进入都重新扫描磁盘 */
export const useGalleryStore = create<GalleryStore>((set) => ({
  folders: [],
  setFolders: (folders) => set({ folders }),
  foldersLoaded: false,
  setFoldersLoaded: (v) => set({ foldersLoaded: v }),

  currentFolder: null,
  setCurrentFolder: (f) => set({ currentFolder: f }),
  medias: [],
  setMedias: (m) => set({ medias: m }),
  visibleCount: GALLERY_PAGE_SIZE,
  setVisibleCount: (updater) =>
    set((s) => ({ visibleCount: updater(s.visibleCount) })),
  resetVisibleCount: () => set({ visibleCount: GALLERY_PAGE_SIZE }),

  columns: 5,
  setColumns: (c) => set({ columns: c }),
  fitMode: 'cover',
  setFitMode: (m) => set({ fitMode: m }),
}));
