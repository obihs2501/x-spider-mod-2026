import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';
import { TwitterUser } from '../interfaces/TwitterUser';

export interface BloggerRecord {
  screenName: string;
  name?: string;
  avatar?: string;
  userId?: string;
  /** 上次创建下载任务的时间戳（毫秒），用于增量下载 */
  lastDownloadAt: number;
}

export interface BloggerStore {
  bloggers: BloggerRecord[];
  recordDownload: (user: TwitterUser) => void;
  removeBlogger: (screenName: string) => void;
}

/** 已下载博主列表（持久化），支持下次增量继续下载 */
export const useBloggerStore = create<BloggerStore>()(
  persist(
    (set, get) => ({
      bloggers: [],
      recordDownload: (user) => {
        if (!user?.screenName) return;
        const rest = get().bloggers.filter(
          (b) => b.screenName !== user.screenName,
        );
        set({
          bloggers: [
            {
              screenName: user.screenName,
              name: user.name,
              avatar: user.avatar,
              userId: user.id,
              lastDownloadAt: Date.now(),
            },
            ...rest,
          ],
        });
      },
      removeBlogger: (screenName) => {
        set({
          bloggers: get().bloggers.filter((b) => b.screenName !== screenName),
        });
      },
    }),
    {
      name: 'bloggers',
      storage: createTauriFileStorage(),
      version: 1,
    },
  ),
);
