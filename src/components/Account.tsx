/* eslint-disable react/prop-types */
import {
  App,
  Avatar,
  Button,
  Form,
  Input,
  List,
  Modal,
  Popconfirm,
  Switch,
  Tag,
} from 'antd';
import React, { useEffect, useState } from 'react';
import { useAccountsStore, XAccount } from '../stores/accounts';
import { getAccountInfo } from '../twitter/api';
import {
  PlusOutlined,
  QuestionCircleOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import FormItem from 'antd/es/form/FormItem';
import { useForm } from 'antd/es/form/Form';
import { stringifyCookie } from '../utils/cookie';
import dayjs from 'dayjs';

const CookieHelp: React.FC = () => (
  <p className="mt-2">
    <button
      onClick={() => {
        Modal.confirm({
          title: '寻找 Cookie 的方法',
          icon: null,
          content: (
            <>
              <p>1. 打开推特并登录。</p>
              <p>2. 按【F12】打开开发者工具。</p>
              <p>3. 找到【应用程序（Applications）】选项卡。</p>
              <p>
                4.
                在左侧列表中找到【Cookie】，展开并选中【https://twitter.com】。
              </p>
              <p>
                5.
                在右侧找到名称为【auth_token】和【ct0】的项目，复制相应值填写表单即可。
              </p>
            </>
          ),
        });
      }}
      className="text-ant-color-link flex items-center bg-transparent"
    >
      <QuestionCircleOutlined
        className="transform translate-y-[0.6px]"
        aria-hidden
      />
      <span className="ml-1">寻找 Cookie 的方法</span>
    </button>
  </p>
);

const AccountStatusTags: React.FC<{ account: XAccount; active: boolean }> = ({
  account,
  active,
}) => {
  const rateLimited = account.rateLimitedUntil > Date.now();
  return (
    <span className="ml-1">
      {active && <Tag color="success">使用中</Tag>}
      {!account.enabled && <Tag>已停用</Tag>}
      {rateLimited && (
        <Tag color="warning">
          限流中 至 {dayjs(account.rateLimitedUntil).format('HH:mm')}
        </Tag>
      )}
    </span>
  );
};

export const Account: React.FC = () => {
  const {
    accounts,
    activeAccountId,
    displayAccountId,
    addAccount,
    removeAccount,
    updateAccount,
    setActiveAccountId,
  } = useAccountsStore((s) => ({
    accounts: s.accounts,
    activeAccountId: s.activeAccountId,
    displayAccountId: s.displayAccountId,
    addAccount: s.addAccount,
    removeAccount: s.removeAccount,
    updateAccount: s.updateAccount,
    setActiveAccountId: s.setActiveAccountId,
  }));
  const [poolOpen, setPoolOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addLoading, setAddLoading] = useState(false);
  const [form] = useForm();
  const { message } = App.useApp();

  // 左上角固定展示手动选择的账号；自动轮换只在后台切换请求所用账号
  const displayAccount =
    accounts.find((a) => a.id === displayAccountId) ||
    accounts.find((a) => a.id === activeAccountId) ||
    accounts[0] ||
    null;

  // 为缺少资料的展示账号补拉 screenName / 头像（如旧版迁移进来的账号）
  useEffect(() => {
    (async () => {
      if (!displayAccount || displayAccount.screenName) return;
      try {
        const info = await getAccountInfo(displayAccount.cookieString);
        updateAccount(displayAccount.id, {
          screenName: info.screenName,
          avatar: info.avatar,
        });
      } catch (err) {
        log.error('Fetch account info failed', err);
      }
    })();
  }, [displayAccount?.id, displayAccount?.screenName]);

  const onAddFormFinished = async (values: any) => {
    setAddLoading(true);
    const newCookieString = stringifyCookie(values);

    try {
      const info = await getAccountInfo(newCookieString);
      if (
        accounts.some((a) => a.screenName && a.screenName === info.screenName)
      ) {
        message.warning(`账号 ${info.screenName} 已在账号池中`);
        return;
      }
      addAccount(newCookieString, {
        screenName: info.screenName,
        avatar: info.avatar,
      });
      message.success(`已添加账号 ${info.screenName}`);
      form.resetFields();
      setAddOpen(false);
    } catch (err: any) {
      log.error(err);
      message.error('无法登录，请检查 Cookie 或代理配置是否正确');
    } finally {
      setAddLoading(false);
    }
  };

  return (
    <>
      <div className="px-4">
        <section
          aria-label="个人信息"
          className="flex flex-col justify-center items-center border-b-[1px] py-6 border-[#E8E6DC]"
        >
          {!displayAccount && (
            <>
              <button
                className="bg-transparent"
                onClick={() => setAddOpen(true)}
              >
                <Avatar size={50}>登录</Avatar>
              </button>
              <span className="sr-only" role="alert">
                账号未登录
              </span>
            </>
          )}
          {displayAccount && (
            <>
              <span className="sr-only" role="alert">
                账号 {displayAccount.screenName || '未知'} 已登录
              </span>
              <a
                className="focus:outline !outline-4 !outline-black"
                title="前往个人主页"
                aria-label="前往个人主页"
                target="_blank"
                href={`https://twitter.com/${displayAccount.screenName || ''}`}
                rel="noreferrer"
              >
                <Avatar size={50} src={displayAccount.avatar} alt="头像">
                  {displayAccount.screenName?.[0] || '?'}
                </Avatar>
              </a>
              <div className="text-[#3D3929] mt-1 font-bold">
                {displayAccount.screenName || '加载中…'}
              </div>
            </>
          )}
          <button
            onClick={() => setPoolOpen(true)}
            className="text-[#87867F] bg-transparent hover:text-ant-color-primary transition-colors text-sm mt-1"
          >
            <TeamOutlined aria-hidden />
            <span className="ml-1">账号池（{accounts.length}）</span>
          </button>
        </section>
      </div>

      <Modal
        open={poolOpen}
        onCancel={() => setPoolOpen(false)}
        footer={null}
        title="账号池"
        width={520}
      >
        <p className="text-ant-color-text-secondary text-xs mb-2">
          多账号轮换可降低单账号的请求频率与风控风险。轮换策略可在「设置 →
          账号轮换」中调整；收到 429
          限流时会自动切换到下一个可用账号。自动轮换只在后台切换请求所用账号（标「使用中」），左上角始终显示你手动选择的账号。
        </p>
        <List
          dataSource={accounts}
          locale={{ emptyText: '暂无账号，点击下方按钮添加' }}
          renderItem={(account) => {
            const isActive = account.id === activeAccountId;
            return (
              <List.Item
                actions={[
                  !isActive && (
                    <Button
                      key="use"
                      size="small"
                      disabled={!account.enabled}
                      onClick={() => setActiveAccountId(account.id)}
                    >
                      设为当前
                    </Button>
                  ),
                  <Switch
                    key="enable"
                    size="small"
                    checked={account.enabled}
                    checkedChildren="启用"
                    unCheckedChildren="停用"
                    onChange={(checked) =>
                      updateAccount(account.id, { enabled: checked })
                    }
                  />,
                  <Popconfirm
                    key="remove"
                    title="确认删除该账号？"
                    onConfirm={() => removeAccount(account.id)}
                  >
                    <Button size="small" danger>
                      删除
                    </Button>
                  </Popconfirm>,
                ].filter(Boolean)}
              >
                <List.Item.Meta
                  avatar={
                    <Avatar src={account.avatar}>
                      {account.screenName?.[0] || '?'}
                    </Avatar>
                  }
                  title={
                    <span>
                      {account.screenName || '未验证账号'}
                      <AccountStatusTags account={account} active={isActive} />
                    </span>
                  }
                  description={`添加于 ${dayjs(account.addedAt).format('YYYY-MM-DD HH:mm')}`}
                />
              </List.Item>
            );
          }}
        />
        <Button
          block
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setAddOpen(true)}
          className="mt-2"
        >
          添加账号
        </Button>
      </Modal>

      <Modal
        onOk={() => form.submit()}
        confirmLoading={addLoading}
        onCancel={() => setAddOpen(false)}
        open={addOpen}
        title="添加账号（Twitter Cookie）"
      >
        <Form
          labelCol={{ span: 5 }}
          form={form}
          className="mt-4"
          onFinish={onAddFormFinished}
        >
          <FormItem
            name="auth_token"
            label="auth_token"
            rules={[
              {
                type: 'string',
                required: true,
              },
            ]}
          >
            <Input placeholder="名称为 auth_token 的值" />
          </FormItem>
          <FormItem
            name="ct0"
            label="ct0"
            rules={[
              {
                type: 'string',
                required: true,
              },
            ]}
          >
            <Input placeholder="名称为 ct0 的值" />
          </FormItem>
        </Form>
        <CookieHelp />
        {addLoading && (
          <span className="sr-only" role="status">
            登录中，请稍候
          </span>
        )}
      </Modal>
    </>
  );
};
