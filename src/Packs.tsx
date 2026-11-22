import { useState } from 'react';
import { Button, Card, Checkbox, Collapse, Drawer, Form, Input, InputNumber, Modal, Popconfirm, Select, Space, Table, Tag, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, fileURL, request } from './api';
import { difficultyLabels, questionAudioURL, questionCoverURL, questionHint, roundOptions, ruleFor } from './quiz';
import type { QuizPack, QuizPackSummary, QuizStatus } from './quiz';
import { Failure, PageTitle, Refresh, useAction } from './shared';
import { useTags } from './Tags';

const statusLabels = { new: 'В очереди', pending: 'Подготовка', ready: 'Готово' };
const statusColors = { new: 'default', pending: 'processing', ready: 'success' };
const isPreparing = (pack: QuizPackSummary) => pack.status !== 'ready' && !pack.clip_error;

function PreparationStatus({ status }: { status: QuizStatus }) {
  return <Tag color={statusColors[status]}>{statusLabels[status]}</Tag>;
}

export function Packs() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<QuizPackSummary | 'new' | null>(null);
  const [coverFiles, setCoverFiles] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();
  const action = useAction();
  const retry = useAction();
  const tags = useTags();
  const tagOptions = tags.data?.map(tag => ({ value: tag.name, label: tag.name }));
  const query = useQuery({
    queryKey: ['quiz-packs', page],
    queryFn: ({ signal }) => request<QuizPackSummary[]>(`/quiz-packs?limit=20&offset=${(page - 1) * 20}`, { signal }),
    refetchInterval: ({ state }) => state.data?.some(isPreparing) ? 2000 : false,
  });
  const count = useQuery({ queryKey: ['quiz-packs', 'count'], queryFn: ({ signal }) => request<{ count: number }>('/quiz-packs/count', { signal }) });
  const detail = useQuery({
    queryKey: ['quiz-pack', selected], queryFn: ({ signal }) => request<QuizPack>(`/quiz-packs/${selected}`, { signal }),
    enabled: !!selected, refetchInterval: ({ state }) => state.data && isPreparing(state.data) ? 2000 : false,
  });
  const edit = (pack: QuizPackSummary | 'new') => {
    action.reset();
    setCoverFiles([]);
    form.resetFields();
    form.setFieldsValue(pack === 'new' ? { tags: [], difficulty: 'medium', question_count: 100, round_types: ['artist_by_track'] } : pack);
    setEditing(pack);
  };
  const preparation = (pack: QuizPackSummary) => <Space orientation="vertical" size={4}>
    {pack.clip_error ? <Typography.Text type="danger">{pack.clip_error}</Typography.Text> : <PreparationStatus status={pack.status} />}
    {pack.clips_total > 0 && <Typography.Text type="secondary">Клипы загружены · {pack.clips_ready} из {pack.clips_total}</Typography.Text>}
    {pack.clip_error && <Button size="small" loading={retry.isPending && retry.variables.path === `/quiz-packs/${pack.id}/retry-clips`}
      onClick={() => retry.mutate({ path: `/quiz-packs/${pack.id}/retry-clips` })}>Повторить подготовку</Button>}
  </Space>;
  return <><PageTitle title="Квиз-пакеты" subtitle="От 10 до 100 вопросов · без повторов исполнителей"><Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => edit('new')}>Создать пакет</Button></PageTitle>
    <Failure error={query.error || count.error || tags.error} /><div className="panel"><div className="table-total">Всего: {count.data?.count?.toLocaleString('ru-RU') ?? '—'}</div><Table<QuizPackSummary> rowKey="id" loading={query.isPending} dataSource={query.data} scroll={{ x: 740 }} pagination={{ current: page, pageSize: 20, total: count.data?.count, showSizeChanger: false, onChange: setPage }} columns={[
      { title: 'Пакет', dataIndex: 'name', render: (name, row) => <Button type="link" onClick={() => setSelected(row.id)}>{name}</Button> },
      { title: 'Описание', dataIndex: 'description' }, { title: 'Создан', dataIndex: 'created_at', render: date },
      { title: 'Подготовка', render: (_, row) => preparation(row) },
      { title: 'Действия', render: (_, row) => <Space><Button onClick={() => edit(row)}>Изменить</Button><Popconfirm title="Удалить пакет?" onConfirm={() => action.mutateAsync({ path: `/quiz-packs/${row.id}`, method: 'DELETE' })}><Button danger>Удалить</Button></Popconfirm></Space> },
    ]} /></div>
    <Modal open={!!editing} title={editing === 'new' ? 'Составить квиз-пакет' : 'Описание пакета'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}>
      <Failure error={action.error} />
      <Form form={form} layout="vertical" onFinish={values => {
        const { name, description, tags, artist_tag, difficulty, round_types, question_count } = values;
        let body: unknown = { name, description, tags };
        if (editing === 'new') {
          const pack = { name, description, tags, artist_tag, difficulty, round_types, question_count };
          const cover = coverFiles[0]?.originFileObj;
          if (cover) {
            const data = new FormData();
            data.append('pack', JSON.stringify(pack));
            data.append('cover', cover);
            body = data;
          } else {
            body = pack;
          }
        }
        action.mutate({ path: `/quiz-packs${editing && editing !== 'new' ? `/${editing.id}` : ''}`, method: editing === 'new' ? 'POST' : 'PATCH', body }, { onSuccess: () => setEditing(null) });
      }}>
        <Form.Item name="name" label="Название" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
        <Form.Item name="description" label="Описание"><Input.TextArea /></Form.Item><Form.Item name="tags" label="Теги пакета" extra="Управление списком — в разделе «Теги»"><Select mode="multiple" showSearch={{ optionFilterProp: 'label' }} options={tagOptions} loading={tags.isPending} disabled={tags.isError} /></Form.Item>
        {editing === 'new' && <Form.Item name="artist_tag" label="Тег исполнителей (необязательно)"><Select allowClear showSearch={{ optionFilterProp: 'label' }} options={tagOptions} loading={tags.isPending} disabled={tags.isError} /></Form.Item>}
        {editing === 'new' && <>
          <Form.Item label="Обложка пакета">
            <Upload accept="image/*" maxCount={1} fileList={coverFiles} beforeUpload={() => false}
              onChange={({ fileList }) => setCoverFiles(fileList)}>
              <Button>Выбрать изображение</Button>
            </Upload>
          </Form.Item>
          <Form.Item name="difficulty" label="Сложность" rules={[{ required: true }]}>
            <Select options={Object.entries(difficultyLabels).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="question_count" label="Количество вопросов" extra="Каждый раунд содержит 10 вопросов."
            rules={[{ required: true, type: 'integer', min: 10, max: 100 }, { validator: (_, value: number) => value % 10 === 0 ? Promise.resolve() : Promise.reject(new Error('Укажите число, кратное 10')) }]}>
            <InputNumber min={10} max={100} step={10} precision={0} />
          </Form.Item>
          <Form.Item name="round_types" label="Типы раундов" rules={[{ type: 'array', required: true, min: 1, message: 'Выберите хотя бы один раунд' }]}>
            <Checkbox.Group>
              <Space orientation="vertical">
                {roundOptions.map(option => <Checkbox key={option.value} value={option.value}>{option.label}</Checkbox>)}
              </Space>
            </Checkbox.Group>
          </Form.Item>
          <Typography.Text type="secondary">Типы раундов выбираются случайно и при необходимости повторяются. Для каждого вопроса нужен свой подходящий исполнитель.</Typography.Text>
        </>}
      </Form>
    </Modal>
    <Drawer open={!!selected} title={detail.data?.name || 'Пакет'} onClose={() => setSelected(null)} size="large" loading={detail.isPending}>
      <Failure error={detail.error} /><p>{String(detail.data?.description || '')}</p>
      {detail.data && <div>{preparation(detail.data)}</div>}
      <Collapse items={detail.data?.rounds?.map(round => ({ key: round.id, label: `Раунд ${round.number} · ${ruleFor(round.type).name}`, children: round.questions.map(q => {
        if (q.deleted) return <Card key={q.id} size="small" className="question" title={`${q.number}. ${q.primary_text}`} />;
        const hint = questionHint(q.secondary_text, round.type);
        return <Card key={q.id} size="small" className="question" title={`${q.number}. ${q.primary_text}`} extra={<PreparationStatus status={q.status} />}>
          {hint && <p style={{ whiteSpace: 'pre-line' }}>{hint}</p>}
          {round.type === 'artist_by_cover' && selected
            ? <img className="cover" src={questionCoverURL(selected, q.number)} alt="Обложка с масками" />
            : q.image_download_id && <img className="cover" src={fileURL(q.image_download_id)} alt="Изображение вопроса" />}
          {selected && q.sound_download_id && q.status === 'ready' && <><audio controls preload="none" src={questionAudioURL(selected, q.number)} /><div className="muted">Фрагмент: {q.trackStartSec?.toFixed(1)}–{q.trackFinishSec?.toFixed(1)} сек.</div></>}
          <details><summary>Показать ответ</summary><p>{q.answer}</p>{!!q.answer_info?.artist && q.answer_info.artist !== q.answer && <p>Исполнитель: {String(q.answer_info.artist)}</p>}{!!q.answer_info?.track && q.answer_info.track !== q.answer && <p>Трек: {String(q.answer_info.track)}</p>}{!!q.answer_info?.album && <p>Альбом: {String(q.answer_info.album)}</p>}</details>
        </Card>;
      }) }))} />
    </Drawer>
  </>;
}

