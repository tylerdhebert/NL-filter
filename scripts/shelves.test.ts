import { expect, test } from 'bun:test';
import { MANUAL, RULES, SHELVES, meaningfulTags, shelfFor } from './shelves';
import { resolveGames } from './games';
import type { Video } from './youtube';
const votes = (...names: string[]): [string, number][] => names.map((name, i) => [name, 100-i]);
test('noise is stripped before ranking, preserving vote order', () => {
  const tags = meaningfulTags(votes('Indie', '2D', 'Singleplayer', 'Stealth', 'Action', 'Assassins', 'VR', 'Shooter'));
  expect(tags).toEqual(['Stealth', 'Assassins', 'VR', 'Shooter']);
  expect(shelfFor('steam:1', tags)).toBe('Stealth & Adventure');
});
test('first matching rule wins', () => {
  expect(shelfFor('steam:1', ['Card Game', 'Roguelike', 'Deckbuilding', 'Strategy'])).toBe('Roguelike Deckbuilders');
  expect(shelfFor('steam:1', ['Auto Battler', 'Roguelike Deckbuilder'])).toBe('Auto Battlers');
});
test('each rule respects its meaningful-tag cutoff', () => {
  for (const rule of RULES) for (const tag of rule.tags) {
    expect(shelfFor('steam:1', [...Array(rule.top-1).fill('Unknown'), tag])).toBe(rule.name);
    expect(shelfFor('steam:1', [...Array(rule.top).fill('Unknown'), tag])).toBe('Everything Else');
  }
  expect(shelfFor('steam:1', ['Deckbuilding', ...Array(6).fill('Unknown'), 'Roguelite'])).toBe('Roguelike Deckbuilders');
  expect(shelfFor('steam:1', ['Deckbuilding', ...Array(7).fill('Unknown'), 'Roguelite'])).toBe('Everything Else');
});
test('manual overrides precede rules for name and Steam keys', () => {
  for (const [key, shelf] of Object.entries(MANUAL)) expect(shelfFor(key, ['Auto Battler'])).toBe(shelf);
  expect(shelfFor('steam:1147860', ['Strategy'])).toBe('Everything Else');
  expect(shelfFor('name:unknown', ['Auto Battler'])).toBe('Everything Else');
  expect(shelfFor('steam:1', [])).toBe('Everything Else');
  expect(SHELVES).toHaveLength(16);
  expect(SHELVES[4]).toBe('Trivia & Web Games');
  expect(SHELVES.at(-1)).toBe('Everything Else');
});
test('game output classifies before truncation and omits genres and the other shelf', () => {
  const video = (id: string, title: string, description = '') => ({ id, title, description } as Video);
  const { games } = resolveGames([video('a', 'Example', 'https://store.steampowered.com/app/1'), video('b', 'A round (Chess)'), video('c', 'Unmatched')], {
    '1': { name: 'Example', type: 'game', genres: ['Indie'], tags: votes('Indie', ...Array(9).fill('Unknown'), 'Roguelike Deckbuilder') },
  });
  expect(games['steam:1'].shelf).toBe('Roguelike Deckbuilders');
  expect(games['steam:1'].tags).toHaveLength(8);
  expect(games['name:chess'].shelf).toBe('Strategy & Board Games');
  expect(games['name:chess'].tags).toEqual([]);
  expect(games.other).not.toHaveProperty('shelf');
  for (const game of Object.values(games)) expect(game).not.toHaveProperty('genres');
});
