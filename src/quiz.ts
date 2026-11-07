export interface QuizPackSummary {
  id: string;
  name: string;
  description: string;
  tags: string[] | null;
  created_at: string;
}

export interface QuizPack extends QuizPackSummary {
  rounds?: QuizRound[];
}

export interface QuizRound {
  id: string;
  number: number;
  type: string;
  questions: QuizQuestion[];
}

export interface QuizQuestion {
  id: string;
  number: number;
  artist_id: string;
  track_id: string | null;
  album_id: string | null;
  primary_text: string;
  secondary_text: string;
  answer: string;
  answer_info: Record<string, unknown> | null;
  image_download_id: string | null;
  sound_download_id: string | null;
  trackStartSec: number | null;
  trackFinishSec: number | null;
}

export interface RoundResult {
  attempt_id: string;
  r: number;
  n: number;
  answers: Record<string, boolean>;
}

export const questionAudioURL = (packId: string, number: number) =>
  `/api/v1/quiz-packs/${encodeURIComponent(packId)}/questions/${number}/audio`;

const roundRules: Record<string, { name: string; instructions: string; label: string; symbol: string }> = {
  artist_by_track: {
    name: 'Кто звучит?',
    instructions: 'Прослушайте отрывок трека и назовите исполнителя.',
    label: 'На слух',
    symbol: '♫',
  },
  artist_by_cover: {
    name: 'Лицо альбома',
    instructions: 'Рассмотрите обложку альбома и назовите исполнителя, который его выпустил.',
    label: 'По обложке',
    symbol: '◉',
  },
  track_vowels: {
    name: 'Только гласные',
    instructions: 'Прослушайте отрывок и назовите трек. В подсказке оставлены гласные, а согласные заменены подчёркиваниями.',
    label: 'По гласным',
    symbol: 'А',
  },
  artist_by_logo: {
    name: 'Узнайте по изображению',
    instructions: 'Рассмотрите логотип или фотографию и назовите исполнителя.',
    label: 'По изображению',
    symbol: '✦',
  },
  artist_initial: {
    name: 'Первая буква',
    instructions: 'Послушайте трек и назовите исполнителя. Подсказка под вопросом — первая буква его имени.',
    label: 'По первой букве',
    symbol: 'Б',
  },
};

export const ruleFor = (type: string) => roundRules[type] ?? {
  name: 'Музыкальный раунд',
  instructions: 'Читайте задание и используйте подсказки, изображение и звук, если они есть.',
  label: 'Музыкальный раунд',
  symbol: '♪',
};
