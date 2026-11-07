import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Modal, Select, Space, Table, Tag, Typography } from 'antd';
import { CaretRightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, fileURL, pretty, request } from './api';
import { Failure, PageTitle, Refresh, Status, useAction } from './shared';

export function Parsing() {
  const query = useQuery({ queryKey: ['parsing-runs'], queryFn: () => request<Entity[]>('/parsing-runs?limit=100'), refetchInterval: 3000 });
  const action = useAction();
  const active = query.data?.some(row => ['pending', 'running'].includes(row.status || ''));
  return <><PageTitle title="Парсинг каталога" subtitle="Genius и MusicBrainz · состояние обновляется каждые 3 секунды">
    <Refresh onClick={() => void query.refetch()} /><Button href="#parsing-errors">Ошибки исполнителей</Button><Button type="primary" icon={<CaretRightOutlined />} loading={action.isPending} disabled={active || query.isPending || !!query.error} onClick={() => action.mutate({ path: '/parsing-runs' })}>Запустить парсер</Button>
  </PageTitle><Failure error={query.error} />
    <Alert showIcon type="info" title="Сначала добавьте исполнителей" description="Парсер обработает новые записи и повторит исполнителей с ошибками предыдущих запусков. Исполнители в статусе «Вручную» пропускаются. Загрузки начнутся автоматически." />
    <div className="panel spaced"><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isFetching} scroll={{ x: 700 }} columns={[
      { title: 'Запуск', dataIndex: 'created_at', render: date }, { title: 'Статус', dataIndex: 'status', render: value => <Status value={value} /> },
      { title: 'Обработано', dataIndex: 'processed' }, { title: 'С ошибками', dataIndex: 'failed' }, { title: 'Ошибка', dataIndex: 'error', ellipsis: true },
    ]} /></div></>;
}

export function ParsingErrors() {
  const [status, setStatus] = useState('errored');
  const [page, setPage] = useState(1);
  const action = useAction();
  const query = useQuery({ queryKey: ['parsing-errors', status, page],
    queryFn: () => request<Entity[]>(`/artists?status=${status}&limit=20&offset=${(page - 1) * 20}`), refetchInterval: 5000 });
  return <><PageTitle title="Ошибки парсинга" subtitle="Причины ошибок исполнителей и ручная обработка">
    <Refresh onClick={() => void query.refetch()} /><Button href="#parsing">К запускам</Button></PageTitle>
    <Failure error={query.error} /><Alert type="info" showIcon title="Ошибки повторяются при следующем запуске"
      description="Чтобы временно исключить исполнителя из автоматического парсинга, переведите его в «Вручную». Вернуть в очередь можно в любой момент." />
    <div className="panel spaced"><div className="toolbar"><Select value={status} style={{ width: 250 }} onChange={value => { setStatus(value); setPage(1); }} options={[
      { value: 'errored', label: 'Завершились ошибкой' }, { value: 'manual', label: 'Ручная обработка' },
    ]} /></div><Table<Entity> rowKey="id" dataSource={query.data} loading={query.isPending} pagination={false} scroll={{ x: 800 }} columns={[
      { title: 'Исполнитель', dataIndex: 'name', width: 200 },
      { title: 'Статус', dataIndex: 'status', width: 130, render: value => <Status value={value} /> },
      { title: 'Последняя ошибка', dataIndex: 'error', render: (value: string) => value ? <Typography.Text copyable>{value}</Typography.Text> : <span className="muted">Нет сохранённой ошибки</span> },
      { title: 'Обновлено', dataIndex: 'updated_at', width: 170, render: date },
      { title: 'Действия', width: 180, render: (_, row) => <Button loading={action.isPending} onClick={() => action.mutate({ path: `/artists/${row.id}`, method: 'PATCH', body: { status: status === 'manual' ? 'created' : 'manual' } })}>{status === 'manual' ? 'Вернуть в очередь' : 'Вручную'}</Button> },
    ]} /><div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div></div></>;
}

