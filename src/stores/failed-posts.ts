import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';

export interface FailedPostRecord {
  /** `${screenName}:${postId}` */
  id: string;
  screenName: string;
  userName?: string;
  avatar?: string;
  postId: string;
  error: string;
  createdAt: number;
}

export interface FailedPostsStore {
  failures: FailedPostRecord[];
  addFailure: (rec: Omit<FailedPostRecord, 'id' | 'createdAt'>) => void;
  removeFailure: (id: string) => void;
  clear: () => void;
}

/** 爬虫任务中处理失败的推文队列（持久化），供之后手动重试 */
export const useFailedPostsStore = create<FailedPostsStore>()(
  persist(
    (set, get) => ({
      failures: [],
      addFailure: (rec) => {
        if (!rec.postId) return;
        const id = `${rec.screenName}:${rec.postId}`;
        const rest = get().failures.filter((f) => f.id !== id);
        set({
          // 上限 500 条，避免无限增长
          failures: [{ ...rec, id, createdAt: Date.now() }, ...rest].slice(
            0,
            500,
          ),
        });
      },
      removeFailure: (id) => {
        set({ failures: get().failures.filter((f) => f.id !== id) });
      },
      clear: () => set({ failures: [] }),
    }),
    {
      name: 'failed-posts',
      storage: createTauriFileStorage(),
      version: 1,
    },
  ),
);
