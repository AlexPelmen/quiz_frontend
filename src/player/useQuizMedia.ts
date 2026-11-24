import { useEffect, useState } from 'react';
import { fileURL, requestBlob } from '../api';
import { questionAudioURL, questionCoverURL, type QuizPack } from '../quiz';

export type QuestionMedia = { audio?: string; image?: string };

type MediaState =
  | { status: 'preparing' }
  | { status: 'loading'; loaded: number; total: number }
  | { status: 'ready'; questions: ReadonlyMap<string, QuestionMedia>; total: number }
  | { status: 'error'; message: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

async function forEachConcurrent<T>(items: readonly T[], signal: AbortSignal, load: (item: T) => Promise<void>) {
  let next = 0;
  async function worker() {
    while (next < items.length && !signal.aborted) {
      await load(items[next++]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, worker));
}

async function prepareMedia(pack: QuizPack, files: Map<string, string>, signal: AbortSignal, update: (state: MediaState) => void) {
  const questions = (pack.rounds ?? []).flatMap(round => round.questions.map(question => ({ question, roundType: round.type })));
  const sources = new Map<string, QuestionMedia>();
  const downloads = new Map<string, string>();

  for (const { question, roundType } of questions) {
    if (question.deleted) continue;
    const audio = question.sound_download_id ? questionAudioURL(pack.id, question.number) : undefined;
    const image = roundType === 'artist_by_cover' ? questionCoverURL(pack.id, question.number)
      : question.image_download_id ? fileURL(question.image_download_id) : undefined;
    if (audio) downloads.set(audio, `аудиофрагмент к вопросу №${question.number}`);
    if (image && !downloads.has(image)) downloads.set(image, `изображение к вопросу №${question.number}`);
    sources.set(question.id, { audio, image });
  }

  signal.throwIfAborted();
  const total = downloads.size;
  let loaded = 0;
  if (total) update({ status: 'loading', loaded, total });
  await forEachConcurrent([...downloads], signal, async ([url, label]) => {
    try {
      const blob = await requestBlob(url, signal);
      signal.throwIfAborted();
      files.set(url, URL.createObjectURL(blob));
      update({ status: 'loading', loaded: ++loaded, total });
    } catch (error) {
      throw new Error(`Не удалось загрузить ${label}. ${errorMessage(error)}`);
    }
  });

  signal.throwIfAborted();
  const localURL = (url?: string) => url ? files.get(url) : undefined;
  for (const media of sources.values()) {
    media.audio = localURL(media.audio);
    media.image = localURL(media.image);
  }
  update({ status: 'ready', questions: sources, total });
}

export function useQuizMedia(pack: QuizPack | undefined) {
  const [attempt, setAttempt] = useState(0);
  const [load, setLoad] = useState<{ pack: QuizPack; attempt: number; state: MediaState }>();

  useEffect(() => {
    if (!pack?.rounds?.some(round => round.questions.length)) return;
    const controller = new AbortController();
    const files = new Map<string, string>();
    const update = (state: MediaState) => setLoad({ pack, attempt, state });
    function release() {
      controller.abort();
      for (const url of files.values()) URL.revokeObjectURL(url);
      files.clear();
    }

    void prepareMedia(pack, files, controller.signal, update).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      release();
      update({ status: 'error', message: errorMessage(error) });
    });
    return release;
  }, [pack, attempt]);

  const state: MediaState = load && load.pack === pack && load.attempt === attempt ? load.state : { status: 'preparing' };
  return { state, retry: () => setAttempt(current => current + 1) };
}
