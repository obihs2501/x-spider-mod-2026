import { DownloadFilter } from './DownloadFilter';
import { TwitterUser } from './TwitterUser';

export interface CreationTask {
  id: string;
  user: TwitterUser;
  filter: DownloadFilter;
  status: 'waiting' | 'active';
  completeCount: number;
  skipCount: number;
  /** 处理失败进入失败队列的媒体数 */
  failCount?: number;
}
