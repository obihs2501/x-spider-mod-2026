import { fs } from '@tauri-apps/api';
import { invoke } from '@tauri-apps/api/tauri';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';
import { classifyFile, isPathUnder } from '../utils/gallery-media';

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
  size?: number;
}

/** 单个文件夹的扫描结果：本层媒体文件 + 本层子文件夹 */
export interface GalleryFolderContent {
  medias: GalleryMedia[];
  subfolders: GalleryFolder[];
  /** 扫描时目录本身的修改时间，用于判断目录是否有增删 */
  dirModifiedAt?: number;
  scannedAt: number;
}

interface DirEntryInfo {
  name: string;
  path: string;
  isDir: boolean;
  modifiedAt?: number;
  size?: number;
}

export type GalleryViewMode = 'thumbnail' | 'list';
export type GallerySortBy = 'name' | 'modifiedAt';
export type GalleryMediaSortBy = 'name' | 'modifiedAt' | 'size';
export type GallerySortOrder = 'asc' | 'desc';
export type GalleryTypeFilter = 'all' | 'image' | 'video';

export interface GalleryStore {
  folders: GalleryFolder[];
  foldersLoaded: boolean;
  /** folders 列表对应的保存路径；保存路径变化时才需要自动重扫 */
  foldersDir: string;
  /** 上次读取根目录时根目录的修改时间，用于判断是否新增/删除了文件夹 */
  rootModifiedAt?: number;
  foldersLoading: boolean;

  /** 当前浏览的文件夹层级栈（空数组 = 未选择文件夹），支持多级目录 */
  folderStack: GalleryFolder[];
  /** 其他页面（如博主管理）请求画廊打开的文件夹路径，进入画廊后消费并清空 */
  pendingOpenPath: string | null;
  setPendingOpenPath: (p: string | null) => void;
  medias: GalleryMedia[];
  subfolders: GalleryFolder[];
  /** 当前文件夹正在扫描中 */
  scanning: boolean;
  mediaCache: Record<string, GalleryFolderContent>;
  invalidateMediaCache: (path: string) => void;
  visibleCount: number;
  showMore: () => void;

  // ---- 浏览偏好（持久化）----
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
  mediaSortBy: GalleryMediaSortBy;
  setMediaSortBy: (by: GalleryMediaSortBy) => void;
  mediaSortOrder: GallerySortOrder;
  setMediaSortOrder: (o: GallerySortOrder) => void;
  typeFilter: GalleryTypeFilter;
  setTypeFilter: (f: GalleryTypeFilter) => void;
  /** 左侧文件夹列表按博主分组显示 */
  groupByBlogger: boolean;
  setGroupByBlogger: (v: boolean) => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  /** 视频卡片自动生成首帧缩略图 */
  videoThumbs: boolean;
  setVideoThumbs: (v: boolean) => void;

  // ---- 筛选（不持久化）----
  folderSearch: string;
  setFolderSearch: (s: string) => void;
  mediaSearch: string;
  setMediaSearch: (s: string) => void;

  // ---- 操作 ----
  /** 读取保存目录下的一层文件夹；已加载过时按修改时间增量校验 */
  loadFolders: (saveDirBase: string) => Promise<void>;
  /** 根目录有变化（新增/删除文件夹）时才重新读取 */
  refreshFoldersIfChanged: (saveDirBase: string) => Promise<void>;
  /** 进入文件夹：stack 为包含目标在内的完整层级栈 */
  openFolder: (
    folder: GalleryFolder,
    stack: GalleryFolder[],
    force?: boolean,
  ) => Promise<void>;
  /** 按绝对路径打开（支持顶层文件夹的任意子目录），找不到时返回 false */
  openPath: (path: string) => Promise<boolean>;
  goBack: () => void;
  closeFolder: () => void;
}

export const GALLERY_PAGE_SIZE = 120;
export const GALLERY_MIN_COLUMNS = 3;
export const GALLERY_MAX_COLUMNS = 10;

let openToken = 0;

async function readDir(path: string): Promise<DirEntryInfo[]> {
  return invoke<DirEntryInfo[]>('read_dir_with_metadata', { path });
}

async function readModifiedAt(path: string): Promise<number | undefined> {
  const [meta] = await invoke<{ path: string; modifiedAt?: number }[]>(
    'filesystem_metadata',
    { paths: [path] },
  );
  return meta?.modifiedAt;
}

function splitPath(p: string): string[] {
  return p.split(/[\\/]/).filter(Boolean);
}

