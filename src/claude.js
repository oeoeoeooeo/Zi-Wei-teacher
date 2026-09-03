import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { getAstrolabe, formatAstrolabe, formatHoroscope, scanYears } from './ziwei.js';
import { loadMemory, formatMemory, rememberPerson, addNote } from './memory.js';

const client = new Anthropic();

const MODEL = 'claude-opus-5';

const birthProperties = {
  calendar: {
    type: 'string',
    enum: ['solar', 'lunar'],
    description: '出生日期使用的曆法:solar=陽曆/國曆,lunar=農曆',
  },
  date: {
    type: 'string',
    description: '出生日期,格式 YYYY-M-D,例如 1990-8-16(民國年請先換算為西元年)',
  },
  birthHour: {
    type: 'integer',
    minimum: 0,
    maximum: 23,
    description: '出生時間的「小時」(24 小時制,0-23)。23 點會自動歸為晚子時。',
  },
  gender: {
    type: 'string',
    enum: ['male', 'female'],
    description: '性別',
  },
  isLeapMonth: {
    type: 'boolean',
    description: '農曆閏月出生時設為 true(僅 calendar=lunar 時有意義)',
  },
};

const getAstrolabeTool = betaTool({
  name: 'get_astrolabe',
  description:
    '依出生資料排出完整紫微斗數本命盤:十二宮、主星亮度、生年四化(含沖宮)、輔佐煞雜曜、五行局、大限歲數、身宮落宮、來因宮、三方四正、夾宮、宮干飛四化與自化、十二神煞、小限之年,並附程式自動偵測的格局清單供核對。解讀任何命盤前必須先呼叫此工具,不可自行推算。',
  inputSchema: {
    type: 'object',
    properties: birthProperties,
    required: ['calendar', 'date', 'birthHour', 'gender'],
  },
  run: (input) => {
    const astrolabe = getAstrolabe(input);
    return formatAstrolabe(astrolabe);
  },
});

const getHoroscopeTool = betaTool({
  name: 'get_horoscope',
  description:
    '依出生資料與目標日期,取得該時間點的大限、流年、小限、流月、流日(給 targetHour 時另含流時)資訊:運限干支、運限命宮疊本命何宮、運限十二宮對照本命宮位、運限四化落宮、運限四化與生年四化的交涉(祿忌沖、雙忌、雙祿)、大限×流年交疊、流曜位置、太歲關係(值/沖/刑/害/破)。回答「今年運勢」「某年如何」「最近適不適合…」「擇日」「犯太歲嗎」這類與時間有關的問題前必須呼叫。',
  inputSchema: {
    type: 'object',
    properties: {
      ...birthProperties,
      targetDate: {
        type: 'string',
        description: '要查詢運勢的目標日期,格式 YYYY-M-D。問「今年」就用今天的日期;問某年就用該年任一日(建議 7-1);問某月用該月任一日;問某日用該日。',
      },
      targetHour: {
        type: 'integer',
        minimum: 0,
        maximum: 23,
        description: '目標時辰(0-23),只在需要流時(擇時、某個時段吉凶)時提供',
      },
    },
    required: ['calendar', 'date', 'birthHour', 'gender', 'targetDate'],
  },
  run: (input) => {
    const astrolabe = getAstrolabe(input);
    return formatHoroscope(astrolabe, input.targetDate, input.targetHour);
  },
});

