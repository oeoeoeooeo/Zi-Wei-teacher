import Anthropic from '@anthropic-ai/sdk';
import { betaTool } from '@anthropic-ai/sdk/helpers/beta/json-schema';
import { SYSTEM_PROMPT } from './systemPrompt.js';
import { getAstrolabe, formatAstrolabe, formatHoroscope } from './ziwei.js';

const client = new Anthropic();

const MODEL = 'claude-opus-4-8';

const birthProperties = {
  calendar: {
    type: 'string',
    enum: ['solar', 'lunar'],
    description: '出生日期使用的曆法:solar=陽曆/國曆,lunar=農曆',
  },
  date: {
    type: 'string',
    description: '出生日期,格式 YYYY-M-D,例如 1990-8-16',
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
    '依出生資料排出完整紫微斗數本命盤(十二宮、主星亮度、生年四化、輔佐煞雜曜、五行局、大限歲數區間)。解讀任何命盤前必須先呼叫此工具,不可自行推算。',
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
    '依出生資料與目標日期,取得該時間點的大限、流年、流月、流日、流時資訊(運限干支、運限四化、流曜)。回答「今年運勢」「某年如何」「最近適不適合…」「擇日」這類與時間有關的問題前必須呼叫。',
  inputSchema: {
    type: 'object',
    properties: {
      ...birthProperties,
      targetDate: {
        type: 'string',
        description: '要查詢運勢的目標日期,格式 YYYY-M-D。問「今年」就用今天的日期。',
      },
    },
    required: ['calendar', 'date', 'birthHour', 'gender', 'targetDate'],
  },
  run: (input) => {
    const astrolabe = getAstrolabe(input);
    return formatHoroscope(astrolabe, input.targetDate);
  },
});

/**
 * 跑一輪對話(含工具呼叫迴圈),回傳老師的文字回覆。
 * @param {Array} history - Anthropic messages 陣列(user/assistant 文字輪替)
 */
export async function askTeacher(history) {
  const finalMessage = await client.beta.messages.toolRunner({
    model: MODEL,
    max_tokens: 8192,
    thinking: { type: 'adaptive' },
    system: [
      {
        type: 'text',
        text: `${SYSTEM_PROMPT}\n\n今天的日期是:${new Date().toISOString().slice(0, 10)}`,
      },
    ],
    tools: [getAstrolabeTool, getHoroscopeTool],
    messages: history,
    max_iterations: 8,
  });

  const text = finalMessage.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim();

  return text || '(老師沉思了一下,但沒有說話。請再問一次。)';
}
