import { store, addEvent, clamp, rand01 } from '../store.js'

/**
 * 事件规则系统 + 危机状态机。
 *
 * 事件定义字段（全部可选字段均有默认值，保持向后兼容）：
 *   id        唯一标识
 *   type      info/good/bad/crisis（时间线着色用）
 *   tags      分类标签：shock（外部冲击，年初结算）/ culture / social
 *   requires  前置条件。可以是函数，也可以是 { 条件名: 函数 } 的对象——
 *             全部满足才允许发生，不满足则【直接排除】而不是降低概率；
 *             对象形式会记录未满足项，供 fallback 降级使用
 *   intent    近似意愿条件：前置不满足但社会"想办这件事"时，允许走 fallback
 *   fallback  降级结果（取消/延期/缩小规模等）：(ctx, failedKeys) => {text,type,impact,cost}
 *   chance    满足前置后的发生概率函数（随状态变化）
 *   motive    触发原因说明，追加到事件文本后，保证可追溯
 *   cost      资源消耗 {treasury: 8, ...}，资源不足视为不满足前置
 *   impact    即时数值效果
 *   aftermath 后续影响 [{yearsLeft, impact, text}]，逐年结算
 *   conflicts 互斥事件 id，同年不会同时执行
 *   onTrigger 触发后的附加动作（如创建危机），返回的字符串会追加进事件文本
 */

// ---------- 数值效果应用（支持新增资源字段） ----------
export function applyImpact(impact) {
  const s = store.society
  if (impact.economy) s.economy = clamp(s.economy + impact.economy, 5, 100)
  if (impact.stability) s.stability = clamp(s.stability + impact.stability, 2, 100)
  if (impact.culture) s.culture = clamp(s.culture + impact.culture, 5, 100)
  if (impact.happiness) s.happiness = clamp(s.happiness + impact.happiness, 0, 100)
  if (impact.inequality) s.inequality = clamp(s.inequality + impact.inequality, 5, 95)
  if (impact.population) s.population = Math.max(50, s.population * (1 + impact.population))
  if (impact.foodStock) s.foodStock = clamp(s.foodStock + impact.foodStock, 0, 100)
  if (impact.foodPrice) s.foodPrice = clamp(s.foodPrice + impact.foodPrice, 5, 150)
  if (impact.treasury) s.treasury = clamp(s.treasury + impact.treasury, 0, 100)
  if (impact.orgCapacity) s.orgCapacity = clamp(s.orgCapacity + impact.orgCapacity, 0, 100)
  if (impact.security) s.security = clamp(s.security + impact.security, 0, 100)
}

// ---------- 危机工具 ----------
export function findCrisis(type) {
  return store.society.crises.find(c => c.type === type)
}

export function hasCrisisStage(ctx, stage) {
  return ctx.s.crises.some(c => c.stage === stage)
}

const STAGE_RANK = { developing: 1, crisis: 2, recovering: 3 }

/** 创建危机；若已存在则只升不降（severity 取高、stage 取重） */
export function ensureCrisis(type, stage, severity) {
  const s = store.society
  let c = findCrisis(type)
  if (!c) {
    c = { id: `${type}-${s.year}`, type, stage, severity, years: 0, entered: false }
    s.crises.push(c)
  } else {
    c.severity = Math.max(c.severity, severity)
    if ((STAGE_RANK[stage] || 0) > (STAGE_RANK[c.stage] || 0) && c.stage !== 'recovering') c.stage = stage
  }
  return c
}

