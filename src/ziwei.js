import { astro } from 'iztro';

// 十天干四化表(祿、權、科、忌),與 iztro 內部口徑一致(戊科右弼、壬科左輔、庚忌天同)
export const MUTAGEN_TABLE = {
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
export const BRANCH_ORDER = ['寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥', '子', '丑'];
const BRANCH_ZODIAC = { 子: '鼠', 丑: '牛', 寅: '虎', 卯: '兔', 辰: '龍', 巳: '蛇', 午: '馬', 未: '羊', 申: '猴', 酉: '雞', 戌: '狗', 亥: '豬' };
// 地支六合(明祿暗祿用)
const SIX_HARMONY = { 子: '丑', 丑: '子', 寅: '亥', 亥: '寅', 卯: '戌', 戌: '卯', 辰: '酉', 酉: '辰', 巳: '申', 申: '巳', 午: '未', 未: '午' };
// 地支相刑(子卯、寅巳申、丑戌未、辰午酉亥自刑)
const PUNISH = { 子: ['卯'], 卯: ['子'], 寅: ['巳', '申'], 巳: ['寅', '申'], 申: ['寅', '巳'], 丑: ['戌', '未'], 戌: ['丑', '未'], 未: ['丑', '戌'], 辰: ['辰'], 午: ['午'], 酉: ['酉'], 亥: ['亥'] };
// 地支相害
const HARM = { 子: '未', 未: '子', 丑: '午', 午: '丑', 寅: '巳', 巳: '寅', 卯: '辰', 辰: '卯', 申: '亥', 亥: '申', 酉: '戌', 戌: '酉' };
// 地支相破
const BREAK = { 子: '酉', 酉: '子', 丑: '辰', 辰: '丑', 寅: '亥', 亥: '寅', 卯: '午', 午: '卯', 巳: '申', 申: '巳', 未: '戌', 戌: '未' };

const BRIGHT = new Set(['廟', '旺', '得']);
const DIM = new Set(['陷', '不']);

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

function byBranchMap(a) {
  return new Map(a.palaces.map((p) => [branchIndex(p.earthlyBranch), p]));
}

function allStars(p) {
  return [...p.majorStars, ...p.minorStars, ...p.adjectiveStars];
}

function palaceHas(p, name) {
  return allStars(p).some((s) => s.name === name);
}

function starIn(p, name) {
  return allStars(p).find((s) => s.name === name);
}

// 宮位的三方四正(含本宮):本宮、對宮、兩個三合宮
function trinePalaces(p, a) {
  const byBranch = byBranchMap(a);
  const idx = branchIndex(p.earthlyBranch);
  return [p, byBranch.get((idx + 6) % 12), byBranch.get((idx + 4) % 12), byBranch.get((idx + 8) % 12)];
}

// 鄰宮(前後兩宮,用於夾宮)
function neighborPalaces(p, a) {
  const byBranch = byBranchMap(a);
  const idx = branchIndex(p.earthlyBranch);
  return [byBranch.get((idx + 11) % 12), byBranch.get((idx + 1) % 12)];
}

function trineHas(p, a, names) {
  const ps = trinePalaces(p, a);
  return names.every((n) => ps.some((q) => palaceHas(q, n)));
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
  const [, opposite, trine1, trine2] = trinePalaces(palace, a);
  return `對宮${opposite.name}(${opposite.earthlyBranch})、三合${trine1.name}(${trine1.earthlyBranch})・${trine2.name}(${trine2.earthlyBranch})`;
}

// 夾宮偵測:回傳此宮被哪些星曜組合所夾
function bracketPatterns(p, a) {
  const [prev, next] = neighborPalaces(p, a);
  const pairs = [
    ['擎羊', '陀羅', '羊陀夾'],
    ['火星', '鈴星', '火鈴夾'],
    ['地空', '地劫', '空劫夾'],
    ['左輔', '右弼', '輔弼夾'],
    ['文昌', '文曲', '昌曲夾'],
    ['天魁', '天鉞', '魁鉞夾'],
    ['太陽', '太陰', '日月夾'],
  ];
  const out = [];
  for (const [x, y, label] of pairs) {
    if ((palaceHas(prev, x) && palaceHas(next, y)) || (palaceHas(prev, y) && palaceHas(next, x))) out.push(label);
  }
  // 生年祿權科夾(任兩化)
  const mutagenOf = (q) => [...q.majorStars, ...q.minorStars].filter((s) => s.mutagen).map((s) => s.mutagen);
  const mp = mutagenOf(prev);
  const mn = mutagenOf(next);
  const good = ['祿', '權', '科'];
  if (mp.some((m) => good.includes(m)) && mn.some((m) => good.includes(m))) {
    out.push(`${mp.filter((m) => good.includes(m)).join('')}${mn.filter((m) => good.includes(m)).join('')}夾(生年吉化夾宮)`);
  }
  if (mp.includes('忌') || mn.includes('忌')) {
    const other = mp.includes('忌') ? mn : mp;
    if (other.includes('忌')) out.push('雙忌夾(前後宮皆生年忌)');
  }
  return out;
}

/**
 * 格局自動偵測。以命宮為主,回傳 {name, where, note} 陣列。
 * 定義採常見通說並偏保守;仍需老師依三方四正煞忌裁定成格與破格。
 */
export function detectPatterns(a) {
  const out = [];
  const soul = a.palaces.find((p) => p.name === '命宮');
  const body = a.palaces.find((p) => p.isBodyPalace);
  const byBranch = byBranchMap(a);
  const starIndex = buildStarIndex(a);
  const soulBranch = soul.earthlyBranch;
  const trine = trinePalaces(soul, a);
  const trineHasAll = (names) => trineHas(soul, a, names);
  const trineStars = (name) => trine.find((q) => palaceHas(q, name));
  const add = (name, where, note) => out.push({ name, where, note });
  const soulMajor = soul.majorStars.map((s) => s.name);
  const bright = (name) => {
    const p = starIndex.get(name);
    const s = p && starIn(p, name);
    return s?.brightness ?? '';
  };
  const hasMut = (label) => a.palaces.some((p) => [...p.majorStars, ...p.minorStars].some((s) => s.mutagen === label));
  const mutPalace = (label) => a.palaces.find((p) => [...p.majorStars, ...p.minorStars].some((s) => s.mutagen === label));
  const inTrine = (p) => !!p && trine.includes(p);

  // ── 命宮結構 ──
  if (soul.majorStars.length === 0) {
    const opp = trine[1];
    add('命無正曜', `命宮(${soulBranch})`, `借對宮${opp.name}主星${opp.majorStars.map((s) => s.name).join('、') || '(亦無)'}論之,力量打折;需看夾宮與四化`);
  }
  if (soulMajor.includes('紫微') && soulBranch === '午') add('極向離明', '命宮(午)', '紫微在午坐命,帝座得地');
  if (soulMajor.includes('紫微') && soulBranch === '子') add('紫微居子', '命宮(子)', '紫微在子,獨坐宜見輔弼');
  if (soulMajor.includes('太陽') && soulBranch === '卯') add('日照雷門', '命宮(卯)', '太陽在卯坐命,名大於利');
  if (soulMajor.includes('太陰') && soulBranch === '亥') add('月朗天門', '命宮(亥)', '太陰在亥坐命,財蔭雙全');
  if (soulMajor.includes('巨門') && ['子', '午'].includes(soulBranch)) add('石中隱玉', `命宮(${soulBranch})`, '巨門子午坐命,厚積薄發,得祿權尤佳');
  if (soulMajor.includes('七殺') && ['寅', '申'].includes(soulBranch)) add('七殺朝斗', `命宮(${soulBranch})`, '七殺寅申坐命');
  if (soulMajor.includes('七殺') && ['子', '午'].includes(soulBranch)) add('七殺仰斗', `命宮(${soulBranch})`, '七殺子午坐命');
  if (soulMajor.includes('廉貞') && ['寅', '申'].includes(soulBranch) && soul.majorStars.length === 1) add('雄宿朝元', `命宮(${soulBranch})`, '廉貞寅申獨坐');
  if (soulMajor.includes('天梁') && ['子', '午'].includes(soulBranch)) add('壽星入廟', `命宮(${soulBranch})`, '天梁子午坐命');
  if (soulMajor.includes('太陽') && soulMajor.includes('巨門')) add('巨日同宮', `命宮(${soulBranch})`, '口才傳播、異域生財');
  if (soulMajor.includes('武曲') && soulMajor.includes('貪狼')) add('貪武同行', `命宮(${soulBranch})`, '先貧後富,三十後發');
  if (soulMajor.includes('天機') && soulMajor.includes('巨門') && soulBranch === '卯') add('巨機居卯', '命宮(卯)', '上格,見祿權尤佳');
  if (soulMajor.includes('天機') && soulMajor.includes('巨門') && soulBranch === '酉' && soul.majorStars.some((s) => s.mutagen === '忌')) add('巨機化酉', '命宮(酉)', '機巨在酉逢忌,主奔波是非');

  // ── 三方四正星曜格 ──
  if (trineHasAll(['紫微', '天府']) && !soulMajor.includes('紫微') && !soulMajor.includes('天府')) add('紫府朝垣', '命宮三方四正', '紫微天府拱命');
  if (trineHasAll(['天府', '天相']) && !soulMajor.includes('天府') && !soulMajor.includes('天相')) add('府相朝垣', '命宮三方四正', '府相拱命,衣祿豐足');
  if (soulMajor.includes('紫微') && trineHasAll(['左輔', '右弼'])) add('君臣慶會', '命宮三方四正', '紫微得輔弼拱照');
  if (soulMajor.includes('紫微') && soul.majorStars.some((s) => ['天府', '天相'].includes(s.name)) && trine.some((q) => palaceHas(q, '左輔') || palaceHas(q, '右弼'))) add('君臣慶會(廣義)', '命宮三方四正', '紫微府相會輔弼');
  if (trineHasAll(['七殺', '破軍', '貪狼'])) add('殺破狼', '命宮三方四正', '動盪開創之局,成敗看四化與吉煞');
  if (trineHasAll(['天機', '太陰', '天同', '天梁'])) add('機月同梁', '命宮三方四正', '宜公教、幕僚、企劃、服務');
  if (trineHasAll(['太陽', '天梁', '文昌']) && (trine.some((q) => palaceHas(q, '祿存')) || trine.some((q) => [...q.majorStars, ...q.minorStars].some((s) => s.mutagen === '祿')))) add('陽梁昌祿', '命宮三方四正', '考試功名第一格');
  if (trineHasAll(['太陽', '太陰'])) {
    const sunB = bright('太陽');
    const moonB = bright('太陰');
    if (BRIGHT.has(sunB) && BRIGHT.has(moonB)) add('日月並明', '命宮三方四正', `太陽${sunB}、太陰${moonB}皆明`);
    else if (DIM.has(sunB) && DIM.has(moonB)) add('日月反背', '命宮三方四正', `太陽${sunB}、太陰${moonB}皆失輝,宜離祖發展、靠後天努力`);
  } else {
    const sunP = starIndex.get('太陽');
    const moonP = starIndex.get('太陰');
    if (sunP && moonP && DIM.has(bright('太陽')) && DIM.has(bright('太陰')) && (inTrine(sunP) || inTrine(moonP))) add('日月反背(偏)', '太陽太陰皆陷', '日月無光,宜離鄉背井、白手起家');
  }
  if (soulBranch === '丑' || soulBranch === '未') {
    if (soulMajor.includes('太陽') && soulMajor.includes('太陰')) add('日月同宮', `命宮(${soulBranch})`, '陰陽交會,性情明暗起伏');
  }
  const [, oppP, t1, t2] = trine;
  if (palaceHas(oppP, '太陽') && palaceHas(oppP, '太陰')) add('日月照命(對宮日月)', `${oppP.name}(${oppP.earthlyBranch})`, '日月在對宮拱照');

  // ── 祿與財格 ──
  const luCunP = starIndex.get('祿存');
  const huaLuP = mutPalace('祿');
  if (luCunP && huaLuP && inTrine(luCunP) && inTrine(huaLuP)) {
    add(luCunP === huaLuP ? '祿合鴛鴦(雙祿同宮)' : '雙祿朝垣', `祿存(${luCunP.name})、化祿(${huaLuP.name})`, '雙祿會命,財源穩固');
  }
  if (luCunP && luCunP === soul && huaLuP && SIX_HARMONY[soulBranch] === huaLuP.earthlyBranch) add('明祿暗祿', `祿存坐命,化祿在${huaLuP.name}(六合)`, '暗中有財,得意外之助');
  const maP = starIndex.get('天馬');
  if (maP && inTrine(maP)) {
    const luHere = palaceHas(maP, '祿存') || [...maP.majorStars, ...maP.minorStars].some((s) => s.mutagen === '祿');
    const oppMa = byBranch.get((branchIndex(maP.earthlyBranch) + 6) % 12);
    const luOpp = palaceHas(oppMa, '祿存') || [...oppMa.majorStars, ...oppMa.minorStars].some((s) => s.mutagen === '祿');
    if (luHere) add('祿馬交馳', `${maP.name}(${maP.earthlyBranch})`, '祿馬同宮,宜遠方求財、動中生財');
    else if (luOpp) add('祿馬交馳(對照)', `天馬${maP.name}、祿在${oppMa.name}`, '祿馬對拱');
  }
  const tanP = starIndex.get('貪狼');
  if (tanP) {
    if (palaceHas(tanP, '火星')) add('火貪格', `${tanP.name}(${tanP.earthlyBranch})`, '橫發之格,辰戌丑未尤佳;見煞忌則暴起暴落');
    if (palaceHas(tanP, '鈴星')) add('鈴貪格', `${tanP.name}(${tanP.earthlyBranch})`, '橫發之格,見煞忌則暴起暴落');
    if (tanP.earthlyBranch === '子' && (palaceHas(tanP, '擎羊') || palaceHas(tanP, '陀羅') || palaceHas(tanP, '天姚') || palaceHas(tanP, '咸池'))) add('泛水桃花', `${tanP.name}(子)`, '貪狼在子會煞或桃花星,感情多波、宜自律');
    if (tanP.earthlyBranch === '寅' && palaceHas(tanP, '陀羅')) add('風流綵杖', `${tanP.name}(寅)`, '貪狼陀羅在寅,感情與慾望的功課');
    if (palaceHas(tanP, '廉貞') && ['巳', '亥'].includes(tanP.earthlyBranch) && (palaceHas(tanP, '擎羊') || palaceHas(tanP, '陀羅') || palaceHas(tanP, '火星') || palaceHas(tanP, '鈴星'))) add('風流綵杖(廉貪會煞)', `${tanP.name}(${tanP.earthlyBranch})`, '廉貪陷地會煞,見天刑則反主自律');
  }

  // ── 四化格 ──
  const luP = mutPalace('祿');
  const quanP = mutPalace('權');
  const keP = mutPalace('科');
  const jiP = mutPalace('忌');
  if (luP && quanP && keP && inTrine(luP) && inTrine(quanP) && inTrine(keP)) add('三奇嘉會', '命宮三方四正', '生年祿權科齊會命宮三方,格局高');
  else if (luP && quanP && inTrine(luP) && inTrine(quanP)) add('權祿巡逢', '命宮三方四正', '祿權會命');
  else if (luP && keP && inTrine(luP) && inTrine(keP)) add('科祿巡逢', '命宮三方四正', '祿科會命');
  else if (quanP && keP && inTrine(quanP) && inTrine(keP)) add('科權巡逢', '命宮三方四正', '權科會命');
  if (jiP && inTrine(jiP)) add('命宮三方見生年忌', `${jiP.name}(${jiP.earthlyBranch})`, `${[...jiP.majorStars, ...jiP.minorStars].find((s) => s.mutagen === '忌')?.name}化忌在命宮三方四正,為一生課題所在`);

  // ── 吉星格 ──
  if (palaceHas(soul, '左輔') && palaceHas(soul, '右弼')) add('左右同宮', `命宮(${soulBranch})`, '輔弼同坐命,助力多');
  else if (trineHasAll(['左輔', '右弼']) && !soulMajor.includes('紫微')) add('輔弼拱命', '命宮三方四正', '左輔右弼拱照');
  if (palaceHas(soul, '文昌') && palaceHas(soul, '文曲')) add('文桂文華(昌曲同宮)', `命宮(${soulBranch})`, '昌曲坐命,文才出眾');
  else if (trineHasAll(['文昌', '文曲'])) add('昌曲拱命', '命宮三方四正', '文昌文曲會照');
  const kuiP = starIndex.get('天魁');
  const yueP = starIndex.get('天鉞');
  if (kuiP && yueP) {
    if ((kuiP === soul && yueP === oppP) || (yueP === soul && kuiP === oppP)) add('坐貴向貴', '命宮與遷移', '魁鉞命遷對照,貴人顯著');
    else if (inTrine(kuiP) && inTrine(yueP)) add('魁鉞拱命', '命宮三方四正', '天魁天鉞會照');
  }

  // ── 凶格與夾宮 ──
  const yangP = starIndex.get('擎羊');
  const tuoP = starIndex.get('陀羅');
  for (const p of a.palaces) {
    const brackets = bracketPatterns(p, a);
    const hasJi = [...p.majorStars, ...p.minorStars].some((s) => s.mutagen === '忌');
    if (brackets.includes('羊陀夾') && hasJi) add('羊陀夾忌', `${p.name}(${p.earthlyBranch})`, '生年忌被羊陀所夾,該宮壓力極大,為重點課題');
    if (brackets.includes('羊陀夾') && palaceHas(p, '祿存') && !hasJi && p === soul) add('羊陀夾命(祿存坐命)', `命宮(${soulBranch})`, '祿存坐命必羊陀夾,主謹慎守財、壓力自來');
    if (p === soul) {
      if (brackets.includes('火鈴夾')) add('火鈴夾命', `命宮(${soulBranch})`, '性急易躁,防意外與衝突');
      if (brackets.includes('空劫夾')) add('空劫夾命', `命宮(${soulBranch})`, '財來財去,宜精神層面發展');
      if (brackets.includes('輔弼夾')) add('輔弼夾命', `命宮(${soulBranch})`, '左右夾輔,貴人扶持');
      if (brackets.includes('昌曲夾')) add('昌曲夾命', `命宮(${soulBranch})`, '文星夾命,文書才藝');
      if (brackets.includes('魁鉞夾')) add('魁鉞夾命', `命宮(${soulBranch})`, '貴人夾命');
      if (brackets.includes('日月夾')) add('日月夾命', `命宮(${soulBranch})`, '日月夾輔');
      for (const b of brackets) if (b.includes('夾(生年吉化夾宮)')) add('吉化夾命', `命宮(${soulBranch})`, `前後宮${b}`);
    }
  }
  if (palaceHas(soul, '地空') && palaceHas(soul, '地劫')) add('命裡逢空', `命宮(${soulBranch})`, '空劫坐命,宜哲思創意、不宜投機');
  else if (palaceHas(soul, '地空') || palaceHas(soul, '地劫')) add('空劫坐命(單見)', `命宮(${soulBranch})`, '見一顆空劫,思想脫俗、財宜守');
  if (yangP === soul && soulBranch === '午') add('馬頭帶箭', '命宮(午)', '擎羊在午坐命,威鎮邊疆、宜異地武職競技,亦主奔波刑傷');
  if (trineHasAll(['鈴星', '文昌', '陀羅', '武曲'])) add('鈴昌陀武', '命宮三方四正', '四星會照,古云限至投河;今解為水險、文書財務糾紛,行運見忌煞之年特別小心');
  const lianP = starIndex.get('廉貞');
  if (lianP && palaceHas(lianP, '天相') && palaceHas(lianP, '擎羊')) add('刑囚夾印', `${lianP.name}(${lianP.earthlyBranch})`, '廉相遇擎羊,防官非文書');
  const xiangP = starIndex.get('天相');
  if (xiangP) {
    const [pv, nx] = neighborPalaces(xiangP, a);
    const jiInNb = (q) => [...q.majorStars, ...q.minorStars].some((s) => s.mutagen === '忌');
    const luInNb = (q) => [...q.majorStars, ...q.minorStars].some((s) => s.mutagen === '祿') || palaceHas(q, '祿存');
    if ((jiInNb(pv) && luInNb(nx)) || (jiInNb(nx) && luInNb(pv))) add('財蔭夾印', `天相(${xiangP.name})`, '天相被祿與忌所夾:祿在則「財蔭夾印」主貴人,忌在則帶「刑忌夾印」壓力,兩者並見,福禍相倚');
    else if (jiInNb(pv) || jiInNb(nx)) add('刑忌夾印', `天相(${xiangP.name})`, '天相鄰宮見生年忌,印星受制,防文書契約與官非');
    else if (luInNb(pv) && luInNb(nx)) add('財蔭夾印', `天相(${xiangP.name})`, '天相被祿所夾,貴人提攜、坐享其成');
  }
  // 羊陀火鈴之數(命宮三方四正煞星總數)
  const shaNames = ['擎羊', '陀羅', '火星', '鈴星', '地空', '地劫'];
  const shaInTrine = shaNames.filter((n) => trine.some((q) => palaceHas(q, n)));
  const shaInSoul = shaNames.filter((n) => palaceHas(soul, n));
  add('煞星統計', '命宮三方四正', `命宮坐煞:${shaInSoul.join('、') || '無'};三方四正見煞:${shaInTrine.join('、') || '無'}(共${shaInTrine.length}顆)`);

  // 身宮
  if (body) {
    const bodyNote = body.name === '命宮'
      ? '命身同宮,先天後天一致,個性鮮明、專注但也固執'
      : ({
          夫妻: '身在夫妻,感情婚姻對一生走向影響大,重視伴侶',
          財帛: '身在財帛,人生重心在求財理財',
          遷移: '身在遷移,外出發展、動中得利,人生多變動',
          官祿: '身在官祿,事業為人生重心,以工作定義自我',
          福德: '身在福德,重精神享受與內心安頓,晚運看福德',
        }[body.name] ?? '');
    add('身宮所在', `${body.name}(${body.earthlyBranch})`, bodyNote);
  }
  return out;
}

export function formatAstrolabe(a) {
  const starIndex = buildStarIndex(a);
  const byBranch = byBranchMap(a);
  const lines = [];
  lines.push(`性別:${a.gender}`);
  lines.push(`陽曆:${a.solarDate} 農曆:${a.lunarDate}`);
  lines.push(`四柱:${a.chineseDate}`);
  lines.push(`時辰:${a.time}(${a.timeRange}) 生肖:${a.zodiac} 星座:${a.sign}`);
  const body = a.palaces.find((p) => p.isBodyPalace);
  lines.push(`命宮地支:${a.earthlyBranchOfSoulPalace} 身宮地支:${a.earthlyBranchOfBodyPalace}(身宮落於${body?.name ?? '?'})`);
  lines.push(`命主:${a.soul} 身主:${a.body} 五行局:${a.fiveElementsClass}`);
  const originalPalace = a.palaces.find((p) => p.isOriginalPalace);
  if (originalPalace) {
    lines.push(`來因宮:${originalPalace.name}(${originalPalace.heavenlyStem}${originalPalace.earthlyBranch},宮干同生年天干)`);
  }

  // 生年四化落宮摘要(含沖對宮)
  const birthMutagens = [];
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      if (s.mutagen) {
        const opp = byBranch.get((branchIndex(p.earthlyBranch) + 6) % 12);
        const extra = s.mutagen === '忌' ? `,沖${opp.name}` : '';
        birthMutagens.push({ label: s.mutagen, text: `${s.name}化${s.mutagen}(${p.name}${extra})` });
      }
    }
  }
  birthMutagens.sort((x, y) => MUTAGEN_LABELS.indexOf(x.label) - MUTAGEN_LABELS.indexOf(y.label));
  if (birthMutagens.length) {
    lines.push(`生年四化落宮:${birthMutagens.map((m) => m.text).join('、')}`);
  }

  // 目前所在大限
  const nowYear = new Date().getFullYear();
  const birthYear = parseInt(a.solarDate.split('-')[0], 10);
  const nominalAge = nowYear - birthYear + 1;
  const currentDecadal = a.palaces.find((p) => nominalAge >= p.decadal.range[0] && nominalAge <= p.decadal.range[1]);
  if (currentDecadal) {
    lines.push(`今年虛歲約 ${nominalAge},現行大限:${currentDecadal.name}宮(${currentDecadal.heavenlyStem}${currentDecadal.earthlyBranch},${currentDecadal.decadal.range[0]}-${currentDecadal.decadal.range[1]} 歲)`);
  }

  // 格局偵測
  const patterns = detectPatterns(a);
  if (patterns.length) {
    lines.push('');
    lines.push('【格局偵測】(程式依通行定義自動判斷,供老師核對三方四正煞忌後裁定成格/破格)');
    for (const pt of patterns) lines.push(`- ${pt.name}|${pt.where}|${pt.note}`);
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
    const brackets = bracketPatterns(p, a);
    if (brackets.length) lines.push(`  夾宮:${brackets.join('、')}`);
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

// 生年支與流年支的關係(犯太歲判斷)
function taiSuiRelation(birthBranch, yearBranch) {
  const rel = [];
  if (birthBranch === yearBranch) rel.push('值太歲(本命年)');
  if ((branchIndex(birthBranch) + 6) % 12 === branchIndex(yearBranch)) rel.push('沖太歲');
  if (PUNISH[birthBranch]?.includes(yearBranch)) rel.push('刑太歲');
  if (HARM[birthBranch] === yearBranch) rel.push('害太歲');
  if (BREAK[birthBranch] === yearBranch) rel.push('破太歲');
  return rel;
}

// 運限四化與生年四化的交涉
function mutagenInteractions(label, scopeMutagen, a, starIndex, birthMutagenByStar, birthMutagenByPalace) {
  const notes = [];
  scopeMutagen.forEach((starName, i) => {
    const m = MUTAGEN_LABELS[i];
    const p = starIndex.get(starName);
    if (!p) return;
    const birthOnStar = birthMutagenByStar.get(starName);
    if (birthOnStar) {
      if (m === '祿' && birthOnStar === '忌') notes.push(`${label}祿逢生年忌同星(${starName},${p.name}):祿忌交會,先甜後苦、得而復失,或為化解課題之機`);
      else if (m === '忌' && birthOnStar === '祿') notes.push(`${label}忌沖生年祿同星(${starName},${p.name}):祿忌相沖,原有資源受阻,防破耗`);
      else if (m === '忌' && birthOnStar === '忌') notes.push(`${label}忌疊生年忌(${starName},${p.name}):雙忌同星,該宮課題引爆點`);
      else if (m === '祿' && birthOnStar === '祿') notes.push(`${label}祿疊生年祿(${starName},${p.name}):雙祿,機會窗口`);
      else if (m === '權' && birthOnStar === '權') notes.push(`${label}權疊生年權(${starName},${p.name}):雙權,掌控力強但易衝`);
      else if (m === '權' && birthOnStar === '忌') notes.push(`${label}權逢生年忌(${starName},${p.name}):權忌同星,執著中求突破、易硬碰硬`);
      else if (m === '科' && birthOnStar === '忌') notes.push(`${label}科逢生年忌(${starName},${p.name}):科忌同星,課題有貴人緩解`);
    }
    const others = (birthMutagenByPalace.get(p.earthlyBranch) ?? []).filter((x) => x.star !== starName);
    for (const o of others) {
      if (m === '忌' && o.label === '忌') notes.push(`${label}忌入本命${p.name}與生年忌(${o.star})同宮:雙忌同宮`);
      if (m === '忌' && o.label === '祿') notes.push(`${label}忌入本命${p.name}與生年祿(${o.star})同宮:祿忌同宮,得失並見`);
      if (m === '祿' && o.label === '忌') notes.push(`${label}祿入本命${p.name}與生年忌(${o.star})同宮:祿忌同宮,苦中有甜`);
    }
    if (m === '忌') {
      const opp = a.palaces.find((q) => branchIndex(q.earthlyBranch) === (branchIndex(p.earthlyBranch) + 6) % 12);
      notes.push(`${label}忌(${starName})坐本命${p.name},沖${opp.name}`);
    }
  });
  return notes;
}

function birthMutagenMaps(a) {
  const byStar = new Map();
  const byPalace = new Map();
  for (const p of a.palaces) {
    for (const s of [...p.majorStars, ...p.minorStars]) {
      if (s.mutagen) {
        byStar.set(s.name, s.mutagen);
        if (!byPalace.has(p.earthlyBranch)) byPalace.set(p.earthlyBranch, []);
        byPalace.get(p.earthlyBranch).push({ star: s.name, label: s.mutagen });
      }
    }
  }
  return { byStar, byPalace };
}

// 運限十二宮 → 本命宮位對照表
function overlayMap(palaceNames, natalByBranch) {
  const order = ['命宮', '兄弟', '夫妻', '子女', '財帛', '疾厄', '遷移', '僕役', '官祿', '田宅', '福德', '父母'];
  const map = new Map();
  palaceNames.forEach((name, i) => map.set(name, BRANCH_ORDER[i]));
  return order
    .filter((n) => map.has(n))
    .map((n) => `${n}=${natalByBranch.get(map.get(n)) ?? '?'}(${map.get(n)})`)
    .join('、');
}

export function formatHoroscope(a, targetDate, targetHour) {
  const h = targetHour === undefined || targetHour === null
    ? a.horoscope(targetDate)
    : a.horoscope(targetDate, hourToTimeIndex(targetHour));
  const starIndex = buildStarIndex(a);
  const { byStar, byPalace } = birthMutagenMaps(a);
  // 地支 → 本命宮位名(供疊宮與流曜定位)
  const natalByBranch = new Map(a.palaces.map((p) => [p.earthlyBranch, p.name]));
  const lines = [];
  lines.push(`目標日期:${h.solarDate}(農曆 ${h.lunarDate})${targetHour !== undefined && targetHour !== null ? ` 目標時辰:${targetHour} 時` : ''}`);
  if (h.age) lines.push(`虛歲:${h.age.nominalAge ?? ''}`);
  const birthBranch = a.chineseDate?.trim().split(/\s+/)[0]?.slice(1);
  if (birthBranch && h.yearly?.earthlyBranch) {
    const rel = taiSuiRelation(birthBranch, h.yearly.earthlyBranch);
    lines.push(`太歲關係:生年${birthBranch}(${BRANCH_ZODIAC[birthBranch] ?? ''})vs 流年${h.yearly.earthlyBranch}(${BRANCH_ZODIAC[h.yearly.earthlyBranch] ?? ''}) → ${rel.length ? rel.join('、') : '不犯太歲'}`);
  }
  lines.push('');

  const scopeMutagens = {};
  const scope = (label, s) => {
    if (!s) return;
    const extra = s.range ? `(${s.range[0]}-${s.range[1]} 歲)` : '';
    lines.push(`【${label}】${s.heavenlyStem ?? ''}${s.earthlyBranch ?? ''}${extra}`);
    if (s.palaceNames && s.palaceNames.length) {
      const soulIdx = s.palaceNames.indexOf('命宮');
      if (soulIdx >= 0) {
        const branch = BRANCH_ORDER[soulIdx];
        const natal = a.palaces.find((p) => p.earthlyBranch === branch);
        const stars = natal ? [...natal.majorStars, ...natal.minorStars].map(starLabel).join('、') : '';
        lines.push(`  ${label}命宮在${branch}(疊本命${natalByBranch.get(branch) ?? '?'};該宮星曜:${stars || '無主星'})`);
      }
      lines.push(`  ${label}十二宮疊本命:${overlayMap(s.palaceNames, natalByBranch)}`);
    }
    if (s.mutagen && s.mutagen.length) {
      scopeMutagens[label] = s.mutagen;
      const detail = s.mutagen
        .map((starName, i) => {
          const target = starIndex.get(starName);
          return `${starName}化${MUTAGEN_LABELS[i]}${target ? `(本命${target.name})` : ''}`;
        })
        .join('、');
      lines.push(`  ${label}四化:${detail}`);
      const notes = mutagenInteractions(label, s.mutagen, a, starIndex, byStar, byPalace);
      if (notes.length) lines.push(`  ${label}四化交涉:${notes.join(';')}`);
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
  if (targetHour !== undefined && targetHour !== null) scope('流時', h.hourly);

  // 大限 × 流年 四化交疊
  const dec = scopeMutagens['大限'];
  const yr = scopeMutagens['流年'];
  if (dec && yr) {
    const cross = [];
    const decJiP = starIndex.get(dec[3]);
    const yrJiP = starIndex.get(yr[3]);
    if (dec[3] === yr[3]) cross.push(`大限忌與流年忌同星(${dec[3]}),雙忌引爆於本命${decJiP?.name}`);
    else if (decJiP && yrJiP && decJiP === yrJiP) cross.push(`大限忌(${dec[3]})與流年忌(${yr[3]})同入本命${decJiP.name}:雙忌同宮,當年該宮課題最重`);
    const decLuP = starIndex.get(dec[0]);
    const yrLuP = starIndex.get(yr[0]);
    if (decLuP && yrLuP && decLuP === yrLuP) cross.push(`大限祿與流年祿同入本命${decLuP.name}:雙祿,當年該宮機會最大`);
    if (decLuP && yrJiP && decLuP === yrJiP) cross.push(`流年忌(${yr[3]})沖入大限祿(${dec[0]})所在本命${decLuP.name}:祿忌交沖`);
    if (decJiP && yrLuP && decJiP === yrLuP) cross.push(`流年祿(${yr[0]})入大限忌(${dec[3]})所在本命${decJiP.name}:忌中見祿,難中有解`);
    if (yrJiP && decJiP) {
      const oppIdx = (branchIndex(decJiP.earthlyBranch) + 6) % 12;
      if (branchIndex(yrJiP.earthlyBranch) === oppIdx) cross.push(`流年忌與大限忌對沖(本命${yrJiP.name}↔${decJiP.name}):雙忌夾擊,慎防兩宮事項同時出狀況`);
    }
    if (cross.length) {
      lines.push('');
      lines.push(`【大限×流年交疊】${cross.join(';')}`);
    }
  }
  return lines.join('\n');
}

/**
 * 逐年掃描:回傳 startYear~endYear 每年精簡的流年訊號,供應期判斷。
 */
export function scanYears(a, startYear, endYear) {
  const starIndex = buildStarIndex(a);
  const { byStar, byPalace } = birthMutagenMaps(a);
  const natalByBranch = new Map(a.palaces.map((p) => [p.earthlyBranch, p.name]));
  const birthBranch = a.chineseDate?.trim().split(/\s+/)[0]?.slice(1);
  const lines = [];
  lines.push(`逐年掃描 ${startYear}-${endYear}(以每年 7 月 1 日為代表日取流年;流月流日不在此列)`);
  lines.push('欄位:年份 干支 虛歲|大限|流年命宮疊本命|流年四化落本命宮|流年夫妻/財帛/官祿/疾厄/田宅疊本命|流鸞流喜/流昌流曲/流羊流陀所在本命宮|訊號');
  lines.push('');
  for (let y = startYear; y <= endYear; y++) {
    const h = a.horoscope(`${y}-7-1`);
    const yr = h.yearly;
    const dec = h.decadal;
    const soulIdx = yr.palaceNames.indexOf('命宮');
    const soulBranch = BRANCH_ORDER[soulIdx];
    const decSoulIdx = dec.palaceNames.indexOf('命宮');
    const decSoulBranch = BRANCH_ORDER[decSoulIdx];
    const overlay = (name) => {
      const i = yr.palaceNames.indexOf(name);
      return i >= 0 ? natalByBranch.get(BRANCH_ORDER[i]) : '?';
    };
    const mut = yr.mutagen.map((s, i) => `${s}${MUTAGEN_LABELS[i]}→${starIndex.get(s)?.name ?? '?'}`).join('、');
    const flowStar = (name) => {
      for (let i = 0; i < (yr.stars?.length ?? 0); i++) {
        if (yr.stars[i].some((st) => st.name === name)) return natalByBranch.get(BRANCH_ORDER[i]);
      }
      return null;
    };
    const flow = `鸞${flowStar('流鸞') ?? '-'}/喜${flowStar('流喜') ?? '-'}・昌${flowStar('流昌') ?? '-'}/曲${flowStar('流曲') ?? '-'}・羊${flowStar('流羊') ?? '-'}/陀${flowStar('流陀') ?? '-'}`;

    const signals = [];
    const notes = mutagenInteractions('流年', yr.mutagen, a, starIndex, byStar, byPalace).filter((n) => !n.startsWith('流年忌(') || !n.includes(',沖'));
    for (const n of notes) {
      const short = n.replace(/^流年/, '').split(':')[0];
      signals.push(short);
    }
    const decJiP = starIndex.get(dec.mutagen[3]);
    const yrJiP = starIndex.get(yr.mutagen[3]);
    const decLuP = starIndex.get(dec.mutagen[0]);
    const yrLuP = starIndex.get(yr.mutagen[0]);
    if (decJiP && yrJiP && decJiP === yrJiP) signals.push(`大限忌流年忌同入${decJiP.name}(雙忌)`);
    if (decLuP && yrLuP && decLuP === yrLuP) signals.push(`大限祿流年祿同入${decLuP.name}(雙祿)`);
    if (decLuP && yrJiP && decLuP === yrJiP) signals.push(`流年忌沖大限祿於${decLuP.name}`);
    if (decJiP && yrJiP && branchIndex(yrJiP.earthlyBranch) === (branchIndex(decJiP.earthlyBranch) + 6) % 12) signals.push('大限忌流年忌對沖');
    // 婚緣訊號
    const luan = flowStar('流鸞');
    const xi = flowStar('流喜');
    const yrSpouse = overlay('夫妻');
    const yrSoul = natalByBranch.get(soulBranch);
    if ([luan, xi].some((x) => x && (x === yrSoul || x === yrSpouse || x === '夫妻' || x === '命宮'))) signals.push('鸞喜入流年命/夫妻(婚喜緣動)');
    const natalSpouse = a.palaces.find((p) => p.name === '夫妻');
    if (yr.mutagen.slice(0, 3).some((s) => starIndex.get(s) === natalSpouse)) signals.push('流年吉化入本命夫妻');
    if (yrJiP === natalSpouse) signals.push('流年忌入本命夫妻(感情課題)');
    // 太歲
    if (birthBranch) {
      const rel = taiSuiRelation(birthBranch, yr.earthlyBranch);
      if (rel.length) signals.push(rel.join('、'));
    }
    // 流年命宮疊本命與大限命宮
    if (soulBranch === decSoulBranch) signals.push('流年命宮疊大限命宮(十年關鍵年)');
    // 小限
    const ageIdx = h.age?.palaceNames?.indexOf('命宮');
    const ageBranch = ageIdx >= 0 ? BRANCH_ORDER[ageIdx] : null;
    if (ageBranch && ageBranch === soulBranch) signals.push('流年小限同宮');
    if (ageBranch && branchIndex(ageBranch) === (branchIndex(soulBranch) + 6) % 12) signals.push('流年小限對沖');

    lines.push(
      `${y} ${yr.heavenlyStem}${yr.earthlyBranch} ${h.age?.nominalAge ?? ''}歲|大限${dec.heavenlyStem}${dec.earthlyBranch}(${natalByBranch.get(decSoulBranch)})|流命${soulBranch}(${yrSoul})|${mut}|夫${yrSpouse}/財${overlay('財帛')}/官${overlay('官祿')}/疾${overlay('疾厄')}/田${overlay('田宅')}|${flow}|${signals.join(';') || '-'}`
    );
  }
  return lines.join('\n');
}
