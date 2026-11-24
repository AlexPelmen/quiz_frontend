import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, Button, Empty, Image, Modal, Progress, Spin, Tag } from 'antd';
import type { AutoComplete, GetRef } from 'antd';
import {
  ArrowLeftOutlined, ArrowRightOutlined, CustomerServiceOutlined, LogoutOutlined, MutedOutlined, PauseOutlined,
  PlayCircleFilled, SoundOutlined, UserOutlined,
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
const clipSeconds = 30;
const tickSeconds = 5;
const questionSeconds = clipSeconds + tickSeconds;
const countdownTicks = new URL('./countdown-ticks.mp3', import.meta.url).href;

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
  deadlines: Partial<Record<string, number>>;
  results: Partial<Record<string, RoundResult>>;
  saved: Set<string>;
};

const numberLabel = (number: number) => String(number).padStart(2, '0');
const questionPlural = new Intl.PluralRules('ru');

function Tags({ tags }: { tags: QuizPackSummary['tags'] }) {
  return tags?.length ? <span className="mq-tags">{tags.map((tag, index) => <Tag key={`${tag}-${index}`}>{tag}</Tag>)}</span> : null;
}

function PackRow({ pack, onOpen }: { pack: QuizPackSummary; onOpen: () => void }) {
  const [failedCover, setFailedCover] = useState<string>();
  const cover = pack.cover_download_id;
  const difficulty = pack.difficulty === 'easy' || pack.difficulty === 'hard' ? pack.difficulty : 'medium';
  const count = pack.questions_total;
  const plural = count === undefined ? undefined : questionPlural.select(count);
  return <Button block className="mq-pack-row" onClick={onOpen}
    icon={<ArrowRightOutlined />} iconPlacement="end">
    <span className="mq-pack-art">
      {cover && cover !== failedCover ? <img src={fileURL(cover)} alt="" loading="lazy" onError={() => setFailedCover(cover)} />
        : <CustomerServiceOutlined aria-hidden="true" />}
    </span>
    <span className="mq-pack-copy">
      <strong>{pack.name}</strong>
      <span className="mq-pack-meta">
        {count !== undefined && <span>{count} {plural === 'one' ? 'вопрос' : plural === 'few' ? 'вопроса' : 'вопросов'}</span>}
        <Tag className="mq-difficulty" data-difficulty={difficulty}>{difficultyLabels[difficulty]}</Tag>
      </span>
      <Tags tags={pack.tags} />
    </span>
  </Button>;
}

