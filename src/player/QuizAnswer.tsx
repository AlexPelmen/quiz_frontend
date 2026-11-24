import { useEffect, useRef, useState } from 'react';
import { CheckOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
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
  return { image: cover ? fileURL(cover) : logoURL, fallback: cover && cover !== logo ? logoURL : undefined, releaseDate: album?.release_date };
}

function AnswerImage({ image, fallback, showBackdrop }: { image: string; fallback?: string; showBackdrop: boolean }) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const src = failed ? fallback : image;
  return !src || fallbackFailed
    ? <span className="mq-answer-image-error">Изображение недоступно</span>
    : <>
      {showBackdrop && <span className="mq-answer-backdrop" aria-hidden="true" style={{ backgroundImage: `url("${src}")` }} />}
      <img className="mq-answer-image" src={src} alt="" onError={() => failed ? setFallbackFailed(true) : setFailed(true)} />
    </>;
}

export function QuizAnswer({ answer, roundType, clueImage }: { answer: SubmittedAnswer; roundType: string; clueImage?: string }) {
  const { question } = answer;
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    card.current?.scrollIntoView({ block: 'nearest' });
  }, []);

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

  return <div className="mq-answer" id="mq-answer" ref={card} tabIndex={-1}>
    <Alert type={answer.correct ? 'success' : 'error'} showIcon
      title={answer.correct ? 'Правильно' : 'Неправильно'} description={`Ваш ответ: ${answer.text}`} />
    <div className="mq-answer-art" data-kind={isTrack ? 'track' : 'artist'}>
      <CustomerServiceOutlined className="mq-answer-placeholder" aria-hidden="true" />
      {media?.image && <AnswerImage key={media.image} image={media.image} fallback={media.fallback} showBackdrop={!isTrack} />}
      <div className="mq-answer-caption" role="status">
        <div className="mq-kicker"><CheckOutlined /> {isTrack ? 'УГАДЫВАЛИ ТРЕК' : 'УГАДЫВАЛИ ИСПОЛНИТЕЛЯ'}</div>
        <h2>{!isTrack && displayedArtists ? displayedArtists : questionName(question.answer)}</h2>
      </div>
      {contributors.isError && <span className="mq-answer-image-error" role="status">Не удалось загрузить всех исполнителей трека</span>}
      {mediaQuery.isError && <span className="mq-answer-image-error" role="status">Изображение недоступно</span>}
    </div>
    {facts.length > 0 && <dl>{facts.map(([key, value]) =>
      <div key={key}><dt>{labels[key] ?? key}</dt><dd>{String(value)}</dd></div>,
    )}</dl>}
  </div>;
}
