import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createTauriFileStorage } from './persist/tauri-file-storage';
import { useAppStateStore } from './app-state';
import { useSettingsStore } from './settings';

export interface XAccount {
  id: string;
  cookieString: string;
  screenName?: string;
  avatar?: string;
  enabled: boolean;
  /** 该账号限流冷却截止时间戳（毫秒），0 表示未限流 */
  rateLimitedUntil: number;
  addedAt: number;
}

export interface AccountsStore {
  accounts: XAccount[];
  activeAccountId: string;
  /** 左上角展示的账号（手动选择）；自动轮换只改 activeAccountId，不改它 */
  displayAccountId: string;

  addAccount: (
    cookieString: string,
    info?: { screenName?: string; avatar?: string },
  ) => XAccount;
  removeAccount: (id: string) => void;
  updateAccount: (id: string, patch: Partial<Omit<XAccount, 'id'>>) => void;
  /** 手动切换当前账号：同时更新轮换游标与左上角展示 */
  setActiveAccountId: (id: string) => void;
  /** 内部：自动轮换切换游标，不改变左上角展示账号 */
  setRotationAccountId: (id: string) => void;

  /** 当前可用（启用且未在限流冷却中）的账号列表 */
  getAvailableAccounts: () => XAccount[];
  /** 解析当前生效账号；若指定账号不可用则自动顺延到下一个可用账号 */
  getActiveAccount: () => XAccount | null;
  /** 轮换到下一个可用账号，返回新账号（无可换账号时返回 null） */
  rotateToNext: (reason: string) => XAccount | null;
  /** 标记账号进入限流冷却 */
  markRateLimited: (id: string, cooldownMs: number) => void;
  /** 每次 API 请求时调用：按请求数轮换 */
  noteRequest: () => void;
  /** 每个博主批量任务开始时调用：按博主轮换 */
  noteBloggerStart: () => void;
}

let alog: ICategoriedLogger;
function log() {
  if (!alog) alog = window.log.category('ACCOUNT');
  return alog;
}

// 请求计数不需要跨会话保留，放在模块级
let requestCount = 0;

export const useAccountsStore = create(
  persist<AccountsStore>(
    (set, get) => ({
      accounts: [],
      activeAccountId: '',
      displayAccountId: '',

      addAccount: (cookieString, info) => {
        const account: XAccount = {
          id: nanoid(),
          cookieString: cookieString.trim(),
          screenName: info?.screenName,
          avatar: info?.avatar,
          enabled: true,
          rateLimitedUntil: 0,
          addedAt: Date.now(),
        };
        const accounts = [...get().accounts, account];
        set({
          accounts,
          activeAccountId: get().activeAccountId || account.id,
          displayAccountId: get().displayAccountId || account.id,
        });
        log().info('Account added', account.screenName || account.id);
        return account;
      },

      removeAccount: (id) => {
        const accounts = get().accounts.filter((a) => a.id !== id);
        const patch: Partial<AccountsStore> = { accounts };
        if (get().activeAccountId === id) {
          patch.activeAccountId = accounts.find((a) => a.enabled)?.id || '';
        }
        if (get().displayAccountId === id) {
          patch.displayAccountId = accounts.find((a) => a.enabled)?.id || '';
        }
        set(patch as any);
      },

      updateAccount: (id, patch) => {
        set({
          accounts: get().accounts.map((a) =>
            a.id === id ? { ...a, ...patch } : a,
          ),
        });
      },

      setActiveAccountId: (id) => {
        requestCount = 0;
        set({ activeAccountId: id, displayAccountId: id });
      },

      setRotationAccountId: (id) => {
        requestCount = 0;
        set({ activeAccountId: id });
      },

      getAvailableAccounts: () => {
        const now = Date.now();
        return get().accounts.filter(
          (a) => a.enabled && a.cookieString && a.rateLimitedUntil <= now,
        );
      },

      getActiveAccount: () => {
        const available = get().getAvailableAccounts();
        if (available.length === 0) return null;
        const active = available.find((a) => a.id === get().activeAccountId);
        if (active) return active;
        // 当前账号不可用（被删/禁用/限流），自动顺延
        const next = available[0];
        get().setRotationAccountId(next.id);
        log().info('Active account unavailable, fallback to', next.screenName);
        return next;
      },

      rotateToNext: (reason) => {
        const { accounts, activeAccountId } = get();
        const available = get().getAvailableAccounts();
        if (available.length === 0) return null;
        if (available.length === 1 && available[0].id === activeAccountId) {
          return null;
        }
        // 从当前账号在完整列表中的位置向后找第一个可用账号（环形）
        const currentIndex = accounts.findIndex(
          (a) => a.id === activeAccountId,
        );
        for (let step = 1; step <= accounts.length; step++) {
          const candidate = accounts[(currentIndex + step) % accounts.length];
          if (available.some((a) => a.id === candidate.id)) {
            get().setRotationAccountId(candidate.id);
            log().info(
              `Rotate account (${reason}):`,
              candidate.screenName || candidate.id,
            );
            return candidate;
          }
        }
        return null;
      },

      markRateLimited: (id, cooldownMs) => {
        get().updateAccount(id, { rateLimitedUntil: Date.now() + cooldownMs });
        const account = get().accounts.find((a) => a.id === id);
        log().warn(
          'Account rate limited',
          account?.screenName || id,
          `cooldown ${Math.round(cooldownMs / 60000)}min`,
        );
      },

      noteRequest: () => {
        const n = Number(
          useSettingsStore.getState().accountRotation?.rotateEveryNRequests,
        );
        if (!n || n <= 0) return;
        requestCount++;
        if (requestCount >= n && get().getAvailableAccounts().length > 1) {
          get().rotateToNext('request-count');
        }
      },

      noteBloggerStart: () => {
        const enabled =
          useSettingsStore.getState().accountRotation?.rotateOnBlogger;
        if (!enabled) return;
        if (get().getAvailableAccounts().length > 1) {
          get().rotateToNext('blogger');
        }
      },
    }),
    {
      name: 'accounts',
      storage: createTauriFileStorage(),
      version: 1,
      partialize: (s) =>
        ({
          accounts: s.accounts,
          activeAccountId: s.activeAccountId,
          displayAccountId: s.displayAccountId,
        }) as AccountsStore,
      onRehydrateStorage: () => {
        return async (state, error) => {
          if (error) return;
          if (state?.accounts?.length) {
            // 旧版本没有 displayAccountId：用当前轮换游标补齐
            if (!state.displayAccountId) {
              useAccountsStore.setState({
                displayAccountId: state.activeAccountId || state.accounts[0].id,
              });
            }
            return;
          }

          // 旧版单账号迁移：把 app-state 里的 cookieString 导入账号池
          const appStatePersist = useAppStateStore.persist;
          if (!appStatePersist.hasHydrated()) {
            await new Promise<void>((resolve) => {
              const unsub = appStatePersist.onFinishHydration(() => {
                unsub();
                resolve();
              });
            });
          }
          const legacy = useAppStateStore.getState().cookieString?.trim();
          if (legacy && useAccountsStore.getState().accounts.length === 0) {
            useAccountsStore.getState().addAccount(legacy);
            // 清空旧字段，避免删除全部账号后重启时旧 Cookie 再次被导入
            useAppStateStore.getState().setCookieString('');
            log().info('Migrated legacy cookie into account pool');
          }
        };
      },
    },
  ),
);
