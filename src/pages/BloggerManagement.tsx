/* eslint-disable react/prop-types */
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UsergroupAddOutlined,
  FolderAddOutlined,
  EditOutlined,
  CaretRightOutlined,
  CaretDownOutlined,
  DragOutlined,
} from '@ant-design/icons';
import { fs, shell } from '@tauri-apps/api';
import {
  App,
  Avatar,
  Button,
  Checkbox,
  DatePicker,
  Empty,
  Input,
  List,
  Modal,
  Progress,
  Radio,
  Tooltip,
  Dropdown,
  Space,
} from 'antd';
import dayjs, { Dayjs } from 'dayjs';
import React, { useMemo, useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import MediaType from '../enums/MediaType';
import { getFollowing, getListMembers, getUser } from '../twitter/api';
import { TwitterUser } from '../interfaces/TwitterUser';
import { BloggerRecord, useBloggerStore } from '../stores/bloggers';
import { useDownloadStore } from '../stores/download';
import { useLocalIndexStore } from '../stores/local-index';
import { useSettingsStore } from '../stores/settings';
import { useRouteStore } from '../stores/route';
import { useHomepageStore } from '../stores/homepage';
import { ROUTES } from '../constants/routes';
import { delay } from '../utils';

export const BloggerManagement: React.FC = () => {
  const { message, modal } = App.useApp();
  const {
    bloggers,
    groups,
    removeBlogger,
    createGroup,
    removeGroup,
    renameGroup,
    toggleGroupCollapse,
    moveBloggerToGroup,
  } = useBloggerStore();
  const createCreationTask = useDownloadStore((s) => s.createCreationTask);
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const { postIdCount, importFromDisk, bloggerStats } = useLocalIndexStore(
    (s) => ({
      postIdCount: s.postIds.length,
      importFromDisk: s.importFromDisk,
      bloggerStats: s.bloggerStats,
    }),
  );
  const setRoute = useRouteStore((s) => s.setRoute);
  const { resetToInitial, setKeyword, loadUser } = useHomepageStore((s) => ({
    resetToInitial: s.resetToInitial,
    setKeyword: s.setKeyword,
    loadUser: s.loadUser,
  }));

  const [importLoading, setImportLoading] = useState(false);
  const [incLoading, setIncLoading] = useState('');
  const [homepageLoading, setHomepageLoading] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [incrementalTargets, setIncrementalTargets] = useState<BloggerRecord[]>(
    [],
  );
  const [incrementalStart, setIncrementalStart] = useState<Dayjs>(dayjs());
  const [useCustomStart, setUseCustomStart] = useState(false);
  const [batchProgress, setBatchProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);

  const [importUsersOpen, setImportUsersOpen] = useState(false);
  const [importKind, setImportKind] = useState<'list' | 'following'>('list');
  const [importInput, setImportInput] = useState('');
  const [importFetching, setImportFetching] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importUsers, setImportUsers] = useState<TwitterUser[] | null>(null);

  const [renamingGroup, setRenamingGroup] = useState<string | null>(null);
  const [renamingValue, setRenamingValue] = useState('');
  const [createGroupOpen, setCreateGroupOpen] = useState(false);
  const [createGroupInput, setCreateGroupInput] = useState('');

  const fetchImportUsers = async () => {
    const input = importInput.trim().replace(/^@/, '');
    if (!input) return;
    setImportFetching(true);
    setImportUsers(null);
    setImportProgress(0);
    try {
      let users: TwitterUser[];
      if (importKind === 'list') {
        users = await getListMembers(input, setImportProgress);
      } else {
        const target = await getUser(input);
        users = await getFollowing(target.id, setImportProgress);
      }
      setImportUsers(users);
      if (users.length === 0) {
        message.warning('未获取到用户，请确认输入内容和登录 Cookie 是否有效');
      }
    } catch (err: any) {
      log.error(err);
      message.error(`获取失败：${err?.message || '未知原因'}`);
    } finally {
      setImportFetching(false);
    }
  };

  const confirmImportUsers = () => {
    if (!importUsers?.length) return;
    const added = useBloggerStore.getState().importBloggers(importUsers);
    message.success(
      `导入完成：新增 ${added} 位博主（${importUsers.length - added} 位已存在）`,
    );
    setImportUsersOpen(false);
    setImportUsers(null);
    setImportInput('');
  };

  const onImport = async () => {
    setImportLoading(true);
    try {
      const {
        total,
        added,
        bloggers: newBloggers,
      } = await importFromDisk(saveDirBase);
      message.success(
        `扫描完成：识别 ${total} 个帖子 ID（新增 ${added}），导入 ${newBloggers} 个新博主。`,
      );
    } catch (err: any) {
      log.error(err);
      message.error(`导入失败：${err?.message || err}`);
    } finally {
      setImportLoading(false);
    }
  };

  // 单个博主的增量起点：上次创建下载任务时间与本地最新文件日期中较新者
  // （latestFileAt 仅在重新扫描本地内容时更新，单独使用会一直停留在旧日期）
  const getBloggerStartTs = (b: BloggerRecord) =>
    Math.max(
      bloggerStats[b.screenName]?.latestFileAt || 0,
      b.lastDownloadAt || 0,
    );

  const openIncrementalDialog = (targets: BloggerRecord[]) => {
    if (targets.length === 0) return;
    let defaultStart = Number.POSITIVE_INFINITY;
    for (const b of targets) {
      const ts = getBloggerStartTs(b);
      if (ts > 0 && ts < defaultStart) defaultStart = ts;
    }
    if (!Number.isFinite(defaultStart) || defaultStart <= 0) {
      defaultStart = Date.now();
    }
    setUseCustomStart(false);
    setIncrementalTargets(targets);
    setIncrementalStart(dayjs(defaultStart));
  };

  /**
   * 创建增量下载任务。
   * - 有游标（lastSeenTweetId）时优先用游标精确截断（扫到该推文即停止翻页），
   *   dateRange 仍传入但仅作辅助过滤（下载器会取两者的交集）；
   * - 无游标时纯按日期范围抓取。
   */
  const createIncremental = async (
    b: BloggerRecord,
    since: Dayjs,
    stopAtTweetId?: string,
  ) => {
    const user = await getUser(b.screenName);
    createCreationTask(user, {
      mediaTypes: [MediaType.Photo, MediaType.Video, MediaType.Gif],
      dateRange: [since, dayjs()],
      source: 'medias' as const,
      stopAtTweetId,
    });
  };

  const startBatchIncremental = async () => {
    if (incrementalTargets.length === 0) return;
    setIncLoading('batch');
    setBatchProgress({ current: 0, total: incrementalTargets.length });
    const failed: string[] = [];
    for (let i = 0; i < incrementalTargets.length; i++) {
      setBatchProgress({ current: i + 1, total: incrementalTargets.length });
      const b = incrementalTargets[i];
      try {
        const since = useCustomStart
          ? incrementalStart
          : dayjs(getBloggerStartTs(b) || Date.now());
        await createIncremental(b, since, b.lastSeenTweetId);
        await delay(1200 + Math.floor(Math.random() * 1800));
      } catch (err: any) {
        log.error(err);
        failed.push(b.screenName);
      }
    }
    setIncrementalTargets([]);
    setIncLoading('');
    setBatchProgress(null);
    if (failed.length) {
      message.warning(
        `任务创建完成，失败：${failed.join('、')}（账号可能已被封禁、改名或注销，可从列表移除）`,
      );
    } else {
      message.success(
        `已创建 ${incrementalTargets.length} 位博主的增量下载任务`,
      );
    }
  };

  const openLocalFolder = async (b: BloggerRecord) => {
    const directoryPath = bloggerStats[b.screenName]?.directoryPath;
    if (!directoryPath || !(await fs.exists(directoryPath))) {
      message.warning('未找到该博主的本地文件夹，请先导入本地已下载内容');
      return;
    }
    await shell.open(directoryPath);
  };

  const openInGallery = async (b: BloggerRecord) => {
    const directoryPath = bloggerStats[b.screenName]?.directoryPath;
    if (!directoryPath || !(await fs.exists(directoryPath))) {
      message.warning('未找到该博主的本地文件夹，请先导入本地已下载内容');
      return;
    }
    // 使用 useGalleryStore 导入并设置待打开的路径
    const { setPendingOpenPath } = await import('../stores/gallery').then((m) =>
      m.useGalleryStore.getState(),
    );
    setPendingOpenPath(directoryPath);
    const galleryRoute = ROUTES.find((r) => r.id === 'gallery');
    if (galleryRoute) setRoute(galleryRoute);
  };

  const gotoHomepage = async (screenName: string) => {
    setHomepageLoading(screenName);
    resetToInitial();
    setKeyword(screenName);
    const home = ROUTES.find((r) => r.id === 'home');
    if (home) setRoute(home);
    try {
      await loadUser(screenName);
    } catch (err: any) {
      log.error(err);
      message.error(`加载博主失败：${err?.message || '未知原因'}`);
    } finally {
      setHomepageLoading('');
    }
  };

  const handleCreateGroup = () => {
    setCreateGroupInput('');
    setCreateGroupOpen(true);
  };

  const confirmCreateGroup = () => {
    const name = createGroupInput.trim();
    if (name) {
      createGroup(name);
      setCreateGroupInput('');
      setCreateGroupOpen(false);
    }
  };

  const handleRenameGroup = (id: string, oldName: string) => {
    setRenamingGroup(id);
    setRenamingValue(oldName);
  };

  const confirmRenameGroup = () => {
    if (renamingGroup && renamingValue.trim()) {
      renameGroup(renamingGroup, renamingValue.trim());
    }
    setRenamingGroup(null);
    setRenamingValue('');
  };

  const handleRemoveGroup = (id: string, name: string) => {
    modal.confirm({
      title: `删除分组「${name}」？`,
      content: '分组中的博主会移至未分组列表，不会被删除。',
      onOk: () => removeGroup(id),
    });
  };

  const filtered = useMemo(
    () =>
      search
        ? bloggers.filter(
            (b) =>
              b.screenName.toLowerCase().includes(search.toLowerCase()) ||
              (b.name || '').toLowerCase().includes(search.toLowerCase()),
          )
        : bloggers,
    [bloggers, search],
  );

  const groupedBloggers = useMemo(() => {
    const ungrouped = filtered.filter((b) => !b.groupId);
    const grouped = groups.map((g) => ({
      group: g,
      bloggers: filtered.filter((b) => b.groupId === g.id),
    }));
    return { ungrouped, grouped };
  }, [filtered, groups]);

  const allFilteredSelected =
    filtered.length > 0 &&
    filtered.every((b) => selected.includes(b.screenName));

  const removeSelected = () => {
    modal.confirm({
      title: `从列表移除 ${selected.length} 位博主？`,
      content: '不会删除本地文件。',
      onOk: () => {
        selected.forEach(removeBlogger);
        setSelected([]);
      },
    });
  };

  const autoStartTss = incrementalTargets
    .map(getBloggerStartTs)
    .filter((ts) => ts > 0);
  const cursorCount = incrementalTargets.filter(
    (b) => b.lastSeenTweetId,
  ).length;
  const autoRangeHint =
    autoStartTss.length === 0
      ? '暂无下载记录，将从当前时间开始'
      : autoStartTss.length === 1 ||
          Math.min(...autoStartTss) === Math.max(...autoStartTss)
        ? `将从 ${dayjs(Math.min(...autoStartTss)).format('YYYY-MM-DD HH:mm')} 开始`
        : `最早 ${dayjs(Math.min(...autoStartTss)).format('YYYY-MM-DD HH:mm')} · 最晚 ${dayjs(
            Math.max(...autoStartTss),
          ).format('YYYY-MM-DD HH:mm')}`;

  const renderBloggerItem = (b: BloggerRecord) => {
    const isIncLoading = incLoading === b.screenName;
    const isHomeLoading = homepageLoading === b.screenName;
    const isSelected = selected.includes(b.screenName);
    const stats = bloggerStats[b.screenName];

    return (
      <List.Item
        key={b.screenName}
        className="!px-4 !py-3 !border-0 transition-colors hover:bg-ant-color-fill-secondary cursor-pointer"
        actions={[
          <Tooltip key="inc" title="增量下载">
            <Button
              type="text"
              size="small"
              icon={<CloudDownloadOutlined />}
              loading={isIncLoading}
              onClick={(e) => {
                e.stopPropagation();
                openIncrementalDialog([b]);
              }}
            />
          </Tooltip>,
          <Tooltip key="folder" title="打开本地文件夹">
            <Button
              type="text"
              size="small"
              icon={<FolderOpenOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openLocalFolder(b);
              }}
            />
          </Tooltip>,
          <Tooltip key="gallery" title="在画廊中查看">
            <Button
              type="text"
              size="small"
              icon={<AppstoreOutlined />}
              onClick={(e) => {
                e.stopPropagation();
                openInGallery(b);
              }}
            />
          </Tooltip>,
          <Tooltip key="homepage" title="跳转主页预览">
            <Button
              type="text"
              size="small"
              icon={<SearchOutlined />}
              loading={isHomeLoading}
              onClick={(e) => {
                e.stopPropagation();
                gotoHomepage(b.screenName);
              }}
            />
          </Tooltip>,
          <Dropdown
            key="move"
            menu={{
              items: [
                { key: 'none', label: '取消分组' },
                { type: 'divider' },
                ...groups.map((g) => ({ key: g.id, label: g.name })),
              ],
              onClick: ({ key }) =>
                moveBloggerToGroup(b.screenName, key === 'none' ? null : key),
            }}
            trigger={['click']}
          >
            <Button
              type="text"
              size="small"
              icon={<DragOutlined />}
              onClick={(e) => e.stopPropagation()}
            />
          </Dropdown>,
          <Button
            key="del"
            type="text"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={(e) => {
              e.stopPropagation();
              modal.confirm({
                title: `从列表移除 ${b.screenName}？`,
                content: '不会删除本地文件。',
                onOk: () => removeBlogger(b.screenName),
              });
            }}
          />,
        ]}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Checkbox
            checked={isSelected}
            onChange={(e) => {
              e.stopPropagation();
              setSelected(
                e.target.checked
                  ? [...selected, b.screenName]
                  : selected.filter((s) => s !== b.screenName),
              );
            }}
            onClick={(e) => e.stopPropagation()}
          />
          {b.avatar && (
            <Avatar src={b.avatar} size={40} className="flex-shrink-0" />
          )}
          <div className="flex-1 min-w-0">
            <button
              className="flex items-center gap-2 mb-1 bg-transparent hover:text-ant-color-primary transition-colors disabled:opacity-50 text-left w-full"
              disabled={isHomeLoading}
              onClick={(e) => {
                e.stopPropagation();
                gotoHomepage(b.screenName);
              }}
            >
              <span className="font-semibold text-ant-color-text truncate">
                {b.name || b.screenName}
              </span>
              <span className="text-ant-color-text-tertiary text-sm truncate">
                @{b.screenName}
              </span>
            </button>
            <div className="flex items-center gap-3 text-xs text-ant-color-text-secondary">
              {stats && <span>本地 {stats.postCount} 帖</span>}
              {b.lastDownloadAt > 0 && (
                <span>
                  上次 {dayjs(b.lastDownloadAt).format('MM-DD HH:mm')}
                </span>
              )}
              {b.lastSeenTweetId && (
                <Tooltip title={`游标 ID: ${b.lastSeenTweetId}`}>
                  <span className="text-ant-color-success">✓ 游标</span>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </List.Item>
    );
  };

  return (
    <div className="flex flex-col h-screen">
      <PageHeader />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="font-bold text-lg">博主管理</h2>
        <span className="text-gray-400 text-sm">
          共 {bloggers.length} 位博主
          {postIdCount > 0 && ` · 本地索引 ${postIdCount} 个帖子`}
        </span>
        <Tooltip title="扫描保存目录并更新博主、本地文件数量和帖子索引">
          <Button
            size="small"
            icon={<ImportOutlined />}
            loading={importLoading}
            onClick={onImport}
          >
            导入/刷新本地内容
          </Button>
        </Tooltip>
        <Tooltip title="获取 X 列表成员或某账号的关注，批量加入博主列表">
          <Button
            size="small"
            icon={<UsergroupAddOutlined />}
            onClick={() => setImportUsersOpen(true)}
          >
            列表/关注导入
          </Button>
        </Tooltip>
        <Tooltip title="创建分组">
          <Button
            size="small"
            icon={<FolderAddOutlined />}
            onClick={handleCreateGroup}
          >
            新建分组
          </Button>
        </Tooltip>
        <Checkbox
          checked={allFilteredSelected}
          indeterminate={selected.length > 0 && !allFilteredSelected}
          onChange={(e) =>
            setSelected(
              e.target.checked ? filtered.map((b) => b.screenName) : [],
            )
          }
        >
          全选当前结果
        </Checkbox>
        <Button
          size="small"
          disabled={selected.length === 0}
          onClick={() =>
            openIncrementalDialog(
              bloggers.filter((b) => selected.includes(b.screenName)),
            )
          }
        >
          批量增量（{selected.length}）
        </Button>
        <Dropdown
          menu={{
            items: [
              { key: 'none', label: '取消分组' },
              ...(groups.length > 0 ? [{ type: 'divider' as const }] : []),
              ...groups.map((g) => ({ key: g.id, label: g.name })),
            ],
            onClick: ({ key }) => {
              const targetGroupId = key === 'none' ? null : key;
              selected.forEach((screenName) =>
                moveBloggerToGroup(screenName, targetGroupId),
              );
              const targetName =
                key === 'none'
                  ? '未分组'
                  : groups.find((g) => g.id === key)?.name || '';
              message.success(
                `已将 ${selected.length} 位博主移动到${targetName}`,
              );
              setSelected([]);
            },
          }}
          disabled={selected.length === 0}
        >
          <Button size="small" disabled={selected.length === 0}>
            移动到分组（{selected.length}）
          </Button>
        </Dropdown>
        <Button
          size="small"
          danger
          disabled={selected.length === 0}
          onClick={removeSelected}
        >
          移除选中（{selected.length}）
        </Button>
      </div>
      <Input
        placeholder="搜索博主用户名或昵称"
        prefix={<SearchOutlined />}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        allowClear
        className="mb-3"
      />

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <Empty description="无博主或搜索无结果" />
        ) : (
          <div className="space-y-3">
            {/* 分组卡片 */}
            {groupedBloggers.grouped.map(({ group, bloggers: gBloggers }) => (
              <div
                key={group.id}
                className="border border-ant-color-border rounded-lg overflow-hidden bg-ant-color-bg-container"
              >
                {/* 分组头部 */}
                <div
                  className="flex items-center justify-between px-4 py-2.5 bg-ant-color-fill-quaternary cursor-pointer transition-colors hover:bg-ant-color-fill-tertiary"
                  onClick={() => toggleGroupCollapse(group.id)}
                >
                  <Space className="flex-1">
                    {group.collapsed ? (
                      <CaretRightOutlined className="text-ant-color-text-tertiary" />
                    ) : (
                      <CaretDownOutlined className="text-ant-color-text-tertiary" />
                    )}
                    {renamingGroup === group.id ? (
                      <Input
                        size="small"
                        value={renamingValue}
                        onChange={(e) => setRenamingValue(e.target.value)}
                        onBlur={confirmRenameGroup}
                        onPressEnter={confirmRenameGroup}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        style={{ width: 180 }}
                      />
                    ) : (
                      <span className="font-semibold text-ant-color-text">
                        {group.name}
                        <span className="ml-2 text-ant-color-text-tertiary font-normal">
                          ({gBloggers.length})
                        </span>
                      </span>
                    )}
                  </Space>
                  <Space size="small">
                    <Button
                      type="text"
                      size="small"
                      icon={<EditOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRenameGroup(group.id, group.name);
                      }}
                    />
                    <Button
                      type="text"
                      size="small"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveGroup(group.id, group.name);
                      }}
                    />
                  </Space>
                </div>

                {/* 分组内博主列表 */}
                {!group.collapsed && gBloggers.length > 0 && (
                  <List
                    dataSource={gBloggers}
                    renderItem={renderBloggerItem}
                    split={true}
                    className="[&_.ant-list-item]:border-t [&_.ant-list-item]:border-ant-color-border-secondary"
                  />
                )}
              </div>
            ))}

            {/* 未分组博主 */}
            {groupedBloggers.ungrouped.length > 0 && (
              <div className="border border-ant-color-border rounded-lg overflow-hidden bg-ant-color-bg-container">
                {groups.length > 0 && (
                  <div className="px-4 py-2.5 bg-ant-color-fill-quaternary">
                    <span className="font-semibold text-ant-color-text">
                      未分组
                      <span className="ml-2 text-ant-color-text-tertiary font-normal">
                        ({groupedBloggers.ungrouped.length})
                      </span>
                    </span>
                  </div>
                )}
                <List
                  dataSource={groupedBloggers.ungrouped}
                  renderItem={renderBloggerItem}
                  split={true}
                  className={
                    groups.length > 0
                      ? '[&_.ant-list-item]:border-t [&_.ant-list-item]:border-ant-color-border-secondary'
                      : ''
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>

      <Modal
        title="增量下载"
        open={incrementalTargets.length > 0}
        onCancel={() => setIncrementalTargets([])}
        onOk={startBatchIncremental}
        confirmLoading={incLoading === 'batch'}
        okText="开始下载"
        width={600}
      >
        <div className="space-y-3">
          <p>
            已选择 <strong>{incrementalTargets.length}</strong> 位博主
            {cursorCount > 0 && (
              <span className="text-green-600">
                （{cursorCount} 位有增量游标，将精确续传）
              </span>
            )}
          </p>
          <Radio.Group
            value={useCustomStart}
            onChange={(e) => setUseCustomStart(e.target.value)}
          >
            <Space direction="vertical">
              <Radio value={false}>
                各博主从自己的上次下载时间开始
                <div className="text-xs text-gray-400 ml-6">
                  {autoRangeHint}
                </div>
              </Radio>
              <Radio value={true}>统一自定义时间</Radio>
            </Space>
          </Radio.Group>
          {useCustomStart && (
            <DatePicker
              showTime
              value={incrementalStart}
              onChange={(v) => v && setIncrementalStart(v)}
              className="w-full"
            />
          )}
          {batchProgress && (
            <Progress
              percent={Math.round(
                (batchProgress.current / batchProgress.total) * 100,
              )}
              status="active"
              format={() => `${batchProgress.current}/${batchProgress.total}`}
            />
          )}
        </div>
      </Modal>

      <Modal
        title={importKind === 'list' ? '导入 X 列表成员' : '导入关注的用户'}
        open={importUsersOpen}
        onCancel={() => {
          setImportUsersOpen(false);
          setImportUsers(null);
          setImportInput('');
        }}
        footer={
          importUsers ? (
            <Button type="primary" onClick={confirmImportUsers}>
              确认导入 {importUsers.length} 位博主
            </Button>
          ) : null
        }
        width={700}
      >
        <div className="space-y-3">
          <Radio.Group
            value={importKind}
            onChange={(e) => setImportKind(e.target.value)}
          >
            <Radio value="list">列表 ID</Radio>
            <Radio value="following">账号用户名</Radio>
          </Radio.Group>
          <Input
            placeholder={
              importKind === 'list'
                ? '输入列表 ID（URL 中的数字）'
                : '输入账号用户名（@xxx）'
            }
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            onPressEnter={fetchImportUsers}
          />
          <Button
            type="primary"
            block
            loading={importFetching}
            onClick={fetchImportUsers}
          >
            获取
          </Button>
          {importFetching && (
            <Progress
              percent={importProgress}
              status="active"
              format={(p) => `已获取 ${p} 位`}
            />
          )}
          {importUsers && (
            <div className="max-h-96 overflow-y-auto border rounded p-2">
              <List
                dataSource={importUsers}
                renderItem={(u) => (
                  <List.Item key={u.screenName}>
                    <List.Item.Meta
                      avatar={<Avatar size="small" src={u.avatar} />}
                      title={`@${u.screenName}`}
                      description={u.name}
                    />
                  </List.Item>
                )}
                size="small"
              />
            </div>
          )}
        </div>
      </Modal>

      <Modal
        title="新建分组"
        open={createGroupOpen}
        onCancel={() => {
          setCreateGroupOpen(false);
          setCreateGroupInput('');
        }}
        onOk={confirmCreateGroup}
        okText="确定"
        cancelText="取消"
      >
        <Input
          placeholder="分组名称"
          autoFocus
          value={createGroupInput}
          onChange={(e) => setCreateGroupInput(e.target.value)}
          onPressEnter={confirmCreateGroup}
        />
      </Modal>
    </div>
  );
};
