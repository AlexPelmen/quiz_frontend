import { useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Drawer, Form, Input, Modal, Select, Space, Spin, Typography } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { date, request, save } from './api';
import { useAuth } from './Auth';
import { questionHint, ruleFor } from './quiz';
import { Failure } from './shared';
import { useTags } from './Tags';

export type FeedbackReport = {
  id: string;
  user_name: string;
  type: string;
  comment: string;
  created_at: string;
  question_deleted: boolean;
  question: {
    pack_name: string;
    number: number;
    round_type: string;
    primary_text: string;
    secondary_text: string;
    answer: string;
    artist_id: string | null;
    track_id: string | null;
    artist_name: string;
    track_name: string;
    album_name: string;
    yt_music_url: string;
    albums: { id: string; name: string }[];
    coartists: string[];
    release_date: string;
    track_start_sec: number | null;
    track_finish_sec: number | null;
    has_image: boolean;
    has_answer_image: boolean;
    has_audio: boolean;
  };
};

export const reportLabels: Record<string, string> = {
  question_error: 'Ошибка в вопросе', bad_audio: 'Плохой звук', bug: 'Баг',
};

const actionLabels = {
  'delete-artist': 'Удалить исполнителя',
  'delete-track': 'Удалить трек',
  'reject-cover': 'Запретить обложку',
  'reset-artist': 'Уточнить ссылку и очистить данные',
  'edit-artist-tags': 'Изменить теги исполнителя',
  'coauthor': 'Уточнить соавтора',
  'delete-report': 'Удалить жалобу',
};
type Action = keyof typeof actionLabels;
const reportPath = (id: string) => `/question-feedback/${encodeURIComponent(id)}`;

export function FeedbackReportDrawer({ id, onClose, onResolved }: {
  id: string | null; onClose: () => void; onResolved: () => void;
}) {
  const report = useQuery({
    queryKey: ['question-feedback', 'report', id], enabled: id !== null,
    queryFn: ({ signal }) => request<FeedbackReport>(reportPath(id!), { signal }),
  });

  return <Drawer title="Жалоба" open={id !== null} onClose={onClose} size="large"
    loading={id !== null && report.isPending}>
    <Failure error={report.error} />
    {report.data && <ReportCard key={report.data.id} report={report.data} onResolved={onResolved} />}
  </Drawer>;
}

function ReportCard({ report, onResolved }: { report: FeedbackReport; onResolved: () => void }) {
  const [action, setAction] = useState<Action | null>(null);
  const { can } = useAuth();
  const q = report.question;
  const hint = questionHint(q.secondary_text, q.round_type);
  const artistIsAnswer = q.round_type !== 'track_vowels' && q.answer === q.artist_name;
  const trackIsAnswer = q.round_type === 'track_vowels' && q.answer === q.track_name;
  const mediaURL = `/api/v1${reportPath(report.id)}`;
  const canEdit = !report.question_deleted;
  const coauthorTargets = [
    ...(q.track_id && can('tracks') ? [{ value: 'track', label: `Трек — ${q.track_name}` }] : []),
    ...(can('albums') ? q.albums.map(album => ({ value: album.id, label: `Альбом — ${album.name}` })) : []),
  ];

  return <>
    <Typography.Title level={4}>{reportLabels[report.type] ?? report.type}</Typography.Title>
    <Typography.Paragraph style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{report.comment}</Typography.Paragraph>
    <Typography.Text type="secondary">{report.user_name} · {date(report.created_at)}</Typography.Text>
    <Divider />
    {report.question_deleted && <Alert type="info" showIcon title="Вопрос снят с игры" style={{ marginBottom: 16 }} />}
    <Typography.Title level={4}>{q.primary_text}</Typography.Title>
    <Typography.Paragraph type="secondary">{q.pack_name} · {ruleFor(q.round_type).name} · вопрос {q.number}</Typography.Paragraph>
    {hint && <Typography.Paragraph style={{ whiteSpace: 'pre-wrap' }}>{hint}</Typography.Paragraph>}
    <Descriptions column={1} size="small" colon={false} items={[
      ...(q.answer && !artistIsAnswer && !trackIsAnswer ? [{ key: 'answer', label: 'Правильный ответ', children: q.answer }] : []),
      ...(q.artist_name ? [{ key: 'artist', label: artistIsAnswer ? 'Исполнитель · правильный ответ' : 'Исполнитель', children: q.artist_name }] : []),
      ...(q.coartists.length ? [{ key: 'coartists', label: q.round_type === 'artist_by_cover' ? 'Соавторы альбома' : 'Соавторы трека', children: q.coartists.join(', ') }] : []),
      ...(q.track_name ? [{ key: 'track', label: trackIsAnswer ? 'Трек · правильный ответ' : 'Трек', children: q.track_name }] : []),
      ...(q.album_name ? [{ key: 'album', label: 'Альбом', children: q.album_name }] : []),
      ...(q.release_date ? [{ key: 'release', label: 'Релиз', children: q.release_date }] : []),
      ...(q.yt_music_url ? [{ key: 'yt', label: 'YouTube Music', children:
        <Typography.Link href={q.yt_music_url} target="_blank" rel="noopener noreferrer">Открыть страницу исполнителя</Typography.Link>,
      }] : []),
    ]} />
    {(q.has_audio || q.has_image || q.has_answer_image) && <Space orientation="vertical" size="middle" style={{ width: '100%', marginTop: 16 }}>
      {q.has_audio && <ReportAudio url={`${mediaURL}/audio`} start={q.track_start_sec} finish={q.track_finish_sec} />}
      {q.has_image && <ReportImage url={`${mediaURL}/image`} label="Изображение в вопросе" />}
      {q.has_answer_image && <ReportImage url={`${mediaURL}/answer-image`} label="Изображение в ответе" />}
    </Space>}
    <Divider />
    <Space wrap>
      {canEdit && q.artist_id && can('artists') && <>
        <Button onClick={() => setAction('edit-artist-tags')}>{actionLabels['edit-artist-tags']}</Button>
        <Button danger onClick={() => setAction('delete-artist')}>{actionLabels['delete-artist']}</Button>
        <Button danger onClick={() => setAction('reset-artist')}>{actionLabels['reset-artist']}</Button>
      </>}
      {canEdit && q.track_id && can('tracks') &&
        <Button danger onClick={() => setAction('delete-track')}>{actionLabels['delete-track']}</Button>}
      {canEdit && q.round_type === 'artist_by_cover' && q.has_image && can('album-guessing') &&
        <Button danger onClick={() => setAction('reject-cover')}>{actionLabels['reject-cover']}</Button>}
      {canEdit && coauthorTargets.length > 0 &&
        <Button onClick={() => setAction('coauthor')}>{actionLabels.coauthor}</Button>}
      <Button danger onClick={() => setAction('delete-report')}>{actionLabels['delete-report']}</Button>
    </Space>
    {action && <ActionDialog report={report} action={action} targets={coauthorTargets}
      onClose={() => setAction(null)} onResolved={onResolved} />}
  </>;
}