// ---------- 事件定义 ----------
// 注意：drought 必须保持在 shock 类的首位，测试依赖此顺序
export const EVENT_DEFS = [
  // ===== 外部冲击（shock）：年初首先结算 =====
  {
    id: 'drought', type: 'bad', tags: ['shock'],
    text: '遭遇罕见旱灾，粮食大幅减产',
    requires: ctx => ctx.w.envPressure >= 15,
    chance: ctx => 0.06 + ctx.w.envPressure * 0.002,
    motive: ctx => `环境压力 ${Math.round(ctx.w.envPressure)}，气候异常`,
    impact: { economy: -6, stability: -2, happiness: -2 },
    onTrigger: ctx => {
      ctx.s.foodStock = clamp(ctx.s.foodStock - 18, 0, 100)
      if (ctx.s.foodStock < 45) {
        ensureCrisis('famine', 'developing', 30 + (45 - ctx.s.foodStock))
        return '粮食库存告急，饥荒风险正在累积'
      }
    }
  },
  {
    id: 'flood', type: 'bad', tags: ['shock'],
    text: '洪涝灾害冲毁农田与道路',
    requires: ctx => ctx.w.envPressure >= 20,
    chance: ctx => 0.04 + ctx.w.envPressure * 0.0015,
    motive: ctx => `环境压力 ${Math.round(ctx.w.envPressure)}`,
    impact: { economy: -5, stability: -3 },
    onTrigger: ctx => {
      ctx.s.foodStock = clamp(ctx.s.foodStock - 12, 0, 100)
      if (ctx.s.foodStock < 40) {
        ensureCrisis('famine', 'developing', 28 + (40 - ctx.s.foodStock))
        return '存粮被毁，饥荒风险浮现'
      }
    }
  },
  {
    id: 'plague', type: 'bad', tags: ['shock'],
    text: '一场瘟疫蔓延，人口下降',
    requires: ctx => ctx.s.population >= 200,
    chance: () => 0.08,
    impact: { population: -0.04, happiness: -6, stability: -3 },
    aftermath: [{ yearsLeft: 2, impact: { happiness: -2 }, text: '疫情余波逐渐散去，社会情绪回暖' }]
  },
  {
    id: 'border_raid', type: 'bad', tags: ['shock'],
    text: '边境冲突爆发，社会资源被消耗',
    requires: () => true,
    chance: ctx => 0.06 + (100 - ctx.s.security) * 0.001,
    motive: ctx => `治安 ${Math.round(ctx.s.security)}，边防${ctx.s.security < 40 ? '空虚' : '尚可'}`,
    impact: { economy: -5, security: -6 },
    onTrigger: ctx => {
      if (ctx.s.security < 40) {
        ensureCrisis('war', 'developing', 35)
        return '边防无力应对，冲突有演变为战争的危险'
      }
    }
  },
  {
    id: 'extreme_weather', type: 'bad', tags: ['shock'],
    text: '极端天气频发，民众人心惶惶',
    requires: ctx => ctx.w.envPressure >= 25,
    chance: ctx => 0.05 + ctx.w.envPressure * 0.001,
    impact: { stability: -4, happiness: -4 }
  },
  {
    id: 'ore_discovery', type: 'good', tags: ['shock'],
    text: '发现了新的矿脉，经济得到提振',
    requires: () => true,
    chance: () => 0.09,
    impact: { economy: 8 }
  },
  {
    id: 'trade_route', type: 'good', tags: ['shock'],
    text: '对外贸易路线开通，财富流入',
    requires: ctx => ctx.s.stability >= 40 && !findCrisis('war'),
    chance: () => 0.11,
    motive: () => '社会稳定且无战事，商队愿意往来',
    impact: { economy: 7, inequality: 2 },
    aftermath: [{ yearsLeft: 2, impact: { economy: 1 } }]
  },
  {
    id: 'scholar', type: 'good', tags: ['shock'],
    text: '一位游方学者带来了远方的知识',
    requires: ctx => ctx.w.culturalOpenness >= 25,
    chance: () => 0.1,
    impact: { culture: 7 }
  },

  // ===== 文化活动（culture）：考虑稳定/财政/组织/安全，危机时有替代形式 =====
  {
    id: 'grand_festival', type: 'good', tags: ['culture'],
    text: '文化交流节盛大举办，社会凝聚力上升',
    conflicts: ['riot', 'pacification', 'propaganda_rally'],
    requires: {
      stability: ctx => ctx.s.stability >= 55,
      treasury: ctx => ctx.s.treasury >= 15,
      orgCapacity: ctx => ctx.s.orgCapacity >= 45,
      security: ctx => ctx.s.security >= 50,
      noCrisis: ctx => !hasCrisisStage(ctx, 'crisis')
    },
    // 社会仍有办活动的意愿（不算危机重重、财政尚可），才允许降级结果
    intent: ctx => ctx.s.stability >= 40 && ctx.s.treasury >= 4 && !hasCrisisStage(ctx, 'crisis'),
    fallback: (ctx, failed) => {
      if (failed.includes('treasury')) {
        return { text: '因财政紧张，文化交流节缩小为民间自发的小规模庆典', impact: { culture: 3, happiness: 2 }, cost: { treasury: 3 } }
      }
      if (failed.includes('orgCapacity')) {
        return { text: '文化节因组织不力被迫推迟，民众的期待落空了', impact: { happiness: -1 } }
      }
      if (failed.includes('security') || failed.includes('noCrisis')) {
        return { text: '出于安全考虑，大型文化活动被取消', impact: { happiness: -2 } }
      }
      return { text: '文化活动因条件不足而缩小规模', impact: { culture: 2, happiness: 1 } }
    },
    fallbackChance: 0.4,
    chance: () => 0.3,
    cost: { treasury: 8 },
    motive: () => '社会稳定、财政充裕、政府组织得力',
    impact: { culture: 7, happiness: 5, stability: 3 }
  },
  {
    id: 'folk_fair', type: 'good', tags: ['culture'],
    text: '民间自发举办的集市与庙会，为日常生活增添了生气',
    requires: ctx => ctx.s.stability >= 30,
    chance: () => 0.22,
    motive: () => '民间自组织，不依赖官方资源',
    impact: { happiness: 2, economy: 1, culture: 1 }
  },
  {
    id: 'religious_rite', type: 'info', tags: ['culture'],
    text: '面对艰难时局，民众举行祈福仪式，心绪稍安',
    requires: ctx => ctx.s.crises.length > 0 || ctx.w.envPressure >= 45,
    chance: () => 0.35,
    motive: () => '危机中的精神慰藉需求',
    impact: { happiness: 3, culture: 1 }
  },
  {
    id: 'propaganda_rally', type: 'info', tags: ['culture'],
    text: '政权组织宣传集会凝聚人心，社会士气有所提振',
    conflicts: ['grand_festival'],
    requires: ctx => (findCrisis('war') || findCrisis('rebellion')) && ctx.s.orgCapacity >= 30,
    chance: () => 0.35,
    cost: { treasury: 3 },
    motive: () => '战时动员与舆论引导',
    impact: { stability: 3, culture: 1, happiness: -1 }
  },
  {
    id: 'pacification', type: 'good', tags: ['culture', 'social'],
    text: '政府举办安抚活动并发放救济，紧张局势有所缓和',
    conflicts: ['grand_festival'],
    requires: ctx => {
      const r = findCrisis('rebellion')
      return r && r.stage === 'developing' && ctx.s.treasury >= 8
    },
    chance: () => 0.3,
    cost: { treasury: 8 },
    motive: () => '政权安抚动荡地区',
    impact: { stability: 4, happiness: 2 },
    onTrigger: ctx => {
      const r = findCrisis('rebellion')
      if (r) r.severity = clamp(r.severity - 15, 0, 100)
    }
  },

  // ===== 社会事件（social） =====
  {
    id: 'riot', type: 'bad', tags: ['social'],
    text: '物资分配不均引发小规模骚乱',
    conflicts: ['grand_festival'],
    requires: ctx => ctx.s.inequality >= 55 && ctx.s.happiness < 55,
    chance: ctx => 0.08 + (ctx.s.inequality - 55) * 0.006,
    motive: ctx => `不平等 ${Math.round(ctx.s.inequality)}，民怨积聚`,
    impact: { stability: -8, inequality: 4 },
    onTrigger: ctx => {
      const r = findCrisis('rebellion')
      if (r && r.stage !== 'recovering') {
        r.severity = clamp(r.severity + 10, 0, 100)
        return '骚乱与暗中的叛乱势力相互呼应'
      }
    }
  },
  {
    id: 'golden_age', type: 'good', tags: ['social'],
    text: '社会进入黄金时期，艺术与贸易空前繁荣',
    requires: ctx => ctx.s.economy >= 80 && ctx.s.happiness >= 70 && ctx.s.crises.length === 0,
    chance: () => 0.3,
    motive: () => '经济繁荣、民生安乐、天下无事',
    impact: { culture: 5, stability: 4 }
  }
]

