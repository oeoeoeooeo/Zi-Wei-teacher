import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 對話紀錄存在專案根目錄的 chats/(已列入 .gitignore,絕不隨程式碼上傳)
const LOG_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'chats');
fs.mkdirSync(LOG_DIR, { recursive: true });

function sanitize(name) {
  return String(name ?? '')
    .replace(/[^\w一-鿿-]/g, '_')
    .slice(0, 40);
}

function chatFile(chat) {
  const label =
    chat.type === 'private'
      ? `私訊-${sanitize(chat.first_name || chat.username || chat.id)}`
      : `群組-${sanitize(chat.title || chat.id)}`;
  return path.join(LOG_DIR, `${label}-${chat.id}.txt`);
}

function timestamp() {
  return new Date().toLocaleString('zh-TW', { hour12: false });
}

/**
 * 追加一筆對話到該聊天室的紀錄檔。
 * @param {object} chat - Telegram chat 物件
 * @param {string} who - 發言者名稱(使用者名字或「紫雲老師」)
 * @param {string} text - 內容
 */
export function logChat(chat, who, text) {
  try {
    fs.appendFileSync(chatFile(chat), `[${timestamp()}] ${who}:\n${text}\n\n`);
  } catch (err) {
    console.error('寫入對話紀錄失敗:', err.message);
  }
}

export function logEvent(chat, text) {
  logChat(chat, '※系統', text);
}
