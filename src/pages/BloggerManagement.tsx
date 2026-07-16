/* eslint-disable react/prop-types */
import {
  CloudDownloadOutlined,
  DeleteOutlined,
  ImportOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { App, Avatar, Button, Empty, Input, List, Tooltip } from 'antd';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import MediaType from '../enums/MediaType';
import { getUser } from '../twitter/api';
import { BloggerRecord, useBloggerStore } from '../stores/bloggers';
import { useDownloadStore } from '../stores/download';
import { useLocalIndexStore } from '../stores/local-index';
import { useSettingsStore } from '../stores/settings';
import { useRouteStore } from '../stores/route';
import { useHomepageStore } from '../stores/homepage';
import { ROUTES } from '../constants/routes';

export const BloggerManagement: React.FC = () => {
  const { message } = App.useApp();
  const { bloggers, removeBlogger } = useBloggerStore();
  const createCreationTask = useDownloadStore((s) => s.createCreationTask);
  const saveDirBase = useSettingsStore((s) => s.download.saveDirBase);
  const postIdCount = useLocalIndexStore((s) => s.postIds.length);
  const importFromDisk = useLocalIndexStore((s) => s.importFromDisk);
  const setRoute = useRouteStore((s) => s.setRoute);
  const setKeyword = useHomepageStore((s) => s.setKeyword);

  const [importLoading, setImportLoading] = useState(false);
  const [incLoading, setIncLoading] = useState('');
  const [search, setSearch] = useState('');

  const onImport = async () => {
    setImportLoading(true);
    try {
      const { total, added, bloggers: newBloggers } =
        await importFromDisk(saveDirBase);
      message.success(
        `扫描完成：识别 ${total} 个帖子 ID（新增 ${added}），导入 ${newBloggers} 个新博主。下载时将自动跳过已存在的帖子。`,
      );
    } catch (err: any) {
      log.error(err);
      message.error(`导入失败：${err?.message || err}`);
    } finally {
      setImportLoading(false);
    }
  };

  const incrementalDownload = async (b: BloggerRecord) => {
    setIncLoading(b.screenName);
    try {
      const user = await getUser(b.screenName);
      createCreationTask(user, {
        source: 'medias',
        mediaTypes: [MediaType.Photo, MediaType.Video, MediaType.Gif],
        dateRange: [dayjs(b.lastDownloadAt), dayjs()],
      });
      message.success(
        `已创建 @${b.screenName} 的增量下载任务（${dayjs(
          b.lastDownloadAt,
        ).format('YYYY-MM-DD HH:mm')} 起）`,
      );
    } catch (err: any) {
      log.error(err);
      message.error(`增量下载失败：${err?.message || '未知原因'}`);
    } finally {
      setIncLoading('');
    }
  };

  const gotoHomepage = (screenName: string) => {
    setKeyword(screenName);
    const home = ROUTES.find((r) => r.id === 'home');
    if (home) setRoute(home);
  };

  const filtered = search
    ? bloggers.filter(
        (b) =>
          b.screenName.toLowerCase().includes(search.toLowerCase()) ||
          (b.name || '').toLowerCase().includes(search.toLowerCase()),
      )
    : bloggers;

  return (
    <div className="flex flex-col h-screen">
      <PageHeader />
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <h2 className="font-bold text-lg">博主管理</h2>
        <span className="text-gray-400 text-sm">
          共 {bloggers.length} 位博主
          {postIdCount > 0 && ` · 本地索引 ${postIdCount} 个帖子`}
        </span>
        <Tooltip title="扫描保存目录：按「昵称 (@用户名)」文件夹导入博主，并把文件名中的帖子 ID 加入索引，下载时自动跳过">
          <Button
            size="small"
            icon={<ImportOutlined />}
            loading={importLoading}
            onClick={onImport}
          >
            导入本地已下载
          </Button>
        </Tooltip>
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

      <div className="grow overflow-auto pb-6">
        {filtered.length === 0 ? (
          <Empty
            className="mt-20"
            description={
              bloggers.length === 0
                ? '暂无博主记录，可点击「导入本地已下载」从保存目录识别'
                : '没有匹配的博主'
            }
          />
        ) : (
          <List
            dataSource={filtered}
            className="bg-white border-[1px] border-[#E8E6DC] rounded-xl px-4"
            renderItem={(b) => (
              <List.Item
                actions={[
                  <Button
                    key="inc"
                    size="small"
                    type="primary"
                    ghost
                    icon={<CloudDownloadOutlined />}
                    loading={incLoading === b.screenName}
                    onClick={() => incrementalDownload(b)}
                    title={`从 ${dayjs(b.lastDownloadAt).format(
                      'YYYY-MM-DD HH:mm',
                    )} 下载到现在`}
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
                <List.Item.Meta
                  avatar={
                    <Avatar src={b.avatar} size={40}>
                      {b.screenName[0]?.toUpperCase()}
                    </Avatar>
                  }
                  title={
                    <button
                      className="bg-transparent hover:text-ant-color-primary transition-colors"
                      onClick={() => gotoHomepage(b.screenName)}
                      title="到主页加载该博主"
                    >
                      {b.name || b.screenName}
                      <span className="text-gray-400 font-normal ml-2">
                        @{b.screenName}
                      </span>
                    </button>
                  }
                  description={`上次下载：${dayjs(b.lastDownloadAt).format(
                    'YYYY-MM-DD HH:mm',
                  )}`}
                />
              </List.Item>
            )}
          />
        )}
      </div>
    </div>
  );
};
