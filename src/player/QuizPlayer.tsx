import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Image, Modal, Progress, Spin, Tag } from 'antd';
import type { AutoComplete, GetRef } from 'antd';
import {
  ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined,
  CalendarOutlined, CustomerServiceOutlined, MutedOutlined, PauseOutlined,
  PlayCircleFilled, PlayCircleOutlined, ReloadOutlined, SoundOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fileURL, request, save } from '../api';
import { useAuth } from '../Auth';
import { difficultyLabels, questionHint, quizScore, ruleFor } from '../quiz';
import type { AnswerOption, QuizPack, QuizPackSummary, QuizQuestion, QuizRound, RoundResult, SubmittedAnswer } from '../quiz';
import { QuizAnswer } from './QuizAnswer';
import { QuizAnswerInput } from './QuizAnswerInput';
import { QuestionFeedback } from './QuestionFeedback';
import { useQuizAudio } from './useQuizAudio';
import { useQuizMedia, type QuestionMedia } from './useQuizMedia';
import './player.css';

const pageSize = 12;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const posterSymbols = ['♫', '✳', '◉', '♪', '✦', '∿'];
const wave = [10, 18, 12, 24, 32, 19, 26, 13, 22, 30, 16, 8];

type Step =
  | { kind: 'round'; round: QuizRound }
  | { kind: 'question'; round: QuizRound; question: QuizQuestion; position: number }
  | { kind: 'result'; round: QuizRound }
  | { kind: 'finish' };

function gameSteps(rounds: QuizRound[]): Step[] {
  const steps: Step[] = [];
  for (const round of rounds) {
    steps.push({ kind: 'round', round });
    round.questions.forEach((question, index) => steps.push({ kind: 'question', round, question, position: index + 1 }));
    steps.push({ kind: 'result', round });
  }
  return [...steps, { kind: 'finish' }];
}

type Game = {
  pack: QuizPack;
  media: ReadonlyMap<string, QuestionMedia>;
  steps: Step[];
  index: number;
  attemptId: string;
  answers: Partial<Record<string, SubmittedAnswer>>;
  results: Partial<Record<string, RoundResult>>;
  saved: Set<string>;
};

const numberLabel = (number: number) => String(number).padStart(2, '0');
const timeLabel = (seconds: number) => `${Math.floor(seconds / 60)}:${numberLabel(Math.floor(seconds % 60))}`;

function Tags({ tags }: { tags: QuizPackSummary['tags'] }) {
  return tags?.length ? <div className="mq-tags">{tags.map((tag, index) => <Tag key={`${tag}-${index}`}>{tag}</Tag>)}</div> : null;
}

function Splash({ answer = false }: { answer?: boolean }) {
  return <div className={`mq-splash${answer ? ' mq-splash-answer' : ''}`} aria-hidden="true">
    {posterSymbols.map(symbol => <span key={symbol}>{symbol}</span>)}
  </div>;
}

function RecordArt() {
  return <div className="mq-record-art" aria-hidden="true">
    <div className="mq-art-grid" />
    <span className="mq-art-caption">MUSIC QUIZ<br />33 ⅓ RPM</span>
    <div className="mq-sleeve" />
    <div className="mq-record"><div className="mq-record-label">♫</div></div>
    <span className="mq-art-star">✦</span>
    <span className="mq-art-star mq-art-star-small">✧</span>
    <span className="mq-art-index">SIDE A / 01</span>
  </div>;
}

function QuizImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <Alert showIcon type="warning" title="Изображение вопроса недоступно" />
    : <Image className="mq-question-image" src={src} onError={() => setFailed(true)} alt="Изображение-подсказка к вопросу" preview={false} />;
}

