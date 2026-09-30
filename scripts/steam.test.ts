import { expect, test } from 'bun:test';
import { parseSteamTags } from './steam';

test('Steam tags preserve page order and match brackets outside JSON strings', () => {
  const html = `<script>InitAppTagModal( 123,
    [{"tagid":1716,"name":"Roguelike","count":439,"browseable":true},
     {"tagid":2,"name":"A [tag] with \\"quotes\\"","count":12,"extra":[1,[2]]}], []);</script>`;
  expect(parseSteamTags(html, '123')).toEqual([['Roguelike', 439], ['A [tag] with "quotes"', 12]]);
  expect(parseSteamTags(html, '456')).toEqual([]);
  expect(parseSteamTags('<html></html>', '123')).toEqual([]);
});

test('Steam tags keep only the top 20 and reject incomplete arrays', () => {
  const tags = Array.from({ length: 22 }, (_, i) => ({ name: `Tag ${i}`, count: 100 - i }));
  expect(parseSteamTags(`InitAppTagModal(123, ${JSON.stringify(tags)}, []);`, '123')).toEqual(tags.slice(0, 20).map(t => [t.name, t.count]));
  expect(() => parseSteamTags('InitAppTagModal(123, [{"name":"Tag","count":1}', '123')).toThrow();
});
