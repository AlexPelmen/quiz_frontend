export interface QuizPackSummary {
  id: string;
  name: string;
  description: string;
  tags: string[] | null;
  created_at: string;
  difficulty?: string;
  cover_download_id?: string | null;
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

export const difficultyLabels: Record<string, string> = { easy: 'Лёгкий', medium: 'Средний', hard: 'Сложный' };

const ranks = ['Днище', 'Говнарь', 'Лох', 'Чушпан', 'Вася', 'Кренделёк', 'Башка', 'Бывалый', 'Суровый', 'Божество'];

export function quizScore(correct: number, total: number) {
  const points = total ? Math.round(correct * 100 / total) : 0;
  return { points, rank: ranks[Math.min(9, Math.floor(points / 10))] };
}

export const questionAudioURL = (packId: string, number: number) =>
  `/api/v1/quiz-packs/${encodeURIComponent(packId)}/questions/${number}/audio`;

export const questionCoverURL = (packId: string, number: number) =>
  `/api/v1/quiz-packs/${encodeURIComponent(packId)}/questions/${number}/cover`;

export function questionHint(text: string, roundType: string, answer?: string) {
  if (roundType === 'artist_cities' || roundType === 'artist_alphabet') return '';
  // В ранее созданных пакетах начальные A и An ошибочно пропускались.
  if (roundType === 'artist_initial' && /^\s*a(?:n)?\s+\S/iu.test(answer || '')) return 'A/А';
  // В сохранённых пакетах согласные могли быть записаны как подчёркивания.
  return roundType === 'track_vowels' ? text.replaceAll('_', '').replace(/\s+/g, ' ').trim().toLowerCase() : text;
}

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
    instructions: 'Прослушайте отрывок и назовите трек. В подсказке пропущены согласные, а гласные показаны строчными буквами.',
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
    instructions: 'Послушайте трек и назовите исполнителя. Подсказка показывает первую букву на латинице и кириллице. В начале названия пропускается только артикль The.',
    label: 'По первой букве',
    symbol: 'Б',
  },
  artist_by_albums: {
    name: 'По списку альбомов',
    instructions: 'Назовите исполнителя, выпустившего эти альбомы.',
    label: 'По альбомам',
    symbol: '▤',
  },
  artist_cities: {
    name: 'Игра в города',
    instructions: 'Угадайте исполнителей по трекам. В латинской записи каждый следующий начинается с последней буквы предыдущего. Артикли The, A и An пропускаются.',
    label: 'Цепочка',
    symbol: '↪',
  },
  artist_growth: {
    name: 'На вырост',
    instructions: 'Угадайте исполнителей по трекам. В каждом следующем названии больше букв. Пробелы, цифры и знаки не считаются.',
    label: 'На вырост',
    symbol: '↗',
  },
  artist_alphabet: {
    name: 'Алфавит',
    instructions: 'Угадайте исполнителей по трекам. Первая буква каждого следующего названия идёт дальше по латинскому алфавиту.',
    label: 'Алфавит',
    symbol: 'A',
  },
};

export const roundOptions = Object.entries(roundRules).map(([value, rule]) => ({ value, label: rule.name }));

export const ruleFor = (type: string) => roundRules[type] ?? {
  name: 'Музыкальный раунд',
  instructions: 'Читайте задание и используйте подсказки, изображение и звук, если они есть.',
  label: 'Музыкальный раунд',
  symbol: '♪',
};
