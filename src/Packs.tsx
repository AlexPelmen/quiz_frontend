import { useState } from 'react';
import { Button, Card, Collapse, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, fileURL, request } from './api';
import { questionAudioURL, QuizPack } from './quiz';
import { Failure, PageTitle, Refresh, useAction } from './shared';

export function Packs() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [form] = Form.useForm();
  const action = useAction();
  const query = useQuery({ queryKey: ['quiz-packs', page], queryFn: () => request<Entity[]>(`/quiz-packs?limit=20&offset=${(page - 1) * 20}`) });
  const detail = useQuery({ queryKey: ['quiz-pack', selected], queryFn: () => request<QuizPack>(`/quiz-packs/${selected}`), enabled: !!selected });
  const edit = (pack: Entity | 'new') => { form.resetFields(); form.setFieldsValue(pack === 'new' ? { tags: [] } : pack); setEditing(pack); };
  return <><PageTitle title="Квиз-пакеты" subtitle="До 10 раундов по 10 вопросов · без повторов исполнителей"><Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => edit('new')}>Создать пакет</Button></PageTitle>
    <Failure error={query.error} /><div className="panel"><Table<Entity> rowKey="id" loading={query.isFetching} dataSource={query.data} pagination={false} columns={[
      { title: 'Пакет', dataIndex: 'name', render: (name, row) => <Button type="link" onClick={() => setSelected(row.id)}>{name}</Button> },
      { title: 'Описание', dataIndex: 'description' }, { title: 'Создан', dataIndex: 'created_at', render: date },
      { title: 'Действия', render: (_, row) => <Space><Button onClick={() => edit(row)}>Изменить</Button><Popconfirm title="Удалить пакет?" onConfirm={() => action.mutateAsync({ path: `/quiz-packs/${row.id}`, method: 'DELETE' })}><Button danger>Удалить</Button></Popconfirm></Space> },
    ]} /><div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div></div>
    <Modal open={!!editing} title={editing === 'new' ? 'Составить квиз-пакет' : 'Описание пакета'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}>
      <Form form={form} layout="vertical" onFinish={values => {
        const { name, description, tags, artist_tag } = values;
        const body = { name, description, tags, ...(editing === 'new' && artist_tag ? { artist_tag } : {}) };
        action.mutate({ path: `/quiz-packs${editing && editing !== 'new' ? `/${editing.id}` : ''}`, method: editing === 'new' ? 'POST' : 'PATCH', body }, { onSuccess: () => setEditing(null) });
      }}>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Описание"><Input.TextArea /></Form.Item><Form.Item name="tags" label="Теги пакета"><Select mode="tags" /></Form.Item>
        {editing === 'new' && <Form.Item name="artist_tag" label="Тег исполнителей (необязательно)"><Input placeholder="Например, rock" /></Form.Item>}
        <Typography.Text type="secondary">Если данных недостаточно, пакет будет короче. Для первого раунда нужны минимум 10 разных исполнителей с готовым аудио.</Typography.Text>
      </Form>
    </Modal>
    <Drawer open={!!selected} title={detail.data?.name || 'Пакет'} onClose={() => setSelected(null)} size="large" loading={detail.isPending}>
      <Failure error={detail.error} /><p>{String(detail.data?.description || '')}</p>
      <Collapse items={detail.data?.rounds?.map(round => ({ key: round.id, label: `Раунд ${round.number} · ${round.type}`, children: round.questions.map(q => <Card key={q.id} size="small" className="question" title={`${q.number}. ${q.primary_text}`}>
        {!!q.secondary_text && <p>{q.secondary_text}</p>}
        {q.image_download_id && <img className="cover" src={fileURL(q.image_download_id)} alt="Изображение вопроса" />}
        {selected && q.sound_download_id && <><audio controls preload="none" src={questionAudioURL(selected, q.number)} /><div className="muted">Фрагмент: {q.trackStartSec?.toFixed(1)}–{q.trackFinishSec?.toFixed(1)} сек.</div></>}
        <details><summary>Показать ответ</summary><p>{q.answer}</p>{!!q.answer_info?.artist && q.answer_info.artist !== q.answer && <p>Исполнитель: {String(q.answer_info.artist)}</p>}{!!q.answer_info?.track && q.answer_info.track !== q.answer && <p>Трек: {String(q.answer_info.track)}</p>}{!!q.answer_info?.album && <p>Альбом: {String(q.answer_info.album)}</p>}</details>
      </Card>) }))} />
    </Drawer>
  </>;
}

