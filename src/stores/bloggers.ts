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
  /**
   * 增量游标：上次完整跑完的任务中见过的最新推文 ID（雪花序，越大越新）。
   * 增量下载扫到不晚于它的推文即停，比日期精确。
   */
  lastSeenTweetId?: string;
}

export interface BloggerStore {
  bloggers: BloggerRecord[];
  recordDownload: (user: TwitterUser) => void;
  /** 任务完整结束后推进增量游标（只前进不后退） */
  recordSeenTweet: (screenName: string, tweetId: string) => void;
  /** 批量导入博主（跳过已存在的），返回新增数量 */
  importBloggers: (users: TwitterUser[]) => number;
  removeBlogger: (screenName: string) => void;
}

/** 雪花 ID 比较：a 是否比 b 更新；解析失败按不更新处理 */
function isNewerTweetId(a: string, b?: string): boolean {
  if (!b) return true;
  try {
    return BigInt(a) > BigInt(b);
  } catch {
    return false;
  }
}

/** 已下载博主列表（持久化），支持下次增量继续下载 */
export const useBloggerStore = create<BloggerStore>()(
  persist(
    (set, get) => ({
      bloggers: [],
      recordDownload: (user) => {
        if (!user?.screenName) return;
        const existing = get().bloggers.find(
          (b) => b.screenName === user.screenName,
        );
        const rest = get().bloggers.filter(
          (b) => b.screenName !== user.screenName,
        );
        set({
          bloggers: [
            {
              ...existing,
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
      recordSeenTweet: (screenName, tweetId) => {
        if (!screenName || !tweetId) return;
        set({
          bloggers: get().bloggers.map((b) => {
            if (b.screenName !== screenName) return b;
            if (!isNewerTweetId(tweetId, b.lastSeenTweetId)) return b;
            return { ...b, lastSeenTweetId: tweetId };
          }),
        });
      },
      importBloggers: (users) => {
        const existing = new Set(get().bloggers.map((b) => b.screenName));
        const fresh = users.filter(
          (u) => u.screenName && !existing.has(u.screenName),
        );
        if (fresh.length === 0) return 0;
        set({
          bloggers: [
            ...fresh.map((u) => ({
              screenName: u.screenName,
              name: u.name,
              avatar: u.avatar,
              userId: u.id,
              lastDownloadAt: 0,
            })),
            ...get().bloggers,
          ],
        });
        return fresh.length;
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