function QuizImage({ src }: { src: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <Alert showIcon type="warning" title="Изображение вопроса недоступно" />
    : <Image className="mq-question-image" src={src} onError={() => setFailed(true)} alt="Изображение-подсказка к вопросу" preview={false} />;
}

function QuestionTimer({ remaining, label }: { remaining: number; label: string }) {
  const urgent = remaining <= tickSeconds;
  const progress = remaining / questionSeconds * 100;
  const colors = urgent ? '#fff200, #ff7700' : '#c5ff00, #00ffc2';
  return <div className="mq-countdown" data-urgent={urgent}>
    <div className="mq-countdown-ring" style={{ backgroundImage: `conic-gradient(${colors} ${progress}%, #2c2c36 0)` }}>
      <span role="timer" aria-label={`Осталось секунд: ${remaining}`}>{numberLabel(remaining)}</span>
    </div>
    {label && <span className="mq-countdown-label">{label}</span>}
  </div>;
}

export function QuizPlayer() {
  const { can, logout, logoutError, logoutPending } = useAuth();
  const [sound, setSound] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const [clock, setClock] = useState({ deadline: 0, seconds: questionSeconds });
  const sendingAnswer = useRef(false);
  const media = useRef<HTMLAudioElement>(null);
  const audio = useQuizAudio(media);
  const heading = useRef<HTMLHeadingElement>(null);
  const answerField = useRef<GetRef<typeof AutoComplete>>(null);
  const retryTimeout = useRef<GetRef<typeof Button>>(null);
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
    mutationFn: ({ questionId, attemptId, option }: { questionId: string; attemptId: string; option?: AnswerOption }) =>
      save<SubmittedAnswer>(`/questions/${encodeURIComponent(questionId)}/answer`, 'POST', {
        attempt_id: attemptId,
        ...(option ? { option_id: option.id, option_type: option.type } : { timed_out: true }),
      }),
    onSuccess: (answer, { questionId, attemptId }) => {
      setGame(current => current?.attemptId === attemptId
        ? { ...current, answers: { ...current.answers, [questionId]: answer } } : current);
    },
    onSettled: () => { sendingAnswer.current = false; },
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
  const clipDuration = Math.min(clipSeconds, Math.max(0, (question?.trackFinishSec ?? 0) - (question?.trackStartSec ?? 0)) || clipSeconds);
  const deadline = question ? game?.deadlines[question.id] : undefined;
  const remaining = clock.deadline === deadline ? clock.seconds : questionSeconds;
  const revealed = !!submitted;
  const timeoutFailed = answerSubmission.isError && !answerSubmission.variables?.option;
  const audioSource = deadline === undefined || revealed || answerSubmission.isPending || remaining === 0 ? null
    : remaining <= tickSeconds ? countdownTicks : remaining > questionSeconds - clipDuration ? clip : null;
  const completedFiles = packMedia.status === 'ready' ? packMedia.total : packMedia.status === 'loading' ? packMedia.loaded : 0;
  const screen = game ? `${game.attemptId}-${game.index}` : selected ? `pack-${selected}-${!!pack}` : 'catalog';

  useEffect(() => {
    if (answerField.current && !window.matchMedia('(pointer: coarse)').matches) {
      answerField.current.focus({ preventScroll: true });
    } else if (screen !== 'catalog' || document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [screen, revealed]);

  useEffect(() => {
    if (timeoutFailed) retryTimeout.current?.focus();
  }, [timeoutFailed]);

  function move(offset: number) {
    if (!game || submission.isPending || sendingAnswer.current) return;
    if (offset > 0 && ((question && !submitted) || (result && !resultSaved))) return;
    const index = game.index + offset;
    const next = game.steps[index];
    if (!next) return;
    answerSubmission.reset();
    if (next.kind === 'result' && !game.results[next.round.id]) {
      const questions = next.round.questions.filter(q => !q.deleted);
      if (questions.some(q => !game.answers[q.id])) return;
      const result = { n: questions.length, r: questions.filter(q => game.answers[q.id]?.correct).length };
      setGame({ ...game, index, results: { ...game.results, [next.round.id]: result } });
      submission.mutate({ roundId: next.round.id, attemptId: game.attemptId });
      return;
    }
    const nextQuestion = next.kind === 'question' && !next.question.deleted ? next.question.id : undefined;
    const deadlines = nextQuestion && game.deadlines[nextQuestion] === undefined
      ? { ...game.deadlines, [nextQuestion]: performance.now() + questionSeconds * 1000 } : game.deadlines;
    setGame({ ...game, index, deadlines });
  }

  function submitAnswer(option?: AnswerOption) {
    if (!game || !question || revealed || deadline === undefined || sendingAnswer.current) return;
    const acceptedOption = performance.now() < deadline ? option : undefined;
    sendingAnswer.current = true;
    audio.load(null);
    answerSubmission.mutate({ questionId: question.id, attemptId: game.attemptId, option: acceptedOption });
  }

  const updateClock = useEffectEvent((end: number) => {
    const time = Math.max(0, end - performance.now());
    const seconds = Math.ceil(time / 1000);
    setClock(current => current.deadline === end && current.seconds === seconds ? current : { deadline: end, seconds });
    if (!time && !timeoutFailed && !answerSubmission.isPending) submitAnswer();
    return time;
  });

  useEffect(() => {
    if (deadline === undefined || revealed) return;
    let timer: number;
    function update(end: number) {
      const time = updateClock(end);
      if (time > 0) timer = window.setTimeout(() => update(end), Math.max(12, time % 1000 || 1000));
    }
    update(deadline);
    return () => window.clearTimeout(timer);
  }, [deadline, revealed, timeoutFailed, answerSubmission.isPending]);

  function loadQuestionAudio(enabled: boolean) {
    if (audioSource && deadline !== undefined) {
      const elapsed = questionSeconds - (deadline - performance.now()) / 1000;
      const tick = audioSource === countdownTicks;
      const offset = Math.max(0, elapsed - (tick ? clipSeconds : 0));
      if (offset < (tick ? tickSeconds : clipDuration)) {
        audio.load(audioSource, enabled, tick && offset < .12 ? 0 : offset);
        return;
      }
    }
    audio.load(null);
  }

  const syncAudio = useEffectEvent(() => loadQuestionAudio(sound === true));
  useEffect(() => {
    syncAudio();
  }, [audioSource, deadline]);

  function togglePlayback() {
    if (!clip || audioSource !== clip) return;
    if (sound) audio.toggle();
    else changeSound(true);
  }

  function goToCatalog() {
    if (submission.isPending || sendingAnswer.current) return;
    submission.reset();
    answerSubmission.reset();
    audio.load(null);
    setGame(null);
    setSelected(null);
  }

  function changeSound(enabled: boolean) {
    setSound(enabled);
    if (audioSource) loadQuestionAudio(enabled);
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
    } else if (clip && audioSource === clip && event.code === 'Space') {
      event.preventDefault();
      togglePlayback();
    }
  });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKeyDown(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const loadError = selected ? detail.error : packs.error;
  const lastQuestion = step?.kind === 'question' && step.position === step.round.questions.length;
  const following = game?.steps[game.index + 1];
  const showingClue = !!(hint || questionMedia?.image);
  const countdownLabel = clip ? remaining <= questionSeconds - clipDuration ? 'Отрывок закончился'
    : !sound ? 'Звук выключен' : audio.playing ? 'Отрывок играет' : 'Отрывок на паузе' : '';
  const profileLabel = can('packs') ? 'Студия пакетов' : 'Мой профиль';

  return <div className="mq">
    <header className="mq-header">
      <button className="mq-brand" onClick={goToCatalog} aria-label="Music Quiz, к списку пакетов">
        MUSIC<span className="mq-brand-accent">QUIZ</span>
      </button>
      <nav aria-label="Навигация">
        <Button type="text" className="mq-icon-button" aria-label="Звук" title={sound ? 'Выключить звук' : 'Включить звук'}
          aria-pressed={sound === true} disabled={sound === null} icon={sound ? <SoundOutlined /> : <MutedOutlined />} onClick={() => changeSound(!sound)} />
        <Button type="text" className="mq-icon-button" href={can('packs') ? '/admin#packs' : '/admin#profile'}
          aria-label={profileLabel} title={profileLabel} icon={<UserOutlined />} />
        <Button type="text" className="mq-icon-button" aria-label="Выйти" title="Выйти" icon={<LogoutOutlined />}
          onClick={logout} loading={logoutPending} />
      </nav>
    </header>

    <main className="mq-main">
      {logoutError && <Alert showIcon type="error" title={logoutError.message} />}
      {audio.error && !question && <Alert type="warning" showIcon title={audio.error} />}
      <div key={screen} className="mq-screen">
        {!selected &&
          <section id="packs" className="mq-catalog" aria-labelledby="packs-title">
            <h1 id="packs-title" ref={heading} tabIndex={-1}>Пакеты квизов</h1>
            {packs.isPending && <div className="mq-status" role="status"><Spin /> Загружаем пакеты…</div>}
            {loadError && <Alert type="error" showIcon title="Не удалось загрузить список пакетов" description={loadError.message}
              action={<Button onClick={() => void packs.refetch()} loading={packs.isFetching}>Повторить</Button>} />}
            {packs.isSuccess && !packs.data?.length && <Empty className="mq-empty"
              description={page === 1 ? 'Пакетов пока нет. Создайте первый в студии.' : 'На этой странице пакетов нет.'}>
              {page === 1 && can('packs') && <Button href="/admin#packs">Открыть студию пакетов</Button>}
            </Empty>}
            <div className="mq-pack-list">{packs.data?.map(item => <PackRow key={item.id} pack={item} onOpen={() => setSelected(item.id)} />)}</div>
            {(page > 1 || (packs.data?.length ?? 0) >= pageSize) && <div className="mq-pager">
              <Button icon={<ArrowLeftOutlined />} disabled={page === 1} onClick={() => setPage(page - 1)}>Назад</Button>
              <span>Страница {page}</span>
              <Button icon={<ArrowRightOutlined />} iconPlacement="end" disabled={(packs.data?.length ?? 0) < pageSize}
                onClick={() => setPage(page + 1)}>Далее</Button>
            </div>}
          </section>}

        {selected && !game && <>
          <Button type="text" className="mq-back" icon={<ArrowLeftOutlined />} onClick={goToCatalog}>Все пакеты</Button>
          {detail.isPending && <div className="mq-status" role="status"><Spin /> Загружаем пакет…</div>}
          {loadError && <Alert type="error" showIcon title="Не удалось загрузить пакет" description={loadError.message}
            action={<Button onClick={() => void detail.refetch()}>Повторить</Button>} />}
          {pack && <section className="mq-stage mq-detail">
            <h1 ref={heading} tabIndex={-1}>{pack.name}</h1>
            {pack.cover_download_id && <img className="mq-detail-cover" src={fileURL(pack.cover_download_id)} alt="Обложка пакета" />}
            <Tag className="mq-difficulty" data-difficulty={pack.difficulty ?? 'medium'}>{difficultyLabels[pack.difficulty ?? 'medium']}</Tag>
            {pack.description && <p>{pack.description}</p>}
            <Tags tags={pack.tags} />
            <div className="mq-pack-stats">
              <span>Раунды <strong>{rounds.length}</strong></span>
              <span>Вопросы <strong>{total}</strong></span>
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
            <Button size="large" type="primary" disabled={!total || packMedia.status !== 'ready'}
              onClick={() => {
                if (packMedia.status !== 'ready') return;
                setGame({ pack, media: packMedia.questions, steps: gameSteps(rounds), index: 0, attemptId: crypto.randomUUID(),
                  answers: {}, deadlines: {}, results: {}, saved: new Set() });
              }}>Начать</Button>
          </section>}
        </>}

        {game && step && <>
          {game.index > 0 && <div className="mq-game-controls" data-question={step.kind === 'question'}>
            <Button type="text" className="mq-back" icon={<ArrowLeftOutlined />} disabled={submission.isPending || answerSubmission.isPending}
              onClick={() => move(-1)}>Назад</Button>
          </div>}

          {step.kind === 'round' && rule && <section className="mq-stage mq-round">
            <h1 ref={heading} tabIndex={-1}>{rule.name}</h1>
            <p>{rule.instructions}</p>
            <p className="mq-round-time">{step.round.questions.some(item => game.media.get(item.id)?.audio)
              ? 'До 30 секунд звучит отрывок. Всего 35 секунд на ответ.' : '35 секунд на каждый ответ.'}</p>
            <Button type="primary" size="large" onClick={() => move(1)}>Играть</Button>
          </section>}

          {step.kind === 'question' && <section className="mq-stage mq-question" data-revealed={revealed}>
            <div className="mq-question-progress">
              <div>Вопрос {numberLabel(step.position)} / {numberLabel(step.round.questions.length)}</div>
              <Progress aria-label="Прогресс раунда" percent={step.position / step.round.questions.length * 100}
                steps={step.round.questions.length} showInfo={false} strokeColor="#c5ff00" railColor="#2c2c36" />
            </div>
            {!submitted && <h1 className="mq-question-title" ref={heading} tabIndex={-1}>{step.question.primary_text}</h1>}
            {question && <div className="mq-question-time" data-compact={showingClue}>
              {!revealed && <QuestionTimer remaining={remaining} label={countdownLabel} />}
              {!revealed && !!clip && <Button shape="circle" className="mq-playback"
                disabled={audioSource !== clip} aria-label={audio.playing && audioSource === clip ? 'Пауза' : 'Воспроизвести фрагмент'}
                icon={audio.playing && audioSource === clip ? <PauseOutlined /> : <PlayCircleFilled />} onClick={togglePlayback} />}
              <QuestionFeedback questionID={question.id} revealed={revealed} />
            </div>}
            {submitted ? <QuizAnswer answer={submitted} headingRef={heading} roundType={step.round.type} clueImage={questionMedia?.image} />
              : question && <div className="mq-question-body">
                {hint && <div className="mq-hint">{hint}</div>}
                {questionMedia?.image && <QuizImage src={questionMedia.image} />}
                {remaining > 0 ? <QuizAnswerInput fieldRef={answerField} preferred={step.round.type === 'track_vowels' ? 'track' : 'artist'}
                  pending={answerSubmission.isPending} error={answerSubmission.error} onSubmit={submitAnswer} />
                  : <div className="mq-timeout" role="status">
                    {timeoutFailed ? <Alert type="error" showIcon title="Не удалось сохранить пропуск"
                      description={answerSubmission.error?.message} action={<Button ref={retryTimeout} onClick={() => submitAnswer()}>Повторить</Button>} />
                      : <><Spin size="small" /> Открываем правильный ответ…</>}
                  </div>}
                {audio.error && <Alert className="mq-question-error" type="warning" showIcon title={audio.error} />}
              </div>}
            {(!question || revealed) && <Button className="mq-next-question" size="large" type="primary" onClick={() => move(1)}>
              {lastQuestion ? 'Завершить раунд' : 'Следующий вопрос'} <kbd>Enter</kbd>
            </Button>}
          </section>}

          {step.kind === 'result' && result && <section className="mq-stage mq-round">
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
            <h1 ref={heading} tabIndex={-1}>{score.points} из 100 очков</h1>
            <p>Ваше звание — <strong>{score.rank}</strong></p>
            <p>Угадано {correct} из {playable} в квизе «{game.pack.name}».</p>
            <Button type="primary" size="large" onClick={goToCatalog}>К списку квизов</Button>
          </section>}

        </>}
      </div>
    </main>

    <audio ref={media} hidden preload="none" onPlaying={audio.onPlaying} onPause={audio.onStop}
      onEnded={audio.onStop} onError={audio.onError} />
    <Modal open={sound === null} closable={false} mask={{ closable: false }} centered width={460}
      onCancel={() => changeSound(false)} className="mq-sound-modal"
      title="Включим звук?"
      footer={<><Button onClick={() => changeSound(false)}>Без звука</Button>
        <Button type="primary" icon={<SoundOutlined />} onClick={() => changeSound(true)}>Включить звук</Button></>}>
      <p>Треки будут запускаться сами, когда вы открываете вопрос. Звук можно переключить в любой момент.</p>
    </Modal>
  </div>;
}
