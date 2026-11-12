import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Progress, Row, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { CaretRightOutlined, CloudDownloadOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { date, Entity, fileURL, pretty, request, save } from './api';
import { Failure, PageTitle, Refresh, Status, useAction } from './shared';
import './downloads.css';

const providers = [
  { id: 'yt_music', name: 'YouTube Music', fields: 'Карточка, логотип, подписчики, месячная аудитория, популярные альбомы и треки, обложки, длительности и счётчики.' },
  { id: 'genius', name: 'Genius', fields: 'Имя и логотип, альбомы и популярные треки, даты релизов и обложки.' },
  { id: 'musicbrainz', name: 'MusicBrainz', fields: 'Страна и состав, альбомы и даты, записи и длительности, обложки через Cover Art Archive.' },
];

export function providerName(value: unknown) {
  return providers.find(provider => provider.id === value)?.name ?? 'Общий импорт';
}

export function Parsing() {
  const query = useQuery({ queryKey: ['parsing-runs'], queryFn: () => request<Entity[]>('/parsing-runs?limit=100'), refetchInterval: 3000 });
  const action = useAction();
  const active = query.data?.some(row => ['pending', 'running', 'stopping'].includes(row.status || ''));
  return <><PageTitle title="Парсинг каталога" subtitle="YouTube Music, Genius и MusicBrainz · состояние обновляется каждые 3 секунды">
    <Refresh onClick={() => void query.refetch()} /><Button href="#parsing-errors">Ошибки исполнителей</Button><Button href="#parsing-logs">Журнал</Button>
    <Button href="#album-cleanup">Очистка альбомов</Button>
  </PageTitle><Failure error={query.error || action.error} />
    <Row gutter={[12, 12]}>
      {providers.map(provider => <Col key={provider.id} xs={24} md={12} xl={8}>
        <Card size="small" style={{ height: '100%' }}>
          <Space direction="vertical">
            <Button type="primary" icon={<CaretRightOutlined />} loading={action.isPending}
              disabled={active || query.isPending || !!query.error}
              onClick={() => action.mutate({ path: '/parsing-runs', body: { provider: provider.id } })}>{provider.name}</Button>
            <Typography.Text type="secondary">{provider.fields}</Typography.Text>
          </Space>
        </Card>
      </Col>)}
    </Row>
    <div className="panel spaced"><div className="table-total">Всего показано запусков: {query.data?.length.toLocaleString('ru-RU') ?? '—'}</div><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isFetching} scroll={{ x: 1040 }} columns={[
      { title: 'Запуск', dataIndex: 'created_at', render: date }, { title: 'Статус', dataIndex: 'status', render: value => <Status value={value} /> },
      { title: 'Провайдер', dataIndex: 'provider', render: providerName },
      { title: 'Действие', render: (_, row) => ['pending', 'running'].includes(row.status || '') ? <Button danger loading={action.isPending} onClick={() => action.mutate({ path: `/parsing-runs/${row.id}/stop` })}>Остановить</Button> : row.status === 'stopping' ? 'Ожидание завершения исполнителя' : '—' },
      { title: 'Журнал', render: (_, row) => <Button href={`#parsing-logs?run=${row.id}`}>Открыть</Button> },
      { title: 'Исполнителей', dataIndex: 'processed' }, { title: 'Полей', dataIndex: 'fields' },
      { title: 'Альбомов', dataIndex: 'albums' }, { title: 'Треков', dataIndex: 'tracks' },
      { title: 'Сбоев', dataIndex: 'errors' }, { title: 'Причина остановки', dataIndex: 'error', ellipsis: true },
    ]} /></div></>;
}

