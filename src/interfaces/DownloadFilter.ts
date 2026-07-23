import { Dayjs } from 'dayjs';
import MediaType from '../enums/MediaType';

export interface DownloadFilter {
  dateRange?: [start: Dayjs, end: Dayjs];
  mediaTypes?: MediaType[];
  source: 'medias' | 'tweets';
  /** 增量游标：扫到不晚于该推文 ID（雪花序比较）即停止翻页 */
  stopAtTweetId?: string;
}
