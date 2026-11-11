import { useEffect, useRef, useState } from 'react';
import { Spin } from 'antd';
import { CheckOutlined, CustomerServiceOutlined } from '@ant-design/icons';
import { useQuery } from '@tanstack/react-query';
import { fileURL, request } from '../api';
import { questionName, type QuizQuestion } from '../quiz';

const labels: Record<string, string> = { artist: 'Исполнитель', track: 'Трек', album: 'Альбом', release: 'Релиз' };

async function trackAlbum(trackId: string | null, signal: AbortSignal) {
  if (!trackId) return null;
  const track = await request<{ album_id: string | null }>(`/tracks/${encodeURIComponent(trackId)}`, { signal });
  if (!track.album_id) return null;
  return request<{ cover_download_id: string | null; release_date: string }>(
    `/albums/${encodeURIComponent(track.album_id)}`, { signal },
  );
}

function AnswerImage({ id, fallbackId, showBackdrop }: { id: string; fallbackId?: string | null; showBackdrop: boolean }) {
  const [failed, setFailed] = useState(false);
  const [fallbackFailed, setFallbackFailed] = useState(false);
  const activeId = failed ? fallbackId : id;
  const src = activeId ? fileURL(activeId) : '';
  return !activeId || fallbackFailed
    ? <span className="mq-answer-image-error">Изображение недоступно</span>
    : <>
      {showBackdrop && <span className="mq-answer-backdrop" aria-hidden="true" style={{ backgroundImage: `url("${src}")` }} />}
      <img className="mq-answer-image" src={src} alt="" onError={() => failed ? setFallbackFailed(true) : setFailed(true)} />
    </>;
}

export function QuizAnswer({ question, roundType }: { question: QuizQuestion; roundType: string }) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    card.current?.scrollIntoView({ block: 'nearest' });
  }, []);

  const isTrack = roundType === 'track_vowels';
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
  const knownLogo = roundType === 'artist_by_logo' ? question.image_download_id : null;
  const artist = useQuery({
    queryKey: ['answer-artist', question.artist_id],
    queryFn: ({ signal }) => request<{ logo_download_id: string | null }>(
      `/artists/${encodeURIComponent(question.artist_id)}`, { signal },
    ),
    enabled: !knownLogo && !!question.artist_id,
  });
  const album = useQuery({
    queryKey: ['answer-album', question.track_id],
    queryFn: ({ signal }) => trackAlbum(question.track_id, signal),
    enabled: isTrack && !!question.track_id,
  });
  const artworkId = isTrack ? album.data?.cover_download_id ?? artist.data?.logo_download_id : knownLogo ?? artist.data?.logo_download_id;
  const artworkQuery = isTrack ? album : artist;
  const facts = Object.entries({
    ...Object.fromEntries(Object.entries(question.answer_info || {}).map(([key, value]) => [key, typeof value === 'string' ? questionName(value) : value])),
    ...(isTrack && displayedArtists ? { artist: displayedArtists } : {}),
    ...(album.data?.release_date ? { release: album.data.release_date } : {}),
  }).filter(([key, value]) =>
    key !== (isTrack ? 'track' : 'artist') && (
      (typeof value === 'string' && value.trim() && value !== question.answer) || typeof value === 'number'
    ),
  );

  return <div className="mq-answer" id="mq-answer" ref={card}>
    <div className="mq-answer-art" data-kind={isTrack ? 'track' : 'artist'}>
      <CustomerServiceOutlined className="mq-answer-placeholder" aria-hidden="true" />
      {artworkId && <AnswerImage key={artworkId} id={artworkId} fallbackId={isTrack && artworkId !== artist.data?.logo_download_id ? artist.data?.logo_download_id : null} showBackdrop={!isTrack} />}
      <div className="mq-answer-caption" role="status">
        <div className="mq-kicker"><CheckOutlined /> {isTrack ? 'УГАДЫВАЛИ ТРЕК' : 'УГАДЫВАЛИ ИСПОЛНИТЕЛЯ'}</div>
        <h2>{!isTrack && displayedArtists ? displayedArtists : questionName(question.answer)}</h2>
      </div>
      {artworkQuery.isLoading && <div className="mq-answer-loading"><Spin size="small" aria-label="Загружаем изображение" /></div>}
      {artworkQuery.isError && !artworkId && <span className="mq-answer-image-error" role="status">Изображение недоступно</span>}
      {contributors.isError && <span className="mq-answer-image-error" role="status">Не удалось загрузить всех исполнителей трека</span>}
    </div>
    {facts.length > 0 && <dl>{facts.map(([key, value]) =>
      <div key={key}><dt>{labels[key] ?? key}</dt><dd>{String(value)}</dd></div>,
    )}</dl>}
  </div>;
}