export function ParsingErrors() {
  const [status, setStatus] = useState('error');
  const [page, setPage] = useState(1);
  const action = useAction();
  const query = useQuery({ queryKey: ['parsing-errors', status, page],
    queryFn: () => request<Entity[]>(`/artists?status=${status}&limit=20&offset=${(page - 1) * 20}`), refetchInterval: 5000 });
  const count = useQuery({ queryKey: ['artists', 'count', status], queryFn: ({ signal }) => request<{ count: number }>(`/artists/count?status=${status}`, { signal }), refetchInterval: 5000 });
  return <><PageTitle title="Ошибки парсинга" subtitle="Причины ошибок исполнителей и ручная обработка">
    <Refresh onClick={() => void query.refetch()} /><Button href="#parsing">К запускам</Button></PageTitle>
    <Failure error={query.error || count.error} /><Alert type="info" showIcon title="Ошибки повторяются при следующем запуске"
      description="Исполнителей с ручным статусом можно вернуть в очередь." />
    <div className="panel spaced"><div className="toolbar"><Select value={status} style={{ width: 250 }} onChange={value => { setStatus(value); setPage(1); }} options={[
      { value: 'error', label: 'Завершились ошибкой' }, { value: 'partial', label: 'Частично заполнены' },
      { value: 'errored', label: 'Ошибки прежних запусков' }, { value: 'manual', label: 'Ручная обработка' },
    ]} /></div><div className="table-total">Всего: {count.data?.count?.toLocaleString('ru-RU') ?? '—'}</div><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isPending} pagination={{ current: page, pageSize: 20, total: count.data?.count, showSizeChanger: false, onChange: setPage }} scroll={{ x: 800 }} columns={[
      { title: 'Исполнитель', dataIndex: 'name', width: 200 },
      { title: 'Статус', dataIndex: 'status', width: 130, render: value => <Status value={value} /> },
      { title: 'Последняя ошибка', dataIndex: 'error', render: (value: string) => value ? <Typography.Text copyable>{value}</Typography.Text> : <span className="muted">Нет сохранённой ошибки</span> },
      { title: 'Обновлено', dataIndex: 'updated_at', width: 170, render: date },
      { title: 'Действия', width: 180, render: (_, row) => status === 'manual' && <Button loading={action.isPending} onClick={() => action.mutate({ path: `/parsing-errors/${row.id}/requeue` })}>Вернуть в очередь</Button> },
    ]} /></div></>;
}

const downloaders = [
  { key: 'yt_music', label: 'YouTube Music' },
  { key: 'hitmo', label: 'Hitmo' },
  { key: 'genius_youtube', label: 'Genius + YouTube' },
  { key: 'genius_short', label: 'Genius Short' },
  { key: 'image', label: 'Изображения' },
];

function canStart(row: Entity) {
  return ['created', 'errored', 'manual'].includes(row.status || '')
    && (row.file_type === 'mp3' || (row.source_type === 'image' && !!row.source_uri));
}

