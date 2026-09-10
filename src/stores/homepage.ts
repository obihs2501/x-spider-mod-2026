import { create } from 'zustand';
import { TwitterUser } from '../interfaces/TwitterUser';
import {
  getAccountInfo,
  getBookmarks,
  getLikes,
  getUser,
  getUserMedias,
  searchTimeline,
} from '../twitter/api';
import { TwitterPost } from '../interfaces/TwitterPost';
import { DownloadFilter } from '../interfaces/DownloadFilter';
import MediaType from '../enums/MediaType';
import { produce } from 'immer';
import { useAccountsStore } from './accounts';

export interface PostListRequest {
  list?: TwitterPost[];
  loading: boolean;
  cursor: string | null;
}

export interface UserInfoRequest {
  data?: TwitterUser;
  loading: boolean;
}

/** 主页下载模式：博主/帖子、高级搜索、我的喜欢、我的书签 */
export type HomepageMode = 'user' | 'search' | 'likes' | 'bookmarks';

export interface HomepageStore {
  keyword: string;
  setKeyword: (kw: string) => void;
  filter: DownloadFilter;
  setFilter: (filter: DownloadFilter) => void;

  mode: HomepageMode;
  setMode: (mode: HomepageMode) => void;
  /** 高级搜索语句（支持 X 搜索语法） */
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  /** 登录账号自己的用户信息（我的喜欢 / 书签模式需要） */
  selfUser?: TwitterUser;
  loadSelfUser: () => Promise<TwitterUser>;

  // 单条帖子解析预览（跨页面保留）
  postPreview: TwitterPost | null;
  setPostPreview: (post: TwitterPost | null) => void;

  userInfo: UserInfoRequest;
  loadUser: (screenName: string) => Promise<void>;
  clearUser: () => void;
  resetToInitial: () => void;

  postList: PostListRequest;
  clearPostList: () => void;
  loadPostList: () => Promise<void>;
  loadMorePostList: () => Promise<void>;
}

type PageFetcher = (
  cursor?: string,
) => Promise<{ twitterPosts: TwitterPost[]; cursor: string | null }>;

/** 按当前模式构造分页加载函数；条件不满足（未加载用户/未填搜索词）时返回 null */
function buildFetcher(state: HomepageStore): PageFetcher | null {
  switch (state.mode) {
    case 'search': {
      const query = state.searchQuery.trim();
      if (!query) return null;
      return (cursor) => searchTimeline(query, cursor);
    }
    case 'likes': {
      const id = state.selfUser?.id;
      if (!id) return null;
      return (cursor) => getLikes(id, cursor);
    }
    case 'bookmarks':
      return (cursor) => getBookmarks(cursor);
    default: {
      const id = state.userInfo.data?.id;
      if (!id) return null;
      return (cursor) => getUserMedias(id, cursor);
    }
  }
}

let loadPostListAbortController = new AbortController();
let loadUserAbortController = new AbortController();

export const useHomepageStore = create<HomepageStore>((set, get) => ({
  keyword: '',
  setKeyword: (kw: string) => set({ keyword: kw }),
  filter: {
    mediaTypes: [MediaType.Photo, MediaType.Video, MediaType.Gif],
    source: 'medias',
  },
  setFilter: (filter) => set({ filter }),

  mode: 'user',
  setMode: (mode) => {
    if (mode === get().mode) return;
    loadPostListAbortController.abort();
    set({
      mode,
      postList: { cursor: null, list: undefined, loading: false },
    });
  },
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  selfUser: undefined,
  loadSelfUser: async () => {
    const cached = get().selfUser;
    if (cached) return cached;
    const account = useAccountsStore.getState().getActiveAccount();
    if (!account) {
      throw new Error('请先在左上角「账号池」中添加已登录的账号');
    }
    let screenName = account.screenName;
    if (!screenName) {
      const info = await getAccountInfo(account.cookieString);
      screenName = info.screenName;
      useAccountsStore
        .getState()
        .updateAccount(account.id, { screenName, avatar: info.avatar });
    }
    const user = await getUser(screenName);
    set({ selfUser: user });
    return user;
  },

  postPreview: null,
  setPostPreview: (post) => set({ postPreview: post }),

  userInfo: {
    loading: false,
    data: undefined,
  },
  loadUser: async (screenName: string) => {
    loadUserAbortController.abort();
    loadUserAbortController = new AbortController();
    const abortController = loadUserAbortController;

    set({
      userInfo: {
        data: undefined,
        loading: true,
      },
    });

    try {
      const value = await getUser(screenName);

      if (abortController.signal.aborted) {
        return;
      }

      set({
        userInfo: {
          loading: false,
          data: value,
        },
      });
    } catch (err: any) {
      if (abortController.signal.aborted) {
        return;
      }
      set({
        userInfo: {
          data: undefined,
          loading: false,
        },
      });
      throw err;
    }
  },
  clearUser: () =>
    set({
      userInfo: {
        loading: false,
        data: undefined,
      },
    }),
  resetToInitial: () => {
    loadUserAbortController.abort();
    loadPostListAbortController.abort();
    set({
      keyword: '',
      postPreview: null,
      userInfo: {
        loading: false,
        data: undefined,
      },
      postList: {
        cursor: null,
        list: undefined,
        loading: false,
      },
    });
  },

  postList: {
    list: undefined,
    loading: false,
    cursor: null,
  },
  clearPostList: () => {
    set({
      postList: {
        cursor: null,
        list: undefined,
        loading: false,
      },
    });
  },
  loadPostList: async () => {
    loadPostListAbortController.abort();
    loadPostListAbortController = new AbortController();
    const abortController = loadPostListAbortController;
    const state = get();
    const fetchPage = buildFetcher(state);

    if (!fetchPage) {
      throw new Error(
        state.mode === 'search' ? '请先输入搜索语句' : '未加载用户信息',
      );
    }

    set({
      postList: {
        cursor: null,
        list: undefined,
        loading: true,
      },
    });

    try {
      const { cursor, twitterPosts } = await fetchPage();

      if (abortController.signal.aborted) {
        return;
      }

      set({
        postList: {
          list: twitterPosts,
          loading: false,
          cursor,
        },
      });
    } catch (err: any) {
      if (abortController.signal.aborted) {
        return;
      }
      log.error('Failed to load post list', err);
      set({
        postList: {
          cursor: null,
          list: [],
          loading: false,
        },
      });
      throw new Error(`加载列表失败：${err?.message || '未知原因'}`);
    }
  },
  loadMorePostList: async () => {
    const state = get();
    const postList = state.postList;
    const fetchPage = buildFetcher(state);

    if (!postList.list) {
      throw new Error('未初始化列表');
    }
    if (postList.loading) {
      throw new Error('已正在加载中');
    }
    if (!postList.cursor) {
      throw new Error('没有更多数据了');
    }
    if (!fetchPage) {
      throw new Error('未加载用户信息');
    }

    set(
      produce(state, (draft) => {
        draft.postList.loading = true;
      }),
    );

    loadPostListAbortController.abort();
    loadPostListAbortController = new AbortController();
    const abortController = loadPostListAbortController;

    try {
      const { twitterPosts, cursor } = await fetchPage(postList.cursor);

      if (abortController.signal.aborted) {
        return;
      }

      set({
        postList: {
          loading: false,
          list: (postList.list || []).concat(twitterPosts),
          cursor,
        },
      });
    } catch (err: any) {
      if (abortController.signal.aborted) {
        return;
      }
      set(
        produce(get(), (draft) => {
          draft.postList.loading = false;
        }),
      );
      throw err;
    }
  },
}));
