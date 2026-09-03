#!/usr/bin/env node
// 直接印出排盤工具給老師看的原始數據,方便檢查排盤與偵測結果。
//   npm run chart -- <solar|lunar> <YYYY-M-D> <hour 0-23> <male|female> [目標日期 YYYY-M-D] [起始年 結束年]
import { getAstrolabe, formatAstrolabe, formatHoroscope, scanYears } from '../src/ziwei.js';

const [calendar, date, hour, gender, targetDate, startYear, endYear] = process.argv.slice(2);
if (!calendar || !date || hour === undefined || !gender) {
  console.error('用法:npm run chart -- <solar|lunar> <YYYY-M-D> <hour 0-23> <male|female> [目標日期] [起始年 結束年]');
  process.exit(1);
}
const a = getAstrolabe({ calendar, date, birthHour: Number(hour), gender });
console.log(formatAstrolabe(a));
if (targetDate) {
  console.log('\n══════════ 運限 ══════════\n');
  console.log(formatHoroscope(a, targetDate));
}
if (startYear && endYear) {
  console.log('\n══════════ 逐年掃描 ══════════\n');
  console.log(scanYears(a, Number(startYear), Number(endYear)));
}