export const useGalleryStore = create<GalleryStore>()(
  persist(
    (set, get) => ({
      folders: [],
      foldersLoaded: false,
      foldersDir: '',
      rootModifiedAt: undefined,
      foldersLoading: false,

      folderStack: [],
      pendingOpenPath: null,
      setPendingOpenPath: (p) => set({ pendingOpenPath: p }),
      medias: [],
      subfolders: [],
      scanning: false,
      mediaCache: {},
      invalidateMediaCache: (folderPath) =>
        set((state) => {
          // 目录变化/删除时，连同其下所有子目录的缓存一并失效
          const staleKeys = Object.keys(state.mediaCache).filter((key) =>
            isPathUnder(key, folderPath),
          );
          if (staleKeys.length === 0) return state;
          const next = { ...state.mediaCache };
          staleKeys.forEach((key) => delete next[key]);
          return { mediaCache: next };
        }),
      visibleCount: GALLERY_PAGE_SIZE,
      showMore: () =>
        set((s) => ({ visibleCount: s.visibleCount + GALLERY_PAGE_SIZE })),

      columns: 5,
      setColumns: (c) =>
        set({
          columns: Math.min(
            GALLERY_MAX_COLUMNS,
            Math.max(GALLERY_MIN_COLUMNS, Math.round(c)),
          ),
        }),
      fitMode: 'cover',
      setFitMode: (m) => set({ fitMode: m }),
      viewMode: 'thumbnail',
      setViewMode: (mode) => set({ viewMode: mode }),
      folderSortBy: 'modifiedAt',
      setFolderSortBy: (by) => set({ folderSortBy: by }),
      folderSortOrder: 'desc',
      setFolderSortOrder: (o) => set({ folderSortOrder: o }),
      mediaSortBy: 'name',
      setMediaSortBy: (by) => set({ mediaSortBy: by }),
      mediaSortOrder: 'desc',
      setMediaSortOrder: (o) => set({ mediaSortOrder: o }),
      typeFilter: 'all',
      setTypeFilter: (f) => set({ typeFilter: f, visibleCount: GALLERY_PAGE_SIZE }),
      groupByBlogger: false,
      setGroupByBlogger: (v) => set({ groupByBlogger: v }),
      sidebarCollapsed: false,
      setSidebarCollapsed: (v) => set({ sidebarCollapsed: v }),
      videoThumbs: true,
      setVideoThumbs: (v) => set({ videoThumbs: v }),

      folderSearch: '',
      setFolderSearch: (s) => set({ folderSearch: s }),
      mediaSearch: '',
      setMediaSearch: (s) =>
        set({ mediaSearch: s, visibleCount: GALLERY_PAGE_SIZE }),

      loadFolders: async (saveDirBase) => {
        if (!saveDirBase) return;
        set({ foldersLoading: true });
        try {
          if (!(await fs.exists(saveDirBase))) {
            set({
              folders: [],
              foldersLoaded: true,
              foldersDir: saveDirBase,
              rootModifiedAt: undefined,
            });
            return;
          }
          const rootModifiedAt = await readModifiedAt(saveDirBase);
          const entries = await readDir(saveDirBase);
          const previousMap = new Map(
            get().folders.map((folder) => [folder.path, folder]),
          );
          const result: GalleryFolder[] = [];
          for (const entry of entries) {
            if (!entry.isDir || !entry.name) continue;
            const previous = previousMap.get(entry.path);
            if (previous && previous.modifiedAt !== entry.modifiedAt) {
              // 目录有变化：失效旧媒体缓存，下次打开重新扫描
              get().invalidateMediaCache(entry.path);
            }
            result.push({
              name: entry.name,
              path: entry.path,
              modifiedAt: entry.modifiedAt,
            });
          }
          // 删除已不存在目录的缓存（各级子目录的缓存跟随其一级目录保留）
          const stillExists = (cachePath: string) =>
            result.some((f) => isPathUnder(cachePath, f.path));
          const cache = get().mediaCache;
          const staleKeys = Object.keys(cache).filter((p) => !stillExists(p));
          const nextCache = { ...cache };
          staleKeys.forEach((key) => delete nextCache[key]);

          // 当前打开的文件夹已被删除时退回未选择状态
          const current = get().folderStack[0];
          const currentGone =
            current && !result.some((f) => f.path === current.path);

          set({
            folders: result,
            foldersLoaded: true,
            foldersDir: saveDirBase,
            rootModifiedAt,
            mediaCache: nextCache,
            ...(currentGone
              ? { folderStack: [], medias: [], subfolders: [] }
              : {}),
          });
        } finally {
          set({ foldersLoading: false });
        }
      },

      refreshFoldersIfChanged: async (saveDirBase) => {
        const state = get();
        if (!state.foldersLoaded || state.foldersDir !== saveDirBase) {
          await state.loadFolders(saveDirBase);
          return;
        }
        try {
          const modifiedAt = await readModifiedAt(saveDirBase);
          if (modifiedAt !== state.rootModifiedAt) {
            await state.loadFolders(saveDirBase);
          }
        } catch (err) {
          log.warn('检查画廊根目录变化失败', err);
        }
      },

      openFolder: async (folder, stack, force = false) => {
        const token = ++openToken;
        set({
          folderStack: stack,
          visibleCount: GALLERY_PAGE_SIZE,
          mediaSearch: '',
        });
        const cached = get().mediaCache[folder.path];
        if (cached && !force) {
          set({
            medias: cached.medias,
            subfolders: cached.subfolders,
            scanning: false,
          });
          // 后台校验目录是否有增删；无变化则直接复用缓存
          try {
            const modifiedAt = await readModifiedAt(folder.path);
            if (token !== openToken) return;
            if (modifiedAt === cached.dirModifiedAt) return;
          } catch {
            return;
          }
        } else if (!cached) {
          set({ medias: [], subfolders: [] });
        }

        set({ scanning: true });
        try {
          const dirModifiedAt = await readModifiedAt(folder.path);
          const entries = await readDir(folder.path);
          if (token !== openToken) return;
          const medias: GalleryMedia[] = [];
          const subfolders: GalleryFolder[] = [];
          for (const e of entries) {
            if (e.isDir) {
              subfolders.push({
                name: e.name,
                path: e.path,
                modifiedAt: e.modifiedAt,
              });
              continue;
            }
            const kind = classifyFile(e.name);
            if (!kind) continue;
            medias.push({
              path: e.path,
              name: e.name,
              isVideo: kind === 'video',
              modifiedAt: e.modifiedAt,
              size: e.size,
            });
          }
          set((state) => ({
            medias,
            subfolders,
            mediaCache: {
              ...state.mediaCache,
              [folder.path]: {
                medias,
                subfolders,
                dirModifiedAt,
                scannedAt: Date.now(),
              },
            },
          }));
        } finally {
          if (token === openToken) set({ scanning: false });
        }
      },

      openPath: async (target) => {
        const folders = get().folders;
        const normalized = target.replace(/[\\/]+$/, '');
        const lower = normalized.toLowerCase();
        const root = folders.find(
          (f) =>
            f.path.toLowerCase() === lower ||
            isPathUnder(lower, f.path.toLowerCase()),
        );
        if (!root) return false;
        const stack: GalleryFolder[] = [root];
        if (root.path.toLowerCase() !== lower) {
          const rest = splitPath(normalized.slice(root.path.length));
          const sep = normalized.includes('\\') ? '\\' : '/';
          let current = root.path;
          for (const segment of rest) {
            current = `${current}${sep}${segment}`;
            stack.push({ name: segment, path: current });
          }
        }
        await get().openFolder(stack[stack.length - 1], stack);
        return true;
      },

      goBack: () => {
        const parentStack = get().folderStack.slice(0, -1);
        const parent = parentStack[parentStack.length - 1];
        if (parent) {
          get().openFolder(parent, parentStack);
        } else {
          get().closeFolder();
        }
      },

      closeFolder: () => {
        openToken++;
        set({ folderStack: [], medias: [], subfolders: [], scanning: false });
      },
    }),
    {
      name: 'gallery-settings',
      storage: createTauriFileStorage(),
      version: 2,
      partialize: (state) =>
        ({
          // 持久化文件夹摘要，重启后画廊直接展示上次的列表；
          // mediaCache 可能很大且 persist 每次 set 都全量写盘，故不持久化。
          folders: state.folders,
          foldersLoaded: state.foldersLoaded,
          foldersDir: state.foldersDir,
          rootModifiedAt: state.rootModifiedAt,
          folderStack: state.folderStack,
          columns: state.columns,
          fitMode: state.fitMode,
          viewMode: state.viewMode,
          folderSortBy: state.folderSortBy,
          folderSortOrder: state.folderSortOrder,
          mediaSortBy: state.mediaSortBy,
          mediaSortOrder: state.mediaSortOrder,
          typeFilter: state.typeFilter,
          groupByBlogger: state.groupByBlogger,
          sidebarCollapsed: state.sidebarCollapsed,
          videoThumbs: state.videoThumbs,
        }) as GalleryStore,
      migrate: (persisted: any, version) => {
        if (version < 2 && persisted) {
          // v2：文件夹默认按修改时间倒序，最近有下载的博主排在前面
          persisted.folderSortBy = 'modifiedAt';
          persisted.folderSortOrder = 'desc';
          persisted.folderStack = [];
        }
        return persisted;
      },
    },
  ),
);
