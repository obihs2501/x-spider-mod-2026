import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';

export interface GalleryFolder {
  name: string;
  path: string;
  modifiedAt?: number;
}

export interface GalleryMedia {
  path: string;
  name: string;
  isVideo: boolean;
  modifiedAt?: number;
}

export type GalleryViewMode = 'thumbnail' | 'list';
export type GallerySortBy = 'name' | 'modifiedAt';
export type GallerySortOrder = 'asc' | 'desc';

export interface GalleryStore {
  folders: GalleryFolder[];
  setFolders: (folders: GalleryFolder[]) => void;
  foldersLoaded: boolean;
  setFoldersLoaded: (v: boolean) => void;

  currentFolder: GalleryFolder | null;
  setCurrentFolder: (f: GalleryFolder | null) => void;
  medias: GalleryMedia[];
  setMedias: (m: GalleryMedia[]) => void;
  mediaCache: Record<string, GalleryMedia[]>;
  setMediaCache: (path: string, medias: GalleryMedia[]) => void;
  invalidateMediaCache: (path: string) => void;
  visibleCount: number;
  setVisibleCount: (updater: (c: number) => number) => void;
  resetVisibleCount: () => void;

  columns: number;
  setColumns: (c: number) => void;
  fitMode: 'cover' | 'contain';
  setFitMode: (m: 'cover' | 'contain') => void;
  viewMode: GalleryViewMode;
  setViewMode: (mode: GalleryViewMode) => void;
  folderSortBy: GallerySortBy;
  setFolderSortBy: (by: GallerySortBy) => void;
  folderSortOrder: GallerySortOrder;
  setFolderSortOrder: (o: GallerySortOrder) => void;
  mediaSortBy: GallerySortBy;
  setMediaSortBy: (by: GallerySortBy) => void;
  mediaSortOrder: GallerySortOrder;
  setMediaSortOrder: (o: GallerySortOrder) => void;
}

export const GALLERY_PAGE_SIZE = 100;

export const useGalleryStore = create<GalleryStore>()(
  persist(
    (set) => ({
      folders: [],
      setFolders: (folders) => set({ folders }),
      foldersLoaded: false,
      setFoldersLoaded: (v) => set({ foldersLoaded: v }),

      currentFolder: null,
      setCurrentFolder: (f) => set({ currentFolder: f }),
      medias: [],
      setMedias: (m) => set({ medias: m }),
      mediaCache: {},
      setMediaCache: (folderPath, medias) =>
        set((state) => ({
          // 允许缓存空文件夹结果，避免每次打开空目录都重新扫描
          mediaCache: { ...state.mediaCache, [folderPath]: medias },
        })),
      invalidateMediaCache: (folderPath) =>
        set((state) => {
          if (!(folderPath in state.mediaCache)) return state;
          const next = { ...state.mediaCache };
          delete next[folderPath];
          return { mediaCache: next };
        }),
      visibleCount: GALLERY_PAGE_SIZE,
      setVisibleCount: (updater) =>
        set((s) => ({ visibleCount: updater(s.visibleCount) })),
      resetVisibleCount: () => set({ visibleCount: GALLERY_PAGE_SIZE }),

      columns: 5,
      setColumns: (c) => set({ columns: c }),
      fitMode: 'cover',
      setFitMode: (m) => set({ fitMode: m }),
      viewMode: 'thumbnail',
      setViewMode: (mode) => set({ viewMode: mode }),
      folderSortBy: 'name',
      setFolderSortBy: (by) => set({ folderSortBy: by }),
      folderSortOrder: 'asc',
      setFolderSortOrder: (o) => set({ folderSortOrder: o }),
      mediaSortBy: 'name',
      setMediaSortBy: (by) => set({ mediaSortBy: by }),
      mediaSortOrder: 'desc',
      setMediaSortOrder: (o) => set({ mediaSortOrder: o }),
    }),
    {
      name: 'gallery-settings',
      storage: createTauriFileStorage(),
      version: 1,
      partialize: (state) =>
        ({
          // 持久化文件夹摘要，重启后画廊直接展示上次的列表，
          // 由页面在每个会话首次进入时后台增量校验（modifiedAt 对比）。
          // mediaCache 可能很大且 persist 每次 set 都全量写盘，故不持久化。
          folders: state.folders,
          foldersLoaded: state.foldersLoaded,
          columns: state.columns,
          fitMode: state.fitMode,
          viewMode: state.viewMode,
          folderSortBy: state.folderSortBy,
          folderSortOrder: state.folderSortOrder,
          mediaSortBy: state.mediaSortBy,
          mediaSortOrder: state.mediaSortOrder,
        }) as GalleryStore,
    },
  ),
);
