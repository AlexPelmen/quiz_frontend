import { useState } from 'react';
import { Alert, Select, Table, Tag, Typography } from 'antd';
import { useQuery } from '@tanstack/react-query';
import { date, pretty, request } from './api';
import { Failure, PageTitle, Refresh } from './shared';

type LogEntry = { time?: string; level?: string; msg?: string; error?: unknown; [key: string]: unknown };

export function SystemLogs() {
  const [level, setLevel] = useState('');
  const query = useQuery({ queryKey: ['system-logs'], queryFn: ({ signal }) => request<{ entries: LogEntry[] }>('/system-logs?limit=1000', { signal }), refetchInterval: 5000 });
  const entries = query.data?.entries.map((entry, index) => ({ ...entry, key: `${entry.time || ''}-${index}` })).filter(entry => !level || entry.level === level);
  return <>
    <PageTitle title="Логи сервера" subtitle="Последние записи backend · обновление каждые 5 секунд"><Refresh onClick={() => void query.refetch()} /></PageTitle>
    <Failure error={query.error} />
    <Alert showIcon type="info" title="Показаны последние 1000 записей с момента запуска сервера" description="После перезапуска список начинается заново. Полный журнал доступен в выводе сервера." />
    <div className="panel spaced">
      <div className="toolbar"><Select aria-label="Уровень записи" value={level} style={{ width: 200 }} onChange={setLevel} options={[
        { value: '', label: 'Все уровни' }, { value: 'INFO', label: 'Информация' },
        { value: 'WARN', label: 'Предупреждения' }, { value: 'ERROR', label: 'Ошибки' },
      ]} /></div>
      <div className="table-total">Показано: {entries?.length.toLocaleString('ru-RU') ?? '—'}</div>
      <Table rowKey="key" dataSource={entries} loading={query.isPending} size="small" scroll={{ x: 700 }} pagination={{ pageSize: 25, showSizeChanger: false }}
        locale={{ emptyText: 'Записей пока нет' }} columns={[
          { title: 'Время', dataIndex: 'time', width: 190, render: date },
          { title: 'Уровень', dataIndex: 'level', width: 150, render: (value: string) => <Tag color={value === 'ERROR' ? 'error' : value === 'WARN' ? 'warning' : 'default'}>{value || '—'}</Tag> },
          { title: 'Сообщение', dataIndex: 'msg', render: (value: string, row) => <><Typography.Text>{value || '—'}</Typography.Text>{row.error != null && <div className="error-text">{String(row.error)}</div>}</> },
        ]} expandable={{ expandedRowRender: row => { return <pre>{pretty(Object.fromEntries(Object.entries(row).filter(([key]) => key !== 'key')))}</pre>; } }} />
    </div>
  </>;
}
