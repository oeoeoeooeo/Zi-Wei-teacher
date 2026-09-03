import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

/**
 * 每個聊天室的「長期記憶」:記住的人物生辰與重點事項,以及對話歷史。
 * 存在專案根目錄 data/(已列入 .gitignore,含個資絕不上傳)。
 * 對話歷史被截斷後,人物資料仍能透過記憶注入系統提示,老師不會忘記誰是誰。
 */
const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const MEMORY_DIR = path.join(DATA_DIR, 'memory');
const HISTORY_FILE = path.join(DATA_DIR, 'histories.json');
fs.mkdirSync(MEMORY_DIR, { recursive: true });

function memoryFile(chatId) {
  return path.join(MEMORY_DIR, `${String(chatId).replace(/[^\w-]/g, '_')}.json`);
}

export function loadMemory(chatId) {
  try {
    return JSON.parse(fs.readFileSync(memoryFile(chatId), 'utf8'));
  } catch {
    return { people: {}, notes: [] };
  }
}

function saveMemory(chatId, mem) {
  fs.writeFileSync(memoryFile(chatId), JSON.stringify(mem, null, 2));
}

/**
 * 記住(或更新)一位人物。同名者合併欄位。
 */
export function rememberPerson(chatId, person) {
  const mem = loadMemory(chatId);
  const key = String(person.name ?? '').trim() || '本人';
  const prev = mem.people[key] ?? {};
  const merged = { ...prev };
  for (const [k, v] of Object.entries(person)) {
    if (v === undefined || v === null || v === '') continue;
    merged[k] = v;
  }
  if (person.notes && prev.notes && person.notes !== prev.notes) {
    merged.notes = `${prev.notes};${person.notes}`.slice(-600);
  }
  merged.updatedAt = new Date().toISOString().slice(0, 10);
  mem.people[key] = merged;
  saveMemory(chatId, mem);
  return merged;
}

export function addNote(chatId, note) {
  const mem = loadMemory(chatId);
  mem.notes.push({ date: new Date().toISOString().slice(0, 10), text: String(note).slice(0, 300) });
  mem.notes = mem.notes.slice(-20);
  saveMemory(chatId, mem);
}

export function forgetMemory(chatId) {
  try {
    fs.unlinkSync(memoryFile(chatId));
  } catch {
    /* 沒有檔案就算了 */
  }
}

/** 轉成注入系統提示的文字;沒有資料回傳空字串。 */
export function formatMemory(mem) {
  const people = Object.entries(mem.people ?? {});
  if (!people.length && !(mem.notes ?? []).length) return '';
  const lines = ['【此聊天室已記住的資料】(先前對話中使用者提供,可直接取用;若使用者更正則以新資料為準並重新記住)'];
  for (const [name, p] of people) {
    const birth = p.date
      ? `${p.calendar === 'lunar' ? '農曆' : '陽曆'} ${p.date}${p.isLeapMonth ? '(閏月)' : ''} ${p.birthHour !== undefined ? p.birthHour + ' 時' : '時辰不明'} ${p.gender === 'male' ? '男' : p.gender === 'female' ? '女' : ''}`
      : '(尚無生辰)';
    lines.push(`- ${name}${p.relation ? `(${p.relation})` : ''}:${birth}${p.notes ? `;${p.notes}` : ''}`);
  }
  for (const n of mem.notes ?? []) lines.push(`- 備註 ${n.date}:${n.text}`);
  return lines.join('\n');
}

/* ───────── 對話歷史持久化(程式重啟後對話不中斷) ───────── */

export function loadHistories() {
  try {
    const raw = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    return new Map(Object.entries(raw).map(([k, v]) => [Number(k), v]));
  } catch {
    return new Map();
  }
}

let saveTimer = null;
export function scheduleSaveHistories(histories) {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      const obj = Object.fromEntries(histories);
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(obj));
    } catch (err) {
      console.error('寫入對話歷史失敗:', err.message);
    }
  }, 1500);
}
