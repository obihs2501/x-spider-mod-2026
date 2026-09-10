/* eslint-disable react/prop-types */
import { App, Button, Checkbox, DatePicker, Form, Radio, Space } from 'antd';
import dayjs from 'dayjs';
import React, { useState } from 'react';
import MediaType from '../../enums/MediaType';
import { DownloadFilter } from '../../interfaces/DownloadFilter';
import { TwitterUser } from '../../interfaces/TwitterUser';
import { useDownloadStore } from '../../stores/download';
import { useHomepageStore } from '../../stores/homepage';

export const DownloadController: React.FC = () => {
  const { message } = App.useApp();
  const { filter, setFilter, user, mode, searchQuery, loadSelfUser } =
    useHomepageStore((s) => ({
      filter: s.filter,
      setFilter: s.setFilter,
      user: s.userInfo.data,
      mode: s.mode,
      searchQuery: s.searchQuery,
      loadSelfUser: s.loadSelfUser,
    }));
  const { createCreationTask } = useDownloadStore((s) => ({
    createCreationTask: s.createCreationTask,
  }));
  const [starting, setStarting] = useState(false);

  const onStartDownload = async () => {
    if (!filter.mediaTypes || filter.mediaTypes.length === 0) {
      message.error('请至少选择一个媒体类型');
      return;
    }

    setStarting(true);
    try {
      let target: TwitterUser | undefined = user;
      let taskFilter: DownloadFilter = { ...filter };

      if (mode === 'search') {
        const query = searchQuery.trim();
        if (!query) {
          message.error('请先输入搜索语句');
          return;
        }
        // 搜索结果来自多个作者，按各自博主分文件夹保存；任务本身用一个占位「用户」展示
        target = {
          id: '',
          screenName: '',
          name: `搜索：${query}`,
          avatar: '',
          registerTime: dayjs(),
        };
        taskFilter = { ...taskFilter, source: 'search', searchQuery: query };
      } else if (mode === 'likes' || mode === 'bookmarks') {
        const self = await loadSelfUser();
        target = {
          ...self,
          screenName: '',
          name: `${mode === 'likes' ? '我的喜欢' : '我的书签'} (@${self.screenName})`,
        };
        taskFilter = { ...taskFilter, source: mode };
      } else if (!target) {
        message.error('请先加载用户');
        return;
      }

      createCreationTask(target, taskFilter);
      message.success('已成功创建下载任务，请到下载管理页查看');
    } catch (err: any) {
      log.error(err);
      message.error(`创建下载任务失败：${err?.message || '未知原因'}`);
    } finally {
      setStarting(false);
    }
  };

  return (
    <section className="p-4 bg-white rounded-md mt-3 border-[1px]">
      <h2 className="font-bold mb-4">下载配置</h2>
      <Form<DownloadFilter>
        layout="inline"
        initialValues={filter}
        onValuesChange={(_, values) => {
          setFilter({ ...filter, ...values });
        }}
      >
        <Form.Item
          name="dateRange"
          label="日期范围"
          tooltip={
            mode === 'search'
              ? '可只选开始日期（结束留空表示至今）。搜索范围超过一个月时会自动按月拆分为多次搜索，避免 X 搜索丢失结果。'
              : '可只选开始日期（结束留空表示至今）'
          }
        >
          <DatePicker.RangePicker
            allowEmpty={[false, true]}
            presets={[
              {
                label: '至今',
                value: [dayjs.unix(0), dayjs()],
              },
              {
                label: '最近 7 天',
                value: [dayjs().subtract(7, 'day'), dayjs()],
              },
              {
                label: '最近 15 天',
                value: [dayjs().subtract(15, 'day'), dayjs()],
              },
              {
                label: '最近 1 个月',
                value: [dayjs().subtract(1, 'month'), dayjs()],
              },
              {
                label: '最近 6 个月',
                value: [dayjs().subtract(6, 'month'), dayjs()],
              },
              {
                label: '最近 1 年',
                value: [dayjs().subtract(1, 'year'), dayjs()],
              },
            ]}
            disabledDate={(cur) => cur && cur > dayjs().endOf('day')}
          />
        </Form.Item>
        <Form.Item name="mediaTypes" label="媒体类型">
          <Checkbox.Group
            options={[
              {
                label: '视频',
                value: MediaType.Video,
              },
              {
                label: '照片',
                value: MediaType.Photo,
              },
              {
                label: 'GIF',
                value: MediaType.Gif,
              },
            ]}
          />
        </Form.Item>
        {mode === 'user' && (
          <Form.Item
            name="source"
            label="下载源"
            tooltip="帖子能下载到更早的推文，但爬取速度较慢；媒体可能下载不到更早的推文，但爬取速度更快。"
          >
            <Radio.Group
              options={[
                {
                  label: '帖子',
                  value: 'tweets',
                },
                {
                  label: '媒体',
                  value: 'medias',
                },
              ]}
            />
          </Form.Item>
        )}
      </Form>
      <hr className="my-4" />
      <section className="flex space-x-2">
        <Button type="primary" loading={starting} onClick={onStartDownload}>
          <Space>
            <span>开始下载</span>
          </Space>
        </Button>
      </section>
    </section>
  );
};
