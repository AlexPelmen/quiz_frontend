import { useRef, useState } from 'react';
import type { RefObject } from 'react';

// 10 ms of silent PCM lets the consent button activate the same media element used in the game.
const silence = 'data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';
const clipError = 'Не удалось загрузить аудио. Попробуйте воспроизвести фрагмент ещё раз.';

export function useQuizAudio(ref: RefObject<HTMLAudioElement | null>) {
  const attempt = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState('');

  function play() {
    const audio = ref.current;
    if (!audio) return;
    const currentAttempt = ++attempt.current;
    if (audio.error) audio.load();
    setError('');
    void audio.play().catch(reason => {
      if (attempt.current !== currentAttempt) return;
      setPlaying(false);
      const blocked = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setError(blocked ? 'Браузер заблокировал запуск звука. Включите звук вручную.' : clipError);
    });
  }

  function load(url: string | null, autoplay = false, offset = 0) {
    const audio = ref.current;
    if (!audio) return;
    ++attempt.current;
    audio.pause();
    if (url) audio.src = url;
    else audio.removeAttribute('src');
    audio.load();
    if (url && offset > 0) audio.currentTime = offset;
    setPlaying(false);
    setError('');
    if (autoplay && url) play();
  }

  function toggle() {
    const audio = ref.current;
    if (!audio?.getAttribute('src')) return;
    if (audio.paused) play();
    else {
      ++attempt.current;
      audio.pause();
    }
  }

  return {
    playing, error, activate: () => load(silence, true), load, toggle,
    onPlaying: () => {
      if (ref.current?.getAttribute('src') !== silence) setPlaying(true);
    },
    onStop: () => setPlaying(false),
    onError: () => {
      const audio = ref.current;
      if (audio?.error && audio.getAttribute('src') !== silence) setError(clipError);
    },
  };
}
