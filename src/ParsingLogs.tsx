import { Alert, Button, Card, Select, Space, Table, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, request } from './api';
import { Failure, PageTitle, Refresh, Status, statusLabel } from './shared';
import { providerName } from './Operations';

interface ParseEvent {
  id: number;
  artist: string;
  stage: string;
  message: string;
  created_at: string;
}

export function ParsingLogs({ search }: { search?: string }) {
  const runID = new URLSearchParams(search).get('run');
  const runs = useQuery({
    queryKey: ['parsing-runs', 'logs'],
    queryFn: ({ signal }) => request<Entity[]>('/parsing-runs?limit=100', { signal }),
    refetchInterval: 3000,
  });
  const selected = runID || runs.data?.[0]?.id;
  const run = runs.data?.find(item => item.id === selected);
  const events = useQuery({
    queryKey: ['parse-events', selected],
    queryFn: ({ signal }) => request<ParseEvent[]>(`/parsing-runs/${encodeURIComponent(selected!)}/events?limit=200`, { signal }),
    enabled: !!selected,
    refetchInterval: 3000,
  });
  const latest = events.data?.[0];
  const lastEventAge = latest ? Math.max(0, Math.floor((events.dataUpdatedAt - Date.parse(latest.created_at)) / 1000)) : 0;

  return <>
    <PageTitle title="Журнал парсинга" subtitle="Исполнители, этапы источников, время и ошибки">
      <Button href="#parsing">К запускам</Button>
      <Refresh onClick={() => { void runs.refetch(); if (selected) void events.refetch(); }} />
    </PageTitle>
    <Failure error={runs.error || events.error} />
    <Space wrap className="toolbar">
      <Select aria-label="Запуск парсинга" placeholder="Выберите запуск" value={selected}
        loading={runs.isPending} style={{ width: 'min(300px, 100%)' }}
        options={runs.data?.map(row => ({ value: row.id, label: `${date(row.created_at)} · ${statusLabel(row.status || '')}` }))}
        onChange={value => { location.hash = `parsing-logs?run=${encodeURIComponent(value)}`; }} />
      <Status value={run?.status} />
      {run && <Typography.Text>{providerName(run.provider)} · Полей {String(run.fields ?? 0)} ·
        Альбомов {String(run.albums ?? 0)} · Треков {String(run.tracks ?? 0)} · Сбоев {String(run.errors ?? 0)}</Typography.Text>}
    </Space>
    {latest && <Alert showIcon type="info" title={latest.artist ? `${latest.artist} · ${latest.stage}` : latest.stage}
      description={`${latest.message} · ${lastEventAge} сек. назад`} />}
    {!!run?.error && <Alert showIcon type="error" title={run.error} />}
    <Card className="spaced" size="small">
      <div className="table-total table-total-inset">Всего показано событий: {events.data?.length.toLocaleString('ru-RU') ?? '—'}</div>
      <Table<ParseEvent> rowKey="id" loading={!!selected && events.isPending} dataSource={events.data}
        pagination={{ pageSize: 30, showSizeChanger: false }} size="small" scroll={{ x: 660 }}
        locale={{ emptyText: 'События появятся после начала обработки. Для старых запусков журнал может быть пуст.' }}
        columns={[
          { title: 'Время', dataIndex: 'created_at', render: date, width: 160 },
          { title: 'Исполнитель', dataIndex: 'artist', width: 150 },
          { title: 'Этап', dataIndex: 'stage', width: 140 },
          { title: 'Сообщение', dataIndex: 'message', render: value => <Typography.Text style={{ overflowWrap: 'anywhere' }}>{value}</Typography.Text> },
        ]} />
    </Card>
  </>;
}
