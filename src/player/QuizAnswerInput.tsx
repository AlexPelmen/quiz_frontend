import { useEffect, useRef, useState, type RefObject } from 'react';
import { Alert, AutoComplete, Button, Input, Spin, type GetRef } from 'antd';
import { ArrowRightOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { request } from '../api';
import type { AnswerOption, AnswerType } from '../quiz';

type Suggestion = { value: string; label: string; option: AnswerOption };
type Draft = { text: string; option?: AnswerOption };

export function QuizAnswerInput({ fieldRef, preferred, pending, error, onSubmit }: {
  fieldRef: RefObject<GetRef<typeof AutoComplete> | null>;
  preferred: AnswerType;
  pending: boolean;
  error: Error | null;
  onSubmit: (option: AnswerOption) => void;
}) {
  const [draft, setDraft] = useState<Draft>({ text: '' });
  const latest = useRef(draft);
  const [term, setTerm] = useState('');
  const search = draft.option ? '' : draft.text.trim();

  useEffect(() => {
    const timer = window.setTimeout(() => setTerm(search), 275);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (error) fieldRef.current?.focus();
  }, [error, fieldRef]);

  const canSearch = !!search && search === term && !pending;
  const matches = useQuery({
    queryKey: ['quiz-answer-options', term, preferred],
    queryFn: ({ signal }) => request<AnswerOption[]>(`/quiz-answer-options?${new URLSearchParams({ q: term, prefer: preferred })}`, { signal }),
    enabled: canSearch,
    staleTime: 60_000,
    retry: false,
  });
  const options: Suggestion[] = canSearch ? (matches.data ?? []).map(option => ({
    value: `${option.type}:${option.id}`,
    label: option.name,
    option,
  })) : [];

  function update(input: Draft) {
    latest.current = input;
    setDraft(input);
  }

  function submit() {
    const { option } = latest.current;
    if (option && !pending) onSubmit(option);
  }

  return <form className="mq-answer-form" autoComplete="off" onSubmit={event => { event.preventDefault(); submit(); }}
    onKeyDownCapture={event => {
      if (event.key === 'Enter' && (event.nativeEvent.isComposing || event.keyCode === 229)) event.stopPropagation();
    }}>
    <div className="mq-answer-input">
      <AutoComplete<string, Suggestion>
        ref={fieldRef}
        id="mq-player-answer"
        autoComplete="off"
        size="large"
        value={draft.text}
        maxLength={1000}
        placeholder="Ваш ответ"
        disabled={pending}
        options={options}
        listHeight={220}
        classNames={{ popup: { root: 'mq-answer-options' } }}
        virtual={false}
        showSearch={{ filterOption: false }}
        defaultActiveFirstOption={false}
        onChange={value => update({ text: value ?? '' })}
        onSelect={(_, { option }) => update({ text: option.name, option })}
        onKeyDown={event => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || event.keyCode === 229) return;
          event.preventDefault();
          if (!event.repeat) submit();
        }}
      >
        <Input aria-label={preferred === 'track' ? 'Название трека' : 'Имя исполнителя'}
          autoComplete="off" autoCorrect="off" autoCapitalize="none" spellCheck={false} />
      </AutoComplete>
      {canSearch && matches.isFetching && <span className="mq-answer-loader" role="status" aria-label="Поиск вариантов">
        <Spin size="small" />
      </span>}
    </div>
    <Button className="mq-submit-answer" type="primary" size="large" htmlType="submit"
      aria-label="Ответить" disabled={!draft.option} loading={pending}>
      <span className="mq-submit-label">Ответить <kbd>Enter</kbd></span><ArrowRightOutlined className="mq-submit-arrow" />
    </Button>
    {canSearch && matches.isError && <Alert type="warning" showIcon title="Не удалось загрузить варианты"
      action={<Button size="small" onClick={() => void matches.refetch()}>Повторить</Button>} />}
    {error && <Alert type="error" showIcon title="Не удалось отправить ответ" description={error.message} />}
  </form>;
}