export function Downloads() {
  const [status, setStatus] = useState('');
  const [kind, setKind] = useState('mp3');
  const [allSelected, setAllSelected] = useState(false);
  const [excluded, setExcluded] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [selected, setSelected] = useState<Entity[]>([]);
  const [queued, setQueued] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<Error | null>(null);
  const [progress, setProgress] = useState(readDownloadProgress);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [form] = Form.useForm();
  const action = useAction();
  const query = useQuery({ queryKey: ['downloads', status, kind, page], queryFn: ({ signal }) => request<Entity[]>(`/downloads?limit=20&offset=${(page - 1) * 20}&status=${status}&file_type=${kind}`, { signal }), refetchInterval: 3000 });
  const active = useQuery({ queryKey: ['downloads-active-count', kind], queryFn: ({ signal }) => request<{ active: number }>(`/downloads/active-count?file_type=${kind}`, { signal }), refetchInterval: 3000 });
  const count = useQuery({ queryKey: ['downloads', 'count', status, kind], queryFn: ({ signal }) => request<{ count: number }>(`/downloads/count?status=${status}&file_type=${kind}`, { signal }), refetchInterval: 3000 });
  const clearSelection = () => { setSelected([]); setAllSelected(false); setExcluded([]); };
  const canStartSelection = allSelected || (selected.length > 0 && selected.length <= 200
    && selected.every(row => canStart(query.data?.find(current => current.id === row.id) || row)));
  const runStart = async (path: string, body: unknown, fileKind: string, batch: boolean) => {
    setStarting(true);
    setStartError(null);
    try {
      const before = await request<{ active: number }>(`/downloads/active-count?file_type=${fileKind}`);
      const result = await action.mutateAsync({ path, body });
      const added = batch ? (result as { queued: number }).queued : 1;
      if (added > 0) {
        const next = { ...progress, [fileKind]: before.active + added };
        setProgress(next);
        try {
          localStorage.setItem(downloadProgressKey, JSON.stringify(next));
          setStorageError(null);
        } catch {
          setStorageError('Не удалось сохранить прогресс в браузере. После обновления страницы он может потеряться.');
        }
      }
      setQueued(added);
      clearSelection();
      setEditing(null);
      void active.refetch();
    } catch (error) {
      setStartError(error instanceof Error ? error : new Error('Не удалось запустить загрузку'));
    } finally {
      setStarting(false);
    }
  };
  const start = (downloader: string) => void runStart('/downloads/start', allSelected
    ? { downloader, all_matching: true, status, excluded_ids: excluded }
    : { downloader, download_ids: selected.map(row => row.id) }, kind, true);

  return <>
    <PageTitle title="Загрузки и медиатека" subtitle="Отметьте задания и запустите нужный загрузчик">
      <Refresh onClick={() => void query.refetch()} />
    </PageTitle>
    <Failure error={query.error || count.error || active.error || startError || action.error} />
    {storageError && <Alert type="warning" showIcon title={storageError} className="downloads-notice" />}
    <DownloadProgress kind={kind} active={active.data?.active} total={progress[kind]} />
    <div className="panel downloads-panel">
      <Tabs className="downloads-tabs" activeKey={kind} onChange={value => { setKind(value); setPage(1); clearSelection(); setQueued(null); }} items={[
        { key: 'mp3', label: 'Музыка' }, { key: 'image', label: 'Изображения' },
      ]} />
      <div className="downloads-controls">
        <div className="downloads-controls-heading">
          <div><strong>Задания</strong><span>Выберите записи и способ загрузки</span></div>
          <div className="downloads-selection">{allSelected ? `Выбраны все подходящие${excluded.length ? ` · исключено ${excluded.length}` : ''}` : `Выбрано: ${selected.length}`}
            {(!!selected.length || allSelected) && <Button type="link" onClick={clearSelection}>Снять выбор</Button>}
          </div>
        </div>
        <div className="downloads-actions">
          {downloaders.filter(item => kind === 'image' ? item.key === 'image' : item.key !== 'image').map(({ key, label }) =>
            <Button key={key} loading={starting} disabled={!canStartSelection} onClick={() => start(key)}>{label}</Button>)}
        </div>
        {selected.length > 200 && <Typography.Text type="warning">За один запуск можно выбрать до 200 заданий.</Typography.Text>}
        {queued !== null && <Alert type="success" showIcon closable onClose={() => setQueued(null)} title={`Добавлено в очередь: ${queued}`} />}
      </div>
      <div className="downloads-table-heading">
        <div className="downloads-table-title"><strong>Список загрузок</strong><span>Всего: {count.data?.count?.toLocaleString('ru-RU') ?? '—'}</span></div>
        <Select aria-label="Состояние загрузки" value={status} onChange={value => { setStatus(value); setPage(1); clearSelection(); }} options={[
          ['', 'Все состояния'], ['created', 'Ждёт запуска'], ['pending', 'В очереди'], ['processing', 'В обработке'],
          ['finished', 'Завершено'], ['errored', 'Ошибка'], ['manual', 'Нужен источник'],
        ].map(([value, label]) => ({ value, label }))} />
      </div>
      <Table<Entity> rowKey="id" loading={query.isPending} dataSource={query.data} pagination={{ current: page, pageSize: 20, total: count.data?.count, showSizeChanger: false, onChange: setPage }} scroll={{ x: 980 }}
        rowSelection={{
          columnTitle: <Checkbox aria-label="Выбрать все задания" checked={allSelected}
            disabled={!!status && !['created', 'errored', 'manual'].includes(status)}
            onChange={event => { setAllSelected(event.target.checked); setSelected([]); setExcluded([]); }} />,
          selectedRowKeys: allSelected ? (query.data || []).filter(row => canStart(row) && !excluded.includes(row.id)).map(row => row.id) : selected.map(row => row.id),
          preserveSelectedRowKeys: !allSelected,
          onSelect: (row, checked) => {
            if (allSelected) setExcluded(ids => checked ? ids.filter(id => id !== row.id) : [...ids, row.id]);
            else setSelected(rows => checked ? [...rows, row] : rows.filter(item => item.id !== row.id));
          },
          getCheckboxProps: row => ({ disabled: !canStart(row) }),
        }}
        locale={{ emptyText: 'Заданий нет' }} columns={[
          { title: 'Запись / источник', width: 240, render: (_, row) => {
            const meta = row.meta as Record<string, unknown> | undefined;
            const label = downloaders.find(item => item.key === row.downloader)?.label;
            return <><strong>{String(meta?.title || (row.file_type === 'mp3' ? 'Аудиозапись' : 'Изображение'))}</strong>
              <div className="muted">{String(meta?.artist || row.id)}</div>
              {label && <Tag>{label}</Tag>}{row.preview && <Tag>Короткая запись</Tag>}</>;
          } },
          { title: 'Состояние', dataIndex: 'status', width: 230, render: (value, row) => <>
            {value === 'created' ? <Tag>Ждёт запуска</Tag> : <Status value={value} />}
            {row.error && <p className="error-text">{row.error}</p>}
          </> },
          { title: 'Медиа', width: 300, render: (_, row) => row.status === 'finished'
            ? row.file_type === 'mp3' ? <audio controls preload="none" src={fileURL(row.id)} />
              : <a href={fileURL(row.id)} target="_blank" rel="noreferrer"><img className="thumbnail" src={fileURL(row.id)} alt="Открыть изображение" /></a>
            : <span className="muted">Файл пока не готов</span> },
          { title: 'Действия', render: (_, row) => <Space direction="vertical">
            {['created', 'manual', 'errored'].includes(row.status || '') && <Button onClick={() => {
              form.resetFields();
              form.setFieldsValue({ source_type: row.source_type === 'youtube' ? 'youtube' : row.file_type === 'mp3' ? 'mp3' : 'image',
                source_uri: row.source_type === 'unknown' ? '' : row.source_uri });
              setEditing(row);
            }}>Указать ссылку</Button>}
            {row.status === 'finished' && <a href={fileURL(row.id)} target="_blank" rel="noreferrer">Открыть файл</a>}
          </Space> },
        ]} expandable={{ expandedRowRender: row => <pre>{pretty(row)}</pre> }} />
    </div>
    <Modal title="Загрузка по прямой ссылке" open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()}
      okText="Запустить" confirmLoading={starting}>
      <Failure error={startError || action.error} />
      <Form form={form} layout="vertical" onFinish={body => { if (editing) void runStart(`/downloads/${editing.id}/retry`, body, editing.file_type === 'mp3' ? 'mp3' : 'image', false); }}>
        <Form.Item name="source_type" label="Тип источника" rules={[{ required: true }]}><Select options={(editing?.file_type === 'mp3' ? ['mp3', 'youtube'] : ['image']).map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="source_uri" label="Ссылка на файл или видео" rules={[{ required: true }, { type: 'url', message: 'Введите полный URL' }]}><Input /></Form.Item>
      </Form>
    </Modal>
  </>;
}

