import { test, expect } from 'bun:test';
import { classify, peopleIn } from './classify';
import { clean, norm, titleName, resolveGames } from './games';
import { duration, type Video } from './youtube';
test('fresh markers take precedence over VOD wording and report conflicting markers', () => {
  for (const line of ['This is fresh for YouTube content, not a stinky stream VOD! I swear!', 'This is made for YouTube content -- not a stinky Twitch VOD, I promise!', 'This is bespoke made for YouTube content', 'This is hot and fresh content just for YouTube', 'I RECORDED this! It\'s not a stream vod, I promise. It\'s fresh!', 'This is juicy original content, not a VOD! I promise!']) expect(classify(line, '2026-01-01').kind).toBe('fresh');
  expect(classify('This is fresh for YouTube\nThis came from my stream on Jan 1, 2026', '2026-01-02').both).toBe(true);
});
test('stream dates handle abbreviations, ordinals, year rollover, and invalid dates', () => {
  expect(classify('This came from my livestream on Dec. 31st!', '2026-01-02').streamDate).toBe('2025-12-31');
  expect(classify('This was taken from my stream on August 28th 2022!', '2022-09-01').streamDate).toBe('2022-08-28');
  expect(classify('This was originally streamed on my Twitch channel on November 20th, 2023!', '2023-11-22').streamDate).toBe('2023-11-20');
  expect(classify('This came from my stream on February 30th, 2024', '2024-03-01').streamDate).toBeUndefined();
  expect(classify('This came from my stream on September 25thth, 2026.', '2026-09-28').streamDate).toBe('2026-09-25');
  expect(classify('This came from my stream on 01/08/2021!', '2021-01-10').streamDate).toBe('2021-01-08');
});
test('suffix cleanup and duration parsing', () => {
  expect(titleName('A title (Ravenswatch (#ad)')).toBe('Ravenswatch');
  expect(titleName('A title (20 Minutes Till Dawn)')).toBe('20 Minutes Till Dawn');
  expect(titleName('A title (60 Seconds)')).toBe('60 Seconds');
  expect(clean('Repentance Co-op #17')).toBe('Repentance');
  expect(clean('Game Demo Daily #3')).toBe('Game');
  expect(clean('React Court: Episode 4')).toBe('React Court');
  expect(clean('Gartic Phone | Episode 4')).toBe('Gartic Phone');
  expect(clean('GeoGuessr S4 - Episode 14')).toBe('GeoGuessr');
  expect(clean('HITMAN 3 - Episode 3')).toBe('HITMAN 3');
  expect(titleName('The Binding of Isaac: Repentance! (Episode 310: Daycare)')).toBe('The Binding of Isaac: Repentance');
  expect(duration('P1DT2H3M4S')).toBe(93784);
});
test('co-streamers are deduplicated and retain labels', () => {
  expect(peopleIn('Justin: http://twitch.tv/HCJustin\nhttp://twitch.tv/Northernlion')).toEqual([{key:'hcjustin',name:'HCJustin',label:'Justin'}]);
});
test('only demos fold into full games; DLC stays distinct', () => {
  const video = (id: string, title: string, app: string): Video => ({ id, title, description: 'https://store.steampowered.com/app/'+app, publishedAt:'2026-01-01',durationSec:600,views:1,likes:1,isShort:false });
  const steam = {'1':{name:'Base',type:'game',genres:[]},'2':{name:'Expansion',type:'dlc',fullgame:{appid:'1'},genres:[]},'3':{name:'Base Demo',type:'demo',fullgame:{appid:'1'},genres:[]}};
  const result=resolveGames([video('a','A (Expansion)','2'),video('b','B (Base Demo)','3')],steam);
  expect(result.keys.get('a')).toBe('steam:2'); expect(result.keys.get('b')).toBe('steam:1');
});
test('known Steam names match suffix-less titles despite trademarks', () => {
  const v: Video = {id:'x',title:'Showing Off My Custom Drip in Knockout City (#ad)',description:'',publishedAt:'2026-01-01',durationSec:600,views:1,likes:1,isShort:false};
  expect(resolveGames([v], {'1':{name:'Knockout City™',type:'game',genres:[]}}).keys.get('x')).toBe('steam:1');
});

