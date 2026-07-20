import React from 'react';
import { Button, Modal } from 'antd';
import { shell } from '@tauri-apps/api';
import { PlayCircleOutlined } from '@ant-design/icons';

export interface VideoPreviewModalProps {
  open: boolean;
  src?: string;
  title?: string;
  /** 对应的本地文件路径；提供时显示「用默认播放器打开」按钮 */
  filePath?: string;
  onClose: () => void;
}

export const VideoPreviewModal: React.FC<VideoPreviewModalProps> = ({
  open,
  src,
  title,
  filePath,
  onClose,
}) => (
  <Modal
    open={open}
    title={title || '视频预览'}
    centered
    width="min(960px, 90vw)"
    footer={
      <>
        {filePath && (
          <Button
            icon={<PlayCircleOutlined />}
            onClick={() => shell.open(filePath)}
          >
            用默认播放器打开
          </Button>
        )}
        <Button onClick={onClose}>关闭视频</Button>
      </>
    }
    onCancel={onClose}
    keyboard
    destroyOnClose
    maskClosable
  >
    {src && (
      <video
        key={src}
        src={src}
        controls
        autoPlay
        className="w-full max-h-[75vh] bg-black object-contain"
      />
    )}
  </Modal>
);
