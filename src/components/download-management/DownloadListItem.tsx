/* eslint-disable react/prop-types */
import {
  CaretRightFilled,
  DeleteFilled,
  DownloadOutlined,
  FileFilled,
  FolderFilled,
  PauseOutlined,
} from '@ant-design/icons';
import { dialog, fs, path, shell } from '@tauri-apps/api';
import { App, Avatar, Progress } from 'antd';
import * as R from 'ramda';
import React from 'react';
import { DownloadTask } from '../../interfaces/DownloadTask';
import { useDownloadStore } from '../../stores/download';
import { buildPostUrl, buildUserUrl } from '../../twitter/url';
import { showInFolder } from '../../utils/shell';
import { StatusText } from './StatusText';
import { TaskAction, TaskActions } from './TaskActions';

export interface DownloadListItemProps {
  task: DownloadTask;
  itemClientHeight: number;
  itemGap: number;
}

export const DownloadListItem = React.memo(function DownloadListItem({
  task: t,
  itemClientHeight,
}: DownloadListItemProps) {
  const { message } = App.useApp();
  const {
    removeDownloadTask,
    pauseDownloadTask,
    unpauseDownloadTask,
    redownloadTask,
  } = useDownloadStore((s) => ({
    removeDownloadTask: s.removeDownloadTask,
    pauseDownloadTask: s.pauseDownloadTask,
    unpauseDownloadTask: s.unpauseDownloadTask,
    batchRemoveDownloadTasks: s.batchRemoveDownloadTasks,
    redownloadTask: s.redownloadTask,
    batchRedownloadTask: s.batchRedownloadTask,
  }));
  const actionRedownload: TaskAction = {
    name: '重新下载',
    onClick: async () => {
      try {
        await redownloadTask(t.gid);
        message.success('已开始重新下载该任务');
      } catch (err) {
        log.error(err);
        dialog.message('无法重新下载文件', {
          type: 'error',
        });
      }
    },
    icon: <DownloadOutlined />,
    primary: false,
  };

  const actionPause: TaskAction = {
    name: '暂停',
    onClick: async () => {
      await pauseDownloadTask(t.gid);
    },
    icon: <PauseOutlined />,
    primary: true,
  };

  const actionUnpause: TaskAction = {
    name: '继续',
    onClick: async () => {
      await unpauseDownloadTask(t.gid);
    },
    icon: <CaretRightFilled />,
    primary: true,
  };

  const actionDelete: TaskAction = {
    name: '删除',
    onClick: async () => {
      if (
        await dialog.confirm('确认删除该任务？\n已下载的文件不会被删除。', {
          okLabel: '删除',
          cancelLabel: '取消',
          type: 'warning',
          title: '删除任务',
        })
      ) {
        await removeDownloadTask(t.gid);
      }
    },
    icon: <DeleteFilled />,
    danger: true,
  };

  const actionOpen: TaskAction = {
    name: '打开',
    onClick: async () => {
      const filePath = await path.join(t.dir, t.fileName);
      if (!(await fs.exists(filePath))) {
        dialog.message('文件不存在', {
          type: 'error',
          title: '错误',
        });
        return;
      }
      await shell.open(filePath);
    },
    icon: <FileFilled />,
    primary: true,
  };

  const actionOpenDir: TaskAction = {
    name: '打开目录',
    onClick: async () => {
      const filePath = await path.join(t.dir, t.fileName);
      if (!(await fs.exists(filePath))) {
        dialog.message('文件不存在', {
          type: 'error',
          title: '错误',
        });
        return;
      }
      await showInFolder(filePath, true);
    },
    icon: <FolderFilled />,
  };

  // 已下载的文件直接本地打开，只有本地没有时才跳转推文网页
  const openMediaLocalFirst = async () => {
    try {
      const filePath = await path.join(t.dir, t.fileName);
      if (await fs.exists(filePath)) {
        await shell.open(filePath);
        return;
      }
    } catch (err) {
      log.error(err);
    }
    if (t.post.user?.screenName && t.post.id) {
      await shell.open(buildPostUrl(t.post.user.screenName, t.post.id));
    } else {
      message.warning('本地文件不存在，且无法定位推文链接');
    }
  };

  // 博主本地文件夹存在就在画廊中打开，不存在才跳转 X 主页
  const openUserLocalFirst = async () => {
    try {
      if (t.dir && (await fs.exists(t.dir))) {
        // 使用 useGalleryStore 导入并设置待打开的路径
        const { setPendingOpenPath } = await import(
          '../../stores/gallery'
        ).then((m) => m.useGalleryStore.getState());
        const { setRoute } = await import('../../stores/route').then((m) =>
          m.useRouteStore.getState(),
        );
        const { ROUTES } = await import('../../constants/routes');
        setPendingOpenPath(t.dir);
        const galleryRoute = ROUTES.find((r) => r.id === 'gallery');
        if (galleryRoute) setRoute(galleryRoute);
        return;
      }
    } catch (err) {
      log.error(err);
    }
    if (t.post.user?.screenName) {
      await shell.open(buildUserUrl(t.post.user.screenName));
    } else {
      message.warning('未找到该博主的本地文件夹');
    }
  };

  return (
    <div
      role="listitem"
      className="bg-white border-[1px] border-gray-300 rounded-md flex overflow-hidden"
    >
      <button
        type="button"
        onClick={openMediaLocalFirst}
        className="shrink-0 overflow-hidden bg-transparent p-0"
        style={{
          width: itemClientHeight,
          height: itemClientHeight,
        }}
        title="打开本地文件（本地不存在时打开推文网页）"
      >
        <img
          src={`${t.media.url}?format=jpg&name=thumb`}
          loading="lazy"
          className="w-full h-full object-cover transition-transform transform hover:scale-105"
        />
      </button>
      <div className="ml-4 overflow-hidden pr-4 w-full h-full">
        <p
          title={t.fileName}
          className="text-ellipsis overflow-hidden whitespace-nowrap font-bold mt-2"
        >
          {t.fileName}
        </p>
        <button
          type="button"
          onClick={openUserLocalFirst}
          title={`在画廊中打开 ${t.post.user?.name || t.post.user?.screenName || '未知用户'} 的文件夹（不存在时打开 X 主页）`}
          className="text-xs flex items-center space-x-1 w-fit text-ant-color-text-secondary bg-gray-100 p-1 rounded-full pr-2 overflow-hidden"
        >
          <Avatar src={t.post.user?.avatar} size={20} />
          <span>{t.post.user?.name || '未知用户'}</span>
          {t.post.user?.screenName && <span>@{t.post.user.screenName}</span>}
        </button>
        <div className="mt-2">
          <TaskActions
            actions={R.cond([
              [R.equals('active'), R.always([actionPause, actionDelete])],
              [R.equals('paused'), R.always([actionUnpause, actionDelete])],
              [R.equals('error'), R.always([actionRedownload, actionDelete])],
              [
                R.equals('complete'),
                R.always([
                  actionOpen,
                  actionOpenDir,
                  actionRedownload,
                  actionDelete,
                ]),
              ],
              [R.T, R.always([])],
            ])(t.status)}
          />
        </div>
        <div className="mt-0">
          <Progress
            percent={Math.round((t.completeSize / t.totalSize) * 100)}
            className="mb-0 mr-0"
          />
        </div>
        <div>
          <StatusText task={t} />
        </div>
      </div>
    </div>
  );
});
