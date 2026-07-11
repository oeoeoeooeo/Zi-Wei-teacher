import { astro } from 'iztro';

// iztro 時辰索引:0=早子時(00:00-01:00) 1=丑 2=寅 ... 11=亥 12=晚子時(23:00-24:00)
export function hourToTimeIndex(hour) {
  if (hour === 23) return 12;
  if (hour === 0) return 0;
  return Math.floor((hour + 1) / 2);
}

export function getAstrolabe({ calendar, date, birthHour, gender, isLeapMonth = false }) {
  const timeIndex = hourToTimeIndex(birthHour);
  const genderZh = gender === 'male' ? '男' : '女';
  const astrolabe =
    calendar === 'lunar'
      ? astro.byLunar(date, timeIndex, genderZh, isLeapMonth, true, 'zh-TW')
      : astro.bySolar(date, timeIndex, genderZh, true, 'zh-TW');
  return astrolabe;
}

function starLabel(star) {
  let label = star.name;
  if (star.brightness) label += `(${star.brightness})`;
  if (star.mutagen) label += `[化${star.mutagen}]`;
  return label;
}

export function formatAstrolabe(a) {
  const lines = [];
  lines.push(`性別:${a.gender}`);
  lines.push(`陽曆:${a.solarDate} 農曆:${a.lunarDate}`);
  lines.push(`四柱:${a.chineseDate}`);
  lines.push(`時辰:${a.time}(${a.timeRange}) 生肖:${a.zodiac} 星座:${a.sign}`);
  lines.push(`命宮地支:${a.earthlyBranchOfSoulPalace} 身宮地支:${a.earthlyBranchOfBodyPalace}`);
  lines.push(`命主:${a.soul} 身主:${a.body} 五行局:${a.fiveElementsClass}`);
  lines.push('');
  for (const p of a.palaces) {
    const major = p.majorStars.map(starLabel).join('、') || '無主星(借對宮)';
    const minor = p.minorStars.map(starLabel).join('、');
    const adj = p.adjectiveStars.map((s) => s.name).join('、');
    const body = p.isBodyPalace ? '(身宮)' : '';
    lines.push(
      `【${p.name}】${p.heavenlyStem}${p.earthlyBranch}${body} 大限 ${p.decadal.range[0]}-${p.decadal.range[1]} 歲`
    );
    lines.push(`  主星:${major}`);
    if (minor) lines.push(`  輔佐煞曜:${minor}`);
    if (adj) lines.push(`  雜曜:${adj}`);
    const gods = [];
    if (p.changsheng12) gods.push(`長生12:${p.changsheng12}`);
    if (p.boshi12) gods.push(`博士12:${p.boshi12}`);
    if (gods.length) lines.push(`  神煞:${gods.join(' ')}`);
  }
  return lines.join('\n');
}

export function formatHoroscope(a, targetDate) {
  const h = a.horoscope(targetDate);
  const lines = [];
  lines.push(`目標日期:${h.solarDate}(農曆 ${h.lunarDate})`);
  lines.push('');

  const scope = (label, s) => {
    if (!s) return;
    lines.push(`【${label}】${s.heavenlyStem ?? ''}${s.earthlyBranch ?? ''}`);
    if (s.mutagen && s.mutagen.length) {
      lines.push(`  ${label}四化(祿權科忌):${s.mutagen.join('、')}`);
    }
    if (s.palaceNames && s.palaceNames.length) {
      lines.push(`  宮位順序(自寅宮起):${s.palaceNames.join('、')}`);
    }
    if (s.stars && s.stars.length) {
      const flat = s.stars
        .map((group, i) => (group.length ? `${i}:${group.map((st) => st.name).join('、')}` : null))
        .filter(Boolean)
        .join(' | ');
      if (flat) lines.push(`  ${label}流曜(索引為自寅宮起的宮位):${flat}`);
    }
  };

  scope('大限', h.decadal);
  scope('流年', h.yearly);
  scope('流月', h.monthly);
  scope('流日', h.daily);
  scope('流時', h.hourly);

  if (h.age) lines.push(`\n虛歲:${h.age.nominalAge ?? ''}`);
  return lines.join('\n');
}
