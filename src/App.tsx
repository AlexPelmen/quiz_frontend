import { useEffect, useState } from 'react';
import { Alert, Button, Layout, Menu, Space, Tag, Tooltip } from 'antd';
import { CustomerServiceOutlined, DatabaseOutlined, DownloadOutlined, PlayCircleOutlined, SettingOutlined, CodeOutlined, AppstoreOutlined, TeamOutlined, WarningOutlined, ReloadOutlined, TagOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { Catalog } from './Catalog';
import { Downloads, Parsing, ParsingErrors, Settings } from './Operations';
import { date, request } from './api';
import { useAction } from './shared';
import { Packs } from './Packs';
import { Console } from './Console';
import { Tags } from './Tags';
import { AlbumGuessing } from './AlbumGuessing';

const sections = [
  { key: 'artists', icon: <TeamOutlined />, label: 'Исполнители' },
  { key: 'albums', icon: <DatabaseOutlined />, label: 'Альбомы' },
  { key: 'album-guessing', icon: <AppstoreOutlined />, label: 'Модерация обложек' },
  { key: 'tracks', icon: <CustomerServiceOutlined />, label: 'Треки' },
  { key: 'parsing', icon: <PlayCircleOutlined />, label: 'Парсинг' },
  { key: 'parsing-errors', icon: <WarningOutlined />, label: 'Ошибки парсинга' },
  { key: 'downloads', icon: <DownloadOutlined />, label: 'Загрузки' },
  { key: 'packs', icon: <AppstoreOutlined />, label: 'Квиз-пакеты' },
  { key: 'tags', icon: <TagOutlined />, label: 'Теги' },
  { key: 'settings', icon: <SettingOutlined />, label: 'Настройки' },
  { key: 'console', icon: <CodeOutlined />, label: 'API-консоль' },
];
const currentRoute = () => location.hash.slice(1);
export function App() {
  const [route, setRoute] = useState(currentRoute);
  const [key, search] = route.split('?', 2);
  const section = sections.some(s => s.key === key) ? key : 'artists';
  const isCatalog = section === 'artists' || section === 'albums' || section === 'tracks';
  useEffect(() => { const update = () => setRoute(currentRoute()); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  const health = useQuery({ queryKey: ['ready'], queryFn: async () => { const r = await fetch('/ready'); if (!r.ok) throw new Error('API недоступен'); return r.json(); }, refetchInterval: 10000 });
  const quota = useQuery({ queryKey: ['genius-quota'], queryFn: () => request<{ limit: number; remaining: number; reset_at: string; observed_at: string } | null>('/genius-quota'), refetchInterval: 10000 });
  const action = useAction();
  return <Layout className="app-layout">
    <Layout.Sider breakpoint="lg" collapsedWidth={64} width={240} className="sidebar">
      <div className="brand"><span className="brand-icon">♫</span><span className="brand-text">Music Quiz<small>СТУДИЯ ПАКЕТОВ</small></span></div>
      <Menu theme="dark" mode="inline" selectedKeys={[section]} items={sections} onClick={({ key }) => { location.hash = key; }} />
      <div className="sidebar-footer">Личная музыкальная библиотека</div>
    </Layout.Sider>
    <Layout><Layout.Header className="topbar"><span>Рабочее пространство <span className="muted">/ Управление</span></span><Space wrap>
      <Button href="/play" icon={<PlayCircleOutlined />}>Играть</Button>
      <Tooltip title={quota.data ? `Последний ответ: ${date(quota.data.observed_at)}. Примерное обновление лимита: ${date(quota.data.reset_at)}` : 'Данные появятся после запроса к Genius'}>
        <Tag color={quota.data && quota.data.remaining === 0 ? 'warning' : 'purple'}>Genius: {quota.data ? `${quota.data.remaining.toLocaleString('ru-RU')} / ${quota.data.limit.toLocaleString('ru-RU')}` : 'нет данных'}</Tag>
      </Tooltip><Button size="small" icon={<ReloadOutlined />} aria-label="Проверить лимит Genius" loading={action.isPending} onClick={() => action.mutate({ path: '/genius-quota/refresh' })} />
      <Tag color={health.isSuccess ? 'success' : 'error'}>{health.isSuccess ? 'Сервис подключён' : 'Нет связи с API'}</Tag></Space></Layout.Header>
      <Layout.Content className="content">
        {health.error && <Alert className="connection-error" type="error" showIcon title="Нет соединения с сервером" description="Проверьте запуск backend и PostgreSQL. Повторная проверка выполняется автоматически." />}
        {isCatalog ? <Catalog key={section} resource={section} search={search} />
          : section === 'album-guessing' ? <AlbumGuessing />
          : section === 'parsing' ? <Parsing /> : section === 'parsing-errors' ? <ParsingErrors /> : section === 'downloads' ? <Downloads /> : section === 'packs' ? <Packs /> : section === 'tags' ? <Tags /> : section === 'settings' ? <Settings /> : <Console />}
      </Layout.Content><Layout.Footer className="footer">Music Quiz · От каталога исполнителей до готового раунда</Layout.Footer>
    </Layout>
  </Layout>;
}
