/* eslint-disable react/prop-types */
import clsx from 'clsx';
import React from 'react';
import { ROUTES } from '../constants/routes';
import { Route } from '../interfaces/Route';
import { useRouteStore } from '../stores/route';
import { Account } from './Account';

interface SideBarItemProps {
  route: Route;
  active: boolean;
}

const Item: React.FC<SideBarItemProps> = ({ route, active }) => {
  const setRoute = useRouteStore((state) => state.setRoute);
  return (
    <li className="px-3">
      <button
        aria-label={`切换到${route.name}${active ? '（当前）' : ''}`}
        className={clsx(
          'block w-full py-2.5 px-4 rounded-lg transition-all text-left',
          active
            ? 'bg-white text-ant-color-primary font-bold shadow-sm border-[1px] border-[#E8E6DC]'
            : 'bg-transparent text-[#3D3929] hover:bg-white/60',
        )}
        onClick={() => {
          setRoute(route);
        }}
      >
        <span className="float-left">{route.icon}</span>
        <span className="ml-2">{route.name}</span>
      </button>
    </li>
  );
};

export const SideBar: React.FC = () => {
  const current = useRouteStore((state) => state.route);

  if (!current) return null;

  return (
    <aside
      aria-label="侧边栏"
      className="fixed top-0 left-0 h-full w-52 bg-[#F0EEE6] border-r-[1px] border-[#E8E6DC] z-40 transition-transform"
    >
      <Account />
      <nav aria-label="页面导航">
        <ul className="pt-6 space-y-1.5">
          {ROUTES.map((route) => (
            <Item
              key={route.id}
              route={route}
              active={current.id === route.id}
            />
          ))}
        </ul>
      </nav>
    </aside>
  );
};
