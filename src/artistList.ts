export type ArtistListEntry = { original: string; body: { name: string } | { yt_music_url: string } };
export type ArtistListError = { input: string; message: string };

export function parseArtistList(text: string): { entries: ArtistListEntry[]; errors: ArtistListError[] } {
  const entries: ArtistListEntry[] = [];
  const errors: ArtistListError[] = [];
  const seen = new Set<string>();
  const items = text.replace(/\\(?=\r?\n)/gu, '').split(/[,;|\r\n\v\t]+/u).map(item => item.trim()).filter(Boolean);
  if (!items.length) errors.push({ input: '', message: 'Введите хотя бы одно имя или ссылку.' });
  for (const original of items) {
    let body: ArtistListEntry['body'];
    if (/^(?:https?:|\w+:\/\/|www\.|(?:music\.|m\.)?youtube\.com\/|youtu\.be\/)/iu.test(original)) {
      try {
        const url = new URL(/^(?:https?:|\w+:\/\/)/iu.test(original) ? original : `https://${original}`);
        const path = decodeURIComponent(url.pathname);
        if (url.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com'].includes(url.hostname.toLowerCase())
          || url.username || url.password || url.port || !/^\/(?:@[\p{L}\p{N}_.-]+|channel\/UC[A-Za-z0-9_-]{22})\/?$/u.test(path)) {
          throw new Error('invalid artist URL');
        }
        body = { yt_music_url: `https://music.youtube.com${url.pathname.replace(/\/$/u, '')}` };
      } catch {
        errors.push({ input: original, message: 'Нужна HTTPS-ссылка на канал YouTube или YouTube Music: /@имя или /channel/UC…' });
        continue;
      }
    } else {
      if ([...original].length > 1000 || [...original].some(char => { const code = char.codePointAt(0)!; return code < 32 || code === 127; })) {
        errors.push({ input: original, message: 'Имя должно содержать не более 1000 символов и не содержать управляющих символов.' });
        continue;
      }
      body = { name: original };
    }
    const key = ('name' in body ? `name:${body.name}` : `url:${body.yt_music_url}`).toLocaleLowerCase();
    if (seen.has(key)) {
      errors.push({ input: original, message: 'Эта запись повторяется в списке.' });
      continue;
    }
    seen.add(key);
    entries.push({ original, body });
  }
  return { entries, errors };
}
