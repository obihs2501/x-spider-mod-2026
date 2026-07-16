/* eslint-disable react/prop-types */
import { CloudDownloadOutlined, DeleteOutlined } from '@ant-design/icons';
import { App, Avatar, Button, Collapse, Empty, List } from 'antd';
import dayjs from 'dayjs';
import React from 'react';
import MediaType from '../../enums/MediaType';
import { getUser } from '../../twitter/api';
import { BloggerRecord, useBloggerStore } from '../../stores/bloggers';
import { useDownloadStore } from '../../stores/download';

export interface BloggerListProps {
  onLoad: (screenName: string) => void;
}

/**
 * 已下载博主列表：点击名字重新加载；「增量」从上次下载时间到现在创建下载任务。
 */
export const BloggerList: React.FC<BloggerListProps> = ({ onLoad }) => {
  const { message } = App.useApp();
  const { bloggers, removeBlogger } = useBloggerStore();
  const createCreationTask = useDownloadStore((s) => s.createCreationTask);
  const [incLoading, setIncLoading] = React.useState<string>('');

  const incrementalDownload = async (b: BloggerRecord) => {
    setIncLoading(b.screenName);
    try {
      // 重新获取一次用户信息（确保 userId 有效）
      const user = await getUser(b.screenName);
      createCreationTask(user, {
        source: 'medias',
        mediaTypes: [MediaType.Photo, MediaType.Video, MediaType.Gif],
        dateRange: [dayjs(b.lastDownloadAt), dayjs()],
      });
      message.success(
        `已创建 @${b.screenName} 的增量下载任务（${dayjs(
          b.lastDownloadAt,
        ).format('MM-DD HH:mm')} 起），请到下载管理页查看`,
      );
    } catch (err: any) {
      log.error(err);
      message.error(`增量下载失败：${err?.message || '未知原因'}`);
    } finally {
      setIncLoading('');
    }
  };

  if (bloggers.length === 0) return null;

  return (
    <Collapse
      ghost
      size="small"
      className="mt-1 -ml-4"
      items={[
        {
          key: 'bloggers',
          label: (
            <span className="text-sm">已下载博主（{bloggers.length}）</span>
          ),
          children:
            bloggers.length === 0 ? (
              <Empty description="暂无记录" />
            ) : (
              <List
                size="small"
                dataSource={bloggers}
                renderItem={(b) => (
                  <List.Item
                    className="!px-0"
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
                        增量
                      </Button>,
                      <Button
                        key="del"
                        size="small"
                        type="text"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => removeBlogger(b.screenName)}
                        title="从列表移除"
                      />,
                    ]}
                  >
                    <button
                      className="flex items-center gap-2 bg-transparent text-left"
                      onClick={() => onLoad(b.screenName)}
                      title="加载该博主"
                    >
                      <Avatar src={b.avatar} size={28}>
                        {b.screenName[0]?.toUpperCase()}
                      </Avatar>
                      <span>
                        {b.name || b.screenName}
                        <span className="text-gray-400 ml-1">
                          @{b.screenName}
                        </span>
                      </span>
                      <span className="text-gray-400 text-xs">
                        上次下载 {dayjs(b.lastDownloadAt).format('MM-DD HH:mm')}
                      </span>
                    </button>
                  </List.Item>
                )}
              />
            ),
        },
      ]}
    />
  );
};
