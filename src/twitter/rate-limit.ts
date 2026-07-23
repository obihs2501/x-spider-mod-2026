import { useAccountsStore } from '../stores/accounts';
import { delay } from '../utils';

let rlog: ICategoriedLogger;
function log() {
  if (!rlog) rlog = window.log.category('RATELIMIT');
  return rlog;
}

interface LimitState {
  limit: number;
  remaining: number;
  /** 重置时间戳（毫秒） */
  resetAt: number;
}

/** key: `${账号ID或guest}:${接口路径}` */
const states = new Map<string, LimitState>();

function stateKey(accountKey: string, path: string) {
  return `${accountKey}:${path}`;
}

/** 当前生效的记账主体：账号池活跃账号 ID，无账号时为游客 */
export function currentAccountKey(): string {
  return useAccountsStore.getState().getActiveAccount()?.id || 'guest';
}

/** 预算阈值：余量不高于总额度 2%（至少 1）视为耗尽，预留少量配额给交互操作 */
function threshold(limit: number) {
  return Math.max(1, Math.floor(limit / 50));
}

/** 该账号在该接口路径上需等待的毫秒数；0 表示预算可用 */
function blockedFor(accountKey: string, path: string): number {
  const state = states.get(stateKey(accountKey, path));
  if (!state) return 0;
  const now = Date.now();
  if (now >= state.resetAt) return 0;
  if (state.remaining > threshold(state.limit)) return 0;
  return state.resetAt - now + 5000;
}

/**
 * 请求前调用：预算充足则本地预扣 1 个配额（响应头会用权威值覆盖）；
 * 当前账号该接口预算耗尽时，优先切换到仍有预算的账号，无可切账号时等待到重置。
 */
export async function acquireBudget(path: string): Promise<void> {
  for (;;) {
    const accounts = useAccountsStore.getState();
    const key = currentAccountKey();
    const wait = blockedFor(key, path);
    if (wait <= 0) {
      const state = states.get(stateKey(key, path));
      if (state && state.remaining > 0 && Date.now() < state.resetAt) {
        state.remaining--;
      }
      return;
    }
    const candidate = accounts
      .getAvailableAccounts()
      .find((a) => a.id !== key && blockedFor(a.id, path) <= 0);
    if (candidate) {
      accounts.setRotationAccountId(candidate.id);
      log().info(
        `接口 ${path} 预算耗尽，切换到账号`,
        candidate.screenName || candidate.id,
      );
      continue;
    }
    const waitCapped = Math.min(wait, 15 * 60 * 1000);
    log().warn(
      `接口 ${path} 所有账号预算均耗尽，等待 ${Math.round(waitCapped / 1000)}s`,
    );
    await delay(waitCapped);
  }
}

/** 响应后调用：用 X-Rate-Limit 响应头更新该账号+接口的预算记账 */
export function noteRateLimitHeaders(
  accountKey: string,
  path: string,
  headers: Record<string, string[]> | undefined,
) {
  if (!headers) return;
  const get = (name: string) =>
    headers[name]?.[0] ?? headers[name.toLowerCase()]?.[0];
  const limit = Number(get('X-Rate-Limit-Limit'));
  const remaining = Number(get('X-Rate-Limit-Remaining'));
  const resetUnix = Number(get('X-Rate-Limit-Reset'));
  if (
    !Number.isFinite(limit) ||
    !Number.isFinite(remaining) ||
    !Number.isFinite(resetUnix) ||
    limit <= 0
  ) {
    return;
  }
  states.set(stateKey(accountKey, path), {
    limit,
    remaining,
    resetAt: resetUnix * 1000,
  });
}
