/* eslint-disable react/prop-types */
import {
  AppstoreOutlined,
  FolderFilled,
  FolderOpenOutlined,
  LinkOutlined,
  PictureOutlined,
  ReloadOutlined,
  SearchOutlined,
  SettingOutlined,
  SortAscendingOutlined,
  SortDescendingOutlined,
  UnorderedListOutlined,
} from '@ant-design/icons';
import { shell, tauri } from '@tauri-apps/api';
import {
  App,
  Avatar,
  Button,
  Empty,
  Input,
  Popover,
  Segmented,
  Select,
  Slider,
  Spin,
  Switch,
  Tooltip,
} from 'antd';
import clsx from 'clsx';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FolderSidebar } from '../components/gallery/FolderSidebar';
import { MediaLightbox } from '../components/gallery/MediaLightbox';
import { MediaRow, MediaTile } from '../components/gallery/MediaTile';
import { GalleryFolderItem } from '../components/gallery/types';
import { PageHeader } from '../components/PageHeader';
import { useBloggerStore } from '../stores/bloggers';
import {
  GALLERY_MAX_COLUMNS,
  GALLERY_MIN_COLUMNS,
  GalleryFolder,
  GalleryMedia,
  useGalleryStore,
} from '../stores/gallery';
import { useLocalIndexStore } from '../stores/local-index';
import { useSettingsStore } from '../stores/settings';
import { buildUserUrl } from '../twitter/url';
import { parseBloggerFolder } from '../utils/blogger-folder';
import { compareNames, formatRelativeDate } from '../utils/gallery-media';
import { showInFolder } from '../utils/shell';

async function waitHydrated(persistApi: {
  hasHydrated: () => boolean;
  onFinishHydration: (fn: () => void) => () => void;
}) {
  if (persistApi.hasHydrated()) return;
  await new Promise<void>((resolve) => {
    const unsub = persistApi.onFinishHydration(() => {
      unsub();
      resolve();
    });
  });
}

const SubfolderCard: React.FC<{
  folder: GalleryFolder;
  list: boolean;
  onOpen: () => void;
}> = ({ folder, list, onOpen }) => (
  <button
    className={clsx(
      'flex items-center gap-3 text-left bg-ant-color-bg-container border border-ant-color-border-secondary hover:border-ant-color-primary transition-colors',
      list ? 'w-full p-3 rounded-lg' : 'p-3 rounded-xl',
    )}
    onClick={onOpen}
    title={folder.name}
  >
    <FolderFilled className="text-2xl text-ant-color-primary shrink-0" />
    <span className="min-w-0 flex-1">
      <span className="block truncate text-sm">{folder.name}</span>
      <span className="block text-xs text-ant-color-text-tertiary">
        {formatRelativeDate(folder.modifiedAt) || '文件夹'}
      </span>
    </span>
  </button>
);

