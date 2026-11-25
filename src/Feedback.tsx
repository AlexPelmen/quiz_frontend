import { useState } from 'react';
import { Button, Space, Table, Tabs, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { date, request } from './api';
import { FeedbackReportDrawer, reportLabels, type FeedbackReport } from './FeedbackReport';
import { ruleFor } from './quiz';
import { Failure, PageTitle, Refresh } from './shared';

type Like = {
  id: string;
  likes: number;
  question: FeedbackReport['question'];
};

type Result<T> = { items: T[]; total: number };
const pageSize = 20;

function QuestionSummary({ question: q }: Pick<FeedbackReport, 'question'>) {
  const title = [q.artist_name, q.track_name || q.album_name].filter(Boolean).join(' · ');
  return <Space orientation="vertical" size={4} style={{ overflowWrap: 'anywhere' }}>
    <Typography.Text>{title || q.primary_text}</Typography.Text>
    <Typography.Text type="secondary">{q.pack_name} · {ruleFor(q.round_type).name} · № {q.number}</Typography.Text>
  </Space>;
}

export function Feedback() {
  const [tab, setTab] = useState('reports');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const paginationParams = `limit=${pageSize}&offset=${(page - 1) * pageSize}`;
  const reports = useQuery({
    queryKey: ['question-feedback', 'reports', page], enabled: tab === 'reports',
    queryFn: ({ signal }) => request<Result<FeedbackReport>>(`/question-feedback?${paginationParams}`, { signal }),
  });
  const likes = useQuery({
    queryKey: ['question-feedback', 'likes', page], enabled: tab === 'likes',
    queryFn: ({ signal }) => request<Result<Like>>(`/question-feedback/likes?${paginationParams}`, { signal }),
  });
  const current = tab === 'reports' ? reports : likes;
  const pagination = { current: page, pageSize, total: current.data?.total, showSizeChanger: false, onChange: setPage };

  return <>
    <PageTitle title="Обратная связь" subtitle="Отзывы игроков о вопросах">
      <Refresh onClick={() => void current.refetch()} />
    </PageTitle>
    <Failure error={current.error} />
    <div className="panel">
      <Tabs activeKey={tab} tabBarStyle={{ margin: 0, paddingInline: 16 }}
        onChange={key => { setTab(key); setPage(1); }}
        destroyOnHidden items={[
          { key: 'reports', label: 'Жалобы', children:
            <Table<FeedbackReport> rowKey="id" size="middle" tableLayout="fixed"
              dataSource={reports.data?.items} loading={reports.isPending} pagination={pagination}
              locale={{ emptyText: 'Жалоб нет' }} columns={[
                { title: 'Жалоба', render: (_, row) => <Space orientation="vertical" size={4} style={{ minWidth: 0 }}>
                  <Button type="link" className="catalog-name" style={{ padding: 0, height: 'auto' }}
                    onClick={() => setSelected(row.id)}>{reportLabels[row.type] ?? row.type}</Button>
                  <Typography.Paragraph ellipsis={{ rows: 2 }} style={{ margin: 0, overflowWrap: 'anywhere' }}>
                    {row.comment}
                  </Typography.Paragraph>
                  <Typography.Text type="secondary" style={{ overflowWrap: 'anywhere' }}>
                    {row.user_name} · {date(row.created_at)}
                  </Typography.Text>
                </Space> },
                { title: 'Вопрос', responsive: ['sm'], render: (_, row) => <QuestionSummary question={row.question} /> },
              ]} /> },
          { key: 'likes', label: 'Лайки', children:
            <Table<Like> rowKey="id" size="middle"
              dataSource={likes.data?.items} loading={likes.isPending} pagination={pagination}
              locale={{ emptyText: 'Лайков нет' }} columns={[
                { title: 'Вопрос', render: (_, row) => <QuestionSummary question={row.question} /> },
                { title: 'Лайки', dataIndex: 'likes', align: 'right', width: 90 },
              ]} /> },
        ]} />
    </div>
    <FeedbackReportDrawer id={selected} onClose={() => setSelected(null)} onResolved={() => {
      if (page > 1 && reports.data?.items.length === 1) setPage(page - 1);
      setSelected(null);
    }} />
  </>;
}