const scanYearsTool = betaTool({
  name: 'scan_years',
  description:
    '逐年掃描一段年份(最多 15 年)的流年精簡訊號:每年的干支、虛歲、所在大限、流年命宮疊本命何宮、流年四化落宮、流年夫妻/財帛/官祿/疾厄/田宅疊本命宮、流鸞流喜流昌流曲流羊流陀位置,以及自動標記的訊號(祿忌沖、雙忌、鸞喜入命/夫妻、犯太歲、流年疊大限命宮等)。用於「哪一年會結婚/換工作/買房」「未來幾年運勢走向」「這步大限哪幾年最關鍵」「回推過去哪年發生大事(定盤)」等應期問題;找出候選年後,再用 get_horoscope 細看該年。',
  inputSchema: {
    type: 'object',
    properties: {
      ...birthProperties,
      startYear: { type: 'integer', description: '起始西元年' },
      endYear: { type: 'integer', description: '結束西元年(含),與起始年相距不超過 14' },
    },
    required: ['calendar', 'date', 'birthHour', 'gender', 'startYear', 'endYear'],
  },
  run: (input) => {
    const start = input.startYear;
    const end = Math.min(input.endYear, start + 14);
    if (end < start) return '結束年不可早於起始年。';
    const astrolabe = getAstrolabe(input);
    return scanYears(astrolabe, start, end);
  },
});

function buildMemoryTools(chatId) {
  const rememberPersonTool = betaTool({
    name: 'remember_person',
    description:
      '把一位人物的生辰資料與重點記進此聊天室的長期記憶(對話截斷或重啟後仍會保留)。使用者一提供完整出生資料(日期、時辰、性別)就要呼叫;同一人資料更正時再呼叫一次即覆蓋。群組或家庭多人時,用清楚的稱呼區分(如「本人」「太太」「大兒子」或對方名字)。',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: '稱呼或名字,如「本人」「Amy」「爸爸」' },
        relation: { type: 'string', description: '與發問者的關係,如「本人」「配偶」「長子」「朋友」' },
        ...birthProperties,
        notes: {
          type: 'string',
          description: '值得記住的重點(職業、關心的議題、已確認的定盤時辰、重大事件年份等),簡短一句',
        },
      },
      required: ['name'],
    },
    run: (input) => {
      const saved = rememberPerson(chatId, input);
      return `已記住:${input.name}${saved.date ? `(${saved.calendar === 'lunar' ? '農曆' : '陽曆'} ${saved.date} ${saved.birthHour ?? '?'} 時 ${saved.gender ?? ''})` : ''}`;
    },
  });

  const addNoteTool = betaTool({
    name: 'remember_note',
    description: '記下一則與此聊天室相關、日後對話仍需要的備註(如使用者的學習進度、偏好的稱呼、正在進行的課程階段、約定的追蹤事項)。不要記錄命盤解讀內容本身。',
    inputSchema: {
      type: 'object',
      properties: { note: { type: 'string', description: '一句話備註' } },
      required: ['note'],
    },
    run: (input) => {
      addNote(chatId, input.note);
      return '已記下。';
    },
  });

  return [rememberPersonTool, addNoteTool];
}

/**
 * 跑一輪對話(含工具呼叫迴圈),回傳老師的文字回覆。
 * @param {Array} history - Anthropic messages 陣列(user/assistant 文字輪替)
 * @param {{chatId?: string|number}} [options]
 */
export async function askTeacher(history, { chatId = 'default' } = {}) {
  const memoryText = formatMemory(loadMemory(chatId));
  const dynamic = [`今天的日期是:${new Date().toISOString().slice(0, 10)}`];
  if (memoryText) dynamic.push(memoryText);

  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [
      // 靜態角色設定放最前面並設快取斷點;日期與聊天室記憶等會變動的內容放在後面
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: dynamic.join('\n\n') },
    ],
    tools: [getAstrolabeTool, getHoroscopeTool, scanYearsTool, ...buildMemoryTools(chatId)],
    messages: history,
    max_iterations: 10,
  });

  const text = finalMessage.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  if (finalMessage.stop_reason === 'refusal') {
    return text || '這個問題老師這邊不方便回答,我們換個方向聊聊好嗎? 🙏';
  }
  if (finalMessage.stop_reason === 'max_tokens') {
    return `${text}\n\n(篇幅太長被截斷了,想接著聽哪一部分再告訴我。)`;
  }
  return text || '(老師沉思了一下,但沒有說話。請再問一次。)';
}
