import { useState } from 'react';
import { Alert, App, Button, Input, Modal, Progress, Typography } from 'antd';
import { useQueryClient } from '@tanstack/react-query';
import { save } from './api';
import { parseArtistList, type ArtistListError } from './artistList';

export function AddArtistList() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState('');
  const [errors, setErrors] = useState<ArtistListError[]>([]);
  const [created, setCreated] = useState(0);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [running, setRunning] = useState(false);
  const { message } = App.useApp();
  const client = useQueryClient();

  const close = () => { setOpen(false); setValue(''); setErrors([]); setCreated(0); setProgress(null); };
  const submit = async () => {
    if (running) return;
    const parsed = parseArtistList(value);
    setErrors(parsed.errors);
    setCreated(0);
    if (parsed.errors.length) return;
    setRunning(true);
    setProgress({ done: 0, total: parsed.entries.length });
    const failures: ArtistListError[] = [];
    let added = 0;
    for (const [index, entry] of parsed.entries.entries()) {
      try {
        await save('/artists', 'POST', entry.body);
        added++;
      } catch (error) {
        failures.push({ input: entry.original, message: error instanceof Error ? error.message : 'Не удалось создать запись.' });
      }
      setProgress({ done: index + 1, total: parsed.entries.length });
    }
    await client.invalidateQueries({ queryKey: ['artists'] });
    await client.invalidateQueries({ queryKey: ['artist-options'] });
    setRunning(false);
    setProgress(null);
    if (!failures.length) {
      close();
      void message.success(`Добавлено исполнителей: ${added}`);
    } else {
      setCreated(added);
      setErrors(failures);
      setValue(failures.map(item => item.input).join('\n'));
    }
  };

  return <>
    <Button className="artist-bulk-button" onClick={() => setOpen(true)}>Добавить список имён/ссылок</Button>
    <Modal title="Добавить исполнителей списком" open={open} onCancel={close} onOk={() => void submit()}
      okText="Добавить" cancelText="Отмена" confirmLoading={running} closable={!running} mask={{ closable: !running }}
      cancelButtonProps={{ disabled: running }} keyboard={!running}>
      <Typography.Paragraph>Введите имена исполнителей или ссылки на их каналы YouTube / YouTube Music.
        Разделяйте записи новой строкой, запятой, точкой с запятой, вертикальной чертой или табуляцией.
        В именах запятые и точки с запятой считаются разделителями.</Typography.Paragraph>
      <Typography.Paragraph type="secondary">Поддерживаются ссылки на страницы /@имя и /channel/UC…; ссылки на отдельные видео не подходят.
        Добавление создаёт записи в каталоге; парсинг запускается отдельно.</Typography.Paragraph>
      {created > 0 && <Alert type="success" showIcon title={`Добавлено исполнителей: ${created}`} description="В поле оставлены записи, которые не удалось добавить." style={{ marginBottom: 12 }} />}
      {errors.length > 0 && <Alert type="error" showIcon title="Проверьте список" description={<ul className="artist-list-errors">{errors.map((item, i) =>
        <li key={`${item.input}-${i}`}>{item.input && <strong>{item.input}: </strong>}{item.message}</li>)}</ul>} style={{ marginBottom: 12 }} />}
      <Input.TextArea aria-label="Имена или ссылки исполнителей" value={value} disabled={running} autoSize={{ minRows: 7, maxRows: 15 }}
        placeholder={'Vampire Weekend\nThe Fray\nhttps://www.youtube.com/@artist'} onChange={event => setValue(event.target.value)} />
      {progress && <Progress aria-label="Добавление исполнителей" percent={Math.round(progress.done / progress.total * 100)}
        format={() => `${progress.done} / ${progress.total}`} />}
    </Modal>
  </>;
}