// ---------- 事件引擎 ----------
/** 评估前置条件；返回未满足的条件名数组（空数组 = 全部满足） */
export function checkRequires(def, ctx) {
  if (!def.requires) return []
  if (typeof def.requires === 'function') return def.requires(ctx) ? [] : ['custom']
  return Object.entries(def.requires).filter(([, fn]) => !fn(ctx)).map(([k]) => k)
}

function canAfford(cost, ctx) {
  if (!cost) return true
  return Object.entries(cost).every(([k, v]) => (ctx.s[k] ?? 0) >= v)
}

function payCost(cost, ctx) {
  if (!cost) return
  for (const [k, v] of Object.entries(cost)) {
    ctx.s[k] = clamp(ctx.s[k] - v, 0, k === 'foodPrice' ? 150 : 100)
  }
}

function executeEvent(ctx, def, failedKeys) {
  let text, impact, cost, type = def.type, aftermath, motive = ''
  if (failedKeys) {
    // 降级结果：取消 / 延期 / 缩小规模
    const fb = def.fallback(ctx, failedKeys)
    if (!fb) return
    text = fb.text
    impact = fb.impact
    cost = fb.cost
    type = fb.type || type
  } else {
    text = typeof def.text === 'function' ? def.text(ctx) : def.text
    impact = def.impact
    cost = def.cost
    aftermath = def.aftermath
    if (def.motive) motive = def.motive(ctx)
  }
  if (!canAfford(cost, ctx)) return
  payCost(cost, ctx)
  if (impact) applyImpact(impact)
  let extra = ''
  if (!failedKeys && def.onTrigger) extra = def.onTrigger(ctx) || ''
  const full = text + (extra ? `，${extra}` : '') + (motive ? `（${motive}）` : '')
  addEvent(full, type)
  if (aftermath) ctx.s.pendingEffects.push(...aftermath.map(a => ({ ...a })))
}

