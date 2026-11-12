import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArtistList } from '../src/artistList.ts';

test('имена разделяются строками, запятыми, точкой с запятой, чертой и табуляцией', () => {
  const result = parseArtistList('Vampire Weekend\\\nThe Fray, Cold War Kids; Mike and the Mechanics|Florence + The Machine\vMuse\tBlur');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map(entry => entry.body.name), ['Vampire Weekend', 'The Fray', 'Cold War Kids', 'Mike and the Mechanics', 'Florence + The Machine', 'Muse', 'Blur']);
});

test('ссылки на каналы YouTube приводятся к YouTube Music', () => {
  const result = parseArtistList('https://www.youtube.com/@artist?si=abc\nhttps://music.youtube.com/channel/UCabcdefghijklmnopqrstuv/');
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.entries.map(entry => entry.body), [
    { yt_music_url: 'https://music.youtube.com/@artist' },
    { yt_music_url: 'https://music.youtube.com/channel/UCabcdefghijklmnopqrstuv' },
  ]);
});

test('неверные ссылки и повторные записи показываются как ошибки', () => {
  const result = parseArtistList('Muse; muse; https://youtube.com/watch?v=abc; https://example.com/@artist; https://youtu.be/abc');
  assert.equal(result.entries.length, 1);
  assert.equal(result.errors.length, 4);
  assert.equal(parseArtistList(' ,;\n\v').errors.length, 1);
});
