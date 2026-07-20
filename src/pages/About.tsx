/* eslint-disable react/prop-types */
import React, { useState } from 'react';
import { PageHeader } from '../components/PageHeader';
import Logo from '../../src-tauri/icons/128x128.png';
import { useCheckUpdate } from '../hooks/useCheckUpdate';
import { dialog } from '@tauri-apps/api';

const REPO_URL = 'https://github.com/obihs2501/x-spider-mod-2026';

export const About: React.FC = () => {
  const [isCheckingUpdate, setIsCheckingUpdate] = useState(false);
  const checkForUpdate = useCheckUpdate();

  return (
    <>
      <PageHeader />
      <section className="flex items-center">
        <img src={Logo} className="w-28" alt="logo" />
        <div className="ml-4">
          <span className="text-5xl font-bold">X-Spider</span>
          <p className="text-gray-400 mt-2">
            推特（X）媒体下载器 · 支持免登录、单帖解析、增量下载
          </p>
        </div>
      </section>
      <ul className="space-y-2 [&_a]:underline mt-4">
        <li>
          <strong>版本号：</strong>
          <span>{PACKAGE_JSON_VERSION}</span>（
          <button
            onClick={async () => {
              setIsCheckingUpdate(true);
              try {
                const hasUpdate = await checkForUpdate();
                if (!hasUpdate) {
                  dialog.message('软件已是最新版本', {
                    title: '软件已是最新版本',
                  });
                }
              } catch (err) {
                dialog.message('无法获取最新更新，请稍后再试', {
                  title: '获取更新错误',
                });
              } finally {
                setIsCheckingUpdate(false);
              }
            }}
            className="bg-transparent text-ant-color-primary disabled:text-gray-400"
            disabled={isCheckingUpdate}
          >
            {isCheckingUpdate ? '请稍候...' : '检查更新'}
          </button>
          ）
        </li>

        <li>
          <strong>原作者：</strong>
          <a
            href="https://github.com/MiningCattiva"
            target="_blank"
            rel="noreferrer"
          >
            MiningCattiva
          </a>
        </li>

        <li>
          <strong>仓库地址：</strong>
          <a href={REPO_URL} target="_blank" rel="noreferrer">
            {REPO_URL}
          </a>
        </li>

        <li>
          <strong>开源协议：</strong>
          <a
            href={`${REPO_URL}/blob/main/LICENSE`}
            target="_blank"
            rel="noreferrer"
          >
            {PACKAGE_JSON_LICENSE}
          </a>
        </li>
      </ul>

      <section className="bg-white border-[1px] border-[#E8E6DC] rounded-xl p-4 mt-6 max-w-[600px] text-sm space-y-1 text-gray-500">
        <p>本项目仅用于学习交流，请勿用于商业或非法用途。</p>
        <p>
          代理设置提示：需开启代理并填入 HTTP 代理地址，本机一般为
          http://127.0.0.1:代理软件端口。
        </p>
      </section>
    </>
  );
};
