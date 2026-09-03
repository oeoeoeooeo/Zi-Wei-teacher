import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { askTeacher } from './claude.js';
import { logChat, logEvent } from './chatlog.js';
import { loadHistories, scheduleSaveHistories, loadMemory, formatMemory, forgetMemory } from './memory.js';

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

// 每個聊天室各自的對話歷史(重啟後自 data/histories.json 還原)與處理佇列
const histories = loadHistories();
const queues = new Map();
const MAX_HISTORY_MESSAGES = 40;

const WELCOME = `你好,我是紫雲老師 🌙
一位專研紫微斗數三十餘年的命理老師。

你可以:
• 提供「出生日期(註明陽曆或農曆)、出生時間、性別」,我幫你排盤解命
• 問感情、事業、財運、健康保養、學業考運、出國發展……
• 問時運:今年運勢、某年某月吉凶、犯太歲、哪一年有婚緣或轉職機會
• 擇日參考:重要日子(簽約、面試、手術)的趨吉時段
• 合婚、家人的盤:提供兩人以上的出生資料,我會分開記清楚
• 想「學」紫微斗數也歡迎,我有初/中/高階的系統教法

指令:
/clear — 清除對話,重新開始(保留已記住的生辰)
/profile — 看我記住了哪些人的資料
/forget — 刪除此聊天室所有記憶與對話
/help — 使用說明

請問今天想聊什麼呢?`;

const HELP = `【使用說明】
1. 排盤需要三樣資料:出生日期(陽曆或農曆,民國年也可以)、出生時間(幾點)、性別。時辰不確定可以先給範圍,我幫你定盤。
2. 直接用白話問就好,例如「今年事業運如何」「我哪一年比較有婚緣」「下週三適合簽約嗎」「家裡有人犯太歲嗎」。
3. 想學斗數就說「我想學紫微斗數」,我會從你的程度開始一課一課教。
4. 我會記住你在這個聊天室提供過的生辰(/profile 可查看),/forget 可以全部刪除。
5. 群組裡請 @ 我或回覆我的訊息,我才會回答。

命理供參考,不做生死斷言、疾病診斷與投資保證;健康請以醫師為準 🙏`;

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
  const text = ctx.message.text ?? ctx.message.caption ?? '';
  const botUsername = ctx.botInfo?.username;
  if (botUsername && text.includes(`@${botUsername}`)) return true;
  if (ctx.message.reply_to_message?.from?.id === ctx.botInfo?.id) return true;
  return false;
}

function friendlyError(err) {
  if (err instanceof Anthropic.RateLimitError) return '現在請教的人比較多,老師忙不過來了 🙏 請一分鐘後再傳一次。';
  if (err instanceof Anthropic.AuthenticationError) return '老師這邊的連線設定有問題,請管理者檢查 API 金鑰。';
  if (err instanceof Anthropic.APIConnectionError) return '老師這邊剛剛訊號不太好 🙏 請稍後再傳一次。';
  if (err instanceof Anthropic.APIError) return '老師這邊系統剛剛出了點小狀況 🙏 請稍後再傳一次。';
  return '抱歉,老師這邊剛剛訊號不太好 🙏 請稍後再傳一次。';
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
    // Telegram 以純文字送出,把偶爾殘留的 Markdown 粗體/標題符號去掉
    const reply = (await askTeacher(history, { chatId }))
      .replace(/\*\*([^*\n]+)\*\*/g, '$1')
      .replace(/^#{1,6}\s+/gm, '');
    history.push({ role: 'assistant', content: reply });
    logChat(ctx.chat, '紫雲老師', reply);

    // 只保留最近的對話,避免無限增長(人物生辰已由記憶工具另存,不怕遺忘)
    if (history.length > MAX_HISTORY_MESSAGES) {
      history.splice(0, history.length - MAX_HISTORY_MESSAGES);
    }
    scheduleSaveHistories(histories);

    const replyParams = isGroup(ctx)
      ? { reply_parameters: { message_id: ctx.message.message_id } }
      : {};
    for (const part of splitMessage(reply)) {
      await ctx.reply(part, replyParams);
    }
  } catch (err) {
    console.error(`[chat ${chatId}]`, err);
    history.pop(); // 失敗時移除這輪的 user 訊息,避免歷史卡在半途
    await ctx.reply(friendlyError(err)).catch(() => {});
  } finally {
    clearInterval(typing);
  }
}

bot.start((ctx) => ctx.reply(WELCOME));
bot.help((ctx) => ctx.reply(HELP));

bot.command('clear', (ctx) => {
  histories.delete(ctx.chat.id);
  scheduleSaveHistories(histories);
  logEvent(ctx.chat, '對話記憶已清除(/clear)');
  return ctx.reply('好的,我們重新開始。已記住的生辰資料仍保留(/profile 可查看,/forget 可刪除)。請直接提問 🙂');
});

bot.command('profile', (ctx) => {
  const text = formatMemory(loadMemory(ctx.chat.id));
  return ctx.reply(text ? text.replace(/^【[^\n]*\n/, '【我記住的資料】\n') : '目前還沒有記住任何人的資料。提供出生資料後我會自動記下。');
});

bot.command('forget', (ctx) => {
  histories.delete(ctx.chat.id);
  scheduleSaveHistories(histories);
  forgetMemory(ctx.chat.id);
  logEvent(ctx.chat, '記憶與對話已全部刪除(/forget)');
  return ctx.reply('已刪除此聊天室的所有記憶與對話紀錄。下次要看盤請重新提供出生資料 🙂');
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

// 非文字訊息(圖片、語音、貼圖等)給予提示
bot.on('message', (ctx) => {
  if (isGroup(ctx) && !shouldRespondInGroup(ctx)) return;
  return ctx.reply('老師目前只看得懂文字訊息 🙏 請用文字告訴我出生資料或問題。').catch(() => {});
});

bot.launch(async () => {
  console.log(`紫雲老師已上線:@${bot.botInfo?.username ?? '(unknown)'}`);
  await bot.telegram
    .setMyCommands([
      { command: 'start', description: '開始與紫雲老師對話' },
      { command: 'help', description: '使用說明' },
      { command: 'profile', description: '查看已記住的生辰資料' },
      { command: 'clear', description: '清除對話,重新開始' },
      { command: 'forget', description: '刪除此聊天室所有記憶' },
    ])
    .catch((err) => console.error('設定指令選單失敗:', err.message));
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
