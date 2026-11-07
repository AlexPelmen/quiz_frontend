import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { CheckOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { fileURL, request } from '../api';
import type { QuizQuestion } from '../quiz';

const labels: Record<string, string> = { artist: 'Исполнитель', track: 'Трек', album: 'Альбом', release: 'Релиз' };

async function trackAlbum(trackId: string | null, signal: AbortSignal) {
  if (!trackId) return null;
  const track = await request<{ album_id: string | null }>(`/tracks/${encodeURIComponent(trackId)}`, { signal });
  if (!track.album_id) return null;
  return request<{ cover_download_id: string | null; release_date: string }>(
    `/albums/${encodeURIComponent(track.album_id)}`, { signal },
  );
}

function AnswerImage({ id, showBackdrop }: { id: string; showBackdrop: boolean }) {
  const [failed, setFailed] = useState(false);
  const src = fileURL(id);
  return failed
    ? <span className="mq-answer-image-error">Изображение недоступно</span>
    : <>
      {showBackdrop && <span className="mq-answer-backdrop" aria-hidden="true" style={{ backgroundImage: `url("${src}")` }} />}
      <img className="mq-answer-image" src={src} alt="" onError={() => setFailed(true)} />
    </>;
}

export function QuizAnswer({ question, roundType }: { question: QuizQuestion; roundType: string }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const isTrack = roundType === 'track_vowels';
  const knownLogo = roundType === 'artist_by_logo' ? question.image_download_id : null;
  const artist = useQuery({
    queryKey: ['answer-artist', question.artist_id],
    queryFn: ({ signal }) => request<{ logo_download_id: string | null }>(
      `/artists/${encodeURIComponent(question.artist_id)}`, { signal },
    ),
    enabled: !isTrack && !knownLogo && !!question.artist_id,
  });
  const album = useQuery({
    queryKey: ['answer-album', question.track_id],
    queryFn: ({ signal }) => trackAlbum(question.track_id, signal),
    enabled: isTrack && !!question.track_id,
  });
  const artworkId = isTrack ? album.data?.cover_download_id : knownLogo ?? artist.data?.logo_download_id;
  const artworkQuery = isTrack ? album : artist;
  const facts = Object.entries({
    ...question.answer_info,
    ...(album.data?.release_date ? { release: album.data.release_date } : {}),
  }).filter(([key, value]) =>
    key !== (isTrack ? 'track' : 'artist') && (
      (typeof value === 'string' && value.trim() && value !== question.answer) || typeof value === 'number'
    ),
  );

  return <div className="mq-answer" id="mq-answer" ref={card}>
    <div className="mq-answer-art" data-kind={isTrack ? 'track' : 'artist'}>
      <CustomerServiceOutlined className="mq-answer-placeholder" aria-hidden="true" />
      {artworkId && <AnswerImage key={artworkId} id={artworkId} showBackdrop={!isTrack} />}
      <div className="mq-answer-caption" role="status">
        <div className="mq-kicker"><CheckOutlined /> {isTrack ? 'УГАДЫВАЛИ ТРЕК' : 'УГАДЫВАЛИ ИСПОЛНИТЕЛЯ'}</div>
        <h2>{question.answer}</h2>
      </div>
      {artworkQuery.isLoading && <div className="mq-answer-loading"><Spin size="small" aria-label="Загружаем изображение" /></div>}
      {artworkQuery.isError && !artworkId && <span className="mq-answer-image-error" role="status">Изображение недоступно</span>}
    </div>
    {facts.length > 0 && <dl>{facts.map(([key, value]) =>
      <div key={key}><dt>{labels[key] ?? key}</dt><dd>{String(value)}</dd></div>,
    )}</dl>}
  </div>;
}
