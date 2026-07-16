/* eslint-disable react/prop-types */
import { Avatar, Button, Collapse, Input, Space, App } from 'antd';
import React, { useRef, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import { PostListGridView } from '../components/homepage/PostListGridView';
import { DownloadController } from '../components/homepage/DownloadController';
import { PostPreview } from '../components/homepage/PostPreview';
import { useAppStateStore } from '../stores/app-state';
import { useHomepageStore } from '../stores/homepage';
import { useDownloadStore } from '../stores/download';
import { buildUserUrl, parsePostUrl } from '../twitter/url';
import { getTweetDetail } from '../twitter/api';

export const Homepage: React.FC = () => {
  const { message } = App.useApp();
  const {
    keyword,
    setKeyword,
    userInfo,
    clearUser,
    loadUser,
    clearPostList: clearMediaList,
    postPreview,
    setPostPreview,
  } = useHomepageStore();
  const { searchHistory, addSearchHistory, clearSearchHistory, cookieString } =
    useAppStateStore((s) => ({
      searchHistory: s.searchHistory,
      addSearchHistory: s.addSearchHistory,
      clearSearchHistory: s.clearSearchHistory,
      cookieString: s.cookieString,
    }));
  const searchAbortControllerRef = useRef<AbortController>();
  const { batchCreateDownloadTask } = useDownloadStore((s) => ({
    batchCreateDownloadTask: s.batchCreateDownloadTask,
  }));
  const [postDownloading, setPostDownloading] = useState(false);

  // 解析单条帖子并展示预览（不自动下载）
  const parseSinglePost = async (url: string) => {
    const parsed = parsePostUrl(url);
    if (!parsed) return false;

    setKeyword(url.trim());
    clearUser();
    clearMediaList();
    setPostPreview(null);

    const hide = message.loading('正在解析帖子…', 0);
    try {
      const post = await getTweetDetail(parsed.postId);
      setPostPreview(post);
      addSearchHistory(url.trim());
    } catch (err: any) {
      log.error(err);
      message.error(`解析帖子失败：${err?.message || '未知原因'}`);
    } finally {
      hide();
    }
    return true;
  };

  const downloadPreviewPost = async () => {
    if (!postPreview) return;
    const medias = postPreview.medias || [];
    if (medias.length === 0) {
      message.warning('该帖子没有可下载的媒体');
      return;
    }
    setPostDownloading(true);
    try {
      await batchCreateDownloadTask(
        medias.map((media) => ({ post: postPreview, media })),
      );
      message.success(
        `已创建 ${medias.length} 个下载任务，请到下载管理页查看`,
      );
    } catch (err: any) {
      log.error(err);
      message.error(`创建下载任务失败：${err?.message || '未知原因'}`);
    } finally {
      setPostDownloading(false);
    }
  };

  const startSearch = async (sn: string) => {
    if (!sn) return;
    sn = sn.trim();

    // 若输入是帖子链接，则解析单条帖子并预览
    if (await parseSinglePost(sn)) return;

    setKeyword(sn);
    setPostPreview(null);

    if (searchAbortControllerRef.current) {
      searchAbortControllerRef.current.abort('Another search');
    }

    clearUser();
    clearMediaList();

    try {
      await loadUser(sn);
      addSearchHistory(sn);
    } catch (err: any) {
      log.error(err);
      message.error('加载失败，请检查用户 ID 是否正确');
    }
  };

  return (
    <div className="flex flex-col h-screen">
      <div>
        <PageHeader />
        <div className="shrink-0">
          <section aria-label="搜索用户">
            <Space.Compact block>
              <Input
                type="search"
                autoComplete="search"
                disabled={userInfo.loading}
                onPressEnter={() => startSearch(keyword)}
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder={
                  cookieString
                    ? '输入用户 ID 或帖子链接，如：shiratamacaron 或 https://x.com/xxx/status/123'
                    : '免登录模式：输入用户 ID 或帖子链接（仅公开账号）'
                }
                className="text-center"
              />
              <Button
                disabled={!keyword}
                loading={userInfo.loading}
                onClick={() => startSearch(keyword)}
                type="primary"
              >
                加载
              </Button>
              {userInfo.loading && (
                <span className="sr-only" role="status">
                  加载用户信息中
                </span>
              )}
            </Space.Compact>
            {searchHistory.length > 0 && (
              <Collapse
                ghost
                size="small"
                className="mt-1 -ml-4"
                items={[
                  {
                    key: 'history',
                    label: (
                      <span className="text-sm">
                        搜索历史（{searchHistory.length}）
                        <Button
                          type="link"
                          size="small"
                          onClick={(e) => {
                            e.stopPropagation();
                            clearSearchHistory();
                          }}
                          className="!p-0 ml-2"
                        >
                          清空
                        </Button>
                      </span>
                    ),
                    children: (
                      <ul className="inline text-sm" aria-label="搜索历史">
                        {searchHistory.map((sn) => (
                          <li key={sn} className="inline">
                            <Button
                              disabled={userInfo.loading}
                              type="link"
                              size="small"
                              onClick={() => {
                                setKeyword(sn);
                                startSearch(sn);
                              }}
                            >
                              <span className="sr-only">搜索</span>
                              {sn}
                            </Button>
                          </li>
                        ))}
                      </ul>
                    ),
                  },
                ]}
              />
            )}
          </section>
          {postPreview && (
            <PostPreview
              post={postPreview}
              downloading={postDownloading}
              onDownload={downloadPreviewPost}
              onClose={() => setPostPreview(null)}
            />
          )}
          {userInfo.data && (
            <>
              <DownloadController />
              <section
                aria-label="用户信息"
                className="bg-white border-[1px] border-gray-300 rounded-md mt-4"
              >
                <span className="sr-only" role="status">
                  用户信息加载完成，当前搜索用户：
                  {userInfo.data.name || '未知用户'}
                </span>
                <a
                  title="跳转到主页"
                  className="flex items-center p-4 focus:outline !outline-4 !outline-cyan-200"
                  href={
                    userInfo.data.screenName
                      ? buildUserUrl(userInfo.data.screenName)
                      : 'javascript:void(0);'
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  <div>
                    <Avatar src={userInfo.data.avatar} size={50} alt="头像" />
                  </div>
                  <div className="ml-2">
                    <p>
                      {userInfo.data.name || '未知用户'}
                      <span className="text-gray-400">
                        （共 {userInfo.data.mediaCount || 0} 个媒体）
                      </span>
                    </p>
                    {userInfo.data.screenName ? (
                      <p className="text-ant-color-text-secondary text-sm mt-1">
                        @{userInfo.data.screenName}
                      </p>
                    ) : undefined}
                  </div>
                </a>
              </section>
            </>
          )}
        </div>
      </div>
      {userInfo.data && (
        <section
          className="relative grow mt-4 pb-4 overflow-hidden h-full min-h-[50vh]"
          aria-label="内容预览"
        >
          <PostListGridView />
        </section>
      )}
    </div>
  );
};
