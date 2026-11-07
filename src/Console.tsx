import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Select, Space, Tag } from 'antd';
import { pretty, request } from './api';
import { PageTitle, useAction } from './shared';
import { useQueryClient } from '@tanstack/react-query';

export function Console() {
  const [result, setResult] = useState('Ответ появится после запроса.');
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  const action = useAction();
  return <><PageTitle title="API-консоль" subtitle="Доступ ко всем JSON-методам сервиса" />
    <Alert type="info" showIcon title="Путь указывается относительно /api/v1" description="Например, /artists?limit=50 или /tracks/UUID. Для файлов и аудио используйте разделы каталога и загрузок." />
    <Card className="spaced"><Form layout="vertical" initialValues={{ method: 'GET', path: '/artists?limit=50', body: '{}' }} onFinish={async values => {
      if (!values.path.startsWith('/') || values.path.startsWith('//') || values.path.includes('://') || values.path.includes('..')) { setResult('Укажите локальный путь, начинающийся с /'); return; }
      setBusy(true);
      try {
        const body = ['POST', 'PATCH'].includes(values.method) ? JSON.stringify(JSON.parse(values.body)) : undefined;
        const data = await request(values.path, { method: values.method, body });
        setResult(data === undefined ? '204 — операция выполнена' : pretty(data));
        if (values.method !== 'GET') await client.invalidateQueries();
      } catch (error) { setResult(error instanceof Error ? error.message : String(error)); }
      finally { setBusy(false); }
    }}>
      <Space.Compact style={{ width: '100%' }}><Form.Item name="method"><Select style={{ width: 120 }} options={['GET', 'POST', 'PATCH', 'DELETE'].map(value => ({ value, label: value }))} /></Form.Item><Form.Item name="path" style={{ flex: 1 }} rules={[{ required: true }]}><Input aria-label="Путь API" /></Form.Item></Space.Compact>
      <Form.Item name="body" label="JSON тела запроса (для POST / PATCH)"><Input.TextArea rows={8} className="code-input" /></Form.Item>
      <Button htmlType="submit" type="primary" loading={busy || action.isPending}>Выполнить запрос</Button><Tag style={{ marginLeft: 12 }}>API v1</Tag>
    </Form></Card><Card title="Ответ" className="spaced"><pre>{result}</pre></Card>
  </>;
}
