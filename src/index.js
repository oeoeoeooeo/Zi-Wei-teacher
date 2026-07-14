import 'dotenv/config';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { askTeacher } from './claude.js';
import { logChat, logEvent } from './chatlog.js';

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('請先在 .env 設定 TELEGRAM_BOT_TOKEN(向 @BotFather 申請)');
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error('請先在 .env 設定 ANTHROPIC_API_KEY(https://platform.claude.com)');
  process.exit(1);
}

const bot = new Telegraf(token, { handlerTimeout: 600_000 });

// 每個聊天室各自的對話歷史與處理佇列
const histories = new Map();
const queues = new Map();
const MAX_HISTORY_MESSAGES = 40;

const WELCOME = `你好,我是紫雲老師 🌙
一位專研紫微斗數三十餘年的命理老師。

你可以:
• 提供「出生日期(註明陽曆或農曆)、出生時間、性別」,我幫你排盤解命
• 問感情、事業、財運、健康保養、學業考運、出國發展……
• 問時運:今年運勢、某年某月吉凶、重要日子的擇日參考
• 合婚:提供兩人的出生資料,我幫你們看互動與互補
• 想「學」紫微斗數也歡迎,我有初/中/高階的系統教法

指令:
/clear — 清除對話,重新開始

請問今天想聊什麼呢?`;

function getHistory(chatId) {
  if (!histories.has(chatId)) histories.set(chatId, []);
  return histories.get(chatId);
}

// Telegram 單則訊息上限 4096 字,保守以 3800 切段(盡量從段落邊界切)
function splitMessage(text, limit = 3800) {
  const parts = [];
  let rest = text;
  while (rest.length > limit) {
    let cut = rest.lastIndexOf('\n\n', limit);
    if (cut < limit * 0.5) cut = rest.lastIndexOf('\n', limit);
    if (cut < limit * 0.5) cut = limit;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut).trimStart();
  }
  if (rest) parts.push(rest);
  return parts;
}

function isGroup(ctx) {
  return ctx.chat.type === 'group' || ctx.chat.type === 'supergroup';
}

// 群組中只在「被 @提及」或「回覆機器人訊息」時發言
function shouldRespondInGroup(ctx) {
  const text = ctx.message.text ?? '';
  const botUsername = ctx.botInfo?.username;
  if (botUsername && text.includes(`@${botUsername}`)) return true;
  if (ctx.message.reply_to_message?.from?.id === ctx.botInfo?.id) return true;
  return false;
}

async function handleText(ctx) {
  const chatId = ctx.chat.id;
  const history = getHistory(chatId);

  let text = ctx.message.text;
  if (isGroup(ctx)) {
    // 移除 @機器人 的提及字串,並標註發問者,讓老師知道群組裡是誰在問
    if (ctx.botInfo?.username) {
      text = text.replaceAll(`@${ctx.botInfo.username}`, '').trim();
    }
    const who = ctx.message.from?.first_name ?? '群友';
    text = `【群組訊息,發問者:${who}】${text}`;
  }

  history.push({ role: 'user', content: text });
  logChat(ctx.chat, ctx.message.from?.first_name ?? '使用者', ctx.message.text);

  // 模型思考期間持續顯示「輸入中…」
  const typing = setInterval(() => {
    ctx.sendChatAction('typing').catch(() => {});
  }, 4500);
  ctx.sendChatAction('typing').catch(() => {});

  try {
    const reply = await askTeacher(history);
    history.push({ role: 'assistant', content: reply });
    logChat(ctx.chat, '紫雲老師', reply);

    // 只保留最近的對話,避免無限增長
    if (history.length > MAX_HISTORY_MESSAGES) {
      history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    }

    const replyParams = isGroup(ctx)
      ? { reply_parameters: { message_id: ctx.message.message_id } }
      : {};
    for (const part of splitMessage(reply)) {
      await ctx.reply(part, replyParams);
    }
  } catch (err) {
    console.error(`[chat ${chatId}]`, err);
    history.pop(); // 失敗時移除這輪的 user 訊息,避免歷史卡在半途
    await ctx
      .reply('抱歉,老師這邊剛剛訊號不太好 🙏 請稍後再傳一次。')
      .catch(() => {});
  } finally {
    clearInterval(typing);
  }
}

bot.start((ctx) => ctx.reply(WELCOME));

bot.command('clear', (ctx) => {
  histories.delete(ctx.chat.id);
  logEvent(ctx.chat, '對話記憶已清除(/clear)');
  return ctx.reply('好的,我們重新開始。請提供出生資料,或直接提問 🙂');
});

bot.on(message('text'), (ctx) => {
  // 群組中只回應 @提及 或回覆機器人的訊息,避免搶答每一句話
  if (isGroup(ctx) && !shouldRespondInGroup(ctx)) return;

  // 同一聊天室的訊息依序處理,避免對話歷史交錯
  const chatId = ctx.chat.id;
  const prev = queues.get(chatId) ?? Promise.resolve();
  const next = prev.then(() => handleText(ctx)).catch((err) => console.error(err));
  queues.set(chatId, next);
  return next;
});

bot.launch(() => {
  console.log(`紫雲老師已上線:@${bot.botInfo?.username ?? '(unknown)'}`);
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
