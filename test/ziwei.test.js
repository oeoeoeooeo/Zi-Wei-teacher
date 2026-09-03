import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  hourToTimeIndex,
  getAstrolabe,
  formatAstrolabe,
  formatHoroscope,
  scanYears,
  detectPatterns,
  MUTAGEN_TABLE,
} from '../src/ziwei.js';

const SAMPLE = { calendar: 'solar', date: '1985-9-30', birthHour: 22, gender: 'male' };

test('時辰索引:23 點為晚子時,0 點為早子時', () => {
  assert.equal(hourToTimeIndex(0), 0);
  assert.equal(hourToTimeIndex(1), 1);
  assert.equal(hourToTimeIndex(2), 1);
  assert.equal(hourToTimeIndex(22), 11);
  assert.equal(hourToTimeIndex(23), 12);
});

test('四化表每干四星且無重複', () => {
  for (const [stem, stars] of Object.entries(MUTAGEN_TABLE)) {
    assert.equal(stars.length, 4, stem);
    assert.equal(new Set(stars).size, 4, stem);
  }
});

test('本命盤輸出含十二宮、格局偵測、夾宮與身宮資訊', () => {
  const a = getAstrolabe(SAMPLE);
  const text = formatAstrolabe(a);
  for (const name of ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母']) {
    assert.ok(text.includes(`【${name}】`), name);
  }
  assert.match(text, /身宮落於夫妻/);
  assert.match(text, /【格局偵測】/);
  assert.match(text, /煞星統計/);
  assert.match(text, /太陰化忌\(夫妻,沖官祿\)/);
  assert.match(text, /現行大限/);
  assert.match(text, /夾宮:羊陀夾/);
  assert.match(text, /飛四化:.*自化/);
});

test('格局偵測回傳結構完整', () => {
  const a = getAstrolabe(SAMPLE);
  const patterns = detectPatterns(a);
  assert.ok(patterns.length >= 2);
  for (const p of patterns) {
    assert.ok(p.name && p.where && typeof p.note === 'string');
  }
  assert.ok(patterns.some((p) => p.name === '鈴貪格'));
  assert.ok(patterns.some((p) => p.name === '身宮所在'));
});

test('殺破狼與機月同梁不會同時判定於同一命宮三方', () => {
  for (const d of ['1990-1-1', '1978-7-15', '2000-12-25', '1966-3-3', '1995-5-5', '2010-10-10']) {
    for (const h of [0, 7, 13, 23]) {
      const a = getAstrolabe({ calendar: 'solar', date: d, birthHour: h, gender: 'female' });
      const names = detectPatterns(a).map((p) => p.name);
      assert.ok(!(names.includes('殺破狼') && names.includes('機月同梁')), `${d} ${h}`);
    }
  }
});

test('運限輸出含疊宮對照、四化交涉與太歲關係', () => {
  const a = getAstrolabe(SAMPLE);
  const text = formatHoroscope(a, '2027-7-1');
  assert.match(text, /流年十二宮疊本命:命宮=/);
  assert.match(text, /太歲關係:.*沖太歲/);
  assert.match(text, /流年四化交涉/);
  assert.ok(!text.includes('【流時】'), '未給時辰時不輸出流時');
  const withHour = formatHoroscope(a, '2027-7-1', 14);
  assert.match(withHour, /【流時】/);
});

test('太歲關係:本命年為值太歲', () => {
  const a = getAstrolabe(SAMPLE); // 乙丑年生
  const text = formatHoroscope(a, '2033-7-1'); // 癸丑年
  assert.match(text, /值太歲/);
});

test('逐年掃描每年一行並含訊號欄', () => {
  const a = getAstrolabe(SAMPLE);
  const text = scanYears(a, 2026, 2030);
  const rows = text.split('\n').filter((l) => /^\d{4} /.test(l));
  assert.equal(rows.length, 5);
  for (const r of rows) assert.equal(r.split('|').length, 7, r);
  assert.match(text, /2027 丁未/);
});

test('農曆與閏月排盤不拋錯', () => {
  const a = getAstrolabe({ calendar: 'lunar', date: '1985-8-16', birthHour: 22, gender: 'male' });
  assert.equal(a.solarDate, '1985-9-30');
  const b = getAstrolabe({ calendar: 'lunar', date: '2023-2-15', birthHour: 9, gender: 'female', isLeapMonth: true });
  assert.ok(b.solarDate.startsWith('2023-'));
});