export function QuizPlayer() {
  const { user, can, logout, logoutError, logoutPending } = useAuth();
  const [sound, setSound] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const media = useRef<HTMLAudioElement>(null);
  const audio = useQuizAudio(media);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerField = useRef<GetRef<typeof AutoComplete>>(null);
  const queryClient = useQueryClient();
  const submission = useMutation({
    mutationFn: ({ roundId, attemptId }: { roundId: string; attemptId: string }) =>
      save<void>(`/quiz-rounds/${encodeURIComponent(roundId)}/results`, 'POST', { attempt_id: attemptId }),
    onSuccess: (_, { roundId, attemptId }) => {
      setGame(current => current?.attemptId === attemptId
        ? { ...current, saved: new Set([...current.saved, roundId]) } : current);
      for (const key of ['artists', 'albums', 'tracks', 'catalog-related']) {
        void queryClient.invalidateQueries({ queryKey: [key] });
      }
    },
  });
  const answerSubmission = useMutation({
    mutationFn: ({ questionId, attemptId, option }: { questionId: string; attemptId: string; option: AnswerOption }) =>
      save<SubmittedAnswer>(`/questions/${encodeURIComponent(questionId)}/answer`, 'POST', {
        attempt_id: attemptId,
        option_id: option.id,
        option_type: option.type,
      }),
    onSuccess: (answer, { questionId, attemptId }) => {
      setGame(current => current?.attemptId === attemptId
        ? { ...current, answers: { ...current.answers, [questionId]: answer } } : current);
    },
  });

  const packs = useQuery({
    queryKey: ['quiz-packs', 'player', page],
    queryFn: () => request<QuizPackSummary[]>(`/quiz-packs?status=ready&limit=${pageSize}&offset=${(page - 1) * pageSize}`),
    enabled: selected === null,
  });
  const detail = useQuery({
    queryKey: ['quiz-pack', 'player', selected],
    queryFn: () => request<QuizPack>(`/quiz-packs/${encodeURIComponent(selected ?? '')}?play=1`),
    enabled: selected !== null && game === null,
  });
  const pack = game?.pack ?? detail.data;
  const { state: packMedia, retry: retryMedia } = useQuizMedia(pack);
  const rounds = (pack?.rounds ?? []).filter(round => round.questions.length > 0);
  const total = rounds.reduce((sum, round) => sum + round.questions.length, 0);
  const playable = rounds.reduce((sum, round) => sum + round.questions.filter(q => !q.deleted).length, 0);
  const step = game?.steps[game.index];
  const correct = step?.kind === 'finish' ? Object.values(game?.answers ?? {}).filter(answer => answer?.correct).length : 0;
  const score = quizScore(correct, playable);
  const question = step?.kind === 'question' && !step.question.deleted ? step.question : null;
  const rule = step && step.kind !== 'finish' ? ruleFor(step.round.type) : null;
  const hint = question && step?.kind === 'question' ? questionHint(question.secondary_text, step.round.type) : '';
  const submitted = question ? game?.answers[question.id] : undefined;
  const result = step?.kind === 'result' ? game?.results[step.round.id] : undefined;
  const resultSaved = step?.kind === 'result' && game?.saved.has(step.round.id);
  const questionMedia = question && game?.media.get(question.id);
  const clip = questionMedia?.audio ?? null;
  const completedFiles = packMedia.status === 'ready' ? packMedia.total : packMedia.status === 'loading' ? packMedia.loaded : 0;
  const screen = game ? `${game.pack.id}-${game.index}` : selected ? `pack-${selected}-${!!pack}` : 'catalog';

  useEffect(() => {
    if (answerField.current) {
      answerField.current.focus({ preventScroll: true });
    } else if (screen !== 'catalog' || document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [screen]);

  function move(offset: number) {
    if (!game || submission.isPending || answerSubmission.isPending) return;
    if (offset > 0 && ((question && !submitted) || (result && !resultSaved))) return;
    const index = game.index + offset;
    const next = game.steps[index];
    if (!next) return;
    answerSubmission.reset();
    const url = next.kind === 'question' ? game.media.get(next.question.id)?.audio ?? null : null;
    if (next.kind === 'result' && !game.results[next.round.id]) {
      const questions = next.round.questions.filter(q => !q.deleted);
      if (questions.some(q => !game.answers[q.id])) return;
      const result = { n: questions.length, r: questions.filter(q => game.answers[q.id]?.correct).length };
      audio.load(null);
      setGame({ ...game, index, results: { ...game.results, [next.round.id]: result } });
      submission.mutate({ roundId: next.round.id, attemptId: game.attemptId });
      return;
    }
    audio.load(url, sound === true);
    setGame({ ...game, index });
  }

  function submitAnswer(option: AnswerOption) {
    if (!game || !question || submitted || answerSubmission.isPending) return;
    answerSubmission.mutate({ questionId: question.id, attemptId: game.attemptId, option });
  }

  function togglePlayback() {
    if (!clip) return;
    if (!sound) setSound(true);
    audio.toggle();
  }

  function goToCatalog() {
    if (submission.isPending || answerSubmission.isPending) return;
    submission.reset();
    answerSubmission.reset();
    audio.load(null);
    setGame(null);
    setSelected(null);
  }

  function changeSound(enabled: boolean) {
    setSound(enabled);
    if (clip) audio.load(clip, enabled);
    else if (enabled) audio.activate();
    else audio.load(null);
  }

  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (!game || sound === null || event.repeat || event.isComposing || event.keyCode === 229 ||
      event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const target = event.target;
    const element = target instanceof Element ? target : null;
    if (element?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }

    if (element?.closest('button, a[href], [role="button"]')) return;
    if (event.key === 'Enter' &&
      (step?.kind === 'round' || (step?.kind === 'question' && (!question || submitted)) || resultSaved)) {
      event.preventDefault();
      move(1);
    } else if (clip && event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const duration = Math.max(0, (question?.trackFinishSec ?? 0) - (question?.trackStartSec ?? 0));
  const loadError = selected ? detail.error : packs.error;
  const lastQuestion = step?.kind === 'question' && step.position === step.round.questions.length;
  const following = game?.steps[game.index + 1];

  return <div className="mq">
    <header className="mq-header">
      <button className="mq-brand" onClick={goToCatalog} aria-label="Music Quiz, к списку пакетов">
        <span className="mq-brand-icon" aria-hidden="true">♫</span><span>MUSIC<span className="mq-brand-accent">QUIZ</span></span>
      </button>
      <nav aria-label="Навигация">
        <span className="mq-account">{user.name}</span>
        <Button type="text" onClick={logout} loading={logoutPending}>Выйти</Button>
        <Button type="text" href={can('packs') ? '/admin#packs' : '/admin#profile'} className="mq-admin">{can('packs') ? 'Студия пакетов' : 'Мой профиль'}</Button>
        <Button className="mq-sound-button" aria-pressed={sound === true} disabled={sound === null}
          icon={sound ? <SoundOutlined /> : <MutedOutlined />} onClick={() => changeSound(!sound)}>
          Звук <span className="mq-sound-state">{sound ? 'вкл.' : 'выкл.'}</span>
        </Button>
      </nav>
    </header>

    <main className="mq-main">
      {logoutError && <Alert showIcon type="error" title={logoutError.message} />}
      {audio.error && !question && <Alert type="warning" showIcon title={audio.error} />}
      <div key={screen} className="mq-screen">
        {!selected && <>
          <section className="mq-hero">
            <div className="mq-hero-copy">
              <span className="mq-kicker"><i /> МУЗЫКАЛЬНАЯ ИГРА</span>
              <h1 ref={heading} tabIndex={-1}>Угадай,<br />что <em>звучит.</em></h1>
              <p>Узнавайте любимых исполнителей по отрывкам, обложкам и подсказкам.</p>
              <Button size="large" type="primary" href="#packs" icon={<ArrowDownOutlined />} iconPlacement="end">Выбрать пакет</Button>
            </div>
            <RecordArt />
          </section>
          <section id="packs" className="mq-catalog" aria-labelledby="packs-title">
            <div className="mq-section-heading">
              <div><div className="mq-kicker">ПОДБОРКИ ДЛЯ ИГРЫ</div><h2 id="packs-title">Пакеты квизов</h2></div>
              <Button icon={<ReloadOutlined />} onClick={() => void packs.refetch()} loading={packs.isFetching}>Обновить</Button>
            </div>
            {packs.isPending && <div className="mq-status" role="status"><Spin /> Загружаем пакеты…</div>}
            {loadError && <Alert type="error" showIcon title="Не удалось загрузить список пакетов" description={loadError.message} />}
            {packs.isSuccess && !packs.data?.length && <Empty className="mq-empty"
              description={page === 1 ? 'Пакетов пока нет. Создайте первый в студии.' : 'На этой странице пакетов нет.'}>
              {page === 1 && can('packs') && <Button href="/admin#packs">Открыть студию пакетов</Button>}
            </Empty>}
            <div className="mq-pack-grid">{packs.data?.map((item, index) => <Card className="mq-pack-card" key={item.id}
              cover={item.cover_download_id ? <img className="mq-pack-cover" src={fileURL(item.cover_download_id)} alt="" />
                : <div className="mq-poster" data-tone={index % 3} aria-hidden="true">
                <span>ПАКЕТ {numberLabel((page - 1) * pageSize + index + 1)}</span>
                <b>{posterSymbols[index % posterSymbols.length]}</b>
                <i>♪</i>
              </div>}>
              <h3>{item.name}</h3>
              <Tag>{difficultyLabels[item.difficulty ?? 'medium']}</Tag>
              <p>{item.description || 'Музыкальные вопросы и подсказки.'}</p>
              <Tags tags={item.tags} />
              <Button block onClick={() => setSelected(item.id)} aria-label={`Открыть пакет «${item.name}»`}
                icon={<ArrowRightOutlined />} iconPlacement="end">Открыть пакет</Button>
            </Card>)}</div>
            {(page > 1 || (packs.data?.length ?? 0) >= pageSize) && <div className="mq-pager">
              <Button icon={<ArrowLeftOutlined />} disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>
              <span>Страница {page}</span>
              <Button icon={<ArrowRightOutlined />} iconPlacement="end" disabled={(packs.data?.length ?? 0) < pageSize}
                onClick={() => setPage(page + 1)}>Далее</Button>
            </div>}
          </section>
        </>}

        {selected && !game && <>
          <Button type="text" className="mq-back" icon={<ArrowLeftOutlined />} onClick={goToCatalog}>Все пакеты</Button>
          {detail.isPending && <div className="mq-status" role="status"><Spin /> Загружаем пакет…</div>}
          {loadError && <Alert type="error" showIcon title="Не удалось загрузить пакет" description={loadError.message}
            action={<Button onClick={() => void detail.refetch()}>Повторить</Button>} />}
          {pack && <section className="mq-stage mq-detail">
            <Splash />
            <div className="mq-kicker"><CustomerServiceOutlined /> ПАКЕТ КВИЗА</div>
            <h1 ref={heading} tabIndex={-1}>{pack.name}</h1>
            {pack.cover_download_id && <img className="mq-detail-cover" src={fileURL(pack.cover_download_id)} alt="Обложка пакета" />}
            <Tag>{difficultyLabels[pack.difficulty ?? 'medium']}</Tag>
            {pack.description && <p>{pack.description}</p>}
            <Tags tags={pack.tags} />
            <div className="mq-pack-stats">
              <span>Раунды <strong>{rounds.length}</strong></span>
              <span>Вопросы <strong>{total}</strong></span>
              {pack.created_at && <span><CalendarOutlined /> {dateFormat.format(new Date(pack.created_at))}</span>}
            </div>
            {rounds.length > 0 ? <ol className="mq-round-list" aria-label="Раунды пакета">
              {rounds.map(round => <li key={round.id}><span>{numberLabel(round.number)}</span>{ruleFor(round.type).name}</li>)}
            </ol> : <Alert showIcon type="info" title="В этом пакете нет вопросов." />}
            {total > 0 && packMedia.status === 'preparing' && <div role="status">Подготавливаем список файлов…</div>}
            {(packMedia.status === 'loading' || packMedia.status === 'ready') && packMedia.total > 0 && <div className="mq-media-progress">
              <div>Загружено {completedFiles} из {packMedia.total} файлов</div>
              <Progress aria-label="Загрузка файлов квиза" aria-valuetext={`${completedFiles} из ${packMedia.total} файлов`}
                percent={Math.floor(completedFiles / packMedia.total * 100)} />
            </div>}
            {packMedia.status === 'error' && <Alert type="error" showIcon title="Не удалось подготовить пакет"
              description={packMedia.message} action={<Button loading={detail.isFetching} onClick={() => {
                void detail.refetch().then(({ isSuccess }) => { if (isSuccess) retryMedia(); });
              }}>Повторить</Button>} />}
            <Button size="large" type="primary" icon={<PlayCircleOutlined />} disabled={!total || packMedia.status !== 'ready'}
              onClick={() => {
                if (packMedia.status !== 'ready') return;
                setGame({ pack, media: packMedia.questions, steps: gameSteps(rounds), index: 0, attemptId: crypto.randomUUID(),
                  answers: {}, results: {}, saved: new Set() });
              }}>Начать</Button>
          </section>}
        </>}

        {game && step && <>
          <div className="mq-game-bar">
            <Button className="mq-back" type="text" icon={<ArrowLeftOutlined />} onClick={goToCatalog}>Все пакеты</Button>
            <span>{game.pack.name}</span>
            {step.kind !== 'finish' && <Tag>РАУНД {step.round.number} / {rounds.length}</Tag>}
          </div>

          {step.kind === 'round' && rule && <section className="mq-stage mq-round" data-tone={(step.round.number - 1) % 3}>
            <Splash />
            <div className="mq-kicker">РАУНД {numberLabel(step.round.number)} <i /> {step.round.questions.length} ВОПРОСОВ</div>
            <div className="mq-round-symbol" aria-hidden="true">{rule.symbol}</div>
            <h1 ref={heading} tabIndex={-1}>{rule.name}</h1>
            <p>{rule.instructions}</p>
            <Button type="primary" size="large" icon={<PlayCircleOutlined />} onClick={() => move(1)}>Играть</Button>
          </section>}

          {step.kind === 'question' && <section className="mq-stage mq-question">
            <Splash />
            <div className="mq-question-top">
              <div className="mq-kicker">ВОПРОС {numberLabel(step.position)} / {numberLabel(step.round.questions.length)}</div>
              {question && <Tag>{rule?.label}</Tag>}
            </div>
            <Progress aria-label="Прогресс раунда" percent={step.position / step.round.questions.length * 100} showInfo={false} strokeColor="#b294ff" />
            <h1 ref={heading} tabIndex={-1}>{step.question.primary_text}</h1>
            {question && <>
              <p>{rule?.instructions}</p>
              {submitted ? <><Splash answer /><QuizAnswer answer={submitted} roundType={step.round.type} clueImage={questionMedia?.image} /></> : <>
                {hint && <div className="mq-hint">{hint}</div>}
                {questionMedia?.image && <QuizImage key={question.id} src={questionMedia.image} />}
              </>}
              {clip && <>
                <div className="mq-audio">
                  <Button shape="circle" type="primary" size="large" aria-label={audio.playing ? 'Пауза' : 'Воспроизвести фрагмент'}
                    icon={audio.playing ? <PauseOutlined /> : <PlayCircleFilled />} onClick={togglePlayback} />
                  <div className="mq-audio-body">
                    <strong>Фрагмент трека</strong>
                    <div className="mq-wave" aria-hidden="true" data-playing={audio.playing}>
                      {wave.map((height, index) => <i key={index} style={{ height, animationDelay: `${index * -45}ms` }} />)}
                    </div>
                  </div>
                  <span className="mq-time">{timeLabel(audio.elapsed)}{duration > 0 && ` / ${timeLabel(duration)}`}</span>
                </div>
                {audio.error && <Alert type="warning" showIcon title={audio.error} />}
              </>}
              <QuestionFeedback key={question.id} questionID={question.id} />
              {!submitted && <QuizAnswerInput fieldRef={answerField} preferred={step.round.type === 'track_vowels' ? 'track' : 'artist'}
                pending={answerSubmission.isPending} error={answerSubmission.error} onSubmit={submitAnswer} />}
            </>}
          </section>}

          {step.kind === 'result' && result && <section className="mq-stage mq-round">
            <div className="mq-kicker">РАУНД {numberLabel(step.round.number)}</div>
            <h1 ref={heading} tabIndex={-1}>Угадано {result.r} из {result.n}</h1>
            {submission.isPending && <div className="mq-status" role="status"><Spin size="small" /> Сохраняем результат…</div>}
            {submission.isError && !resultSaved && <Alert type="error" showIcon title="Не удалось сохранить результат"
              description={submission.error.message} />}
            {resultSaved ? <Button type="primary" size="large" onClick={() => move(1)}>
              {following?.kind === 'finish' ? 'Завершить квиз' : 'Следующий раунд'}
            </Button> : !submission.isPending && <Button type="primary" size="large"
              onClick={() => submission.mutate({ roundId: step.round.id, attemptId: game.attemptId })}>Повторить сохранение</Button>}
          </section>}

          {step.kind === 'finish' && <section className="mq-stage mq-round mq-finish">
            <Splash answer />
            <div className="mq-kicker">КВИЗ ЗАВЕРШЁН</div>
            <div className="mq-round-symbol" aria-hidden="true">✦</div>
            <h1 ref={heading} tabIndex={-1}>{score.points} из 100 очков</h1>
            <p>Ваше звание — <strong>{score.rank}</strong></p>
            <p>Угадано {correct} из {playable} в квизе «{game.pack.name}».</p>
            <Button type="primary" size="large" icon={<UnorderedListOutlined />} onClick={goToCatalog}>К списку квизов</Button>
          </section>}

          <div className="mq-game-controls">
            <Button icon={<ArrowLeftOutlined />} disabled={game.index === 0 || submission.isPending || answerSubmission.isPending}
              onClick={() => move(-1)}>Назад</Button>
            {step.kind === 'question' && <Button type={question && !submitted ? 'default' : 'primary'}
              disabled={!!question && !submitted} onClick={() => move(1)}
              icon={<ArrowRightOutlined />} iconPlacement="end">{lastQuestion ? 'Завершить раунд' : 'Следующий вопрос'}</Button>
            }
          </div>
        </>}
      </div>
    </main>

    <footer className="mq-footer"><span>♫ MUSIC QUIZ</span><span>Поставьте музыку погромче <b>✦</b></span></footer>

    <audio ref={media} hidden preload="none" onPlaying={audio.onPlaying} onPause={audio.onStop}
      onEnded={audio.onStop} onTimeUpdate={audio.onTimeUpdate} onError={audio.onError} />
    <Modal open={sound === null} closable={false} mask={{ closable: false }} centered width={460}
      onCancel={() => changeSound(false)} className="mq-sound-modal"
      title={<><span className="mq-modal-icon"><CustomerServiceOutlined /></span><span>Включим звук?</span></>}
      footer={<><Button onClick={() => changeSound(false)}>Без звука</Button>
        <Button type="primary" icon={<SoundOutlined />} onClick={() => changeSound(true)}>Включить звук</Button></>}>
      <p>Треки будут запускаться сами, когда вы открываете вопрос. Звук можно переключить в любой момент.</p>
    </Modal>
  </div>;
}
