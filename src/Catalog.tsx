import { useState } from 'react';
import { Button, Checkbox, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import type { TableColumnsType, TableProps, UploadFile } from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, UploadOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, request, guessRate, formatCount } from './api';
import { CatalogDetail, missingFieldLabels, type CatalogResource } from './CatalogDetail';
import { Failure, PageTitle, Refresh, Status, statusLabel, useAction } from './shared';
import { useTags } from './Tags';
import { AddArtistList } from './AddArtistList';

const pageSize = 20;
const names = { artists: 'Исполнители', albums: 'Альбомы', tracks: 'Треки' };
const trackStatuses = ['finished', 'processing', 'pending', 'created', 'errored', 'manual', 'missing'];
const media = {
  artists: { endpoint: 'image', label: 'Изображение исполнителя', accept: '.png,.jpg,.jpeg,.gif,.webp,.bmp,.ico' },
  albums: { endpoint: 'cover', label: 'Обложка альбома', accept: '.png,.jpg,.jpeg,.gif,.webp,.bmp,.ico' },
  tracks: { endpoint: 'audio', label: 'Основная запись MP3', accept: '.mp3' },
};

export function Catalog({ resource, search }: { resource: CatalogResource; search?: string }) {
  const params = new URLSearchParams(search);
  const page = Math.max(1, Number.parseInt(params.get('page') || '', 10) || 1);
  const artistID = params.get('artist_id') || undefined;
  const albumID = params.get('album_id') || undefined;
  const trackStatus = params.get('audio_status') || undefined;
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [detailID, setDetailID] = useState<string>();
  const [form] = Form.useForm();
  const formArtistID = Form.useWatch<string>('artist_id', form);
  const action = useAction();
  const tags = useTags();
  const tagOptions = tags.data?.map(tag => ({ value: tag.name, label: tag.name }));

  const updateRoute = (values: Record<string, string | undefined>) => {
    for (const [key, value] of Object.entries({ page: undefined, ...values })) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const next = params.toString();
    location.assign(next ? `#${resource}?${next}` : `#${resource}`);
  };
  const listParams = new URLSearchParams(params);
  listParams.delete('page');
  listParams.set('limit', String(pageSize + 1));
  listParams.set('offset', String((page - 1) * pageSize));
  const query = useQuery({
    queryKey: [resource, listParams.toString()],
    queryFn: ({ signal }) => request<Entity[]>(`/${resource}?${listParams}`, { signal }),
    refetchInterval: resource === 'tracks' ? 5000 : false,
  });
  const count = useQuery({
    queryKey: [resource, 'count', (() => { const p = new URLSearchParams(params); p.delete('page'); p.delete('sort'); p.delete('order'); return p.toString(); })()],
    queryFn: ({ signal }) => request<{ count: number }>(`/${resource}/count?${new URLSearchParams([...params].filter(([key]) => !['page', 'sort', 'order'].includes(key)))}`, { signal }),
    refetchInterval: 5000,
  });
  const artists = useQuery({
    queryKey: ['artist-options'],
    queryFn: ({ signal }) => options('artists', signal),
    enabled: resource !== 'artists',
  });
  const albums = useQuery({
    queryKey: ['album-options'],
    queryFn: ({ signal }) => options('albums', signal),
    enabled: resource === 'tracks',
  });
  const artistNames = new Map(artists.data?.map(row => [row.id, row.name]));
  const albumNames = new Map(albums.data?.map(row => [row.id, row.name]));
  const artistOptions = artists.data?.map(row => ({ value: row.id, label: row.name }));
  const albumOptions = albums.data?.map(row => ({
    value: row.id,
    label: [row.name, artistNames.get(String(row.artist_id))].filter(Boolean).join(' · '),
  }));
  const formAlbumOptions = albums.data?.filter(row => row.artist_id === formArtistID)
    .map(row => ({ value: row.id, label: row.name }));

  const startEdit = (row: Entity | 'new') => {
    action.reset();
    form.resetFields();
    form.setFieldsValue(row === 'new' ? { excluded_from_quiz: false, tags: [] } : row);
    setEditing(row);
  };
  const submit = (values: Record<string, unknown>) => {
    if (!editing) return;
    const common = ['name', 'yt_plays', 'excluded_from_quiz', 'tags'];
    const allowed = [...common, ...(resource === 'artists' ? ['country', 'full_name', 'artists', 'yt_subs', 'yt_music_url']
      : resource === 'albums' ? ['release_date', 'track_list'] : ['album_id', 'duration_seconds']),
      ...(resource !== 'artists' && editing === 'new' ? ['artist_id'] : [])];
    const body = Object.fromEntries(Object.entries(values).filter(([key, value]) =>
      allowed.includes(key) && value !== undefined && value !== null
      && (editing === 'new' || JSON.stringify(value) !== JSON.stringify(editing[key]))));
    if (resource === 'artists' && values.members_known && (editing === 'new' || !editing.members_known)) {
      body.artists = values.artists || [];
    }
    if (resource === 'tracks' && editing !== 'new' && editing.album_id && !values.album_id) {
      body.album_id = '00000000-0000-0000-0000-000000000000';
    }
    if (editing !== 'new' && Object.keys(body).length === 0) {
      setEditing(null);
      return;
    }
    action.mutate({
      path: editing === 'new' ? `/${resource}` : `/${resource}/${editing.id}`,
      method: editing === 'new' ? 'POST' : 'PATCH', body,
    }, { onSuccess: () => setEditing(null) });
  };

  const sortColumn = (key: string) => ({
    key,
    sorter: true,
    sortOrder: params.get('sort') === key ? (params.get('order') === 'desc' ? 'descend' as const : 'ascend' as const) : null,
  });
  const changeSort: TableProps<Entity>['onChange'] = (_pagination, _filters, result, extra) => {
    if (extra.action !== 'sort') return;
    const sorter = Array.isArray(result) ? result[0] : result;
    updateRoute({
      sort: sorter?.order ? String(sorter.columnKey) : undefined,
      order: sorter?.order === 'descend' ? 'desc' : sorter?.order ? 'asc' : undefined,
    });
  };
  const columns: TableColumnsType<Entity> = [
    { title: 'Название', dataIndex: 'name', ...sortColumn('name'), render: (name, row) =>
      <Button className="catalog-name" type="link" onClick={() => setDetailID(row.id)}>{name}</Button> },
    { title: 'Прослушивания', dataIndex: 'yt_plays', ...sortColumn('yt_plays'), width: 155, render: formatCount },
    { title: 'Угадали / загадали', width: 150, render: (_, row) => guessRate(row) },
    { title: 'Статус', dataIndex: 'status', ...sortColumn('status'), width: 160, render: (value, row) =>
      <Space wrap><Status value={value} />{row.excluded_from_quiz && <Tag>Исключено</Tag>}
        {!!row.missing_fields?.length && <Typography.Text type="secondary" title={row.missing_fields.map(field => missingFieldLabels[field] || field).join(', ')}>Пропусков {row.missing_fields.length}</Typography.Text>}
      </Space> },
  ];
  if (resource === 'artists') {
    columns.push({ title: 'Подписчики', dataIndex: 'yt_subs', render: formatCount });
  } else {
    columns.push({ title: 'Исполнитель', dataIndex: 'artist_id', render: value => artistNames.get(value) || '—' });
  }
  if (resource === 'albums') {
    columns.push({ title: 'Дата выхода', dataIndex: 'release_date', ...sortColumn('release_date'), render: value => value || '—' });
  }
  if (resource === 'tracks') {
    columns.push({ title: 'Альбом', dataIndex: 'album_id', render: value => albumNames.get(value) || '—' },
      { title: 'Статус аудио', dataIndex: 'audio_status', ...sortColumn('audio_status'), render: value => <Status value={value} /> });
  }
  columns.push({ title: 'Теги', dataIndex: 'tags', render: (tags: string[]) => tags?.map(tag => <Tag key={tag}>{tag}</Tag>) });
  columns.push(
    { title: 'Добавлен', dataIndex: 'created_at', ...sortColumn('created_at'), render: date },
    { title: 'Действия', width: resource === 'artists' ? 240 : 125, render: (_, row) => <Space wrap>
      <Button aria-label="Изменить" icon={<EditOutlined />} onClick={() => startEdit(row)} />
      {resource === 'artists' && ['parsed', 'error', 'errored', 'partial'].includes(row.status || '') && <Button onClick={() => action.mutate({ path: `/artists/${row.id}/retry` })}>Повторить</Button>}
      <Popconfirm title="Удалить запись?" description="Связанные данные могут быть удалены. Вопросы существующих пакетов защищены." onConfirm={() => action.mutateAsync({ path: `/${resource}/${row.id}`, method: 'DELETE' })}>
        <Button danger aria-label="Удалить" icon={<DeleteOutlined />} />
      </Popconfirm>
    </Space> },
  );

  return <>
    <PageTitle title={names[resource]} subtitle="Музыкальный каталог и данные для подбора вопросов.">
      <Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => startEdit('new')}>Добавить</Button>
    </PageTitle>
    <Failure error={query.error || count.error || artists.error || albums.error || tags.error} />
    <div className="panel">
      <div className="toolbar catalog-filters">
        {resource === 'artists' ? <>
          <Input.Search key={`name:${params.get('name')}`} defaultValue={params.get('name') || ''} aria-label="Поиск исполнителя по названию" placeholder="Поиск по названию" allowClear onSearch={value => updateRoute({ name: value.trim() })} />
          <Select aria-label="Фильтр по тегу" placeholder="Фильтр по тегу" value={params.get('tag') || undefined} allowClear showSearch={{ optionFilterProp: 'label' }} options={tagOptions} onChange={value => updateRoute({ tag: value })} />
        </> : <Select aria-label="Поиск по исполнителю" placeholder="Поиск по исполнителю" value={artistID} loading={artists.isPending} showSearch={{ optionFilterProp: 'label' }} allowClear options={artistOptions} onChange={value => updateRoute({ artist_id: value })} />}
        <Select aria-label="Статус каталога" placeholder="Все статусы каталога" value={params.get('status') || undefined}
          allowClear options={(resource === 'artists' ? ['created', 'processing', 'parsed', 'partial', 'error', 'errored', 'manual'] : ['parsed', 'partial', 'error', 'manual'])
            .map(value => ({ value, label: statusLabel(value) }))}
          onChange={value => updateRoute({ status: value })} />
        {resource === 'tracks' && <>
          <Select aria-label="Поиск по альбому" placeholder="Поиск по альбому" value={albumID} loading={albums.isPending} showSearch={{ optionFilterProp: 'label' }} allowClear options={albumOptions} onChange={value => updateRoute({ album_id: value })} />
          <Select aria-label="Статус аудио" placeholder="Все статусы аудио" value={trackStatus} allowClear options={trackStatuses.map(value => ({
            value, label: value === 'finished' ? 'Есть запись' : statusLabel(value),
          }))} onChange={value => updateRoute({ audio_status: value })} />
        </>}
        {resource === 'artists' && <AddArtistList />}
      </div>
      <div className="table-total">Всего: {count.data ? formatCount(count.data.count) : '—'}</div>
      <Table<Entity> rowKey="id" loading={query.isPending} dataSource={query.data?.slice(0, pageSize)} columns={columns}
        onChange={changeSort} scroll={{ x: resource === 'tracks' ? 1170 : 1010 }} pagination={{ current: page, pageSize, total: count.data?.count, showSizeChanger: false, onChange: next => updateRoute({ page: next === 1 ? undefined : String(next) }) }}
        locale={{ emptyText: 'Записи не найдены' }} />

    </div>
    {detailID && <CatalogDetail resource={resource} id={detailID} onClose={() => setDetailID(undefined)} onEdit={startEdit} />}
    <Modal title={editing === 'new' ? 'Новая запись' : `Редактирование · ${editing?.name || ''}`}
      open={!!editing} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}
      okText={editing === 'new' ? 'Создать' : 'Сохранить поля'} forceRender zIndex={1100}>
      <Failure error={action.error} />
      <Form form={form} layout="vertical" onFinish={submit}>
        <Form.Item name="name" label="Название" dependencies={['yt_music_url']} rules={[({ getFieldValue }) => ({
          validator: (_, value: string | undefined) => value?.trim() || (resource === 'artists' && editing === 'new' && getFieldValue('yt_music_url')?.trim())
            ? Promise.resolve() : Promise.reject(new Error('Введите название или ссылку на исполнителя')),
        })]}><Input maxLength={1000} /></Form.Item>
        <Form.Item name="yt_plays" label="Прослушивания YouTube Music"><InputNumber min={0} max={Number.MAX_SAFE_INTEGER} precision={0} /></Form.Item>
        <Form.Item name="excluded_from_quiz" valuePropName="checked"><Checkbox>Исключить из квиза</Checkbox></Form.Item>
        <Form.Item name="tags" label="Теги" extra="Управление списком — в разделе «Теги»"><Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} options={tagOptions} loading={tags.isPending} disabled={tags.isError} /></Form.Item>
        {resource === 'artists' ? <>
          <Form.Item name="full_name" label="Полное название"><Input /></Form.Item>
          <Form.Item name="yt_music_url" label="Ссылка на YT Music" extra={editing !== 'new' && editing?.yt_music_id ? 'ID исполнителя уже сохранён.' : 'Ссылка на страницу исполнителя; ID определится при парсинге.'}>
            <Input placeholder="https://music.youtube.com/@artist" disabled={editing !== 'new' && !!editing?.yt_music_id} />
          </Form.Item>
          <Form.Item name="country" label="Страна"><Input /></Form.Item>
          <Form.Item name="yt_subs" label="Подписчики YouTube Music"><InputNumber min={0} max={Number.MAX_SAFE_INTEGER} precision={0} /></Form.Item>
          <Form.Item name="artists" label="Участники группы"><Select mode="tags" tokenSeparators={[',']} /></Form.Item>
          <Form.Item name="members_known" valuePropName="checked"><Checkbox>Состав известен, включая сольного исполнителя</Checkbox></Form.Item>
        </> : <>
          {editing === 'new' && <Form.Item name="artist_id" label="Исполнитель" rules={[{ required: true }]}>
            <Select showSearch={{ optionFilterProp: 'label' }} options={artistOptions} onChange={() => form.setFieldValue('album_id', undefined)} />
          </Form.Item>}
          {resource === 'albums' ? <>
            <Form.Item name="release_date" label="Дата выхода"><Input placeholder="Например, 2001" /></Form.Item>
            <Form.Item name="track_list" label="Треклист CSV" extra="Первая строка — position,title"><Input.TextArea rows={3} /></Form.Item>
          </> : <>
            <Form.Item name="album_id" label="Альбом">
              <Select showSearch={{ optionFilterProp: 'label' }} allowClear options={formAlbumOptions} disabled={!formArtistID} />
            </Form.Item>
            <Form.Item name="duration_seconds" label="Длительность, секунды"><InputNumber min={1} max={2147483647} precision={0} /></Form.Item>
          </>}
        </>}
      </Form>
      {editing && editing !== 'new' && <MediaUpload key={editing.id} resource={resource} id={editing.id} />}
    </Modal>
  </>;
}

