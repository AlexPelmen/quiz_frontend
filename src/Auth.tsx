import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { Alert, Button, Card, Checkbox, Form, Input, Modal, Popconfirm, Select, Space, Spin, Table } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, request, save } from './api';
import { Failure, PageTitle } from './shared';

export type Account = { id: string; name: string; login: string; role: 'admin' | 'moderator' | 'player'; permissions: string[]; created_at: string; updated_at: string };
type Context = { user: Account; can: (section: string) => boolean; logout: () => void };
const AuthContext = createContext<Context | null>(null);
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error('Нет данных пользователя'); return value; }

export function AuthGate({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [loginError, setLoginError] = useState('');
  const [expired, setExpired] = useState(false);
  useEffect(() => {
    const invalidate = () => { client.clear(); setExpired(true); };
    window.addEventListener('quiz:unauthorized', invalidate);
    return () => window.removeEventListener('quiz:unauthorized', invalidate);
  }, [client]);
  const me = useQuery({ queryKey: ['auth-me'], queryFn: () => request<Account>('/auth/me'), retry: false, refetchOnWindowFocus: false });
  const login = useMutation({ mutationFn: (body: { login: string; password: string }) => save<Account>('/auth/login', 'POST', body),
    onSuccess: () => { client.clear(); location.reload(); }, onError: error => setLoginError(error.message) });
  const logout = useMutation({ mutationFn: () => save<void>('/auth/logout', 'POST'), onSuccess: () => { client.clear(); location.reload(); } });
  if (me.isPending && !expired) return <div style={{ padding: 32 }}><Spin /></div>;
  if (!expired && me.error && (!(me.error instanceof ApiError) || me.error.status !== 401)) return <div style={{ maxWidth: 420, margin: '10vh auto', padding: 16 }}><Failure error={me.error} /><Button onClick={() => void me.refetch()}>Повторить</Button></div>;
  if (!me.data || expired) return <div style={{ maxWidth: 420, margin: '10vh auto', padding: 16 }}><Card title="Вход в Music Quiz">
    {loginError && <Alert type="error" showIcon title={loginError} />}
    <Form layout="vertical" onFinish={values => login.mutate(values)}>
      <Form.Item label="Логин" name="login" rules={[{ required: true }]}><Input autoComplete="username" /></Form.Item>
      <Form.Item label="Пароль" name="password" rules={[{ required: true }]}><Input.Password autoComplete="current-password" /></Form.Item>
      <Button type="primary" htmlType="submit" loading={login.isPending}>Войти</Button>
    </Form>
  </Card></div>;
  const user = me.data;
  const can = (section: string) => user.role === 'admin' || section === 'profile' || section === 'player'
    || user.role === 'moderator' && section === 'album-guessing' || user.permissions.includes(section);
  return <AuthContext.Provider value={{ user, can, logout: () => logout.mutate() }}>{children}</AuthContext.Provider>;
}

const permissions = [
  ['artists','Исполнители'], ['albums','Альбомы'], ['tracks','Треки'], ['album-guessing','Модерация обложек'],
  ['album-cleanup','Очистка альбомов'], ['parsing','Парсинг'], ['parsing-logs','Журнал парсинга'], ['parsing-errors','Ошибки парсинга'],
  ['downloads','Загрузки'], ['storage','Файловое хранилище'], ['packs','Квиз-пакеты'], ['tags','Теги'], ['settings','Настройки'], ['console','API-консоль'], ['users','Пользователи'],
].map(([value,label]) => ({ value,label }));

export function Profile() {
  const { user } = useAuth();
  const client = useQueryClient();
  const action = useMutation({ mutationFn: (body: { name: string; old_password?: string; new_password?: string }) => save<Account>('/auth/profile','PATCH',body),
    onSuccess: (result, body) => { if (body.new_password) { client.clear(); location.reload(); } else client.setQueryData(['auth-me'], result); } });
  return <><PageTitle title="Мой профиль" subtitle={`Логин: ${user.login}`} /><Card><Failure error={action.error} />
    <Form layout="vertical" initialValues={{ name: user.name }} onFinish={values => action.mutate(values)}>
      <Form.Item name="name" label="Имя" rules={[{ required: true, whitespace: true }]}><Input /></Form.Item>
      <Form.Item name="old_password" label="Текущий пароль"><Input.Password autoComplete="current-password" /></Form.Item>
      <Form.Item name="new_password" label="Новый пароль" extra="Оставьте пустым, если пароль не меняется"><Input.Password autoComplete="new-password" /></Form.Item>
      <Button type="primary" htmlType="submit" loading={action.isPending}>Сохранить</Button>
    </Form></Card></>;
}

export function Users() {
  const { user } = useAuth();
  const client = useQueryClient();
  const [editing,setEditing] = useState<Account | 'new' | null>(null);
  const [form] = Form.useForm();
  const list = useQuery({ queryKey: ['users'], queryFn: () => request<Account[]>('/users') });
  const action = useMutation({ mutationFn: ({ path, method, body }: { path: string; method: string; body?: unknown }) => save(path,method,body),
    onSuccess: () => { setEditing(null); void client.invalidateQueries({ queryKey: ['users'] }); } });
  const open = (row: Account | 'new') => { form.resetFields(); form.setFieldsValue(row === 'new' ? { role:'player', permissions:[] } : { ...row, password:'' }); setEditing(row); };
  return <><PageTitle title="Пользователи" subtitle="Учётные записи и доступ к разделам"><Button type="primary" onClick={() => open('new')}>Добавить</Button></PageTitle>
    <Failure error={list.error || action.error} /><div className="panel"><Table<Account> rowKey="id" dataSource={list.data} loading={list.isPending} scroll={{ x: 780 }} columns={[
      { title:'Имя',dataIndex:'name' }, { title:'Логин',dataIndex:'login' }, { title:'Роль',dataIndex:'role' },
      { title:'Права',render: (_,row) => row.role === 'admin' ? 'Все разделы' : row.permissions.join(', ') || 'По роли' },
      { title:'Действия',render: (_,row) => <Space wrap><Button onClick={() => open(row)}>Изменить</Button>
        <Popconfirm title="Завершить все сеансы пользователя?" onConfirm={() => action.mutate({ path:`/users/${row.id}/revoke`,method:'POST' })}><Button>Завершить сеансы</Button></Popconfirm>
        <Popconfirm title="Удалить пользователя?" onConfirm={() => action.mutate({ path:`/users/${row.id}`,method:'DELETE' })}><Button danger>Удалить</Button></Popconfirm></Space> },
    ]} /></div><Modal open={!!editing} title={editing === 'new' ? 'Новый пользователь' : 'Редактирование пользователя'} onCancel={() => setEditing(null)} onOk={() => form.submit()} confirmLoading={action.isPending}>
      <Failure error={action.error} /><Form form={form} layout="vertical" onFinish={values => action.mutate({ path:editing === 'new' ? '/users' : `/users/${editing?.id}`, method:editing === 'new' ? 'POST' : 'PUT', body:values })}>
        <Form.Item name="name" label="Имя" rules={[{ required:true,whitespace:true }]}><Input /></Form.Item>
        <Form.Item name="login" label="Логин" rules={[{ required:true,whitespace:true }]}><Input autoComplete="off" /></Form.Item>
        <Form.Item name="password" label={editing === 'new' ? 'Пароль' : 'Новый пароль'} rules={editing === 'new' ? [{ required:true }] : []}><Input.Password autoComplete="new-password" /></Form.Item>
        <Form.Item name="role" label="Роль" rules={[{ required:true }]}><Select options={['player','moderator',...(user.role === 'admin' ? ['admin'] : [])].map(value => ({ value,label:value }))} /></Form.Item>
        <Form.Item name="permissions" label="Дополнительные права"><Checkbox.Group options={permissions.filter(item => user.role === 'admin' || user.permissions.includes(item.value))} /></Form.Item>
      </Form></Modal></>;
}
