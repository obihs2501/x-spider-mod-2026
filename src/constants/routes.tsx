import { Route } from '../interfaces/Route';
import {
  HomeFilled,
  SettingFilled,
  DownloadOutlined,
  InfoCircleFilled,
  PictureFilled,
  UnorderedListOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Homepage } from '../pages/Homepage';
import { DownloadManagement } from '../pages/DownloadManagement';
import { BloggerManagement } from '../pages/BloggerManagement';
import { Gallery } from '../pages/Gallery';
import { Settings } from '../pages/Settings';
import { About } from '../pages/About';
import { BatchDownload } from '../pages/BatchDownload';

export const ROUTES: Route[] = [
  {
    id: 'home',
    name: '主页',
    icon: <HomeFilled />,
    element: <Homepage />,
  },
  {
    id: 'batch-download',
    name: '批量下载',
    icon: <UnorderedListOutlined />,
    element: <BatchDownload />,
  },
  {
    id: 'blogger-management',
    name: '博主管理',
    icon: <TeamOutlined />,
    element: <BloggerManagement />,
  },
  {
    id: 'download-management',
    name: '下载管理',
    icon: <DownloadOutlined />,
    element: <DownloadManagement />,
  },
  {
    id: 'gallery',
    name: '画廊',
    icon: <PictureFilled />,
    element: <Gallery />,
  },
  {
    id: 'settings',
    name: '设置',
    icon: <SettingFilled />,
    element: <Settings />,
  },
  {
    id: 'about',
    name: '关于',
    icon: <InfoCircleFilled />,
    element: <About />,
  },
];
