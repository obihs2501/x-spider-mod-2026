import { request } from '../ipc/network';

const HOST = 'api.x.com';

// 公共 Bearer（推特 Web 客户端使用，用于激活游客令牌），无需登录 Cookie
export const PUBLIC_BEARER =
  'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA';

let cachedToken: string | null = null;
let cachedAt = 0;
let inflight: Promise<string> | null = null;

// 游客令牌有效期较短，这里缓存约 2.5 小时
const TOKEN_TTL = 1000 * 60 * 60 * 2.5;

async function activateGuestToken(): Promise<string> {
  const resp = await request({
    method: 'POST',
    url: `https://${HOST}/1.1/guest/activate.json`,
    responseType: 'json',
    headers: {
      'User-Agent': navigator.userAgent,
      Authorization: PUBLIC_BEARER,
    },
  });

  if (resp.status >= 400) {
    throw new Error(`激活游客令牌失败: status=${resp.status}`);
  }

  const token = (resp.body as any)?.guest_token;
  if (!token) {
    throw new Error('响应中找不到 guest_token');
  }

  return String(token);
}

/**
 * 获取一个可用的游客令牌（带缓存）。用于在无 Cookie 情况下访问公开账号的媒体。
 */
export async function getGuestToken(forceRefresh = false): Promise<string> {
  const now = Date.now();
  if (!forceRefresh && cachedToken && now - cachedAt < TOKEN_TTL) {
    return cachedToken;
  }

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const token = await activateGuestToken();
      cachedToken = token;
      cachedAt = Date.now();
      return token;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

/** 令牌失效（如收到 401/403）时调用，强制下次重新激活 */
export function invalidateGuestToken() {
  cachedToken = null;
  cachedAt = 0;
}
