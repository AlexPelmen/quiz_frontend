import { Alert, App, Button, Space, Tag } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { save } from './api';

const labels: Record<string, string> = {
  created: 'Новый', processing: 'В обработке', parsed: 'Импортирован', errored: 'Ошибка', error: 'Ошибка', partial: 'Частично',
  pending: 'В очереди', finished: 'Завершено', manual: 'Вручную', running: 'Выполняется',
  missing: 'Нет записи', stopping: 'Останавливается', stopped: 'Остановлен',
};
export const statusLabel = (value: string) => labels[value] || value;
export function Status({ value }: { value?: string }) {
  const color = value === 'errored' || value === 'error' ? 'error' : value === 'finished' || value === 'parsed' ? 'success'
    : value === 'manual' ? 'warning' : 'processing';
  return value ? <Tag color={value === 'missing' ? 'default' : color}>{statusLabel(value)}</Tag> : null;
}
export function Failure({ error }: { error: Error | null }) {
  return error ? <Alert showIcon type="error" title={error.message} style={{ marginBottom: 16 }} /> : null;
}
export function Refresh({ onClick }: { onClick: () => void }) {
  return <Button icon={<ReloadOutlined />} onClick={onClick}>Обновить</Button>;
}
export function useAction() {
  const { message } = App.useApp();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method = 'POST', body }: { path: string; method?: string; body?: unknown }) => save(path, method, body),
    onSuccess: async () => { message.success('Готово'); await client.invalidateQueries(); },
    onError: (error: Error) => { message.error(error.message); },
  });
}
export function PageTitle({ title, subtitle, children }: { title: string; subtitle: string; children?: React.ReactNode }) {
  return <div className="page-title"><div><h1>{title}</h1><p>{subtitle}</p></div><Space wrap>{children}</Space></div>;
}