async function options(resource: CatalogResource, signal: AbortSignal): Promise<Entity[]> {
  const result: Entity[] = [];
  for (let offset = 0; ; offset += 200) {
    const rows = await request<Entity[]>(`/${resource}?limit=200&offset=${offset}`, { signal });
    result.push(...rows);
    if (rows.length < 200) return result;
  }
}

function MediaUpload({ resource, id }: { resource: CatalogResource; id: string }) {
  const [files, setFiles] = useState<UploadFile[]>([]);
  const action = useAction();
  const { endpoint, label, accept } = media[resource];
  const upload = () => {
    const file = files[0]?.originFileObj;
    if (!file) return;
    action.mutate({ path: `/${resource}/${id}/${endpoint}`, body: file }, { onSuccess: () => setFiles([]) });
  };
  return <section className="catalog-upload">
    <Typography.Title level={5}>{label}</Typography.Title>
    <Typography.Paragraph type="secondary">Загрузка файла применяется сразу. Поля сохраняются отдельно.</Typography.Paragraph>
    <Space wrap align="start">
      <Upload accept={accept} maxCount={1} fileList={files} beforeUpload={() => false}
        onChange={event => setFiles(event.fileList)} disabled={action.isPending}>
        <Button icon={<UploadOutlined />}>Выбрать файл</Button>
      </Upload>
      <Button disabled={!files.length} loading={action.isPending} onClick={upload}>Загрузить файл</Button>
    </Space>
    <Failure error={action.error} />
  </section>;
}
