import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { QuizPlayer } from './player/QuizPlayer';
import { AuthGate } from './Auth';
import 'antd/dist/reset.css';
import './style.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 1500 } } });
const isAdmin = /^\/admin\/?$/.test(location.pathname);
document.title = isAdmin ? 'Music Quiz — управление' : 'Music Quiz — Играть';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}>
    <ConfigProvider locale={ruRU} theme={!isAdmin ? {
      algorithm: theme.darkAlgorithm,
      token: { colorPrimary: '#c5ff00', colorBgBase: '#08080c', colorTextLightSolid: '#101216', borderRadius: 0, fontFamily: 'Inter, Segoe UI, sans-serif' },
      components: { Button: { primaryColor: '#101216' }, Modal: { contentBg: '#111116', headerBg: '#111116' } },
    } : { token: { colorPrimary: '#6254d9', borderRadius: 10, fontFamily: 'Inter, Segoe UI, sans-serif' } }}>
      <AntApp><AuthGate player={!isAdmin}>{isAdmin ? <App /> : <QuizPlayer />}</AuthGate></AntApp>
    </ConfigProvider>
  </QueryClientProvider></React.StrictMode>,
);
