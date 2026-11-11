import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Form, Input, InputNumber, Modal, Row, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { CaretRightOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { date, Entity, fileURL, pretty, request, save } from './api';
import { Failure, PageTitle, Refresh, Status, useAction } from './shared';

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
    <div className="panel spaced"><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isFetching} scroll={{ x: 1040 }} columns={[
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
  return <><PageTitle title="Ошибки парсинга" subtitle="Причины ошибок исполнителей и ручная обработка">
    <Refresh onClick={() => void query.refetch()} /><Button href="#parsing">К запускам</Button></PageTitle>
    <Failure error={query.error} /><Alert type="info" showIcon title="Ошибки повторяются при следующем запуске"
      description="Исполнителей с ручным статусом можно вернуть в очередь." />
    <div className="panel spaced"><div className="toolbar"><Select value={status} style={{ width: 250 }} onChange={value => { setStatus(value); setPage(1); }} options={[
      { value: 'error', label: 'Завершились ошибкой' }, { value: 'partial', label: 'Частично заполнены' },
      { value: 'errored', label: 'Ошибки прежних запусков' }, { value: 'manual', label: 'Ручная обработка' },
    ]} /></div><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isPending} pagination={false} scroll={{ x: 800 }} columns={[
      { title: 'Исполнитель', dataIndex: 'name', width: 200 },
      { title: 'Статус', dataIndex: 'status', width: 130, render: value => <Status value={value} /> },
      { title: 'Последняя ошибка', dataIndex: 'error', render: (value: string) => value ? <Typography.Text copyable>{value}</Typography.Text> : <span className="muted">Нет сохранённой ошибки</span> },
      { title: 'Обновлено', dataIndex: 'updated_at', width: 170, render: date },
      { title: 'Действия', width: 180, render: (_, row) => status === 'manual' && <Button loading={action.isPending} onClick={() => action.mutate({ path: `/artists/${row.id}`, method: 'PATCH', body: { status: 'created' } })}>Вернуть в очередь</Button> },
    ]} /><div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div></div></>;
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
  const [form] = Form.useForm();
  const action = useAction();
  const query = useQuery({ queryKey: ['downloads', status, kind, page], queryFn: ({ signal }) => request<Entity[]>(`/downloads?limit=20&offset=${(page - 1) * 20}&status=${status}&file_type=${kind}`, { signal }), refetchInterval: 3000 });
  const clearSelection = () => { setSelected([]); setAllSelected(false); setExcluded([]); };
  const canStartSelection = allSelected || (selected.length > 0 && selected.length <= 200
    && selected.every(row => canStart(query.data?.find(current => current.id === row.id) || row)));
  const start = (downloader: string) => action.mutate({
    path: '/downloads/start', body: allSelected
      ? { downloader, all_matching: true, status, excluded_ids: excluded }
      : { downloader, download_ids: selected.map(row => row.id) },
  }, { onSuccess: result => { clearSelection(); setQueued((result as { queued: number }).queued); } });

  return <>
    <PageTitle title="Загрузки и медиатека" subtitle="Отметьте задания и запустите нужный загрузчик">
      <Refresh onClick={() => void query.refetch()} />
    </PageTitle>
    <Failure error={query.error || action.error} />
    <div className="panel">
      <Tabs activeKey={kind} onChange={value => { setKind(value); setPage(1); clearSelection(); }} items={[
        { key: 'mp3', label: 'Музыка' }, { key: 'image', label: 'Изображения' },
      ]} />
      {queued !== null && <Alert type="success" showIcon title={`Добавлено в очередь: ${queued}`} />}
      <Space wrap className="toolbar">
        {downloaders.filter(item => kind === 'image' ? item.key === 'image' : item.key !== 'image').map(({ key, label }) =>
          <Button key={key} loading={action.isPending} disabled={!canStartSelection} onClick={() => start(key)}>Запустить {label}</Button>)}
      </Space>
      <div className="toolbar">
        <Select aria-label="Состояние загрузки" value={status} style={{ width: 220 }} onChange={value => { setStatus(value); setPage(1); clearSelection(); }} options={[
          ['', 'Все состояния'], ['created', 'Ждёт запуска'], ['pending', 'В очереди'], ['processing', 'В обработке'],
          ['finished', 'Завершено'], ['errored', 'Ошибка'], ['manual', 'Нужен источник'],
        ].map(([value, label]) => ({ value, label }))} />
        <Typography.Text>{allSelected ? `Выбраны все подходящие задания${excluded.length ? `, исключено ${excluded.length}` : ''}` : `Выбрано ${selected.length}`}</Typography.Text>
        {(!!selected.length || allSelected) && <Button onClick={clearSelection}>Снять выбор</Button>}
        {selected.length > 200 && <Typography.Text type="warning">За один запуск можно выбрать до 200 заданий.</Typography.Text>}

      </div>
      <Table<Entity> rowKey="id" loading={query.isPending} dataSource={query.data} pagination={false} scroll={{ x: 980 }}
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
      <div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div>
    </div>
    <Modal title="Загрузка по прямой ссылке" open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()}
      okText="Запустить" confirmLoading={action.isPending}>
      <Failure error={action.error} />
      <Form form={form} layout="vertical" onFinish={body => action.mutate({ path: `/downloads/${editing?.id}/retry`, body }, { onSuccess: () => setEditing(null) })}>
        <Form.Item name="source_type" label="Тип источника" rules={[{ required: true }]}><Select options={(editing?.file_type === 'mp3' ? ['mp3', 'youtube'] : ['image']).map(value => ({ value, label: value }))} /></Form.Item>
        <Form.Item name="source_uri" label="Ссылка на файл или видео" rules={[{ required: true }, { type: 'url', message: 'Введите полный URL' }]}><Input /></Form.Item>
      </Form>
    </Modal>
  </>;
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
