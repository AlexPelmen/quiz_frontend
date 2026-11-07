import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { Alert, Button, Card, Empty, Image, Modal, Progress, Spin, Tag } from 'antd';
import {
  ArrowDownOutlined, ArrowLeftOutlined, ArrowRightOutlined, ArrowUpOutlined,
  CalendarOutlined, CustomerServiceOutlined, MutedOutlined, PauseOutlined,
  PlayCircleFilled, PlayCircleOutlined, ReloadOutlined, SoundOutlined, UnorderedListOutlined,
} from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { fileURL, request } from '../api';
import { questionAudioURL, ruleFor } from '../quiz';
import type { QuizPack, QuizPackSummary, QuizQuestion, QuizRound } from '../quiz';
import { QuizAnswer } from './QuizAnswer';
import { useQuizAudio } from './useQuizAudio';
import './player.css';

const pageSize = 12;
const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
const posterSymbols = ['♫', '✳', '◉', '♪', '✦', '∿'];
const wave = [10, 18, 12, 24, 32, 19, 26, 13, 22, 30, 16, 8];

type Step =
  | { kind: 'round'; round: QuizRound }
  | { kind: 'question'; round: QuizRound; question: QuizQuestion; position: number }
  | { kind: 'finish' };

function gameSteps(rounds: QuizRound[]): Step[] {
  const steps: Step[] = [];
  for (const round of rounds) {
    steps.push({ kind: 'round', round });
    round.questions.forEach((question, index) => steps.push({ kind: 'question', round, question, position: index + 1 }));
  }
  return [...steps, { kind: 'finish' }];
}

type Game = { pack: QuizPack; steps: Step[]; index: number; revealed: Set<string> };

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

function QuizImage({ id }: { id: string }) {
  const [failed, setFailed] = useState(false);
  return failed
    ? <Alert showIcon type="warning" title="Изображение вопроса недоступно" />
    : <Image className="mq-question-image" src={fileURL(id)} onError={() => setFailed(true)} alt="Изображение-подсказка к вопросу" preview={false} />;
}

