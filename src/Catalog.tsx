import { useState } from 'react';
import { Button, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, PlayCircleOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, fileURL, pretty, request } from './api';
import { Failure, PageTitle, Refresh, Status, useAction } from './shared';

export function Catalog({ resource }: { resource: 'artists' | 'albums' | 'tracks' }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('');
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [detail, setDetail] = useState<Entity | null>(null);
  const [form] = Form.useForm();
  const action = useAction();
  const query = useQuery({ queryKey: [resource, page, filter], queryFn: () => request<Entity[]>(`/${resource}?limit=20&offset=${(page - 1) * 20}${filter ? `&${resource === 'artists' ? 'tag' : 'artist_id'}=${encodeURIComponent(filter)}` : ''}`) });
  const artists = useQuery({ queryKey: ['artist-options'], queryFn: () => options('artists'), enabled: resource !== 'artists' });
  const albums = useQuery({ queryKey: ['album-options'], queryFn: () => options('albums'), enabled: resource === 'tracks' && editing === 'new' });
  const names = { artists: 'Исполнители', albums: 'Альбомы', tracks: 'Треки' };
  const startEdit = (row: Entity | 'new') => {
    form.resetFields();
    form.setFieldsValue(row === 'new' ? { points: 100, tags: [] } : row);
    setEditing(row);
  };
  const submit = async () => {
    const values = form.getFieldsValue();
    const allowed = resource === 'artists' ? ['name', 'points', 'tags', 'country', 'full_name', 'artists']
      : resource === 'albums' ? ['name', 'points', 'release_date', ...(editing === 'new' ? ['artist_id'] : [])]
        : ['name', 'points', ...(editing === 'new' ? ['artist_id', 'album_id'] : [])];
    const body = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
      allowed.includes(key) && value !== undefined && (editing === 'new' || !editing || JSON.stringify(value) !== JSON.stringify(editing[key]))));
    action.mutate({ path: `/${resource}${editing !== 'new' && editing ? `/${editing.id}` : ''}`, method: editing === 'new' ? 'POST' : 'PATCH', body }, { onSuccess: () => setEditing(null) });
  };
  return <>
    <PageTitle title={names[resource]} subtitle="Ваш музыкальный каталог. Оценки влияют на выбор вопросов.">
      <Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => startEdit('new')}>Добавить</Button>
    </PageTitle>
    <Failure error={query.error} />
    <div className="panel"><div className="toolbar">
      {resource === 'artists' ? <Input.Search placeholder="Фильтр по тегу" allowClear onSearch={value => { setFilter(value); setPage(1); }} style={{ width: 280 }} />
        : <Select placeholder="Все исполнители" showSearch optionFilterProp="label" allowClear style={{ width: 300 }} options={artists.data} onChange={value => { setFilter(value || ''); setPage(1); }} />}
      <Typography.Text type="secondary">Points: 0 — исключить, 100 — максимальный интерес</Typography.Text>
    </div>
    <Table<Entity> rowKey="id" loading={query.isFetching} dataSource={query.data} scroll={{ x: 760 }} pagination={false} columns={[
      { title: 'Название', dataIndex: 'name', render: (name: string, row) => <Button type="link" onClick={() => setDetail(row)}>{name}</Button> },
      { title: 'Интерес', dataIndex: 'points', width: 100, render: value => <Tag color={value === 0 ? 'default' : 'purple'}>{value} / 100</Tag> },
      ...(resource === 'artists' ? [{ title: 'Статус', dataIndex: 'status', render: (value: string) => <Status value={value} /> }, { title: 'Теги', dataIndex: 'tags', render: (tags: string[]) => tags?.map(tag => <Tag key={tag}>{tag}</Tag>) }] : []),
      { title: 'Добавлен', dataIndex: 'created_at', render: date },
      { title: 'Действия', width: 200, render: (_, row) => <Space>
        <Button aria-label="Изменить" icon={<EditOutlined />} onClick={() => startEdit(row)} />
        {resource === 'artists' && ['parsed', 'errored'].includes(row.status || '') && <Button onClick={() => action.mutate({ path: `/artists/${row.id}/retry` })}>Повторить</Button>}
        {resource === 'artists' && row.status !== 'processing' && <Button onClick={() => action.mutate({ path: `/artists/${row.id}`, method: 'PATCH', body: { status: row.status === 'manual' ? 'created' : 'manual' } })}>{row.status === 'manual' ? 'В очередь' : 'Вручную'}</Button>}
        <Popconfirm title="Удалить запись?" description="Связанные данные могут быть удалены. Вопросы существующих пакетов защищены." onConfirm={() => action.mutateAsync({ path: `/${resource}/${row.id}`, method: 'DELETE' })}>
          <Button danger aria-label="Удалить" icon={<DeleteOutlined />} />
        </Popconfirm></Space> },
    ]} />
    <div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button><span>Страница {page}</span><Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div></div>
    <Modal title={editing === 'new' ? 'Новая запись' : 'Редактирование'} open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending} forceRender>
      <Form form={form} layout="vertical" onFinish={() => void submit()}>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true, message: 'Введите название' }]}><Input maxLength={1000} /></Form.Item>
        <Form.Item name="points" label="Интерес (Points)" rules={[{ required: true }]}><InputNumber min={0} max={100} precision={0} style={{ width: '100%' }} /></Form.Item>
        {resource === 'artists' ? <>
          <Form.Item name="tags" label="Теги"><Select mode="tags" tokenSeparators={[',']} /></Form.Item>
          <Form.Item name="full_name" label="Полное название"><Input /></Form.Item>
          <Form.Item name="country" label="Страна"><Input /></Form.Item>
          <Form.Item name="artists" label="Участники группы"><Select mode="tags" tokenSeparators={[',']} /></Form.Item>
        </> : <>
          {editing === 'new' && <Form.Item name="artist_id" label="Исполнитель" rules={[{ required: true }]}><Select showSearch optionFilterProp="label" options={artists.data} /></Form.Item>}
          {resource === 'albums' ? <Form.Item name="release_date" label="Дата выхода"><Input placeholder="Например, 2001" /></Form.Item>
            : editing === 'new' && <Form.Item name="album_id" label="Альбом (необязательно)"><Select showSearch optionFilterProp="label" allowClear options={albums.data} /></Form.Item>}
        </>}
      </Form>
    </Modal>
    <Drawer title={detail?.name || 'Запись'} open={!!detail} onClose={() => setDetail(null)} size="large">
      {detail && <><Typography.Paragraph copyable>{detail.id}</Typography.Paragraph>
        {resource === 'tracks' && <TrackAudio trackID={detail.id} />}
        {resource === 'albums' && !!detail.cover_download_id && <img className="cover" src={fileURL(String(detail.cover_download_id))} alt="Обложка" />}
        {resource === 'artists' && !!detail.logo_download_id && <img className="cover" src={fileURL(String(detail.logo_download_id))} alt="Исполнитель" />}
        <pre>{pretty(detail)}</pre></>}
    </Drawer>
  </>;
}

async function options(resource: string): Promise<{ value: string; label: string }[]> {
  const result: { value: string; label: string }[] = [];
  for (let offset = 0; ; offset += 200) {
    const rows = await request<Entity[]>(`/${resource}?limit=200&offset=${offset}`);
    result.push(...rows.map(row => ({ value: row.id, label: row.name || row.id })));
    if (rows.length < 200) return result;
  }
}

function TrackAudio({ trackID }: { trackID: string }) {
  const query = useQuery({ queryKey: ['track-audio', trackID], queryFn: () => request<Entity[]>(`/downloads?track_id=${trackID}&limit=200`), refetchInterval: 5000 });
  return <><Failure error={query.error} />{query.data?.length === 0 && <p>Источников записи пока нет.</p>}
    {query.data?.map(row => <div className="audio-row" key={row.id}><Space><PlayCircleOutlined /><Status value={row.status} /><Tag>{row.source_type}</Tag></Space>
      {row.status === 'finished' && row.file_type === 'mp3' && <audio controls preload="none" src={fileURL(row.id)} />}
      {!!row.error && <p className="error-text">{row.error}</p>}</div>)}</>;
}