/**
 * 年度事件结算：
 * 1) 前置条件硬排除（不满足直接出局，不是降概率）
 * 2) 对满足条件者做概率判定
 * 3) 剔除互斥事件
 * 4) 按数量上限执行
 * 允许一年没有任何事件发生（不强制随机事件）。
 */
export function runEventPhase(ctx, phaseTags, maxEvents = 2) {
  const candidates = EVENT_DEFS.filter(d => d.tags.some(t => phaseTags.includes(t)))

  // 1) 前置条件过滤
  const eligible = []
  for (const def of candidates) {
    const failed = checkRequires(def, ctx)
    if (failed.length === 0) {
      if (canAfford(def.cost, ctx)) eligible.push({ def, failedKeys: null })
    } else if (def.intent && def.fallback && def.intent(ctx)) {
      eligible.push({ def, failedKeys: failed })
    }
  }

  // 2) 概率判定
  const rolled = eligible.filter(e =>
    rand01() < (e.failedKeys ? (e.def.fallbackChance ?? 0.35) : e.def.chance(ctx))
  )

  // 3) 互斥剔除（先触发者优先）
  const compatible = []
  for (const e of rolled) {
    const clash = compatible.some(f =>
      (f.def.conflicts || []).includes(e.def.id) || (e.def.conflicts || []).includes(f.def.id)
    )
    if (!clash) compatible.push(e)
  }

  // 4) 限额执行
  const chosen = compatible.slice(0, maxEvents)
  for (const e of chosen) executeEvent(ctx, e.def, e.failedKeys)
  return chosen
}

