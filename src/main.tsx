import React from 'react';
import ReactDOM from 'react-dom/client';
import { App as AntApp, ConfigProvider, theme } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { QuizPlayer } from './player/QuizPlayer';
import 'antd/dist/reset.css';
import './style.css';

const client = new QueryClient({ defaultOptions: { queries: { retry: 1, staleTime: 1500 } } });
const isPlayer = /^\/play\/?$/.test(location.pathname);
if (isPlayer) document.title = 'Music Quiz — Играть';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><QueryClientProvider client={client}>
    <ConfigProvider locale={ruRU} theme={isPlayer ? {
      algorithm: theme.darkAlgorithm,
      token: { colorPrimary: '#d9ff66', colorBgBase: '#13101b', colorTextLightSolid: '#16121c', borderRadius: 12, fontFamily: 'Inter, Segoe UI, sans-serif' },
      components: { Button: { primaryColor: '#16121c' }, Modal: { contentBg: '#21192c', headerBg: '#21192c' } },
    } : { token: { colorPrimary: '#6254d9', borderRadius: 10, fontFamily: 'Inter, Segoe UI, sans-serif' } }}>
      <AntApp>{isPlayer ? <QuizPlayer /> : <App />}</AntApp>
    </ConfigProvider>
  </QueryClientProvider></React.StrictMode>,
);