test('Repentance and Repentance+ normalize differently', () => {
  expect(norm('The Binding of Isaac: Repentance')).toBe('bindingofisaacrepentance');
  expect(norm('The Binding of Isaac: Repentance+')).toBe('bindingofisaacrepentanceplus');
});

test('rare name-only suffixes fall back to established games in the title prefix', () => {
  const video = (id: string, title: string): Video => ({id,title,description:'',publishedAt:'2026-01-01',durationSec:600,views:1,likes:1,isShort:false});
  const videos = [
    ...Array.from({length:5}, (_, i) => video('sap'+i, 'A (Super Auto Pets)')),
    ...Array.from({length:4}, (_, i) => video('rare'+i, 'A (Rare Game)')),
    ...Array.from({length:3}, (_, i) => video('common'+i, 'Super Auto Pets (Common Suffix)')),
    video('a','Super Auto Pets Tier List But Correct This Time (Free + DLC)'),
    video('b','Super Auto Pets (Free + DLC)'),
    video('c','Rare Game (Uncommon Suffix)'),
    video('d','Super Auto Pets (Miscellaneous)'),
    video('e','Super Auto Pets (Steam Game)'),
    video('f','Super Auto Petsicles (Boundary Suffix)'),
    video('g','A (Super Auto Pets Bonus Suffix)'),
    video('h','Super Auto Pets meets Civ? (Mahokenshi #ad)'),
    video('i','Super Auto Pets meets Civ? (Mahokenshi #AD)'),
  ];
  const result = resolveGames(videos, {'1':{name:'Super Auto Pets',type:'game',genres:[]},'2':{name:'Steam Game',type:'game',genres:[]}});
  expect(result.keys.get('a')).toBe('steam:1'); expect(result.keys.get('b')).toBe('steam:1');
  expect(result.games['steam:1'].count).toBe(7); expect(result.games['steam:1'].steamId).toBe('1');
  expect(result.games['name:freeplusdlc']).toBeUndefined();
  for (const id of ['common0','common1','common2']) expect(result.keys.get(id)).toBe('name:commonsuffix');
  expect(result.keys.get('c')).toBe('name:uncommonsuffix'); expect(result.keys.get('d')).toBe('name:dles');
  expect(result.keys.get('e')).toBe('steam:2'); expect(result.keys.get('f')).toBe('name:boundarysuffix');
  expect(result.keys.get('g')).toBe('name:superautopetsbonussuffix');
  expect(result.keys.get('h')).toBe('name:mahokenshi'); expect(result.keys.get('i')).toBe('name:mahokenshi');
  expect(Object.values(result.games).reduce((n,g) => n+g.count,0)).toBe(videos.length);
});

test('DLE segments merge while resolved Steam games retain their game', () => {
  const video = (id: string, title: string, description = ''): Video => ({id,title,description,publishedAt:'2026-01-01',durationSec:600,views:1,likes:1,isShort:false});
  const result = resolveGames([
    video('misc', 'A (Miscellaneous)', 'https://store.steampowered.com/app/730'),
    video('dles', 'A (DLEs)'),
    video('battle', 'A (Dles Battle vs DumbDog)'),
    video('singular', 'A daily DLE'),
    video('plural', 'Time for DLEs!'),
    video('cs2', 'Stick to the DLEs unc (Counter-Strike 2)'),
    video('prefix', 'Counter-Strike 2 and DLEs'),
    video('boundary', 'Some noodles'),
  ], {'730':{name:'Counter-Strike 2',type:'game',genres:[]}});
  for (const id of ['misc', 'dles', 'battle', 'singular', 'plural']) expect(result.keys.get(id)).toBe('name:dles');
  for (const id of ['cs2', 'prefix']) expect(result.keys.get(id)).toBe('steam:730');
  expect(result.keys.get('boundary')).toBe('other');
  expect(result.games['name:dles']).toEqual({name:'DLEs',shelf:'Trivia & Web Games',tags:[],count:5});
  expect(result.games['name:miscellaneous']).toBeUndefined();
  expect(Object.values(result.games).some(g => g.name === 'Miscellaneous')).toBe(false);
});