const downloadProgressKey = 'music-quiz-download-progress';

function readDownloadProgress(): Record<string, number> {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(downloadProgressKey) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    return Object.fromEntries(Object.entries(saved).filter(([key, value]) =>
      ['mp3', 'image'].includes(key) && typeof value === 'number' && Number.isSafeInteger(value) && value > 0));
  } catch (error) {
    console.warn('Не удалось прочитать прогресс загрузок', error);
    return {};
  }
}

function DownloadProgress({ kind, active, total }: { kind: string; active?: number; total?: number }) {
  if (!active) return null;
  const known = total !== undefined && total >= active;
  const completed = known ? total - active : 0;
  return <section className="downloads-progress panel" aria-label="Прогресс загрузок" role="status">
    <div className="downloads-progress-icon"><CloudDownloadOutlined /></div>
    <div className="downloads-progress-body">
      <div className="downloads-progress-heading">
        <div><strong>Загружаем {kind === 'mp3' ? 'музыку' : 'изображения'}</strong>
          <span>{known ? `Обработано ${completed.toLocaleString('ru-RU')} из ${total.toLocaleString('ru-RU')}` : 'Загрузка запущена в другом сеансе'}</span></div>
        <div className="downloads-remaining"><strong>{active.toLocaleString('ru-RU')}</strong><span>осталось</span></div>
      </div>
      {known && <Progress percent={Math.round(completed / total * 100)} strokeColor="#6254d9" />}
      <span className="downloads-progress-note">Обработанные задания могут завершиться ошибкой.</span>
    </div>
  </section>;
}

