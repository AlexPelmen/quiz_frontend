import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { Alert, Button, Modal, Select, Space, Spin, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { request } from './api';
import { Failure, PageTitle, Refresh, useAction } from './shared';
import './album-guessing.css';

const scale = 10000;
const maxMasks = 32;
const pageSize = 20;
const labels = { pending: 'Не проверена', approved: 'Разрешена', rejected: 'Запрещена' };
type Status = keyof typeof labels;
type Point = { x: number; y: number };
type Rectangle = { x1: number; y1: number; x2: number; y2: number };
type Cover = {
  album_id: string;
  album_name: string;
  artist_name: string;
  cover_download_id: string;
  status: Status;
  rectangles: Rectangle[];
};

export function AlbumGuessing() {
  const [status, setStatus] = useState<Status | ''>('pending');
  const [page, setPage] = useState(0);
  const [shuffle, setShuffle] = useState<number | null>(null);
  const [editing, setEditing] = useState<Cover | null>(null);
  const params = new URLSearchParams({ status, limit: String(pageSize + 1), offset: String(page * pageSize) });
  if (shuffle !== null) params.set('shuffle', String(shuffle));
  const query = useQuery({
    queryKey: ['album-guessing', status, page, shuffle],
    queryFn: ({ signal }) => request<Cover[]>(`/album-guessing?${params}`, { signal }),
  });

  function reshuffle() {
    setShuffle(Math.floor(Math.random() * 2 ** 32));
    setPage(0);
  }

  return <>
    <PageTitle title="Модерация обложек" subtitle="Разрешите обложку для раунда и закройте подсказки на ней">
      <Refresh onClick={() => void query.refetch()} />
    </PageTitle>
    <Failure error={query.error} />
    <div className="panel">
      <div className="toolbar">
        <Select aria-label="Статус модерации" value={status} onChange={value => { setStatus(value); setPage(0); }}
          options={[{ value: '', label: 'Все обложки' }, ...Object.entries(labels).map(([value, label]) => ({ value, label }))]} />
        <Space wrap>
          <Select aria-label="Порядок обложек" value={shuffle === null ? 'alphabetical' : 'random'}
            onChange={value => {
              if (value === 'random') reshuffle();
              else { setShuffle(null); setPage(0); }
            }}
            options={[{ value: 'alphabetical', label: 'По исполнителю' }, { value: 'random', label: 'Случайный порядок' }]} />
          {shuffle !== null && <Button onClick={reshuffle}>Перемешать снова</Button>}
        </Space>
      </div>
      <Table<Cover> rowKey="album_id" loading={query.isPending} dataSource={query.data?.slice(0, pageSize)}
        pagination={false} scroll={{ x: 520 }} locale={{ emptyText: 'Нет обложек с этим статусом' }} columns={[
          { title: 'Альбом', dataIndex: 'album_name' },
          { title: 'Исполнитель', dataIndex: 'artist_name' },
          { title: 'Решение', render: (_, row) => <Tag color={row.status === 'approved' ? 'success' : undefined}>{labels[row.status]}</Tag> },
          { title: 'Действия', render: (_, row) => <Button onClick={() => setEditing(row)}>Проверить</Button> },
        ]} />
      <div className="pager">
        <Button disabled={page === 0} onClick={() => setPage(page - 1)}>Назад</Button>
        <Typography.Text>Страница {page + 1}</Typography.Text>
        <Button disabled={(query.data?.length ?? 0) <= pageSize} onClick={() => setPage(page + 1)}>Далее</Button>
      </div>
    </div>
    {editing && <CoverEditor cover={editing} close={() => setEditing(null)} />}
  </>;
}

function rectangle(a: Point, b: Point): Rectangle {
  return { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) };
}

function position(event: PointerEvent<SVGSVGElement>): Point {
  const bounds = event.currentTarget.getBoundingClientRect();
  const unit = (value: number) => Math.round(Math.max(0, Math.min(1, value)) * scale);
  return { x: unit((event.clientX - bounds.left) / bounds.width), y: unit((event.clientY - bounds.top) / bounds.height) };
}

