#!/usr/bin/env node
// 在終端機直接與紫雲老師對話(不經 Telegram),用於測試與調校。
//   npm run cli            進入互動模式
//   npm run cli -- "問題"  單次提問後結束
import 'dotenv/config';
import readline from 'readline';
import { askTeacher } from '../src/claude.js';

const chatId = process.env.CLI_CHAT_ID ?? 'cli';
const history = [];

async function ask(text) {
  history.push({ role: 'user', content: text });
  const t0 = Date.now();
  try {
    const reply = await askTeacher(history, { chatId });
    history.push({ role: 'assistant', content: reply });
    console.log(`\n紫雲老師(${((Date.now() - t0) / 1000).toFixed(1)}s):\n${reply}\n`);
  } catch (err) {
    history.pop();
    console.error('錯誤:', err);
  }
}

const oneShot = process.argv.slice(2).join(' ').trim();
if (oneShot) {
  await ask(oneShot);
  process.exit(0);
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
console.log('與紫雲老師對話中(輸入 /quit 離開,/clear 清除對話)');
const loop = () =>
  rl.question('你:', async (line) => {
    const text = line.trim();
    if (text === '/quit') return rl.close();
    if (text === '/clear') {
      history.length = 0;
      console.log('(已清除)');
      return loop();
    }
    if (text) await ask(text);
    loop();
  });
loop();
