import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Select, Space } from 'antd';
import { FlagOutlined, HeartFilled, HeartOutlined } from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { request, save } from '../api';

export function QuestionFeedback({ questionID }: { questionID: string }) {
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  const client = useQueryClient();
  const key = ['question-like', questionID];
  const like = useQuery({ queryKey: key, queryFn: ({ signal }) => request<{ liked: boolean }>(`/questions/${questionID}/like`, { signal }) });
  const toggle = useMutation({ mutationFn: (liked: boolean) => save<void>(`/questions/${questionID}/like`, 'PUT', { liked }),
    onSuccess: (_, liked) => client.setQueryData(key, { liked }) });
  const report = useMutation({ mutationFn: (body: { type: string; comment: string }) => save<void>(`/questions/${questionID}/feedback`, 'POST', body),
    onSuccess: () => { setOpen(false); form.resetFields(); } });
  return <div className="mq-feedback">
    <Space wrap>
      <Button aria-pressed={!!like.data?.liked} disabled={!like.data || like.isError} loading={toggle.isPending}
        icon={like.data?.liked ? <HeartFilled /> : <HeartOutlined />} onClick={() => toggle.mutate(!like.data?.liked)}>
        {like.data?.liked ? 'Нравится' : 'Нравится вопрос'}
      </Button>
      <Button icon={<FlagOutlined />} onClick={() => { report.reset(); setOpen(true); }}>Пожаловаться</Button>
    </Space>
    {(like.error || toggle.error) && <Alert showIcon type="error" title="Не удалось обновить лайк" description={(like.error || toggle.error)?.message} action={like.isError ? <Button size="small" onClick={() => void like.refetch()}>Повторить</Button> : undefined} />}
    {report.isSuccess && !open && <span role="status">Спасибо, жалоба отправлена.</span>}
    <Modal title="Пожаловаться на вопрос" open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()}
      okText="Отправить" cancelText="Отмена" confirmLoading={report.isPending}>
      {report.error && <Alert type="error" showIcon title="Не удалось отправить жалобу" description={report.error.message} />}
      <Form form={form} layout="vertical" onFinish={values => report.mutate(values)}>
        <Form.Item name="type" label="Тип жалобы" rules={[{ required: true, message: 'Выберите тип жалобы' }]}>
          <Select options={[
            { value: 'question_error', label: 'Ошибка в вопросе' },
            { value: 'bad_audio', label: 'Звук плохого качества' },
            { value: 'bug', label: 'Баг' },
          ]} />
        </Form.Item>
        <Form.Item name="comment" label="Комментарий" rules={[{ required: true, whitespace: true, message: 'Опишите проблему' }, { max: 4000 }]}>
          <Input.TextArea rows={4} maxLength={4000} showCount placeholder="Расскажите, что не так" />
        </Form.Item>
      </Form>
    </Modal>
  </div>;
}
