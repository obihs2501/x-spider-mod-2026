/* eslint-disable react/prop-types */
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  ImportOutlined,
  SearchOutlined,
  AppstoreOutlined,
  UsergroupAddOutlined,
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
  const { bloggers, removeBlogger } = useBloggerStore();
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

  const createIncremental = async (
    b: BloggerRecord,
    since: Dayjs,
    stopAtTweetId?: string,
  ) => {
    const user = await getUser(b.screenName);
    createCreationTask(user, {
      source: 'medias',
      mediaTypes: [MediaType.Photo, MediaType.Video, MediaType.Gif],
      // 有游标时用游标精确截断（日期只会漏或多抓），无游标才用日期范围
      dateRange: stopAtTweetId ? undefined : [since, dayjs()],
      stopAtTweetId,
    });
  };

  const confirmIncremental = async () => {
    const targets = incrementalTargets;
    if (targets.length === 0) return;
    setIncrementalTargets([]);
    setBatchProgress({ current: 0, total: targets.length });
    const failed: string[] = [];
    for (let i = 0; i < targets.length; i++) {
      const b = targets[i];
      setIncLoading(b.screenName);
      try {
        // 默认各博主用自己的起点，避免一个长期无更新（如被封号）的博主拖累整批；
        // 自定义统一时间时不用游标，按用户显式选择的日期抓取
        const ts = getBloggerStartTs(b);
        const since = useCustomStart || ts <= 0 ? incrementalStart : dayjs(ts);
        const stopAtTweetId = useCustomStart ? undefined : b.lastSeenTweetId;
        await createIncremental(b, since, stopAtTweetId);
      } catch (err: any) {
        log.error(err);
        failed.push(`@${b.screenName}`);
      }
      setBatchProgress({ current: i + 1, total: targets.length });
      if (i < targets.length - 1) {
        await delay(1200 + Math.floor(Math.random() * 1800));
      }
    }
    setIncLoading('');
    setBatchProgress(null);
    if (failed.length) {
      message.warning(
        `任务创建完成，失败：${failed.join('、')}（账号可能已被封禁、改名或注销，可从列表移除）`,
      );
    } else {
      message.success(`已创建 ${targets.length} 位博主的增量下载任务`);
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
        <Button
          size="small"
          danger
          disabled={selected.length === 0}
          onClick={removeSelected}
        >
          批量移除
        </Button>
        <Input
          size="small"
          allowClear
          prefix={<SearchOutlined />}
          placeholder="搜索博主"
          className="max-w-[200px] ml-auto"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {batchProgress && (
        <Progress
          className="mb-3"
          percent={Math.round(
            (batchProgress.current / batchProgress.total) * 100,
          )}
          format={() => `${batchProgress.current}/${batchProgress.total}`}
        />
      )}

      <div className="grow overflow-auto pb-6">
        {filtered.length === 0 ? (
          <Empty className="mt-20" description="暂无匹配的博主记录" />
        ) : (
          <List
            dataSource={filtered}
            className="bg-white border-[1px] border-[#E8E6DC] rounded-xl px-4"
            renderItem={(b) => {
              const stats = bloggerStats[b.screenName];
              return (
                <List.Item
                  actions={[
                    <Button
                      key="gallery"
                      size="small"
                      icon={<AppstoreOutlined />}
                      onClick={() => openInGallery(b)}
                      title="在画廊查看"
                    >
                      画廊查看
                    </Button>,
                    <Button
                      key="folder"
                      size="small"
                      icon={<FolderOpenOutlined />}
                      onClick={() => openLocalFolder(b)}
                      title="用文件管理器打开"
                    >
                      本地文件夹
                    </Button>,
                    <Button
                      key="inc"
                      size="small"
                      type="primary"
                      ghost
                      icon={<CloudDownloadOutlined />}
                      loading={incLoading === b.screenName}
                      onClick={() => openIncrementalDialog([b])}
                    >
                      增量下载
                    </Button>,
                    <Button
                      key="del"
                      size="small"
                      type="text"
                      danger
                      icon={<DeleteOutlined />}
                      onClick={() => removeBlogger(b.screenName)}
                      title="从列表移除（不删除本地文件）"
                    />,
                  ]}
                >
                  <Checkbox
                    className="mr-3"
                    checked={selected.includes(b.screenName)}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...new Set([...old, b.screenName])]
                          : old.filter((sn) => sn !== b.screenName),
                      )
                    }
                  />
                  <List.Item.Meta
                    avatar={
                      <Avatar src={b.avatar} size={40}>
                        {b.screenName[0]?.toUpperCase()}
                      </Avatar>
                    }
                    title={
                      <button
                        className="bg-transparent hover:text-ant-color-primary transition-colors disabled:opacity-50"
                        disabled={homepageLoading === b.screenName}
                        onClick={() => gotoHomepage(b.screenName)}
                      >
                        {b.name || b.screenName}
                        <span className="text-gray-400 font-normal ml-2">
                          @{b.screenName}
                        </span>
                      </button>
                    }
                    description={`上次下载：${dayjs(b.lastDownloadAt).format(
                      'YYYY-MM-DD HH:mm',
                    )} · 本地媒体 ${stats?.mediaCount || 0} 个 · ${
                      stats?.postCount || 0
                    } 个帖子`}
                  />
                </List.Item>
              );
            }}
          />
        )}
      </div>

      <Modal
        open={incrementalTargets.length > 0}
        title={`增量下载（${incrementalTargets.length} 位博主）`}
        okText="创建任务"
        cancelText="取消"
        confirmLoading={!!incLoading}
        onOk={confirmIncremental}
        onCancel={() => setIncrementalTargets([])}
      >
        <p className="mb-2">增量开始时间：</p>
        <Radio.Group
          className="flex flex-col gap-2"
          value={useCustomStart ? 'custom' : 'auto'}
          onChange={(e) => setUseCustomStart(e.target.value === 'custom')}
        >
          <Radio value="auto">
            各博主从自己的上次下载位置开始（推荐）
            <span className="block text-xs text-gray-400">
              {autoRangeHint}
              {cursorCount > 0 &&
                ` · ${cursorCount} 位博主有精确增量游标，将从上次抓取位置续传`}
            </span>
          </Radio>
          <Radio value="custom">统一自定义开始时间</Radio>
        </Radio.Group>
        {useCustomStart && (
          <DatePicker
            showTime
            value={incrementalStart}
            onChange={(value) => value && setIncrementalStart(value)}
            disabledDate={(current) =>
              current && current > dayjs().endOf('day')
            }
            className="w-full mt-2"
          />
        )}
      </Modal>

      <Modal
        open={importUsersOpen}
        title="从列表/关注导入博主"
        okText="加入博主列表"
        cancelText="取消"
        okButtonProps={{ disabled: !importUsers?.length || importFetching }}
        onOk={confirmImportUsers}
        onCancel={() => setImportUsersOpen(false)}
      >
        <Radio.Group
          className="mb-3"
          value={importKind}
          onChange={(e) => {
            setImportKind(e.target.value);
            setImportUsers(null);
          }}
        >
          <Radio value="list">列表成员（输入列表 ID）</Radio>
          <Radio value="following">某账号的关注（输入用户名）</Radio>
        </Radio.Group>
        <div className="flex gap-2">
          <Input
            placeholder={
              importKind === 'list'
                ? '例如 1234567890123456789'
                : '例如 elonmusk'
            }
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            onPressEnter={fetchImportUsers}
            disabled={importFetching}
          />
          <Button loading={importFetching} onClick={fetchImportUsers}>
            获取
          </Button>
        </div>
        <p className="mt-2 text-xs text-gray-400">
          需要已登录的账号 Cookie，人数多时会分页获取、耗时较长。
          {importFetching && ` 已获取 ${importProgress} 个用户…`}
          {importUsers &&
            !importFetching &&
            ` 共获取 ${importUsers.length} 个用户，点击「加入博主列表」完成导入。`}
        </p>
      </Modal>
    </div>
  );
};