function ReportImage({ url, label }: { url: string; label: string }) {
  const [failed, setFailed] = useState(false);
  return <div>
    <Typography.Text strong>{label}</Typography.Text>
    {failed ? <Alert showIcon type="warning" title="Не удалось загрузить изображение" />
      : <img className="cover" style={{ margin: '8px 0 0' }} src={url} alt={label} onError={() => setFailed(true)} />}
  </div>;
}

function ReportAudio({ url, start, finish }: { url: string; start: number | null; finish: number | null }) {
  const [failed, setFailed] = useState(false);
  return <Space orientation="vertical" size="small" style={{ width: '100%' }}>
    <Typography.Text strong>Аудиофрагмент вопроса</Typography.Text>
    {failed ? <Alert showIcon type="warning" title="Не удалось загрузить аудиофрагмент" />
      : <audio aria-label="Аудиофрагмент вопроса" controls preload="none" src={url}
        style={{ maxWidth: '100%' }} onError={() => setFailed(true)} />}
    {start !== null && finish !== null &&
      <Typography.Text type="secondary">{start.toFixed(1)}–{finish.toFixed(1)} с исходной записи</Typography.Text>}
  </Space>;
}

type ActionValues = {
  yt_music_url?: string;
  tags?: string[];
  target?: string;
  artist?: { value: string; label: React.ReactNode };
};

