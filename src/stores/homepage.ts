import { create } from 'zustand';
import { TwitterUser } from '../interfaces/TwitterUser';
import { getUser, getUserMedias } from '../twitter/api';
import { TwitterPost } from '../interfaces/TwitterPost';
import { DownloadFilter } from '../interfaces/DownloadFilter';
import MediaType from '../enums/MediaType';
import { produce } from 'immer';

export interface PostListRequest {
  list?: TwitterPost[];
  loading: boolean;
  cursor: string | null;
}

export interface UserInfoRequest {
  data?: TwitterUser;
  loading: boolean;
}

export interface HomepageStore {
  keyword: string;
  setKeyword: (kw: string) => void;
  filter: DownloadFilter;
  setFilter: (filter: DownloadFilter) => void;

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
  postListGenerator: undefined,
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
    const userInfo = state.userInfo.data;

    if (!userInfo) {
      throw new Error('No userInfo');
    }

    set({
      postList: {
        cursor: null,
        list: undefined,
        loading: true,
      },
    });

    try {
      const { cursor, twitterPosts } = await getUserMedias(userInfo.id);

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
      throw new Error(`加载图片列表失败：${err?.message || '未知原因'}`);
    }
  },
  loadMorePostList: async () => {
    const state = get();
    const postList = state.postList;
    const userInfo = state.userInfo.data;

    if (!postList.list) {
      throw new Error('未初始化列表');
    }
    if (postList.loading) {
      throw new Error('已正在加载中');
    }
    if (!postList.cursor) {
      throw new Error('没有更多数据了');
    }
    if (!userInfo) {
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
      const { twitterPosts, cursor } = await getUserMedias(
        userInfo.id,
        postList.cursor,
      );

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
