export const NOISE = new Set('2D|3D|Singleplayer|Multiplayer|Indie|Casual|Colorful|Replay Value|Great Soundtrack|Cute|Pixel Graphics|Atmospheric|Family Friendly|Minimalist|Horses|Dogs|Dark|Fantasy|Funny|Early Access|Free to Play|Controller|Mouse Only|Difficult|Combat|Procedural Generation|Adventure|Action|Comedy|Relaxing|Exploration|Character Customization|Third Person|First-Person|Gore|Violent|Sci-fi|Stylized|Hand-drawn|Cartoony|Anime|Story Rich|Beautiful|Female Protagonist|Retro|Classic|Memes|Open World|Sandbox|Masterpiece|Multiple Endings|Choices Matter|Nudity|Sexual Content|Realistic|Cartoon|Short|Addictive|Emotional|Fast-Paced|Tactical|Physics|Arcade|Moddable|Soundtrack'.split('|'));
export const meaningfulTags = (tags: [string, number][]) => tags.map(([name]) => name).filter(name => !NOISE.has(name));
const has = (tags: string[], top: number, names: string[]) => tags.slice(0, top).some(t => names.includes(t));
export const RULES: { name: string; tags: string[]; top: number; match?: (tags: string[]) => boolean }[] = [
  { name: 'Auto Battlers', tags: ['Auto Battler'], top: 8 },
  { name: 'Roguelike Deckbuilders', tags: ['Roguelike Deckbuilder'], top: 10, match: t => has(t, 8, ['Deckbuilding', 'Card Battler']) && has(t, 8, ['Roguelike', 'Roguelite']) },
  { name: 'Action Roguelikes', tags: ['Action Roguelike', 'Bullet Hell', 'Bullet Heaven'], top: 8 },
  { name: 'Party Games', tags: ['Party Game', 'Party', 'Trivia', 'Social Deduction', 'Minigames'], top: 4 },
  { name: 'Soulslikes & Action RPGs', tags: ['Souls-like', 'Action RPG', 'Hack and Slash'], top: 6 },
  { name: 'Platformers', tags: ['Platformer', 'Precision Platformer', '3D Platformer', '2D Platformer', 'Puzzle Platformer', 'Runner'], top: 3 },
  { name: 'Horror', tags: ['Horror', 'Survival Horror', 'Psychological Horror'], top: 3 },
  { name: 'Sports & Racing', tags: ['Sports', 'Golf', 'Mini Golf', 'Hockey', 'Racing', 'Football (Soccer)', 'Baseball', 'Basketball', 'Tennis'], top: 3 },
  { name: 'Puzzle', tags: ['Puzzle', 'Word Game', 'Mystery', 'Escape Room', 'Hidden Object'], top: 2 },
  { name: 'Stealth & Adventure', tags: ['Stealth', 'Action-Adventure', 'Espionage'], top: 3 },
  { name: 'Shooters & Battle Royales', tags: ['FPS', 'Shooter', 'Battle Royale', 'Extraction Shooter', 'Hero Shooter', 'Third-Person Shooter', 'Arena Shooter', 'Top-Down Shooter', 'MOBA'], top: 5 },
  { name: 'Roguelikes & Roguelites', tags: ['Roguelike', 'Roguelite', 'Perma Death'], top: 4 },
  { name: 'Strategy & Board Games', tags: ['Strategy', 'Turn-Based Tactics', 'Turn-Based Strategy', 'Tactical RPG', 'Board Game', 'Tabletop', 'Tower Defense', 'RTS', 'Real Time Tactics', 'Mahjong', 'Grand Strategy', '4X', 'Card Game'], top: 6 },
  { name: 'Sims & Management', tags: ['Simulation', 'Management', 'Life Sim', 'Automobile Sim', 'Economy', 'Colony Sim', 'Building', 'Farming Sim'], top: 6 },
];
export const SHELVES = [...RULES.slice(0, 4).map(r => r.name), 'Trivia & Web Games', ...RULES.slice(4).map(r => r.name), 'Everything Else'];
export const MANUAL: Record<string, string> = Object.fromEntries([
  ['Trivia & Web Games', 'dles sporcle cine2nerdlebattles geoguessr geoguessrduels crosswords'],
  ['Auto Battlers', 'bazaar'],
  ['Strategy & Board Games', 'chess catan clubhousegames'],
  ['Roguelike Deckbuilders', 'sliceanddice'],
  ['Sports & Racing', 'nintendoswitchsports london2012 rocketleague mariokart8 mariogolfsuperrush normalgolfgame fzero99'],
  ['Party Games', 'supermariopartyjamboree mariopartysuperstars supermarioparty warioware garticphone codenames nintendoworldchampionshipsnesedition'],
  ['Platformers', 'supermario64 supermariomaker2'],
  ['Shooters & Battle Royales', 'rumbleverse fortnite valorant'],
  ['Puzzle', 'tetris99'],
  ['Soulslikes & Action RPGs', 'northernlionplaysadarksoulsrandomizer finalfantasyxvi'],
  ['Stealth & Adventure', 'northernlionplaysdeathstranding'],
  ['Roguelikes & Roguelites', 'darkestdungeonii'],
  ['Action Roguelikes', 'tboifiendfolio'],
  ['Sims & Management', 'tomodachilife multiplayerrimworld'],
  ['Everything Else', 'reactcourt tierlist twitchrivals aidungeon pokemonunite 2xko dadcraft'],
].flatMap(([shelf, names]) => names.split(' ').map(name => ['name:' + name, shelf])));
MANUAL['steam:1147860'] = 'Everything Else'; // UFO 50
export function shelfFor(key: string, tags: string[]): string {
  return MANUAL[key] ?? (key.startsWith('steam:') ? RULES.find(r => has(tags, r.top, r.tags) || r.match?.(tags))?.name : undefined) ?? 'Everything Else';
}
