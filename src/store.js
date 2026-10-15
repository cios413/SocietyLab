import { reactive } from 'vue'

// ---------- 全局状态 ----------
export const store = reactive({
  engine: 'rule', // 'rule' | 'llm'
  llm: {
    baseUrl: 'https://api.deepseek.com',
    apiKey: '',
    model: 'deepseek-chat'
  },
  world: {
    name: '新曙光殖民地',
    description: '一群移民在一颗资源分布不均的星球上建立了第一个定居点，试图在陌生的环境中重建社会秩序。',
    resourceAbundance: 60,
    techLevel: 35,
    culturalOpenness: 50,
    governance: '共和制',
    envPressure: 30
  },
  factions: [
    { id: 1, name: '拓荒者联盟', culture: '崇尚实干与个人奋斗，重视契约精神', power: 55, cohesion: 70 },
    { id: 2, name: '守序议会', culture: '强调集体秩序与传统，重视等级与稳定', power: 45, cohesion: 80 }
  ],
  characters: [
    {
      id: 1, name: '陈岩', factionId: 1, bio: '出身矿工家庭，靠自学成为工程师',
      ambition: 70, kindness: 55, radicalism: 40,
      wealth: 50, influence: 45, happiness: 60, alive: true
    },
    {
      id: 2, name: '林薇', factionId: 2, bio: '议会长老之女，受过良好教育',
      ambition: 55, kindness: 70, radicalism: 25,
      wealth: 70, influence: 65, happiness: 65, alive: true
    },
    {
      id: 3, name: '阿烈', factionId: 1, bio: '前雇佣兵，对现状不满',
      ambition: 85, kindness: 25, radicalism: 85,
      wealth: 30, influence: 35, happiness: 40, alive: true
    }
  ],
  society: null, // 由 initSociety 创建
  running: false,
  llmBusy: false
})

let nextId = 100
export function genId() {
  // 本地存档恢复后也要避开已存在的人物与阵营 ID。
  nextId = Math.max(nextId, ...store.factions.map(f => f.id || 0), ...store.characters.map(c => c.id || 0))
  return ++nextId
}

// ---------- 社会初始化 ----------
/**
 * 社会状态新增字段默认值。
 * 旧存档缺少这些字段时由 restoreState 兜底补齐，保证兼容。
 */
export const SOCIETY_DEFAULTS = {
  foodStock: 60,      // 粮食库存 0-100，由产出与消耗驱动
  foodPrice: 30,      // 粮价，随库存反向波动，高企伤害民生
  treasury: 50,       // 国库财政 0-100，大型活动与赈灾的资源基础
  orgCapacity: 50,    // 政府组织能力 0-100，决定能否办成大事
  security: 60,       // 治安安全 0-100，影响活动与危机走向
  crises: [],         // 持续危机状态机 [{id,type,stage,severity,years,...}]
  pendingEffects: []  // 事件后续影响 [{yearsLeft, impact, text}]，逐年结算
}

export function initSociety() {
  const w = store.world
  store.society = {
    turn: 0,
    year: 1,
    population: 1000,
    economy: 40 + w.resourceAbundance * 0.3 + w.techLevel * 0.2,
    stability: 60,
    culture: 30 + w.culturalOpenness * 0.4,
    happiness: 55,
    inequality: 35,
    ...SOCIETY_DEFAULTS,
    foodStock: 40 + w.resourceAbundance * 0.4, // 资源越丰初始存粮越多
    crises: [],
    pendingEffects: [],
    history: [],
    events: [{ turn: 0, year: 1, type: 'info', text: `「${w.name}」建立。${w.governance}下的社会秩序开始运转。` }]
  }
  recordHistory()
}

export function recordHistory() {
  const s = store.society
  s.history.push({
    year: s.year,
    population: Math.round(s.population),
    economy: round1(s.economy),
    stability: round1(s.stability),
    culture: round1(s.culture),
    happiness: round1(s.happiness),
    inequality: round1(s.inequality)
  })
}

export function addEvent(text, type = 'info') {
  const s = store.society
  s.events.unshift({ turn: s.turn, year: s.year, type, text })
  if (s.events.length > 300) s.events.pop()
}

export function resetSimulation() {
  store.characters.forEach(c => {
    c.alive = true
    c.happiness = clamp(40 + c.kindness * 0.3, 0, 100)
    c.coupProgress = 0
    c.coupNoticed = false
  })
  initSociety()
}

// ---------- 工具 ----------
export function clamp(v, min = 0, max = 100) { return Math.min(max, Math.max(min, v)) }
export function round1(v) { return Math.round(v * 10) / 10 }

// ---------- 可注入随机源（默认 Math.random，测试时注入种子随机数保证可复现） ----------
let rngFn = Math.random
/** 注入自定义随机源；传 null/undefined 恢复默认 */
export function setRng(fn) { rngFn = typeof fn === 'function' ? fn : Math.random }
export function rand01() { return rngFn() }
export function rand(min, max) { return min + rngFn() * (max - min) }
export function randInt(min, max) { return Math.floor(rand(min, max + 1)) }
export function pick(arr) { return arr[Math.floor(rngFn() * arr.length)] }

// 载入本地保存的 LLM 配置
try {
  const saved = JSON.parse(localStorage.getItem('society-sim-llm') || 'null')
  if (saved) Object.assign(store.llm, saved)
} catch (e) { /* ignore */ }

export function saveLlmConfig() {
  localStorage.setItem('society-sim-llm', JSON.stringify(store.llm))
}

// ---------- 存档（本地自动存档 + 云端共用） ----------
const SAVE_KEY = 'society-sim-save'

export function serializeState() {
  return JSON.stringify({
    world: store.world,
    factions: store.factions,
    characters: store.characters,
    society: store.society,
    savedAt: Date.now()
  })
}

export function restoreState(json) {
  try {
    const s = typeof json === 'string' ? JSON.parse(json) : json
    if (!s || !s.world || !s.society) return false
    store.world = s.world
    store.factions = s.factions || []
    store.characters = s.characters || []
    store.society = s.society
    // 旧存档兜底：补齐新增字段的默认值
    for (const [k, v] of Object.entries(SOCIETY_DEFAULTS)) {
      if (store.society[k] === undefined) store.society[k] = Array.isArray(v) ? [] : v
    }
    store.characters.forEach(c => {
      if (c.coupProgress === undefined) c.coupProgress = 0
    })
    return true
  } catch (e) { return false }
}

/** 游客模式：自动存档到 localStorage */
export function saveLocal() {
  try { localStorage.setItem(SAVE_KEY, serializeState()) } catch (e) { /* 超容量时忽略 */ }
}

/** 启动时恢复本地上次进度 */
export function loadLocal() {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    return raw ? restoreState(raw) : false
  } catch (e) { return false }
}
