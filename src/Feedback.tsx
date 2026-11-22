import { useState } from 'react';
import { Alert, Button, Card, Drawer, Select, Space, Table, Tag, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { date, fileURL, request, save } from './api';
import { questionAudioURL, questionCoverURL, ruleFor } from './quiz';
import { Failure, PageTitle, Refresh } from './shared';

type Question = { id: string; pack_id: string; pack_name: string; number: number; round_type: string; deleted: boolean; primary_text: string; answer: string; has_audio: boolean; image_download_id: string | null; reports: number; unread: number; likes: number };
type Report = { id: string; question_id: string; user_id: string; user_name: string; type: string; comment: string; viewed: boolean; created_at: string; updated_at: string };
const labels: Record<string, string> = { question_error: 'Ошибка в вопросе', bad_audio: 'Звук плохого качества', bug: 'Баг' };

export function Feedback() {
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Question | null>(null);
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['question-feedback', filter, page], queryFn: ({ signal }) =>
    request<{ items: Question[]; total: number }>(`/question-feedback?filter=${filter}&limit=20&offset=${(page - 1) * 20}`, { signal }) });
  const reports = useQuery({ queryKey: ['question-reports', selected?.id], enabled: !!selected,
    queryFn: ({ signal }) => request<Report[]>(`/question-feedback/${selected!.id}`, { signal }) });
  const viewed = useMutation({ mutationFn: ({ id, value }: { id: string; value: boolean }) => save<void>(`/question-feedback/${id}`, 'PATCH', { viewed: value }),
    onSuccess: () => { void client.invalidateQueries({ queryKey: ['question-feedback'] }); void client.invalidateQueries({ queryKey: ['question-reports'] }); } });
  return <>
    <PageTitle title="Обратная связь" subtitle="Жалобы и понравившиеся игрокам вопросы"><Refresh onClick={() => void query.refetch()} /></PageTitle>
    <Failure error={query.error} />
    <div className="panel">
      <div className="toolbar"><Select aria-label="Фильтр обратной связи" value={filter} style={{ width: 250, maxWidth: '100%' }} onChange={value => { setFilter(value); setPage(1); }} options={[
        { value: '', label: 'Все вопросы' }, { value: 'reports', label: 'С жалобами' },
        { value: 'unread', label: 'С непросмотренными жалобами' }, { value: 'likes', label: 'С лайками' },
      ]} /></div>
      <div className="table-total">Всего: {query.data?.total.toLocaleString('ru-RU') ?? '—'}</div>
      <Table<Question> rowKey="id" dataSource={query.data?.items} loading={query.isPending} scroll={{ x: 850 }}
        pagination={{ current: page, pageSize: 20, total: query.data?.total, showSizeChanger: false, onChange: setPage }} columns={[
          { title: 'Вопрос', render: (_, row) => <Button type="link" className="catalog-name" onClick={() => setSelected(row)}>{row.primary_text}</Button> },
          { title: 'Пакет', dataIndex: 'pack_name' },
          { title: 'Раунд', dataIndex: 'round_type', render: value => ruleFor(value).name },
          { title: 'Жалобы', render: (_, row) => <>{row.reports}{row.unread > 0 && <Tag color="warning" style={{ marginLeft: 8 }}>Новых: {row.unread}</Tag>}</> },
          { title: 'Лайки', dataIndex: 'likes' },
          { title: 'Действия', render: (_, row) => <Button onClick={() => setSelected(row)}>Открыть</Button> },
        ]} />
    </div>
    <Drawer title="Вопрос и обратная связь" open={!!selected} onClose={() => setSelected(null)} size="large">
      {selected && <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Title level={4}>{selected.primary_text}</Typography.Title>
        <Typography.Text>Пакет: {selected.pack_name} · {ruleFor(selected.round_type).name} · вопрос {selected.number}</Typography.Text>
        {!selected.deleted && <>
          <Typography.Text>Ответ: {selected.answer}</Typography.Text>
          {selected.round_type === 'artist_by_cover' ? <img className="cover" src={questionCoverURL(selected.pack_id, selected.number)} alt="Обложка вопроса" />
            : selected.image_download_id && <img className="cover" src={fileURL(selected.image_download_id)} alt="Изображение вопроса" />}
          {selected.has_audio && <audio controls preload="none" src={questionAudioURL(selected.pack_id, selected.number)} />}
        </>}
        <Typography.Title level={5}>Жалобы</Typography.Title>
        <Failure error={reports.error || viewed.error} />
        {reports.isPending && <Typography.Text>Загружаем жалобы…</Typography.Text>}
        {reports.data?.length === 0 && <Alert type="info" showIcon title="Жалоб пока нет" />}
        {reports.data?.map(item => <Card key={item.id} size="small" title={labels[item.type] || item.type}
          extra={<Button loading={viewed.isPending} onClick={() => viewed.mutate({ id: item.id, value: !item.viewed })}>{item.viewed ? 'Отметить непросмотренной' : 'Отметить просмотренной'}</Button>}>
          <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{item.comment}</Typography.Paragraph>
          <Typography.Text type="secondary">{item.user_name} · {date(item.created_at)} · {item.viewed ? 'Просмотрена' : 'Не просмотрена'}</Typography.Text>
        </Card>)}
      </Space>}
    </Drawer>
  </>;
}
