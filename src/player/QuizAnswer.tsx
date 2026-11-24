import { useState, type RefObject } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fileURL, request } from '../api';
import { questionName, type QuizQuestion, type SubmittedAnswer } from '../quiz';

const labels: Record<string, string> = { artist: 'Исполнитель', track: 'Трек', album: 'Альбом', release: 'Релиз' };

type AnswerMedia = { image?: string; fallback?: string; releaseDate?: string };

async function answerMedia(question: QuizQuestion, isTrack: boolean, signal: AbortSignal): Promise<AnswerMedia> {
  const { artist_id: artistId, track_id: trackId } = question;
  const artist = artistId ? await request<{ logo_download_id: string | null; missing_fields?: string[] | null }>(
    `/artists/${encodeURIComponent(artistId)}`, { signal },
  ) : null;
  const logo = artist?.missing_fields?.includes('logo') ? null : artist?.logo_download_id;
  const logoURL = logo ? fileURL(logo) : undefined;
  if (!isTrack || !trackId) return { image: logoURL };

  const track = await request<{ album_id: string | null }>(`/tracks/${encodeURIComponent(trackId)}`, { signal });
  const album = track.album_id ? await request<{ cover_download_id: string | null; release_date: string; missing_fields?: string[] | null }>(
    `/albums/${encodeURIComponent(track.album_id)}`, { signal },
  ) : null;
  const cover = album?.missing_fields?.includes('cover') ? null : album?.cover_download_id;
  const coverURL = cover ? fileURL(cover) : undefined;
  return { image: logoURL ?? coverURL, fallback: logoURL && cover !== logo ? coverURL : undefined, releaseDate: album?.release_date };
}

function AnswerImage({ image, fallback }: { image: string; fallback?: string }) {
  const [src, setSrc] = useState<string | undefined>(image);
  return src ? <img className="mq-answer-photo" src={src} alt="" onError={() => setSrc(src === image ? fallback : undefined)} />
    : <span className="mq-answer-image-error" role="status">Изображение недоступно</span>;
}

export function QuizAnswer({ answer, headingRef, roundType, clueImage }: {
  answer: SubmittedAnswer;
  headingRef: RefObject<HTMLHeadingElement | null>;
  roundType: string;
  clueImage?: string;
}) {
  const { question } = answer;
  const verdict = answer.timed_out ? 'timeout' : answer.correct ? 'correct' : 'incorrect';
  const title = answer.timed_out ? 'Время вышло' : answer.correct ? 'Верно' : 'Неверно';
  const isTrack = roundType === 'track_vowels';
  const logoClue = roundType === 'artist_by_logo' ? clueImage : undefined;
  const mediaQuery = useQuery({
    queryKey: ['quiz-answer-media', question.artist_id, isTrack ? question.track_id : null],
    queryFn: ({ signal }) => answerMedia(question, isTrack, signal),
    enabled: !logoClue,
  });
  const media = logoClue ? { image: logoClue } : mediaQuery.data;
  const contributors = useQuery({
    queryKey: ['track-artists', question.track_id],
    queryFn: ({ signal }) => request<{ id: string; name: string }[]>(`/tracks/${encodeURIComponent(question.track_id || '')}/artists`, { signal }),
    enabled: !!question.track_id,
  });
  const names = contributors.data?.map(item => questionName(item.name)).filter(Boolean) || [];
  const selected = contributors.data?.find(item => item.id === question.artist_id)?.name;
  const selectedName = selected ? questionName(selected) : undefined;
  const artistNames = selectedName ? [selectedName, ...names.filter(name => name !== selectedName)] : names;
  const displayedArtists = artistNames.length > 1 ? artistNames.join(' и ') : '';
  const facts = Object.entries({
    ...Object.fromEntries(Object.entries(question.answer_info || {}).map(([key, value]) => [key, typeof value === 'string' ? questionName(value) : value])),
    ...(isTrack && displayedArtists ? { artist: displayedArtists } : {}),
    ...(media?.releaseDate ? { release: media.releaseDate } : {}),
  }).filter(([key, value]) =>
    key !== (isTrack ? 'track' : 'artist') && (
      (typeof value === 'string' && value.trim() && value !== question.answer) || typeof value === 'number'
    ),
  );

  return <div className="mq-answer" data-verdict={verdict}>
    {media?.image && <AnswerImage key={media.image} image={media.image} fallback={media.fallback} />}
    <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
    {verdict === 'incorrect' && <div className="mq-answer-given"><span>Ваш ответ</span><strong>{answer.text}</strong></div>}
    <div className="mq-answer-correct">
      <span>Правильный ответ</span>
      <h2>{!isTrack && displayedArtists ? displayedArtists : questionName(question.answer)}</h2>
    </div>
    {facts.length > 0 && <dl>{facts.map(([key, value]) =>
      <div key={key}><dt>{labels[key] ?? key}</dt><dd>{String(value)}</dd></div>,
    )}</dl>}
    {contributors.isError && <span className="mq-answer-image-error" role="status">Не удалось загрузить всех исполнителей трека</span>}
    {mediaQuery.isError && <span className="mq-answer-image-error" role="status">Изображение недоступно</span>}
  </div>;
}
