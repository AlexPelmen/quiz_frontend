import { useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Space, Table } from 'antd';
import { DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { request } from './api';
import { Failure, PageTitle, Refresh, useAction } from './shared';

export interface TagOption { id: string; name: string }

export function useTags() {
  return useQuery({ queryKey: ['tags'], queryFn: ({ signal }) => request<TagOption[]>('/tags', { signal }) });
}

export function Tags() {
  const query = useTags();
  const action = useAction();
  const [editing, setEditing] = useState<TagOption | 'new' | null>(null);
  const [form] = Form.useForm<{ name: string }>();
  function edit(tag: TagOption | 'new') {
    action.reset();
    form.setFieldsValue({ name: tag === 'new' ? '' : tag.name });
    setEditing(tag);
  }
  return <>
    <PageTitle title="Теги" subtitle="Общий список тегов для каталога и квиз-пакетов">
      <Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => edit('new')}>Добавить тег</Button>
    </PageTitle>
    <Failure error={query.error} /><Failure error={action.error} />
    <div className="panel"><div className="table-total">Всего: {query.data?.length.toLocaleString('ru-RU') ?? '—'}</div><Table<TagOption> rowKey="id" loading={query.isPending} dataSource={query.data} columns={[
      { title: 'Название', dataIndex: 'name' },
      { title: 'Действия', width: 130, render: (_, tag) => <Space>
        <Button aria-label="Изменить тег" icon={<EditOutlined />} onClick={() => edit(tag)} />
        <Popconfirm title="Удалить тег?" description="Используемый тег удалить нельзя." onConfirm={() => action.mutateAsync({ path: `/tags/${tag.id}`, method: 'DELETE' })}>
          <Button danger aria-label="Удалить тег" icon={<DeleteOutlined />} />
        </Popconfirm>
      </Space> },
    ]} /></div>
    <Modal open={!!editing} title={editing === 'new' ? 'Новый тег' : 'Изменить тег'} onCancel={() => setEditing(null)}
      onOk={() => form.submit()} confirmLoading={action.isPending}>
      <Failure error={action.error} />
      <Form form={form} layout="vertical" onFinish={({ name }) => action.mutate({ path: editing === 'new' ? '/tags' : `/tags/${editing?.id}`,
        method: editing === 'new' ? 'POST' : 'PATCH', body: { name } }, { onSuccess: () => setEditing(null) })}>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true, message: 'Введите название' }]}>
          <Input maxLength={100} />
        </Form.Item>
      </Form>
    </Modal>
  </>;
}