export function Downloads() {
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [editing, setEditing] = useState<Entity | null>(null);
  const [form] = Form.useForm();
  const action = useAction();
  const query = useQuery({ queryKey: ['downloads', status, page], queryFn: () => request<Entity[]>(`/downloads?limit=20&offset=${(page - 1) * 20}&status=${status}`), refetchInterval: 3000 });
  return <><PageTitle title="Загрузки и медиатека" subtitle="Очередь, ошибки и сохранённые файлы · обновление каждые 3 секунды"><Refresh onClick={() => void query.refetch()} /></PageTitle>
    <Failure error={query.error} /><div className="panel"><div className="toolbar"><Select value={status} style={{ width: 240 }} onChange={value => { setStatus(value); setPage(1); }} options={[
      ['', 'Все состояния'], ['pending', 'В очереди'], ['processing', 'В обработке'], ['finished', 'Завершено'], ['errored', 'Ошибка'], ['manual', 'Нужен источник'],
    ].map(([value, label]) => ({ value, label }))} /><Tag color="green">Автообновление</Tag></div>
      <Table<Entity> rowKey="id" loading={query.isPending} dataSource={query.data} pagination={false} scroll={{ x: 1000 }} columns={[
        { title: 'Запись / источник', width: 240, render: (_, row) => { const meta = row.meta as Record<string, unknown> | undefined; return <><strong>{String(meta?.title || 'Изображение')}</strong><div className="muted">{String(meta?.artist || row.id)}</div><Tag>{row.source_type}</Tag></>; } },
        { title: 'Состояние', dataIndex: 'status', width: 150, render: value => <Status value={value} /> },
        { title: 'Медиа', width: 330, render: (_, row) => row.status === 'finished' ? row.file_type === 'mp3' ? <audio controls preload="none" src={fileURL(row.id)} /> : <a href={fileURL(row.id)} target="_blank" rel="noreferrer"><img className="thumbnail" src={fileURL(row.id)} alt="Открыть изображение" /></a> : <span className="muted">Файл пока не готов</span> },
        { title: 'Действия', render: (_, row) => <Space direction="vertical">
          {row.status === 'errored' && <Button loading={action.isPending} onClick={() => action.mutate({ path: `/downloads/${row.id}/retry` })}>Повторить</Button>}
          {['manual', 'errored'].includes(row.status || '') && <Button onClick={() => { form.resetFields(); form.setFieldsValue({ source_type: row.file_type === 'mp3' ? 'mp3' : 'image', source_uri: row.source_type === 'unknown' ? '' : row.source_uri }); setEditing(row); }}>Указать источник</Button>}
          {row.status === 'finished' && <a href={fileURL(row.id)} target="_blank" rel="noreferrer">Открыть файл</a>}
        </Space> },
      ]} expandable={{ expandedRowRender: row => <pre>{pretty(row)}</pre> }} />
      <div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div>
    </div>
    <Modal title="Источник файла" open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}>
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
  const [form] = Form.useForm();
  return <><PageTitle title="Настройки" subtitle="Параметры парсинга, загрузок и последовательность раундов"><Refresh onClick={() => void query.refetch()} /></PageTitle>
    <Failure error={query.error} /><Card title="Конфигурация сервиса">
      <Alert type="info" showIcon title="Настройки хранятся в PostgreSQL" description="k_parse × Points определяет число треков для импорта. Секрет Genius задаётся в backend/.env. Изменённые параметры применятся к следующим операциям." />
      {query.data && <Form key={query.dataUpdatedAt} form={form} layout="vertical" initialValues={{ json: pretty(query.data) }} onFinish={values => action.mutate({ path: '/settings', method: 'PATCH', body: JSON.parse(values.json) })}>
        <Form.Item className="spaced" name="json" label="JSON настроек" rules={[{ validator: (_, value) => validateJSON(value) }]}><Input.TextArea autoSize={{ minRows: 18, maxRows: 32 }} className="code-input" /></Form.Item>
        <Button htmlType="submit" type="primary" loading={action.isPending}>Сохранить настройки</Button>
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
