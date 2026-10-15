import { store, addEvent, clamp, genId, round1 } from '../store.js'

const clamp01 = value => Math.max(0, Math.min(1, value))

/** 根据低谷深度与连续下滑程度计算伟人出现概率。 */
export function turningPointChance(s, history, characters = []) {
  const recentFigure = characters.some(c =>
    c.turningPoint && Number.isFinite(c.emergenceYear) && s.year - c.emergenceYear < 4
  )
  if (recentFigure) return { kind: null, probability: 0 }

  const last = history.slice(-3)
  const declineCount = last.length >= 3
    ? ['population', 'economy', 'stability', 'happiness'].filter(key =>
      last[0][key] > last[1][key] && last[1][key] > last[2][key]
    ).length
    : 0
  const lowScore = (
    clamp01((500 - s.population) / 450) +
    clamp01((50 - s.economy) / 45) +
    clamp01((50 - s.stability) / 48) +
    clamp01((50 - s.happiness) / 50)
  ) / 4

  if (lowScore >= 0.25 || (declineCount >= 2 && lowScore >= 0.1)) {
    const severity = clamp01(lowScore * 0.8 + declineCount / 4 * 0.2)
    return { kind: 'hero', probability: 0.05 + severity * 0.7 }
  }

  const sustainedProsperity = last.length === 3 && last.every(h =>
    h.economy >= 65 && h.stability >= 65 && h.happiness >= 65
  ) && s.economy >= 65 && s.stability >= 65 && s.happiness >= 65
  if (sustainedProsperity) {
    const prosperity = (
      clamp01((s.economy - 65) / 35) +
      clamp01((s.stability - 65) / 35) +
      clamp01((s.happiness - 65) / 35)
    ) / 3
    return { kind: 'disruptor', probability: 0.04 + prosperity * 0.36 }
  }
  return { kind: null, probability: 0 }
}

export function drawTurningPoint(s, history, characters, random = Math.random) {
  const candidate = turningPointChance(s, history, characters)
  return candidate.kind && random() < candidate.probability ? candidate.kind : null
}

const NAMES = ['孟远', '苏禾', '顾川', '沈知', '林澄', '秦岳', '陆遥', '许清', '江临', '叶舟']

function uniqueName(year) {
  const available = NAMES.find(name => !store.characters.some(c => c.name === name))
  return available || `新民·${year}`
}

function createRuleFaction(name, culture, power, cohesion) {
  const faction = { id: genId(), name, culture, power, cohesion }
  store.factions.push(faction)
  addEvent(`新阵营「${name}」形成：${culture}`, 'info')
  return faction
}

/** 规则引擎在概率判定成功后生成可追踪的伟人或搅局者。 */
export function spawnRuleTurningPoint(kind, s = store.society) {
  if (kind !== 'hero' && kind !== 'disruptor') return null
  const hero = kind === 'hero'
  const name = uniqueName(s.year)
  const faction = createRuleFaction(
    `${hero ? '复兴联盟' : '激进变革派'}·${s.year}`,
    hero ? '集结居民、协调资源并推动重建' : '反对现有权力结构，号召支持者挑战秩序',
    hero ? 30 : 35, hero ? 70 : 60
  )
  const character = {
    id: genId(), name, factionId: faction.id,
    bio: hero ? '在持续危机中组织互助与制度改革的领袖' : '在繁荣年代对现有秩序提出激进挑战的领袖',
    ambition: hero ? 75 : 85, kindness: hero ? 80 : 25,
    radicalism: hero ? 35 : 85, wealth: hero ? 35 : 60,
    influence: 65, happiness: hero ? 55 : 60, alive: true,
    turningPoint: kind, emergenceYear: s.year
  }
  store.characters.push(character)
  if (hero) {
    s.economy = clamp(s.economy + 5, 5, 100)
    s.stability = clamp(s.stability + 10, 2, 100)
    s.happiness = clamp(s.happiness + 10)
    s.inequality = clamp(s.inequality - 3, 5, 95)
    s.population = Math.max(50, s.population * 1.1)
    addEvent(`${name}组建「${faction.name}」，协调资源并推动改革，社会出现复苏契机`, 'good')
  } else {
    s.stability = clamp(s.stability - 10, 2, 100)
    s.happiness = clamp(s.happiness - 6)
    s.inequality = clamp(s.inequality + 4, 5, 95)
    addEvent(`${name}组建「${faction.name}」挑战现有秩序，社会矛盾开始激化`, 'bad')
  }
  return character
}

/** 普通年份也会随时间出现新人物；社会紧张或文化扩张时可能形成新阵营。 */
export function maybeSpawnRuleNewcomer(s = store.society, random = Math.random) {
  if (store.characters.length >= 40) return null
  const lastArrival = Math.max(1, ...store.characters.map(c => c.emergenceYear || 1))
  const chance = Math.min(0.35, 0.05 + Math.max(0, s.year - lastArrival) * 0.04)
  if (random() >= chance) return null

  const name = uniqueName(s.year)
  let faction = store.factions[Math.floor(random() * store.factions.length)] || null
  if (s.stability < 40 && s.inequality > 50 && random() < 0.3) {
    faction = createRuleFaction(`民生自救会·${s.year}`, '在社会动荡中为生计和公平组织起来', 25, 65)
  } else if (s.culture > 70 && random() < 0.12) {
    faction = createRuleFaction(`新文化社·${s.year}`, '推动教育与文化交流的新兴社群', 20, 60)
  }
  const character = {
    id: genId(), name, factionId: faction?.id ?? null,
    bio: s.stability < 40 ? '在动荡中崭露头角的社会活动者' : '随着社会发展加入公共事务的新人物',
    ambition: 50, kindness: 55, radicalism: s.stability < 40 ? 65 : 35,
    wealth: clamp(s.economy), influence: 30, happiness: clamp(s.happiness), alive: true,
    emergenceYear: s.year
  }
  store.characters.push(character)
  addEvent(`${name}加入${faction ? `「${faction.name}」` : '社会'}，开始参与公共事务`, 'character')
  return character
}

/** 人物影响力和社会环境逐年改变各阵营的实力与凝聚力。 */
export function evolveFactions(s = store.society) {
  for (const f of store.factions) {
    const members = store.characters.filter(c => c.alive && c.factionId === f.id)
    const influence = members.length
      ? members.reduce((sum, c) => sum + c.influence, 0) / members.length : 50
    f.power = clamp(round1(f.power + (influence - 50) * 0.015 + (s.economy - 50) * 0.01))
    f.cohesion = clamp(round1(f.cohesion + (s.stability - 50) * 0.015 - (s.inequality - 50) * 0.012))
  }
}
