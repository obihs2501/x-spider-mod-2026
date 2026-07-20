/* eslint-disable react/prop-types */
import React from 'react';
import { PageHeader } from '../components/PageHeader';
import { Section } from '../components/settings/Section';
import { Item } from '../components/settings/Item';
import {
  DownloadOutlined,
  GlobalOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import Joi from 'joi';
import { SavePathSelector } from '../components/settings/SavePathSelector';
import { Button, Input, Radio, Switch } from 'antd';
import { FileNameTemplateInput } from '../components/settings/FileNameTemplateInput';
import { showInFolder } from '../utils/shell';
import { path } from '@tauri-apps/api';

export const Settings: React.FC = () => {
  return (
    <>
      <PageHeader />
      <Section title="下载" name="download" titleIcon={<DownloadOutlined />}>
        <Item
          validator={(value) => {
            return Joi.string()
              .messages({
                'string.empty': '请填写保存路径模板',
              })
              .validate(value).error?.message;
          }}
          label="保存路径"
          settingKey="saveDirBase"
        >
          <SavePathSelector required />
        </Item>
        <Item
          validator={(value) => {
            return Joi.string()
              .pattern(
                // eslint-disable-next-line
                /^([^\\\/:\*\"<>\|]\\?)+$/,
              )
              .message(
                '文件夹名有误，请检查文件夹名是否正确，文件夹名不能包含以下字符：? * / \\ < > : " |',
              )
              .$.pattern(/^\s+$/, { invert: true })
              .message('文件夹名不能为纯空格！')
              .allow('')
              .validate(value).error?.message;
          }}
          label="文件夹模板"
          settingKey="dirTemplate"
          description={
            '下载文件保存在「保存路径/文件夹模板」下，支持变量。例如 %USER_NAME% (@%USER_SCREEN_NAME%) 会生成形如「久遠美緒💍新人△▼女優 (@kuon_lifepro)」的文件夹；留空时默认也按此格式分类'
          }
        >
          <FileNameTemplateInput />
        </Item>
        <Item
          settingKey="fileNameTemplate"
          label="文件名模板"
          validator={(value) => {
            return Joi.string()
              .pattern(
                // eslint-disable-next-line
                /^[^\\\/:\*\"<>\|]+$/,
              )
              .message(
                '文件名有误，请检查文件名是否正确，文件名不能包含以下字符：? * / \\ < > : " |',
              )
              .$.pattern(/^\s+$/, { invert: true })
              .message('文件名不能为纯空格！')
              .messages({
                'string.empty': '请填写保存文件名模板',
              })
              .validate(value).error?.message;
          }}
        >
          <FileNameTemplateInput />
        </Item>
        <Item
          settingKey="sameFileSkip"
          label="跳过相同文件"
          valuePropName="checked"
          description="存在同名文件时，是否跳过下载"
        >
          <Switch />
        </Item>
        <Item
          settingKey="consecutiveSkipThreshold"
          label="连续跳过阈值"
          description="从最新帖子开始下载时，连续遇到本地已有文件超过此数值则停止（设为 0 则全部尝试）"
          validator={(value) => {
            return Joi.number()
              .integer()
              .min(0)
              .message('请输入 0 或正整数')
              .validate(value).error?.message;
          }}
        >
          <Input type="number" min={0} placeholder="例如：20" />
        </Item>
      </Section>
      <Section title="代理" name="proxy" titleIcon={<GlobalOutlined />}>
        <Item label="启用代理" settingKey="enable" valuePropName="checked">
          <Switch />
        </Item>
        <Item
          label="使用系统代理"
          settingKey="useSystem"
          valuePropName="checked"
          description="自动使用系统代理，如果代理未生效，可能是你的代理软件没有自动设置系统代理，此时请手动配置代理地址。"
        >
          <Switch />
        </Item>
        <Item
          label="代理地址"
          settingKey="url"
          validator={(val) => {
            return Joi.string()
              .uri({
                scheme: ['http'],
              })
              .message('代理地址格式不正确，示例：“http://127.0.0.1:7890”')
              .validate(val).error?.message;
          }}
        >
          <Input placeholder="代理地址，例如：“http://127.0.0.1:7890”" />
        </Item>
      </Section>
      <Section
        title="账号轮换"
        name="accountRotation"
        titleIcon={<TeamOutlined />}
      >
        <Item
          label="按博主轮换"
          settingKey="rotateOnBlogger"
          valuePropName="checked"
          description="每开始一个博主的批量下载任务时，自动切换到账号池中的下一个可用账号，分摊请求量。"
        >
          <Switch />
        </Item>
        <Item
          label="按请求数轮换"
          settingKey="rotateEveryNRequests"
          description="当前账号每发起 N 次 API 请求后自动切换到下一个可用账号，填 0 表示关闭。"
          validator={(value) => {
            return Joi.number()
              .integer()
              .min(0)
              .message('请输入 0 或正整数')
              .validate(value).error?.message;
          }}
        >
          <Input type="number" min={0} placeholder="例如：50（0 为关闭）" />
        </Item>
        <Item
          label="限流冷却时长（分钟）"
          settingKey="rateLimitCooldownMinutes"
          description="账号收到 429 限流后进入冷却，冷却期间不参与轮换；冷却结束自动恢复可用。"
          validator={(value) => {
            return Joi.number()
              .integer()
              .min(1)
              .message('请输入正整数')
              .validate(value).error?.message;
          }}
        >
          <Input type="number" min={1} placeholder="默认：15" />
        </Item>
      </Section>
      <Section title="应用" name="app">
        <Item label="界面风格" settingKey="theme">
          <Radio.Group
            options={[
              { label: '浅色', value: 'light' },
              { label: '深色', value: 'dark' },
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Item>
        <Item
          label="自动检查更新"
          settingKey="autoCheckUpdate"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="接收预览版"
          description="预览版更新更频繁，能获取到最新的特性，但不太稳定，可能会出现各种错误。"
          settingKey="acceptPrerelease"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="记录日志文件"
          description="日志文件可能体积较大，建议软件运行出问题需要上报时再开启，开启后请重启软件。"
          settingKey="writeLogs"
          valuePropName="checked"
        >
          <Switch />
        </Item>
        <Item
          label="日志级别"
          settingKey="logLevel"
          description="控制台与日志文件只输出不低于所选级别的日志：「错误」最少，「调试」最详细。"
        >
          <Radio.Group
            options={[
              { label: '错误', value: 'error' },
              { label: '警告', value: 'warn' },
              { label: '信息', value: 'info' },
              { label: '调试', value: 'debug' },
            ]}
            optionType="button"
            buttonStyle="solid"
          />
        </Item>
        <Item
          label="日志保留天数"
          settingKey="logRetentionDays"
          description="启动时自动删除早于保留天数的日志文件，填 0 表示不自动清理。"
          validator={(value) => {
            return Joi.number()
              .integer()
              .min(0)
              .message('请输入 0 或正整数')
              .validate(value).error?.message;
          }}
        >
          <Input type="number" min={0} placeholder="默认：7（0 为不清理）" />
        </Item>
        <Button
          onClick={async () => {
            await showInFolder(await path.appLogDir());
          }}
        >
          打开日志文件夹
        </Button>
      </Section>
    </>
  );
};
