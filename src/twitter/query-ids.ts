import { fs, path } from '@tauri-apps/api';

/**
 * X GraphQL API queryId 配置（借鉴主仓库 v26.2.0 的容错机制）。
 *
 * X 前端迭代会不定期更换各 operation 的 queryId，旧 ID 失效后接口返回 400/404。
 * - `primary`：当前已知可用的 ID，请求时最先尝试；
 * - `fallbacks`：备用 ID 列表，primary 失效时按顺序依次尝试；
 * - 外部覆盖：在应用数据目录放置 `query-ids.json`（结构同 `DEFAULT_QUERY_IDS`，
 *   字段可省略，省略字段沿用内置默认值），无需改代码即可切换 / 补充 queryId：
 *
 *   ```json
 *   {
 *     "UserMedia": { "primary": "新的queryId", "fallbacks": ["旧的queryId"] }
 *   }
 *   ```
 */
export type GraphQLOperation =
  | 'UserByScreenName'
  | 'UserMedia'
  | 'UserTweets'
  | 'TweetResultByRestId'
  | 'ListMembers'
  | 'Following'
  | 'SearchTimeline'
  | 'Likes'
  | 'Bookmarks';

export interface QueryIdEntry {
  primary: string;
  fallbacks: string[];
}

export const DEFAULT_QUERY_IDS: Record<GraphQLOperation, QueryIdEntry> = {
  UserByScreenName: {
    primary: 'ck5KkZ8t5cOmoLssopN99Q',
    fallbacks: ['sLVLhk0bGj3MVFEKTdax1w', 'NimuplG1OB7Fd2btCLdBOw'],
  },
  UserMedia: {
    primary: 'jCRhbOzdgOHp6u9H4g2tEg',
    fallbacks: ['YqiE3JL1KNgf9nSljYdxaA', 'cEjpJXA15Ok78yO4TUQPeQ'],
  },
  UserTweets: {
    primary: 'E8Wq-_jFSaU7hxVcuOPR9g',
    fallbacks: ['HuTx74BxAnezK1gWvYY7zg', '9zyyd1hebl7oNWIPdA8HRw'],
  },
  TweetResultByRestId: {
    primary: 'qxWQxcMLiTPcavz9Qy5hwQ',
    fallbacks: ['D_jNhjWZeRZT5NURzfJZSQ'],
  },
  ListMembers: {
    primary: 'naea_MSad4pOb-D6_oVv_g',
    fallbacks: ['3dQPyRyAj6Lslp4e0ClXzg'],
  },
  Following: {
    primary: 'SaWqzw0TFAWMx1nXWjXoaQ',
    fallbacks: ['7FEKOPNAvxWASt6v9gfCXw'],
  },
  SearchTimeline: {
    primary: '4fpceYZ6-YQCx_JSl_Cn_A',
    fallbacks: ['nK1dw4oV3k4w5TdtcAdSww'],
  },
  Likes: {
    primary: 'TGEKkJG_meudeaFcqaxM-Q',
    fallbacks: ['aeJWz--kknVBOl7wQ7gh7Q'],
  },
  Bookmarks: {
    primary: 'pLtjrO4ubNh996M_Cubwsg',
    fallbacks: ['qToeLeMs43Q8cr7tRYXmJw'],
  },
};

/** 外部覆盖配置文件名（位于应用数据目录，与各 store 的持久化 JSON 同级） */
export const QUERY_IDS_OVERRIDE_FILE = 'query-ids.json';

type OverrideConfig = Partial<
  Record<GraphQLOperation, Partial<QueryIdEntry>>
> | null;

let overridePromise: Promise<OverrideConfig> | null = null;

/** 读取外部覆盖配置（仅读取一次，结果缓存） */
function loadOverrideConfig(): Promise<OverrideConfig> {
  if (!overridePromise) {
    overridePromise = (async () => {
      try {
        const file = await path
          .appDataDir()
          .then((dir) => path.join(dir, QUERY_IDS_OVERRIDE_FILE));
        if (!(await fs.exists(file))) {
          return null;
        }
        const parsed = JSON.parse(await fs.readTextFile(file));
        return parsed && typeof parsed === 'object' ? parsed : null;
      } catch (err) {
        log.warn('读取 query-ids.json 失败，忽略外部覆盖配置', err);
        return null;
      }
    })();
  }
  return overridePromise;
}

/**
 * 返回某 operation 的候选 queryId（primary 在前，fallbacks 在后，去重）。
 * 请求方按顺序尝试，直到某个 ID 返回成功。
 */
export async function getCandidateQueryIds(
  operation: GraphQLOperation,
): Promise<string[]> {
  const defaults = DEFAULT_QUERY_IDS[operation];
  let primary = defaults.primary;
  let fallbacks = defaults.fallbacks;

  const override = (await loadOverrideConfig())?.[operation];
  if (override) {
    if (typeof override.primary === 'string' && override.primary.trim()) {
      primary = override.primary.trim();
    }
    if (Array.isArray(override.fallbacks)) {
      fallbacks = override.fallbacks.filter(
        (v): v is string => typeof v === 'string' && Boolean(v.trim()),
      );
    }
  }

  return Array.from(new Set([primary, ...fallbacks]));
}
