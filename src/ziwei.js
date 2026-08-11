import { astro } from 'iztro';

// 十天干四化表(祿、權、科、忌),與 iztro 內部口徑一致(戊科右弼、壬科左輔、庚忌天同)
const MUTAGEN_TABLE = {
  甲: ['廉貞', '破軍', '武曲', '太陽'],
  乙: ['天機', '天梁', '紫微', '太陰'],
  丙: ['天同', '天機', '文昌', '廉貞'],
  丁: ['太陰', '天同', '天機', '巨門'],
  戊: ['貪狼', '太陰', '右弼', '天機'],
  己: ['武曲', '貪狼', '天梁', '文曲'],
  庚: ['太陽', '武曲', '太陰', '天同'],
  辛: ['巨門', '太陽', '文曲', '文昌'],
  壬: ['天梁', '紫微', '左輔', '武曲'],
  癸: ['破軍', '巨門', '太陰', '貪狼'],
};
const MUTAGEN_LABELS = ['祿', '權', '科', '忌'];
// iztro 宮位陣列固定自寅宮起
const BRANCH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];

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

// 建立「星曜名 → 所在宮位」索引(主星+輔星,四化只發生在這些星上)
function buildStarIndex(a) {
  const map = new Map();
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) map.set(s.name, p);
  }
  return map;
}

function branchIndex(branch) {
  return BRANCH_ORDER.indexOf(branch);
}

// 宮干飛四化:回傳「星曜+四化 → 落宮(自化標記)」描述
function flyingMutagens(palace, starIndex) {
  const stars = MUTAGEN_TABLE[palace.heavenlyStem];
  if (!stars) return '';
  return stars
    .map((starName, i) => {
      const target = starIndex.get(starName);
      if (!target) return `${starName}${MUTAGEN_LABELS[i]}→(不在盤中)`;
      const self = target.earthlyBranch === palace.earthlyBranch;
      return `${starName}${MUTAGEN_LABELS[i]}→${target.name}${self ? '(自化' + MUTAGEN_LABELS[i] + ')' : ''}`;
    })
    .join('、');
}

// 三方四正:對宮 + 兩個三合宮
function surroundedPalaces(palace, a) {
  const idx = branchIndex(palace.earthlyBranch);
  const byBranch = new Map(a.palaces.map((p) => [branchIndex(p.earthlyBranch), p]));
  const opposite = byBranch.get((idx + 6) % 12);
  const trine1 = byBranch.get((idx + 4) % 12);
  const trine2 = byBranch.get((idx + 8) % 12);
  return `對宮${opposite.name}(${opposite.earthlyBranch})、三合${trine1.name}(${trine1.earthlyBranch})・${trine2.name}(${trine2.earthlyBranch})`;
}

