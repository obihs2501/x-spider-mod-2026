import { fs } from '@tauri-apps/api';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';
import { useBloggerStore } from './bloggers';

const MEDIA_EXTS = [
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'mp4',
  'mov',
  'webm',
  'mkv',
  'm4v',
];

/** 从文件名中提取推文 ID（15~20 位数字） */
function extractPostId(fileName: string): string | null {
  const m = fileName.match(/(\d{15,20})/);
  return m ? m[1] : null;
}

/** 从文件夹名中提取博主，如「____Ncms (@ncmsncmsncms)」→ {name, screenName} */
function parseBloggerFolder(
  folderName: string,
): { name: string; screenName: string } | null {
  const m = folderName.match(/^(.*?)\s*\(@([A-Za-z0-9_]{1,20})\)\s*$/);
  if (!m) return null;
  return { name: m[1].trim() || m[2], screenName: m[2] };
}

/** 从文件名中提取日期，如「[2026-07-09] xxx.jpg」 */
function extractFileDate(fileName: string): number | null {
  const m = fileName.match(/(\d{4}-\d{2}-\d{2})/);
  if (!m) return null;
  const ts = Date.parse(m[1]);
  return Number.isNaN(ts) ? null : ts;
}

export interface BloggerLocalStats {
  directoryPath: string;
  mediaCount: number;
  postCount: number;
  latestFileAt: number;
}

export interface LocalIndexStore {
  /** 已识别为「本地已存在」的推文 ID 集合（数组形式持久化） */
  postIds: string[];
  lastScanAt: number;
  bloggerStats: Record<string, BloggerLocalStats>;
  hasPost: (id?: string) => boolean;
  addPosts: (ids: string[]) => void;
  /** 扫描本地保存目录：导入帖子 ID 索引，并按「昵称 (@用户名)」文件夹识别博主 */
  importFromDisk: (saveDirBase: string) => Promise<{
    total: number;
    added: number;
    bloggers: number;
  }>;
  clear: () => void;
}

export const useLocalIndexStore = create<LocalIndexStore>()(
  persist(
    (set, get) => ({
      postIds: [],
      lastScanAt: 0,
      bloggerStats: {},
      hasPost: (id) => {
        if (!id) return false;
        return get().postIds.includes(id);
      },
      addPosts: (ids) => {
        if (ids.length === 0) return;
        const merged = new Set(get().postIds);
        ids.forEach((id) => merged.add(id));
        set({ postIds: Array.from(merged) });
      },
      importFromDisk: async (saveDirBase) => {
        if (!saveDirBase || !(await fs.exists(saveDirBase))) {
          return { total: 0, added: 0, bloggers: 0 };
        }
        const found = new Set<string>();
        const bloggerPostIds = new Map<string, Set<string>>();
        const bloggerStats = new Map<string, BloggerLocalStats>();
        // 每个博主文件夹内文件的最新日期，用于设定增量起点
        const bloggerDates = new Map<
          string,
          { name: string; screenName: string; latest: number }
        >();
        const entries = await fs.readDir(saveDirBase, { recursive: true });

        const walk = (
          items: fs.FileEntry[],
          blogger: { name: string; screenName: string } | null,
        ) => {
          for (const e of items) {
            if (e.children) {
              // 顶层文件夹尝试解析为博主
              const parsed = blogger || parseBloggerFolder(e.name || '');
              walk(e.children, parsed);
              continue;
            }
            const name = e.name || '';
            const ext = name.split('.').pop()?.toLowerCase() || '';
            if (!MEDIA_EXTS.includes(ext)) continue;
            const id = extractPostId(name);
            if (id) found.add(id);
            if (blogger) {
              const date = extractFileDate(name) || 0;
              const currentStats = bloggerStats.get(blogger.screenName);
              bloggerStats.set(blogger.screenName, {
                directoryPath:
                  currentStats?.directoryPath ||
                  e.path.slice(0, Math.max(0, e.path.length - name.length - 1)),
                mediaCount: (currentStats?.mediaCount || 0) + 1,
                postCount: 0,
                latestFileAt: Math.max(currentStats?.latestFileAt || 0, date),
              });
              if (id) {
                const ids = bloggerPostIds.get(blogger.screenName) || new Set();
                ids.add(id);
                bloggerPostIds.set(blogger.screenName, ids);
              }
              const prev = bloggerDates.get(blogger.screenName);
              if (!prev || date > prev.latest) {
                bloggerDates.set(blogger.screenName, {
                  ...blogger,
                  latest: Math.max(date, prev?.latest || 0),
                });
              }
            }
          }
        };
        walk(entries, null);

        // 合并帖子 ID 索引
        const before = new Set(get().postIds);
        let added = 0;
        found.forEach((id) => {
          if (!before.has(id)) {
            before.add(id);
            added++;
          }
        });
        bloggerStats.forEach((stats, screenName) => {
          stats.postCount = bloggerPostIds.get(screenName)?.size || 0;
        });
        set({
          postIds: Array.from(before),
          lastScanAt: Date.now(),
          bloggerStats: Object.fromEntries(bloggerStats),
        });

        // 把识别到的博主并入博主列表（已存在的不覆盖更新时间）
        const bloggerStore = useBloggerStore.getState();
        let newBloggers = 0;
        bloggerDates.forEach((b) => {
          const exists = bloggerStore.bloggers.some(
            (x) => x.screenName === b.screenName,
          );
          if (!exists) {
            useBloggerStore.setState((s) => ({
              bloggers: [
                {
                  screenName: b.screenName,
                  name: b.name,
                  // 文件名里的日期精确到天，增量起点取当天 0 点
                  lastDownloadAt: b.latest || Date.now(),
                },
                ...s.bloggers,
              ],
            }));
            newBloggers++;
          }
        });

        return { total: found.size, added, bloggers: newBloggers };
      },
      clear: () => set({ postIds: [], lastScanAt: 0, bloggerStats: {} }),
    }),
    {
      name: 'local-index',
      storage: createTauriFileStorage(),
      version: 1,
    },
  ),
);