// ---------- 资源结算（粮食→粮价→民生 / 财政 / 治安 / 组织能力） ----------
export function updateResources(ctx) {
  const { s, w, g } = ctx

  // 粮食：产出 - 消耗（战争拖累生产）
  const warPenalty = findCrisis('war') ? 0.7 : 1
  const production = (w.resourceAbundance * 0.3 + w.techLevel * 0.2 + s.economy * 0.15) * warPenalty
  const consumption = 16 + (s.population / 1000) * 14
  s.foodStock = clamp(s.foodStock + (production - consumption) * 0.4, 0, 100)

  // 粮价随库存反向波动；高价直接伤害民生
  const priceTarget = clamp(95 - s.foodStock * 0.95, 12, 140)
  s.foodPrice = clamp(s.foodPrice + (priceTarget - s.foodPrice) * 0.5, 5, 150)
  if (s.foodPrice > 90) applyImpact({ happiness: -6, stability: -4 })
  else if (s.foodPrice > 60) applyImpact({ happiness: -3, stability: -2 })

  // 财政：税收减去维持开支（危机越多开销越大）
  const income = s.economy * 0.12 * g.econMod
  const upkeep = 3.5 + s.crises.length * 2
  s.treasury = clamp(s.treasury + (income - upkeep) * 0.5, 0, 100)

  // 治安向稳定度收敛；组织能力向制度水平与文化水平收敛
  s.security = clamp(s.security + (s.stability - s.security) * 0.15, 0, 100)
  const orgTarget = g.stabilityBase * 0.5 + s.culture * 0.3 + 20
  s.orgCapacity = clamp(s.orgCapacity + (orgTarget - s.orgCapacity) * 0.1, 0, 100)
}

