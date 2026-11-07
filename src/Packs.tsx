import { useState } from 'react';
import { Button, Card, Checkbox, Collapse, Drawer, Form, Input, Modal, Popconfirm, Select, Space, Table, Typography, Upload } from 'antd';
import type { UploadFile } from 'antd';
import { PlusOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { date, Entity, fileURL, request } from './api';
import { difficultyLabels, questionAudioURL, questionCoverURL, questionHint, QuizPack, roundOptions, ruleFor } from './quiz';
import { Failure, PageTitle, Refresh, useAction } from './shared';
import { useTags } from './Tags';

export function Packs() {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState<Entity | 'new' | null>(null);
  const [coverFiles, setCoverFiles] = useState<UploadFile[]>([]);
  const [form] = Form.useForm();
  const action = useAction();
  const tags = useTags();
  const tagOptions = tags.data?.map(tag => ({ value: tag.name, label: tag.name }));
  const query = useQuery({ queryKey: ['quiz-packs', page], queryFn: () => request<Entity[]>(`/quiz-packs?limit=20&offset=${(page - 1) * 20}`) });
  const detail = useQuery({ queryKey: ['quiz-pack', selected], queryFn: () => request<QuizPack>(`/quiz-packs/${selected}`), enabled: !!selected });
  const edit = (pack: Entity | 'new') => {
    action.reset();
    setCoverFiles([]);
    form.resetFields();
    form.setFieldsValue(pack === 'new' ? { tags: [], difficulty: 'medium', round_types: ['artist_by_track'] } : pack);
    setEditing(pack);
  };
  return <><PageTitle title="Квиз-пакеты" subtitle="До 10 раундов по 10 вопросов · без повторов исполнителей"><Refresh onClick={() => void query.refetch()} /><Button type="primary" icon={<PlusOutlined />} onClick={() => edit('new')}>Создать пакет</Button></PageTitle>
    <Failure error={query.error || tags.error} /><div className="panel"><Table<Entity> rowKey="id" loading={query.isFetching} dataSource={query.data} pagination={false} columns={[
      { title: 'Пакет', dataIndex: 'name', render: (name, row) => <Button type="link" onClick={() => setSelected(row.id)}>{name}</Button> },
      { title: 'Описание', dataIndex: 'description' }, { title: 'Создан', dataIndex: 'created_at', render: date },
      { title: 'Действия', render: (_, row) => <Space><Button onClick={() => edit(row)}>Изменить</Button><Popconfirm title="Удалить пакет?" onConfirm={() => action.mutateAsync({ path: `/quiz-packs/${row.id}`, method: 'DELETE' })}><Button danger>Удалить</Button></Popconfirm></Space> },
    ]} /><div className="pager"><Button disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>Страница {page}<Button disabled={(query.data?.length || 0) < 20} onClick={() => setPage(page + 1)}>Далее</Button></div></div>
    <Modal open={!!editing} title={editing === 'new' ? 'Составить квиз-пакет' : 'Описание пакета'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}>
      <Failure error={action.error} />
      <Form form={form} layout="vertical" onFinish={values => {
        const { name, description, tags, artist_tag, difficulty, round_types } = values;
        let body: unknown = { name, description, tags };
        if (editing === 'new') {
          const pack = { name, description, tags, artist_tag, difficulty, round_types };
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
          <Form.Item name="round_types" label="Типы раундов" rules={[{ type: 'array', required: true, min: 1, message: 'Выберите хотя бы один раунд' }]}>
            <Checkbox.Group>
              <Space orientation="vertical">
                {roundOptions.map(option => <Checkbox key={option.value} value={option.value}>{option.label}</Checkbox>)}
              </Space>
            </Checkbox.Group>
          </Form.Item>
          <Typography.Text type="secondary">Для каждого выбранного раунда нужно 10 подходящих исполнителей. Исполнители в пакете не повторяются.</Typography.Text>
        </>}
      </Form>
    </Modal>
    <Drawer open={!!selected} title={detail.data?.name || 'Пакет'} onClose={() => setSelected(null)} size="large" loading={detail.isPending}>
      <Failure error={detail.error} /><p>{String(detail.data?.description || '')}</p>
      <Collapse items={detail.data?.rounds?.map(round => ({ key: round.id, label: `Раунд ${round.number} · ${ruleFor(round.type).name}`, children: round.questions.map(q => {
        const hint = questionHint(q.secondary_text, round.type);
        return <Card key={q.id} size="small" className="question" title={`${q.number}. ${q.primary_text}`}>
          {hint && <p style={{ whiteSpace: 'pre-line' }}>{hint}</p>}
          {round.type === 'artist_by_cover' && selected
            ? <img className="cover" src={questionCoverURL(selected, q.number)} alt="Обложка с масками" />
            : q.image_download_id && <img className="cover" src={fileURL(q.image_download_id)} alt="Изображение вопроса" />}
          {selected && q.sound_download_id && <><audio controls preload="none" src={questionAudioURL(selected, q.number)} /><div className="muted">Фрагмент: {q.trackStartSec?.toFixed(1)}–{q.trackFinishSec?.toFixed(1)} сек.</div></>}
          <details><summary>Показать ответ</summary><p>{q.answer}</p>{!!q.answer_info?.artist && q.answer_info.artist !== q.answer && <p>Исполнитель: {String(q.answer_info.artist)}</p>}{!!q.answer_info?.track && q.answer_info.track !== q.answer && <p>Трек: {String(q.answer_info.track)}</p>}{!!q.answer_info?.album && <p>Альбом: {String(q.answer_info.album)}</p>}</details>
        </Card>;
      }) }))} />
    </Drawer>
  </>;
}