export function Settings() {
  const query = useQuery({ queryKey: ['settings'], queryFn: () => request<Record<string, unknown>>('/settings'), refetchOnWindowFocus: false });
  const action = useAction();
  const client = useQueryClient();
  const [form] = Form.useForm();
  const guessRate = useMutation({
    mutationFn: (enabled: boolean) => save<Record<string, unknown>>('/settings', 'PATCH', { quiz_guess_rate_enabled: enabled }),
    onSuccess: result => client.setQueryData(['settings'], result),
    onError: () => form.setFieldValue('quiz_guess_rate_enabled', query.data?.quiz_guess_rate_enabled),
  });
  const { quiz_guess_rate_enabled, quiz_guess_rate_asked_threshold, source_429_retries, parser_stop_failures, ...other } = query.data || {};
  return <><PageTitle title="Настройки" subtitle="Параметры парсинга, загрузок и последовательность раундов"><Refresh onClick={() => void query.refetch()} /></PageTitle>
    <Failure error={query.error || action.error || guessRate.error} /><Card title="Конфигурация сервиса">
      <Alert type="info" showIcon title="Настройки хранятся в PostgreSQL"
        description="Отключите учёт ответов, чтобы подбирать вопросы только по прослушиваниям YouTube Music." />
      {query.data && <Form form={form} layout="vertical"
        initialValues={{ json: pretty(other), quiz_guess_rate_enabled, quiz_guess_rate_asked_threshold, source_429_retries, parser_stop_failures }}
        onFinish={({ json, ...values }) => action.mutate({ path: '/settings', method: 'PATCH', body: { ...JSON.parse(json), ...values } })}>
        <Form.Item className="spaced" name="quiz_guess_rate_enabled" label="Учитывать правильные ответы" valuePropName="checked"
          extra="Переключатель сохраняется сразу; остальные настройки — кнопкой ниже.">
          <Switch loading={guessRate.isPending} disabled={guessRate.isPending || action.isPending} onChange={checked => guessRate.mutate(checked)} />
        </Form.Item>
        <Form.Item name="quiz_guess_rate_asked_threshold" label="Порог числа показов"
          extra="Доля правильных ответов используется, когда число показов превышает порог."
          rules={[{ required: true, type: 'integer', min: 0 }]}>
          <InputNumber min={0} precision={0} />
        </Form.Item>
        <Form.Item name="source_429_retries" label="Повторов запроса после ошибки"
          rules={[{ required: true, type: 'integer', min: 0, max: 10 }]}>
          <InputNumber min={0} max={10} precision={0} />
        </Form.Item>
        <Form.Item name="parser_stop_failures" label="Остановить после одинаковых сбоев подряд"
          extra="Серия должна затронуть как минимум две разные сущности."
          rules={[{ required: true, type: 'integer', min: 2, max: 1000 }]}>
          <InputNumber min={2} max={1000} precision={0} />
        </Form.Item>
        <Form.Item className="spaced" name="json" label="JSON настроек" rules={[{ validator: (_, value) => validateJSON(value) }]}><Input.TextArea autoSize={{ minRows: 18, maxRows: 32 }} className="code-input" /></Form.Item>
        <Button htmlType="submit" type="primary" loading={action.isPending} disabled={guessRate.isPending}>Сохранить настройки</Button>
      </Form>}
    </Card></>;
}

export function validateJSON(value: string) {
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Требуется JSON-объект');
    return Promise.resolve();
  } catch { return Promise.reject(new Error('Введите корректный JSON-объект')); }
}