function ActionDialog({ report, action, targets, onClose, onResolved }: {
  report: FeedbackReport; action: Action; targets: { value: string; label: string }[];
  onClose: () => void; onResolved: () => void;
}) {
  const [form] = Form.useForm<ActionValues>();
  const [search, setSearch] = useState('');
  const query = search.trim();
  const { message } = App.useApp();
  const client = useQueryClient();
  const q = report.question;
  const editsTags = action === 'edit-artist-tags';
  const tags = useTags(editsTags);
  const artist = useQuery({
    queryKey: ['feedback-artist-tags', q.artist_id], enabled: editsTags && !!q.artist_id,
    refetchOnMount: 'always', refetchOnWindowFocus: false,
    queryFn: ({ signal }) => request<{ tags: string[] }>(`/artists/${encodeURIComponent(q.artist_id!)}`, { signal }),
  });
  const editorReady = !editsTags || (artist.isFetchedAfterMount && artist.isSuccess && tags.isSuccess);
  const artists = useQuery({
    queryKey: ['feedback-artist-options', query], enabled: action === 'coauthor' && query.length > 0,
    queryFn: ({ signal }) => request<{ id: string; name: string }[]>(
      `/artists?name=${encodeURIComponent(query)}&sort=name&limit=20`, { signal },
    ),
  });
  const mutation = useMutation({
    mutationFn: (values: ActionValues) => {
      const path = reportPath(report.id);
      if (action === 'delete-report') return save<void>(path, 'DELETE');
      if (editsTags) return save<void>(`${path}/actions/${action}`, 'POST', { tags: values.tags ?? [] });
      if (action === 'coauthor') {
        const artist_id = values.artist?.value;
        return values.target === 'track'
          ? save<void>(`${path}/actions/add-track-coauthor`, 'POST', { artist_id })
          : save<void>(`${path}/actions/add-album-coauthor`, 'POST', { artist_id, album_id: values.target });
      }
      return save<void>(`${path}/actions/${action}`, 'POST', { yt_music_url: values.yt_music_url });
    },
    onSuccess: () => {
      onResolved();
      void message.success(action === 'delete-report' ? 'Жалоба удалена' : 'Изменения сохранены, жалоба удалена');
      void client.invalidateQueries();
    },
  });
  const descriptions = {
    'delete-artist': `«${q.artist_name}» будет удалён вместе со своим каталогом. Совместные записи останутся у других исполнителей.`,
    'delete-track': `Трек «${q.track_name}» будет удалён из каталога. Вопросы с ним будут сняты с игры.`,
    'reject-cover': `Обложка альбома «${q.album_name}» будет запрещена для раунда «Лицо альбома». Вопросы с ней будут сняты с игры.`,
    'reset-artist': `Данные «${q.artist_name}» и его каталог будут очищены. Совместные записи останутся у других исполнителей. Чтобы заново загрузить данные по новой ссылке, запустите парсинг.`,
    'edit-artist-tags': `Теги исполнителя «${q.artist_name}»`,
    'coauthor': 'Выберите исполнителя из каталога и запись, к которой его нужно добавить.',
    'delete-report': 'Жалоба будет удалена.',
  };

  return <Modal title={actionLabels[action]} open onCancel={onClose} onOk={() => form.submit()}
    okText={action === 'coauthor' || editsTags ? 'Сохранить' : 'Подтвердить'} cancelText="Отмена"
    okButtonProps={{ danger: action !== 'coauthor' && !editsTags, disabled: !editorReady }} confirmLoading={mutation.isPending}
    closable={!mutation.isPending} keyboard={!mutation.isPending}
    cancelButtonProps={{ disabled: mutation.isPending }}
    mask={{ closable: !mutation.isPending }}>
    <Failure error={mutation.error} />
    <Typography.Paragraph>{descriptions[action]}</Typography.Paragraph>
    {action !== 'delete-report' && <Typography.Paragraph type="secondary">После выполнения жалоба будет удалена.</Typography.Paragraph>}
    <Form form={form} layout="vertical" disabled={mutation.isPending}
      initialValues={{ target: targets.length === 1 ? targets[0].value : undefined }}
      onFinish={values => { if (editorReady) mutation.mutate(values); }}>
      {action === 'reset-artist' && <Form.Item name="yt_music_url" label="Новая ссылка на YouTube Music"
        rules={[{ required: true, whitespace: true, message: 'Укажите ссылку на страницу исполнителя' }]}>
        <Input placeholder="https://music.youtube.com/@artist" />
      </Form.Item>}
      {editsTags && <>
        <Failure error={artist.error ?? tags.error} />
        {editorReady ? <Form.Item name="tags" label="Теги" initialValue={artist.data?.tags ?? []}>
          <Select mode="multiple" allowClear showSearch={{ optionFilterProp: 'label' }}
            placeholder="Выберите теги из справочника"
            options={tags.data?.map(tag => ({ value: tag.name, label: tag.name }))} />
        </Form.Item> : !artist.error && !tags.error && <Spin aria-label="Загружаем теги" size="small" />}
      </>}
      {action === 'coauthor' && <>
        <Form.Item name="target" label="Трек или альбом" rules={[{ required: true, message: 'Выберите запись' }]}>
          <Select options={targets} />
        </Form.Item>
        <Failure error={artists.error} />
        <Form.Item name="artist" label="Соавтор" rules={[{ required: true, message: 'Выберите исполнителя' }]}>
          <Select labelInValue showSearch={{ onSearch: setSearch, filterOption: false }} loading={artists.isFetching}
            placeholder="Начните вводить имя" notFoundContent={query ? 'Совпадений нет' : 'Введите имя исполнителя'}
            options={artists.data?.filter(artist => artist.id !== q.artist_id)
              .map(artist => ({ value: artist.id, label: artist.name }))} />
        </Form.Item>
      </>}
    </Form>
  </Modal>;
}