export const Gallery: React.FC = () => {
  const { message } = App.useApp();
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const {
    folders,
    foldersLoading,
    folderStack,
    medias,
    subfolders,
    scanning,
    mediaCache,
    visibleCount,
    showMore,
    columns,
    setColumns,
    fitMode,
    setFitMode,
    viewMode,
    setViewMode,
    folderSortBy,
    folderSortOrder,
    mediaSortBy,
    setMediaSortBy,
    mediaSortOrder,
    setMediaSortOrder,
    typeFilter,
    setTypeFilter,
    videoThumbs,
    setVideoThumbs,
    folderSearch,
    mediaSearch,
    setMediaSearch,
    loadFolders,
    openFolder,
    goBack,
  } = useGalleryStore();
  const { bloggers, groups } = useBloggerStore((s) => ({
    bloggers: s.bloggers,
    groups: s.groups,
  }));
  const bloggerStats = useLocalIndexStore((s) => s.bloggerStats);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const currentFolder = folderStack[folderStack.length - 1] || null;
  const rootFolder = folderStack[0] || null;

  const reportError = useCallback(
    (prefix: string, err: any) => {
      log.error(err);
      message.error(`${prefix}：${err?.message || err}`);
    },
    [message],
  );

  const refreshFolders = useCallback(async () => {
    if (!saveDirBase) return;
    try {
      await loadFolders(saveDirBase);
    } catch (err) {
      reportError('读取目录失败', err);
    }
  }, [loadFolders, reportError, saveDirBase]);

  const enterFolder = useCallback(
    async (folder: GalleryFolder, stack: GalleryFolder[], force = false) => {
      setLightboxIndex(null);
      try {
        await openFolder(folder, stack, force);
      } catch (err) {
        reportError('扫描文件失败', err);
        useGalleryStore.getState().closeFolder();
      }
    },
    [openFolder, reportError],
  );

  // 进入页面：等待持久化状态恢复后校验根目录是否变化（新增/删除文件夹），
  // 然后处理其他页面请求打开的路径，或恢复上次浏览的文件夹
  useEffect(() => {
    if (!saveDirBase) return;
    let cancelled = false;
    (async () => {
      await waitHydrated(useGalleryStore.persist);
      if (cancelled) return;
      const store = useGalleryStore.getState();
      try {
        await store.refreshFoldersIfChanged(saveDirBase);
      } catch (err) {
        reportError('读取目录失败', err);
      }
      if (cancelled) return;
      const state = useGalleryStore.getState();
      if (state.pendingOpenPath) {
        const target = state.pendingOpenPath;
        state.setPendingOpenPath(null);
        try {
          const ok = await state.openPath(target);
          if (!ok) message.warning('画廊中未找到该文件夹，请先刷新文件夹列表');
        } catch (err) {
          reportError('扫描文件失败', err);
        }
        return;
      }
      const stack = state.folderStack;
      if (stack.length === 0) return;
      const leaf = stack[stack.length - 1];
      if (!state.folders.some((f) => f.path === stack[0].path)) {
        state.closeFolder();
        return;
      }
      if (!state.mediaCache[leaf.path]) {
        await enterFolder(leaf, stack);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saveDirBase]);

  // ---- 左侧文件夹列表：关联博主头像 / 分组 / 数量 ----
  const folderItems = useMemo<GalleryFolderItem[]>(() => {
    const bloggerMap = new Map(
      bloggers.map((b) => [b.screenName.toLowerCase(), b]),
    );
    const statsMap = new Map(
      Object.entries(bloggerStats).map(([k, v]) => [k.toLowerCase(), v]),
    );
    return folders.map((folder) => {
      const parsed = parseBloggerFolder(folder.name);
      const key = parsed?.screenName.toLowerCase();
      const blogger = key ? bloggerMap.get(key) : undefined;
      const stats = key ? statsMap.get(key) : undefined;
      const cached = mediaCache[folder.path];
      return {
        folder,
        displayName: blogger?.name || parsed?.name || folder.name,
        screenName: blogger?.screenName || parsed?.screenName,
        avatar: blogger?.avatar,
        groupId: blogger?.groupId,
        count: stats?.mediaCount ?? cached?.medias.length,
      };
    });
  }, [bloggerStats, bloggers, folders, mediaCache]);

  const sortedFolderItems = useMemo(() => {
    const q = folderSearch.trim().toLowerCase();
    const filtered = q
      ? folderItems.filter(
          (item) =>
            item.folder.name.toLowerCase().includes(q) ||
            item.displayName.toLowerCase().includes(q) ||
            (item.screenName || '').toLowerCase().includes(q),
        )
      : folderItems;
    const direction = folderSortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const result =
        folderSortBy === 'modifiedAt'
          ? (a.folder.modifiedAt || 0) - (b.folder.modifiedAt || 0)
          : compareNames(a.displayName, b.displayName);
      return result * direction;
    });
  }, [folderItems, folderSearch, folderSortBy, folderSortOrder]);

  const currentItem = useMemo(
    () =>
      rootFolder
        ? folderItems.find((i) => i.folder.path === rootFolder.path)
        : undefined,
    [folderItems, rootFolder],
  );

  // ---- 右侧内容：筛选 + 排序 ----
  const sortedSubfolders = useMemo(() => {
    const q = mediaSearch.trim().toLowerCase();
    const filtered = q
      ? subfolders.filter((f) => f.name.toLowerCase().includes(q))
      : subfolders;
    const direction = folderSortOrder === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const result =
        folderSortBy === 'modifiedAt'
          ? (a.modifiedAt || 0) - (b.modifiedAt || 0)
          : compareNames(a.name, b.name);
      return result * direction;
    });
  }, [subfolders, mediaSearch, folderSortBy, folderSortOrder]);

  const typeCounts = useMemo(() => {
    let images = 0;
    let videos = 0;
    for (const m of medias) {
      if (m.isVideo) videos++;
      else images++;
    }
    return { images, videos };
  }, [medias]);

  const sortedMedias = useMemo(() => {
    const q = mediaSearch.trim().toLowerCase();
    const filtered = medias.filter((m) => {
      if (typeFilter === 'image' && m.isVideo) return false;
      if (typeFilter === 'video' && !m.isVideo) return false;
      if (q && !m.name.toLowerCase().includes(q)) return false;
      return true;
    });
    const direction = mediaSortOrder === 'asc' ? 1 : -1;
    return filtered.sort((a, b) => {
      let result: number;
      if (mediaSortBy === 'modifiedAt') {
        result = (a.modifiedAt || 0) - (b.modifiedAt || 0);
      } else if (mediaSortBy === 'size') {
        result = (a.size || 0) - (b.size || 0);
      } else {
        result = compareNames(a.name, b.name);
      }
      return result * direction;
    });
  }, [medias, mediaSearch, typeFilter, mediaSortBy, mediaSortOrder]);

  const visibleMedias = useMemo(
    () => sortedMedias.slice(0, visibleCount),
    [sortedMedias, visibleCount],
  );
  const hasMore = visibleCount < sortedMedias.length;

  // 滚动到底部自动加载下一页
  useEffect(() => {
    const root = contentRef.current;
    const sentinel = sentinelRef.current;
    if (!root || !sentinel || !hasMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) showMore();
      },
      { root, rootMargin: '600px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, showMore, visibleMedias.length]);

  // 切换文件夹时滚动回顶部
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0 });
  }, [currentFolder?.path]);

  const openExternal = useCallback(
    (m: GalleryMedia) => {
      shell.open(m.path).catch((err) => reportError('打开失败', err));
    },
    [reportError],
  );
  const revealInFolder = useCallback(
    (m: GalleryMedia) => {
      showInFolder(m.path, true).catch((err) => reportError('打开失败', err));
    },
    [reportError],
  );

  const closeLightbox = useCallback(() => {
    // 预览时翻到了尚未渲染的项目，关闭后把网格补齐到该位置
    setLightboxIndex((current) => {
      if (current !== null && current >= useGalleryStore.getState().visibleCount) {
        useGalleryStore.setState({ visibleCount: current + 1 });
      }
      return null;
    });
  }, []);

  const displaySettings = (
    <div className="w-56 space-y-3">
      <div>
        <div className="text-xs text-ant-color-text-secondary mb-1">
          每行列数：{columns}
        </div>
        <Slider
          min={GALLERY_MIN_COLUMNS}
          max={GALLERY_MAX_COLUMNS}
          value={columns}
          onChange={(v) => setColumns(v)}
          tooltip={{ open: false }}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ant-color-text-secondary">缩略图</span>
        <Segmented
          size="small"
          value={fitMode}
          onChange={(v) => setFitMode(v as 'cover' | 'contain')}
          options={[
            { label: '裁剪填充', value: 'cover' },
            { label: '完整显示', value: 'contain' },
          ]}
        />
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-ant-color-text-secondary">
          视频首帧缩略图
        </span>
        <Switch size="small" checked={videoThumbs} onChange={setVideoThumbs} />
      </div>
    </div>
  );

  const gridStyle = {
    gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
  };

  return (
    <div className="flex flex-col h-screen">
      <PageHeader />
      {!saveDirBase ? (
        <Empty description="请先在「设置」中配置保存路径" className="mt-20" />
      ) : (
        <div className="flex grow min-h-0 pb-4">
          <FolderSidebar
            items={sortedFolderItems}
            totalCount={folders.length}
            groups={groups}
            selectedPath={rootFolder?.path}
            loading={foldersLoading}
            onSelect={(folder) => enterFolder(folder, [folder])}
            onRefresh={refreshFolders}
            onOpenRoot={() => shell.open(saveDirBase)}
          />

          <section className="flex flex-col grow min-w-0 min-h-0">
            {!currentFolder ? (
              <div className="grow flex flex-col items-center justify-center text-ant-color-text-tertiary">
                <PictureOutlined className="text-6xl mb-4 opacity-40" />
                <p className="text-base">
                  {folders.length === 0
                    ? '保存目录下暂无文件夹'
                    : '从左侧选择一个博主 / 文件夹开始浏览'}
                </p>
                <p className="text-xs mt-2 opacity-70">
                  共 {folders.length} 个文件夹
                  {foldersLoading && ' · 正在刷新…'}
                </p>
              </div>
            ) : (
              <>
                {/* 标题行：博主信息 + 面包屑 + 操作 */}
                <div className="flex items-center gap-3 mb-2 min-w-0">
                  {currentItem?.avatar ? (
                    <Avatar src={currentItem.avatar} size={40} />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-ant-color-fill-secondary flex items-center justify-center shrink-0">
                      <FolderFilled className="text-xl text-ant-color-primary" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 min-w-0 text-base font-bold leading-6">
                      {folderStack.map((f, i) => {
                        const isLast = i === folderStack.length - 1;
                        const label =
                          i === 0 ? currentItem?.displayName || f.name : f.name;
                        return (
                          <React.Fragment key={f.path}>
                            {i > 0 && (
                              <span className="text-ant-color-text-quaternary shrink-0">
                                /
                              </span>
                            )}
                            {isLast ? (
                              <span className="truncate" title={f.name}>
                                {label}
                              </span>
                            ) : (
                              <button
                                className="truncate max-w-[200px] bg-transparent text-ant-color-text-tertiary hover:text-ant-color-primary transition-colors"
                                title={f.name}
                                onClick={() =>
                                  enterFolder(f, folderStack.slice(0, i + 1))
                                }
                              >
                                {label}
                              </button>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                    <div className="text-xs text-ant-color-text-tertiary truncate">
                      {currentItem?.screenName && folderStack.length === 1 && (
                        <span className="mr-2">@{currentItem.screenName}</span>
                      )}
                      {subfolders.length > 0 && `${subfolders.length} 个子文件夹 · `}
                      {typeCounts.images} 张图片 · {typeCounts.videos} 个视频
                      {scanning && (
                        <span className="ml-2 text-ant-color-primary">
                          <ReloadOutlined spin /> 正在扫描…
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {folderStack.length > 1 && (
                      <Button size="small" onClick={goBack}>
                        上一级
                      </Button>
                    )}
                    <Tooltip title="重新扫描当前文件夹">
                      <Button
                        type="text"
                        icon={<ReloadOutlined spin={scanning} />}
                        onClick={() =>
                          enterFolder(currentFolder, folderStack, true)
                        }
                      />
                    </Tooltip>
                    <Tooltip title="在资源管理器中打开">
                      <Button
                        type="text"
                        icon={<FolderOpenOutlined />}
                        onClick={() => shell.open(currentFolder.path)}
                      />
                    </Tooltip>
                    {currentItem?.screenName && (
                      <Tooltip title="打开 X 主页">
                        <Button
                          type="text"
                          icon={<LinkOutlined />}
                          onClick={() =>
                            shell.open(buildUserUrl(currentItem.screenName!))
                          }
                        />
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* 工具栏：筛选 / 搜索 / 排序 / 视图 */}
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <Segmented
                    size="small"
                    value={typeFilter}
                    onChange={(v) => setTypeFilter(v as typeof typeFilter)}
                    options={[
                      { label: `全部 ${medias.length}`, value: 'all' },
                      { label: `图片 ${typeCounts.images}`, value: 'image' },
                      { label: `视频 ${typeCounts.videos}`, value: 'video' },
                    ]}
                  />
                  <Input
                    size="small"
                    allowClear
                    prefix={
                      <SearchOutlined className="text-ant-color-text-quaternary" />
                    }
                    placeholder="筛选文件名"
                    value={mediaSearch}
                    onChange={(e) => setMediaSearch(e.target.value)}
                    className="w-44"
                  />
                  <span className="ml-auto flex items-center gap-1.5">
                    <Select
                      size="small"
                      value={mediaSortBy}
                      onChange={(v) => setMediaSortBy(v)}
                      popupMatchSelectWidth={false}
                      options={[
                        { label: '按名称', value: 'name' },
                        { label: '按修改时间', value: 'modifiedAt' },
                        { label: '按大小', value: 'size' },
                      ]}
                    />
                    <Tooltip
                      title={mediaSortOrder === 'asc' ? '升序' : '降序'}
                    >
                      <Button
                        size="small"
                        icon={
                          mediaSortOrder === 'asc' ? (
                            <SortAscendingOutlined />
                          ) : (
                            <SortDescendingOutlined />
                          )
                        }
                        onClick={() =>
                          setMediaSortOrder(
                            mediaSortOrder === 'asc' ? 'desc' : 'asc',
                          )
                        }
                      />
                    </Tooltip>
                    <Segmented
                      size="small"
                      value={viewMode}
                      onChange={(v) => setViewMode(v as 'thumbnail' | 'list')}
                      options={[
                        {
                          label: (
                            <Tooltip title="网格">
                              <AppstoreOutlined />
                            </Tooltip>
                          ),
                          value: 'thumbnail',
                        },
                        {
                          label: (
                            <Tooltip title="列表">
                              <UnorderedListOutlined />
                            </Tooltip>
                          ),
                          value: 'list',
                        },
                      ]}
                    />
                    <Popover
                      content={displaySettings}
                      trigger="click"
                      placement="bottomRight"
                    >
                      <Tooltip title="显示设置">
                        <Button size="small" icon={<SettingOutlined />} />
                      </Tooltip>
                    </Popover>
                  </span>
                </div>

                {/* 内容区 */}
                <div
                  ref={contentRef}
                  className="grow min-h-0 overflow-y-auto pr-1 pb-6"
                >
                  {scanning && medias.length === 0 && subfolders.length === 0 ? (
                    <div className="flex justify-center mt-20">
                      <Spin tip="正在读取…" />
                    </div>
                  ) : medias.length === 0 && subfolders.length === 0 ? (
                    <Empty
                      description="该文件夹内没有媒体文件"
                      className="mt-20"
                    />
                  ) : (
                    <>
                      {sortedSubfolders.length > 0 && (
                        <div
                          className={clsx(
                            'mb-3',
                            viewMode === 'list' ? 'space-y-2' : 'grid gap-2',
                          )}
                          style={viewMode === 'list' ? undefined : gridStyle}
                        >
                          {sortedSubfolders.map((f) => (
                            <SubfolderCard
                              key={f.path}
                              folder={f}
                              list={viewMode === 'list'}
                              onOpen={() => enterFolder(f, [...folderStack, f])}
                            />
                          ))}
                        </div>
                      )}
                      {sortedMedias.length === 0 ? (
                        medias.length > 0 && (
                          <Empty
                            image={Empty.PRESENTED_IMAGE_SIMPLE}
                            description="没有符合筛选条件的文件"
                            className="mt-10"
                          />
                        )
                      ) : viewMode === 'list' ? (
                        <div className="space-y-2">
                          {visibleMedias.map((m, i) => (
                            <MediaRow
                              key={m.path}
                              media={m}
                              src={tauri.convertFileSrc(m.path)}
                              fitMode={fitMode}
                              videoThumbs={videoThumbs}
                              onOpen={() => setLightboxIndex(i)}
                              onOpenExternal={() => openExternal(m)}
                              onShowInFolder={() => revealInFolder(m)}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="grid gap-2" style={gridStyle}>
                          {visibleMedias.map((m, i) => (
                            <MediaTile
                              key={m.path}
                              media={m}
                              src={tauri.convertFileSrc(m.path)}
                              fitMode={fitMode}
                              videoThumbs={videoThumbs}
                              onOpen={() => setLightboxIndex(i)}
                              onOpenExternal={() => openExternal(m)}
                              onShowInFolder={() => revealInFolder(m)}
                            />
                          ))}
                        </div>
                      )}
                      {hasMore && (
                        <div
                          ref={sentinelRef}
                          className="flex justify-center py-4 text-xs text-ant-color-text-tertiary"
                        >
                          <Spin size="small" />
                          <span className="ml-2">
                            已显示 {visibleMedias.length} / {sortedMedias.length}
                          </span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      )}
      <MediaLightbox
        items={sortedMedias}
        index={lightboxIndex}
        onClose={closeLightbox}
        onNavigate={setLightboxIndex}
        onOpenExternal={openExternal}
        onShowInFolder={revealInFolder}
      />
    </div>
  );
};