export function QuizPlayer() {
  const [sound, setSound] = useState<boolean | null>(null);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [game, setGame] = useState<Game | null>(null);
  const media = useRef<HTMLAudioElement>(null);
  const audio = useQuizAudio(media);
  const heading = useRef<HTMLHeadingElement>(null);

  const packs = useQuery({
    queryKey: ['quiz-packs', 'player', page],
    queryFn: () => request<QuizPackSummary[]>(`/quiz-packs?limit=${pageSize}&offset=${(page - 1) * pageSize}`),
    enabled: selected === null,
  });
  const detail = useQuery({
    queryKey: ['quiz-pack', selected],
    queryFn: () => request<QuizPack>(`/quiz-packs/${encodeURIComponent(selected ?? '')}`),
    enabled: selected !== null && game === null,
  });
  const pack = game?.pack ?? detail.data;
  const rounds = (pack?.rounds ?? []).filter(round => round.questions.length > 0);
  const total = rounds.reduce((sum, round) => sum + round.questions.length, 0);
  const step = game?.steps[game.index];
  const question = step?.kind === 'question' ? step.question : null;
  const rule = step && step.kind !== 'finish' ? ruleFor(step.round.type) : null;
  const revealed = question !== null && (game?.revealed.has(question.id) ?? false);
  const clip = pack && question?.sound_download_id ? questionAudioURL(pack.id, question.number) : null;
  const screen = game ? `${game.pack.id}-${game.index}` : selected ? `pack-${selected}-${!!pack}` : 'catalog';

  useEffect(() => {
    if (screen !== 'catalog' || document.activeElement === document.body) {
      heading.current?.focus({ preventScroll: true });
    }
    window.scrollTo(0, 0);
  }, [screen]);

  function move(offset: number) {
    if (!game) return;
    const index = game.index + offset;
    const next = game.steps[index];
    if (!next) return;
    const url = next.kind === 'question' && next.question.sound_download_id
      ? questionAudioURL(game.pack.id, next.question.number) : null;
    audio.load(url, sound === true);
    setGame({ ...game, index });
  }

  function showAnswer(open: boolean) {
    if (!game || !question || revealed === open) return;
    const answers = new Set(game.revealed);
    if (open) answers.add(question.id);
    else answers.delete(question.id);
    setGame({ ...game, revealed: answers });
  }

  function togglePlayback() {
    if (!clip) return;
    if (!sound) setSound(true);
    audio.toggle();
  }

  function goToCatalog() {
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
    if (!game || sound === null || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.defaultPrevented) return;
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      move(event.key === 'ArrowRight' ? 1 : -1);
    } else if (question && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      showAnswer(event.key === 'ArrowDown');
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
        <Button type="text" href="/#packs" className="mq-admin">Студия пакетов</Button>
        <Button className="mq-sound-button" aria-pressed={sound === true} disabled={sound === null}
          icon={sound ? <SoundOutlined /> : <MutedOutlined />} onClick={() => changeSound(!sound)}>
          Звук <span className="mq-sound-state">{sound ? 'вкл.' : 'выкл.'}</span>
        </Button>
      </nav>
    </header>

    <main className="mq-main">
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
              {page === 1 && <Button href="/#packs">Открыть студию пакетов</Button>}
            </Empty>}
            <div className="mq-pack-grid">{packs.data?.map((item, index) => <Card className="mq-pack-card" key={item.id}
              cover={<div className="mq-poster" data-tone={index % 3} aria-hidden="true">
                <span>ПАКЕТ {numberLabel((page - 1) * pageSize + index + 1)}</span>
                <b>{posterSymbols[index % posterSymbols.length]}</b>
                <i>♪</i>
              </div>}>
              <h3>{item.name}</h3>
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
            <Button size="large" type="primary" icon={<PlayCircleOutlined />} disabled={!total}
              onClick={() => setGame({ pack, steps: gameSteps(rounds), index: 0, revealed: new Set() })}>Начать</Button>
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
              <Tag>{rule?.label}</Tag>
            </div>
            <Progress aria-label="Прогресс раунда" percent={step.position / step.round.questions.length * 100} showInfo={false} strokeColor="#b294ff" />
            <h1 ref={heading} tabIndex={-1}>{step.question.primary_text}</h1>
            {revealed ? <><Splash answer /><QuizAnswer question={step.question} roundType={step.round.type} /></> : <>
              {step.question.secondary_text && <div className="mq-hint">{step.question.secondary_text}</div>}
              {step.question.image_download_id && <QuizImage id={step.question.image_download_id} />}
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
            <Button size="large" type={revealed ? 'default' : 'primary'} aria-expanded={revealed}
              aria-controls={revealed ? 'mq-answer' : undefined}
              icon={revealed ? <ArrowUpOutlined /> : <ArrowDownOutlined />} onClick={() => showAnswer(!revealed)}>
              {revealed ? 'Скрыть ответ' : 'Показать ответ'}
            </Button>
          </section>}

          {step.kind === 'finish' && <section className="mq-stage mq-round mq-finish">
            <Splash answer />
            <div className="mq-kicker">КВИЗ ЗАВЕРШЁН</div>
            <div className="mq-round-symbol" aria-hidden="true">✦</div>
            <h1 ref={heading} tabIndex={-1}>Спасибо!</h1>
            <p>Вы дошли до конца квиза «{game.pack.name}».</p>
            <Button type="primary" size="large" icon={<UnorderedListOutlined />} onClick={goToCatalog}>К списку квизов</Button>
          </section>}

          <div className="mq-game-controls">
            <Button icon={<ArrowLeftOutlined />} disabled={game.index === 0} onClick={() => move(-1)}>Назад</Button>
            <span className="mq-key-hints"><span><kbd>←</kbd> <kbd>→</kbd> Навигация</span>
              {question && <><span><kbd>↓</kbd> Ответ</span><span><kbd>↑</kbd> Скрыть</span></>}
              {clip && <span><kbd>Пробел</kbd> Звук</span>}
            </span>
            {step.kind === 'question' ? <Button type={revealed ? 'primary' : 'default'} onClick={() => move(1)}
              icon={<ArrowRightOutlined />} iconPlacement="end">{following?.kind === 'finish' ? 'Завершить' : lastQuestion ? 'Следующий раунд' : 'Следующий вопрос'}</Button>
              : <span />}
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
