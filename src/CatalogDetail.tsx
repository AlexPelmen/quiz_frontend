import { Alert, Button, Descriptions, Drawer, Space, Spin, Table, Tag, Typography } from 'antd';
import type { DescriptionsProps } from 'antd';
import { EditOutlined, RightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import Papa from 'papaparse';
import { date, Entity, fileURL, request } from './api';
import { Failure, Status } from './shared';

export type CatalogResource = 'artists' | 'albums' | 'tracks';

export function CatalogDetail({ resource, id, onClose, onEdit }: {
  resource: CatalogResource;
  id: string;
  onClose: () => void;
  onEdit: (row: Entity) => void;
}) {
  const detail = useEntity(resource, id);
  const row = detail.data;

  return <Drawer title={row?.name || 'Карточка каталога'} open onClose={onClose} size="large"
    extra={row && <Button icon={<EditOutlined />} onClick={() => onEdit(row)}>Изменить</Button>}>
    <Failure error={detail.error} />
    {detail.isPending && <Spin />}
    {row && <CatalogRecord resource={resource} row={row} />}
  </Drawer>;
}

function useEntity(resource: CatalogResource, id?: string) {
  return useQuery({
    queryKey: [resource, id],
    queryFn: ({ signal }) => request<Entity>(`/${resource}/${id}`, { signal }),
    enabled: !!id,
    refetchInterval: query => resource === 'tracks' && query.state.data?.status !== 'finished' ? 5000 : false,
  });
}

function CatalogRecord({ resource, row }: { resource: CatalogResource; row: Entity }) {
  const artist = useEntity('artists', typeof row.artist_id === 'string' ? row.artist_id : undefined);
  const album = useEntity('albums', typeof row.album_id === 'string' ? row.album_id : undefined);
  const imageID = resource === 'artists' ? row.logo_download_id : row.cover_download_id;
  const fields: NonNullable<DescriptionsProps['items']> = [
    { key: 'points', label: resource === 'albums' ? 'Узнаваемость обложки' : 'Известность', children: `${row.points} / 100` },
    { key: 'guess_num', label: 'Показов в завершённых раундах', children: String(row.guess_num ?? '—') },
    { key: 'tags', label: 'Теги', children: row.tags?.length ? row.tags.map(tag => <Tag key={tag}>{tag}</Tag>) : '—' },
  ];
  if (row.status) fields.push({
    key: 'status', label: resource === 'tracks' ? 'Статус аудио' : 'Статус', children: <Status value={row.status} />,
  });
  if (resource === 'artists') {
    fields.push(
      { key: 'full_name', label: 'Полное название', children: String(row.full_name || '—') },
      { key: 'country', label: 'Страна', children: String(row.country || '—') },
      { key: 'artists', label: 'Участники группы', children: Array.isArray(row.artists) && row.artists.length ? row.artists.join(', ') : '—' },
    );
  } else {
    fields.push({ key: 'artist', label: 'Исполнитель', children: artist.data?.name || (artist.isFetching ? 'Загрузка…' : '—') });
    if (resource === 'albums') fields.push({ key: 'release_date', label: 'Дата выхода', children: String(row.release_date || '—') });
    else fields.push({ key: 'album', label: 'Альбом', children: album.data?.name || (album.isFetching ? 'Загрузка…' : '—') });
  }
  fields.push(
    { key: 'created_at', label: 'Добавлен', children: date(row.created_at) },
    { key: 'updated_at', label: 'Обновлён', children: date(row.updated_at) },
  );

  return <div className="catalog-detail">
    {row.error && <Alert type="error" showIcon title={row.error} />}
    <Failure error={artist.error || album.error} />
    {resource !== 'tracks' && <CatalogImage id={typeof imageID === 'string' ? imageID : undefined} />}
    <Descriptions bordered size="small" column={1} items={fields} />
    {resource === 'artists' && <RelatedCatalog resource="albums" filter="artist_id" id={row.id} />}
    {resource === 'artists' && <RelatedCatalog resource="tracks" filter="artist_id" id={row.id} />}
    {resource === 'albums' && <RelatedCatalog resource="tracks" filter="album_id" id={row.id} />}
    {resource === 'albums' && <AlbumTrackList value={row.track_list} complete={row.track_list_complete} />}
    {resource === 'tracks' && <TrackAudio trackID={row.id} />}
    <details>
      <summary>Идентификаторы</summary>
      <Descriptions size="small" column={1} items={[
        { key: 'id', label: 'ID', children: <Typography.Text copyable>{row.id}</Typography.Text> },
        ...(row.genius_id ? [{ key: 'genius_id', label: 'Genius', children: String(row.genius_id) }] : []),
        ...(row.musicbrainz_id ? [{ key: 'musicbrainz_id', label: 'MusicBrainz', children: String(row.musicbrainz_id) }] : []),
      ]} />
    </details>
  </div>;
}

function CatalogImage({ id }: { id?: string }) {
  const query = useQuery({
    queryKey: ['download', id],
    queryFn: ({ signal }) => request<Entity>(`/downloads/${id}`, { signal }),
    enabled: !!id,
    refetchInterval: query => ['created', 'pending', 'processing'].includes(query.state.data?.status || '') ? 5000 : false,
  });
  if (!id) return <Typography.Text type="secondary">Изображение пока не загружено.</Typography.Text>;
  if (query.error) return <Failure error={query.error} />;
  if (!query.data) return <Spin />;
  if (query.data.status === 'finished') return <img className="cover" src={fileURL(id)} alt="Изображение из каталога" />;
  return <Space wrap>Изображение <Status value={query.data.status} />{query.data.error}</Space>;
}

function RelatedCatalog({ resource, filter, id }: { resource: 'albums' | 'tracks'; filter: 'artist_id' | 'album_id'; id: string }) {
  const params = new URLSearchParams({ [filter]: id });
  const path = `/${resource}?${params}&limit=6`;
  const query = useQuery({
    queryKey: ['catalog-related', path],
    queryFn: ({ signal }) => request<Entity[]>(path, { signal }),
  });
  const isAlbums = resource === 'albums';
  return <section>
    <Typography.Title level={4}>{isAlbums ? 'Альбомы исполнителя' : filter === 'artist_id' ? 'Треки исполнителя' : 'Треки альбома'}</Typography.Title>
    <Failure error={query.error} />
    {query.isPending && <Spin />}
    {query.data?.length === 0 && <Typography.Text type="secondary">
      {isAlbums ? 'Альбомы пока не добавлены' : 'Треки пока не добавлены'}
    </Typography.Text>}
    {!!query.data?.length && <ul className="catalog-related">
      {query.data.slice(0, 5).map(item => <li key={item.id}>
        <Space wrap>{item.name}{item.status && <Status value={item.status} />}</Space>
      </li>)}
    </ul>}
    {query.data && query.data.length > 5 && <Typography.Text type="secondary">Показаны первые 5 записей.</Typography.Text>}
    <Button className="catalog-related-link" href={`#${resource}?${params}`} icon={<RightOutlined />}>
      {isAlbums ? 'Открыть список альбомов' : 'Открыть список треков'}
    </Button>
  </section>;
}

function AlbumTrackList({ value, complete }: { value: unknown; complete: unknown }) {
  if (typeof value !== 'string' || !value.trim()) return <section>
    <Typography.Title level={4}>Треклист из источника</Typography.Title>
    <Typography.Text type="secondary">Треклист пока не загружен.</Typography.Text>
  </section>;

  const parsed = Papa.parse<string[]>(value, { skipEmptyLines: true });
  const [header, ...records] = parsed.data;
  const valid = parsed.errors.length === 0 && header?.length === 2
    && header[0].replace(/^\uFEFF/, '') === 'position' && header[1] === 'title'
    && records.every(record => record.length === 2);

  return <section>
    <Typography.Title level={4}>Треклист из источника</Typography.Title>
    <Typography.Paragraph type="secondary">
      {complete ? 'Полный список из источника.' : 'Список из источника может быть неполным.'}
    </Typography.Paragraph>
    {valid ? <Table
      size="small"
      pagination={false}
      rowKey="key"
      dataSource={records.map(([position, title], key) => ({ key, position, title }))}
      columns={[
        { title: '№', dataIndex: 'position', width: 70 },
        { title: 'Название', dataIndex: 'title' },
      ]}
      locale={{ emptyText: 'Треклист пуст' }}
    /> : <>
      <Alert type="warning" showIcon title="Не удалось прочитать треклист CSV" />
      <details><summary>Исходные данные</summary><pre>{value}</pre></details>
    </>}
  </section>;
}

function TrackAudio({ trackID }: { trackID: string }) {
  const query = useQuery({
    queryKey: ['track-audio', trackID],
    queryFn: ({ signal }) => request<Entity[]>(`/downloads?track_id=${trackID}&limit=200`, { signal }),
    refetchInterval: 5000,
  });
  return <section>
    <Typography.Title level={4}>Аудиозаписи</Typography.Title>
    <Failure error={query.error} />
    {query.isPending && <Spin />}
    {query.data?.length === 0 && <Typography.Text type="secondary">Записей пока нет.</Typography.Text>}
    {query.data?.map((row, index) => <div className="audio-row" key={row.id}>
      <Space wrap>
        <Status value={row.status} />
        <Tag>{row.source_type === 'upload' ? 'Загружено вручную' : row.source_type}</Tag>
        {index === 0 && row.source_type === 'upload' && <Tag color="purple">Основная запись</Tag>}
      </Space>
      {row.status === 'finished' && row.file_type === 'mp3' && <audio controls preload="none" src={fileURL(row.id)} />}
      {row.error && <p className="error-text">{row.error}</p>}
    </div>)}
  </section>;
}