function CoverEditor({ cover, close }: { cover: Cover; close: () => void }) {
  const [approved, setApproved] = useState(cover.status === 'approved');
  const [masks, setMasks] = useState(cover.rectangles);
  const [draft, setDraft] = useState<Rectangle | null>(null);
  const [preview, setPreview] = useState<'loading' | 'ready' | 'error'>('loading');
  const drag = useRef<{ pointerId: number; start: Point } | null>(null);
  const action = useAction();
  const albumPath = `/albums/${encodeURIComponent(cover.album_id)}`;
  const previewURL = `/api/v1${albumPath}/guessing-preview?cover_id=${encodeURIComponent(cover.cover_download_id)}`;

  function start(event: PointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || drag.current || masks.length >= maxMasks || action.isPending) return;
    event.preventDefault();
    const start = position(event);
    drag.current = { pointerId: event.pointerId, start };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraft(rectangle(start, start));
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    if (drag.current?.pointerId === event.pointerId) setDraft(rectangle(drag.current.start, position(event)));
  }

  function finish(event: PointerEvent<SVGSVGElement>, cancel = false) {
    if (drag.current?.pointerId !== event.pointerId) return;
    const result = rectangle(drag.current.start, position(event));
    drag.current = null;
    setDraft(null);
    if (!cancel && result.x2 > result.x1 && result.y2 > result.y1) {
      setMasks(items => [...items, result]);
      setApproved(true);
    }
  }

  return <Modal open title={`${cover.artist_name} — ${cover.album_name}`} onCancel={close}
    okText="Сохранить решение" confirmLoading={action.isPending} okButtonProps={{ disabled: !!draft || (approved && preview !== 'ready') }}
    onOk={() => action.mutate({ path: `${albumPath}/guessing`, method: 'PUT',
      body: { cover_download_id: cover.cover_download_id, approved, rectangles: masks } }, { onSuccess: close })}>
    <Failure error={action.error} />
    <Space orientation="vertical" size="middle">
      <Select aria-label="Использование обложки в раунде" value={approved ? 'approved' : 'rejected'}
        onChange={value => setApproved(value === 'approved')} options={[
          { value: 'approved', label: 'Разрешить в раунде' }, { value: 'rejected', label: 'Запретить в раунде' },
        ]} />
      <Typography.Text>Закройте надпись прямоугольником — обложка будет разрешена при сохранении. Если подсказок нет, её можно разрешить без масок.</Typography.Text>
      {preview === 'loading' && <Spin aria-label="Загрузка обложки" />}
      {preview === 'error' && <Alert type="warning" showIcon title="Обложка недоступна для просмотра"
        description="Закройте редактор и обновите очередь. Для неподдерживаемой обложки загрузите PNG или JPEG." />}
      <div className="guessing-editor" hidden={preview !== 'ready'}>
        <img src={previewURL} alt="Обложка альбома для разметки" draggable={false}
          onLoad={() => setPreview('ready')} onError={() => setPreview('error')} />
        {preview === 'ready' && <svg viewBox={`0 0 ${scale} ${scale}`} preserveAspectRatio="none" aria-hidden="true"
          onPointerDown={start} onPointerMove={move} onPointerUp={event => finish(event)}
          onPointerCancel={event => finish(event, true)}>
          {masks.map((mask, i) => <Mask key={i} mask={mask} />)}
          {draft && <Mask mask={draft} />}
        </svg>}
      </div>
      <Space wrap>
        <Typography.Text>Масок: {masks.length} / {maxMasks}</Typography.Text>
        <Button disabled={!masks.length || !!draft || action.isPending} onClick={() => setMasks(items => items.slice(0, -1))}>Убрать последнюю</Button>
        <Button disabled={!masks.length || !!draft || action.isPending} onClick={() => setMasks([])}>Очистить</Button>
      </Space>
    </Space>
  </Modal>;
}

function Mask({ mask }: { mask: Rectangle }) {
  return <rect x={mask.x1} y={mask.y1} width={mask.x2 - mask.x1} height={mask.y2 - mask.y1} fill="black" />;
}