export function formatAstrolabe(a) {
  const starIndex = buildStarIndex(a);
  const byBranch = new Map(a.palaces.map((p) => [branchIndex(p.earthlyBranch), p]));
  const lines = [];
  lines.push(`性別:${a.gender}`);
  lines.push(`陽曆:${a.solarDate} 農曆:${a.lunarDate}`);
  lines.push(`四柱:${a.chineseDate}`);
  lines.push(`時辰:${a.time}(${a.timeRange}) 生肖:${a.zodiac} 星座:${a.sign}`);
  lines.push(`命宮地支:${a.earthlyBranchOfSoulPalace} 身宮地支:${a.earthlyBranchOfBodyPalace}`);
  lines.push(`命主:${a.soul} 身主:${a.body} 五行局:${a.fiveElementsClass}`);
  const originalPalace = a.palaces.find((p) => p.isOriginalPalace);
  if (originalPalace) {
    lines.push(`來因宮:${originalPalace.name}(${originalPalace.heavenlyStem}${originalPalace.earthlyBranch},宮干同生年天干)`);
  }

  // 生年四化落宮摘要
  const birthMutagens = [];
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      if (s.mutagen) birthMutagens.push({ label: s.mutagen, text: `${s.name}化${s.mutagen}(${p.name})` });
    }
  }
  birthMutagens.sort((x, y) => MUTAGEN_LABELS.indexOf(x.label) - MUTAGEN_LABELS.indexOf(y.label));
  if (birthMutagens.length) {
    lines.push(`生年四化落宮:${birthMutagens.map((m) => m.text).join('、')}`);
  }
  lines.push('');

  for (const p of a.palaces) {
    let major = p.majorStars.map(starLabel).join('、');
    if (!major) {
      const opposite = byBranch.get((branchIndex(p.earthlyBranch) + 6) % 12);
      const borrowed = opposite.majorStars.map(starLabel).join('、');
      major = borrowed
        ? `無主星,借對宮${opposite.name}:${borrowed}`
        : '無主星(對宮亦無主星)';
    }
    const minor = p.minorStars.map(starLabel).join('、');
    const adj = p.adjectiveStars.map((s) => s.name).join('、');
    const marks = `${p.isBodyPalace ? '(身宮)' : ''}${p.isOriginalPalace ? '(來因宮)' : ''}`;
    lines.push(
      `【${p.name}】${p.heavenlyStem}${p.earthlyBranch}${marks} 大限 ${p.decadal.range[0]}-${p.decadal.range[1]} 歲`
    );
    lines.push(`  主星:${major}`);
    if (minor) lines.push(`  輔佐煞曜:${minor}`);
    if (adj) lines.push(`  雜曜:${adj}`);
    lines.push(`  三方四正:${surroundedPalaces(p, a)}`);
    const flying = flyingMutagens(p, starIndex);
    if (flying) lines.push(`  宮干${p.heavenlyStem}飛四化:${flying}`);
    const gods = [];
    if (p.changsheng12) gods.push(`長生12:${p.changsheng12}`);
    if (p.boshi12) gods.push(`博士12:${p.boshi12}`);
    if (p.jiangqian12) gods.push(`將前12:${p.jiangqian12}`);
    if (p.suiqian12) gods.push(`歲前12:${p.suiqian12}`);
    if (gods.length) lines.push(`  神煞:${gods.join(' ')}`);
    if (p.ages && p.ages.length) {
      lines.push(`  小限之年(虛歲):${p.ages.slice(0, 8).join('、')}`);
    }
  }
  return lines.join('\n');
}

export function formatHoroscope(a, targetDate) {
  const h = a.horoscope(targetDate);
  const starIndex = buildStarIndex(a);
  // 地支 → 本命宮位名(供疊宮與流曜定位)
  const natalByBranch = new Map(a.palaces.map((p) => [p.earthlyBranch, p.name]));
  const lines = [];
  lines.push(`目標日期:${h.solarDate}(農曆 ${h.lunarDate})`);
  lines.push('');

  const scope = (label, s) => {
    if (!s) return;
    lines.push(`【${label}】${s.heavenlyStem ?? ''}${s.earthlyBranch ?? ''}`);
    // 疊宮:此運限的命宮落在哪個地支、疊本命何宮
    if (s.palaceNames && s.palaceNames.length) {
      const soulIdx = s.palaceNames.indexOf('命宮');
      if (soulIdx >= 0) {
        const branch = BRANCH_ORDER[soulIdx];
        lines.push(`  ${label}命宮在${branch}(疊本命${natalByBranch.get(branch) ?? '?'})`);
      }
    }
    // 運限四化 + 各化星落在本命哪一宮(疊宮引動處)
    if (s.mutagen && s.mutagen.length) {
      const detail = s.mutagen
        .map((starName, i) => {
          const target = starIndex.get(starName);
          return `${starName}化${MUTAGEN_LABELS[i]}${target ? `(本命${target.name})` : ''}`;
        })
        .join('、');
      lines.push(`  ${label}四化:${detail}`);
    }
    if (s.palaceNames && s.palaceNames.length) {
      lines.push(`  ${label}宮位順序(自寅宮起):${s.palaceNames.join('、')}`);
    }
    if (s.stars && s.stars.length) {
      const flat = s.stars
        .map((group, i) =>
          group.length
            ? `${BRANCH_ORDER[i]}(本命${natalByBranch.get(BRANCH_ORDER[i]) ?? '?'}):${group.map((st) => st.name).join('、')}`
            : null
        )
        .filter(Boolean)
        .join(' | ');
      if (flat) lines.push(`  ${label}流曜:${flat}`);
    }
  };

  scope('大限', h.decadal);
  scope('流年', h.yearly);
  scope('小限', h.age);
  scope('流月', h.monthly);
  scope('流日', h.daily);
  scope('流時', h.hourly);

  if (h.age) lines.push(`\n虛歲:${h.age.nominalAge ?? ''}`);
  return lines.join('\n');
}
