import { useState } from 'react';
import { Alert, Button, Card, Checkbox, Col, Popconfirm, Row, Space, Statistic, Table, Typography } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import { request, save } from './api';
import { Failure, PageTitle } from './shared';

type Size = { count: number; bytes: number };
type StorageFile = { path: string; size: number; kind: string };
type Report = { total: Size; kinds: Record<string, Size>; orphans: StorageFile[] };
type ActionResult = { path: string; error?: string };

const kinds: Record<string, string> = {
  tracks: 'Треки', clips: 'Отрывки', albums: 'Обложки альбомов', artists: 'Фото исполнителей',
  packs: 'Обложки пакетов', other: 'Другие файлы',
};

function size(bytes: number) {
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  let n = bytes;
  let unit = 0;
  while (n >= 1024 && unit < units.length - 1) { n /= 1024; unit++; }
  return `${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(n)} ${units[unit]}`;
}

export function Storage() {
  const [showOrphans, setShowOrphans] = useState(false);
  const [selected, setSelected] = useState<React.Key[]>([]);
  const report = useQuery({ queryKey: ['storage'], queryFn: ({ signal }) => request<Report>('/storage', { signal }) });
  const action = useMutation({
    mutationFn: async ({ action, paths }: { action: 'attach' | 'delete'; paths: string[] }) => {
      const results: ActionResult[] = [];
      for (let start = 0; start < paths.length; start += 200) {
        results.push(...await save<ActionResult[]>('/storage/actions', 'POST', { action, paths: paths.slice(start, start + 200) }));
      }
      return results;
    },
    onSuccess: result => setSelected(result.filter(item => item.error).map(item => item.path)),
    onSettled: () => void report.refetch(),
  });
  const run = (kind: 'attach' | 'delete', paths: string[]) => action.mutate({ action: kind, paths });
  const failed = action.data?.filter(item => item.error) || [];
  const allPaths = (report.data?.orphans || []).map(item => item.path);
  const selectedPaths = new Set(selected);
  const selectedCount = allPaths.filter(path => selectedPaths.has(path)).length;
  return <>
    <PageTitle title="Файловое хранилище" subtitle="Файлы на диске и их использование каталогом">
      <Button loading={report.isFetching} onClick={() => { setShowOrphans(true); void report.refetch(); }}>Поиск файлов-сирот</Button>
    </PageTitle>
    <Failure error={report.error || action.error} />
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={12} xl={6}><Card loading={report.isPending}><Statistic title="Все файлы" value={report.data?.total.count ?? 0} />
        <Typography.Text type="secondary">{size(report.data?.total.bytes ?? 0)}</Typography.Text></Card></Col>
      {Object.entries(kinds).map(([key, label]) => <Col key={key} xs={24} sm={12} xl={6}>
        <Card loading={report.isPending}><Statistic title={label} value={report.data?.kinds[key]?.count ?? 0} />
          <Typography.Text type="secondary">{size(report.data?.kinds[key]?.bytes ?? 0)}</Typography.Text></Card>
      </Col>)}
    </Row>
    {showOrphans && <div className="panel spaced storage-orphans">
      <div className="storage-orphans-header">
      <Typography.Title level={5}>Файлы без связи с каталогом или квизом</Typography.Title>
      <div className="storage-orphans-actions">
        <Button disabled={!selected.length} loading={action.isPending} onClick={() => run('attach', selected.map(String))}>Привязать выбранные</Button>
        <Popconfirm title="Удалить выбранные файлы и их загрузки?" onConfirm={() => run('delete', selected.map(String))} okText="Удалить" cancelText="Отмена">
          <Button danger disabled={!selected.length} loading={action.isPending}>Удалить выбранные</Button>
        </Popconfirm>
        <Typography.Text type="secondary">Выбрано: {selected.length}</Typography.Text>
      </div>
      </div>
      {!!failed.length && <Alert type="warning" showIcon title="Не удалось обработать некоторые файлы" description={failed.map(item => <div key={item.path}>{item.path}: {item.error}</div>)} />}
      <div className="table-total">Всего: {report.data?.orphans.length.toLocaleString('ru-RU') ?? '—'}</div>
      <Table<StorageFile> rowKey="path" dataSource={report.data?.orphans} loading={report.isFetching || action.isPending} scroll={{ x: 800 }}
        rowSelection={{
          columnTitle: <Checkbox aria-label="Выбрать все найденные файлы" checked={allPaths.length > 0 && selectedCount === allPaths.length}
            indeterminate={selectedCount > 0 && selectedCount < allPaths.length} disabled={!allPaths.length || action.isPending}
            onChange={event => setSelected(event.target.checked ? allPaths : [])} />,
          selectedRowKeys: selected, preserveSelectedRowKeys: true, onChange: setSelected,
        }} columns={[
        { title: 'Файл', dataIndex: 'path', className: 'storage-file-path' },
        { title: 'Тип', dataIndex: 'kind', width: 170, render: (value: string) => kinds[value] || value },
        { title: 'Размер', dataIndex: 'size', width: 120, render: size },
        { title: 'Действия', width: 230, render: (_, row) => <Space wrap>
          <Button onClick={() => run('attach', [row.path])}>Привязать</Button>
          <Popconfirm title="Удалить файл и его загрузку?" onConfirm={() => run('delete', [row.path])} okText="Удалить" cancelText="Отмена"><Button danger>Удалить</Button></Popconfirm>
        </Space> },
      ]} />
    </div>}
  </>;
}