// ---------- 危机状态机：持续 / 缓解 / 升级，并对后续年份产生影响 ----------
const CRISIS_HANDLERS = {
  // 饥荒链：歉收 → 库存下降 → 粮价上涨 → 救济或逃荒 → 稳定/人口变化
  famine(ctx, c) {
    const s = ctx.s
    if (!c.entered) {
      c.entered = true
      addEvent(c.stage === 'crisis' ? '饥荒爆发！粮食短缺，民众开始挨饿' : '粮食歉收的影响开始显现，饥荒风险正在累积',
        c.stage === 'crisis' ? 'crisis' : 'bad')
    }
    // 危机期间粮食持续消耗
    s.foodStock = clamp(s.foodStock - 6, 0, 100)

    if (c.stage === 'developing') {
      applyImpact({ happiness: -2, stability: -1 })
      c.severity = clamp(c.severity + (s.foodStock < 30 ? 12 : s.foodStock > 55 ? -15 : 3), 0, 100)
      if (c.severity >= 60 || s.foodStock <= 15) { c.stage = 'crisis'; c.entered = false }
      else if (c.severity <= 5) c.stage = 'recovering'
    } else if (c.stage === 'crisis') {
      applyImpact({ happiness: -8, stability: -6, population: -0.03 })
      if (!c.exodusNoted) { c.exodusNoted = true; addEvent('饥民流离失所，开始外出逃荒', 'crisis') }
      // 政府救济：需要财政与组织能力作为资源基础
      if (s.treasury >= 12 && s.orgCapacity >= 30 && rand01() < 0.7) {
        s.treasury = clamp(s.treasury - 12, 0, 100)
        applyImpact({ foodStock: 22, happiness: 3 })
        c.severity = clamp(c.severity - 30, 0, 100)
        c.stage = 'recovering'
        addEvent('政府开仓放粮赈济灾民（国库 -12），饥荒得到控制', 'good')
      } else if (s.treasury < 8) {
        c.severity = clamp(c.severity + 10, 0, 100)
        if (!c.noMoneyNoted) { c.noMoneyNoted = true; addEvent('国库空虚，赈济无力，饥荒持续恶化', 'crisis') }
      }
      if (s.foodStock > 40) c.stage = 'recovering'
    } else if (c.stage === 'recovering') {
      applyImpact({ happiness: -2 })
      c.severity -= 15
      if (c.severity <= 0) { c.stage = 'resolved'; c.resolvedText = '粮食供应恢复，饥荒终于结束' }
    }
  },

  // 叛乱链：不满积聚 → 公开冲突 → 镇压/安抚/拖垮
  rebellion(ctx, c) {
    const s = ctx.s
    if (!c.entered) {
      c.entered = true
      addEvent(c.stage === 'crisis' ? '动乱升级为公开叛乱，多地爆发武装冲突' : '不满情绪在暗中积聚，叛乱风险浮现',
        c.stage === 'crisis' ? 'crisis' : 'bad')
    }
    if (c.stage === 'developing') {
      applyImpact({ stability: -2, security: -3 })
      c.severity = clamp(c.severity
        + (s.inequality > 55 ? 8 : 2)
        + (s.stability < 30 ? 8 : 0)
        - (s.happiness > 55 ? 8 : 0), 0, 100)
      if (c.severity >= 65) { c.stage = 'crisis'; c.entered = false }
      else if (c.severity <= 5) c.stage = 'recovering'
      // 政府可拨付资源安抚
      if (s.treasury >= 10 && rand01() < 0.35) {
        s.treasury = clamp(s.treasury - 10, 0, 100)
        c.severity = clamp(c.severity - 25, 0, 100)
        applyImpact({ stability: 3 })
        addEvent('政府拨付资源安抚不满地区（国库 -10），局势暂时受控', 'info')
      }
    } else if (c.stage === 'crisis') {
      applyImpact({ economy: -6, stability: -7, security: -8, population: -0.01 })
      if (s.treasury >= 12 && s.security >= 35 && rand01() < 0.45) {
        s.treasury = clamp(s.treasury - 12, 0, 100)
        c.severity = clamp(c.severity - 35, 0, 100)
        c.stage = 'recovering'
        addEvent('政府调集力量平息叛乱（国库 -12），冲突逐渐降温', 'good')
      } else {
        c.severity = clamp(c.severity + 6, 0, 100)
      }
    } else if (c.stage === 'recovering') {
      applyImpact({ stability: -1 })
      c.severity -= 12
      if (c.severity <= 0) { c.stage = 'resolved'; c.resolvedText = '叛乱平息，社会秩序逐步恢复' }
    }
  },

  // 战争链：持续消耗 → 议和或拖垮财政
  war(ctx, c) {
    const s = ctx.s
    if (!c.entered) { c.entered = true; addEvent('边境冲突演变为持续战争，社会资源被大量消耗', 'crisis') }
    applyImpact({ economy: -4, happiness: -3, security: -4 })
    s.treasury = clamp(s.treasury - 6, 0, 100)
    if (s.treasury <= 5) {
      applyImpact({ stability: -8 })
      c.stage = 'resolved'
      c.resolvedText = '国库耗尽，政府被迫与对手议和，社会元气大伤'
    } else if (c.years >= 3 && rand01() < 0.4) {
      c.stage = 'resolved'
      c.resolvedText = '经过多年拉锯，战争终于结束，边境重归平静'
    }
  }
}

export function updateCrises(ctx) {
  const s = ctx.s
  for (const c of [...s.crises]) {
    c.years += 1
    CRISIS_HANDLERS[c.type](ctx, c)
    if (c.stage === 'resolved') {
      if (c.resolvedText) addEvent(c.resolvedText, 'good')
      s.crises.splice(s.crises.indexOf(c), 1)
    }
  }
}

// ---------- 后续影响结算 ----------
export function applyAftermath(ctx) {
  const s = ctx.s
  for (const e of [...s.pendingEffects]) {
    applyImpact(e.impact)
    e.yearsLeft -= 1
    if (e.yearsLeft <= 0) {
      s.pendingEffects.splice(s.pendingEffects.indexOf(e), 1)
      if (e.text) addEvent(e.text, 'info')
    }
  }
}
