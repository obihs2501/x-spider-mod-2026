import { useEffect } from 'react';
import {
  PhysicalPosition,
  PhysicalSize,
  appWindow,
  availableMonitors,
} from '@tauri-apps/api/window';
import { useWindowStateStore } from '../stores/window-state';

const MIN_WIDTH = 800;
const MIN_HEIGHT = 600;

function isVisibleOnAnyMonitor(
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return availableMonitors().then((monitors) =>
    monitors.some((monitor) => {
      const left = monitor.position.x;
      const top = monitor.position.y;
      const right = left + monitor.size.width;
      const bottom = top + monitor.size.height;
      return x < right && x + width > left && y < bottom && y + height > top;
    }),
  );
}

export function useWindowState() {
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unlisteners: (() => void)[] = [];

    const save = async () => {
      if (await appWindow.isMaximized()) {
        const old = useWindowStateStore.getState().windowState;
        if (old) {
          useWindowStateStore.getState().setWindowState({
            ...old,
            maximized: true,
          });
        }
        return;
      }
      const [size, position] = await Promise.all([
        appWindow.innerSize(),
        appWindow.outerPosition(),
      ]);
      useWindowStateStore.getState().setWindowState({
        width: size.width,
        height: size.height,
        x: position.x,
        y: position.y,
        maximized: false,
      });
    };

    const scheduleSave = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void save(), 400);
    };

    (async () => {
      const saved = useWindowStateStore.getState().windowState;
      if (saved) {
        const width = Math.max(MIN_WIDTH, saved.width);
        const height = Math.max(MIN_HEIGHT, saved.height);
        if (await isVisibleOnAnyMonitor(saved.x, saved.y, width, height)) {
          await appWindow.setSize(new PhysicalSize(width, height));
          await appWindow.setPosition(new PhysicalPosition(saved.x, saved.y));
        }
        if (saved.maximized) await appWindow.maximize();
      }
      if (disposed) return;
      unlisteners.push(await appWindow.onResized(scheduleSave));
      unlisteners.push(await appWindow.onMoved(scheduleSave));
    })().catch((err) => {
      try {
        log.warn('Restore window state failed', err);
      } catch {
        // logger 未初始化时忽略
      }
    });

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      void save();
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, []);
}
