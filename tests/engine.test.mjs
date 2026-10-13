/**
 * 规则引擎因果系统自动化测试。
 * 运行：npm test  （等价于 node tests/engine.test.mjs）
 *
 * 通过 setRng 注入 mulberry32 种子随机数，所有用例结果可复现，
 * 不随运行次数变化。
 */
import { store, initSociety, setRng, restoreState } from '../src/store.js'
import { runRuleTurn } from '../src/engine/ruleEngine.js'
import {
  EVENT_DEFS, runEventPhase, checkRequires, findCrisis, ensureCrisis
} from '../src/engine/eventSystem.js'

// ---------- 可复现随机源 ----------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6D2B79F5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- 测试脚手架 ----------
const worldSnap = JSON.parse(JSON.stringify(store.world))
const factionSnap = JSON.parse(JSON.stringify(store.factions))
const charSnap = JSON.parse(JSON.stringify(store.characters))
const G = { stabilityBase: 60, econMod: 1.1, cultureMod: 1.15, unrestMod: 0.9 } // 共和制

function resetWorld(seed = 42) {
  setRng(mulberry32(seed))
  store.world = JSON.parse(JSON.stringify(worldSnap))
  store.factions = JSON.parse(JSON.stringify(factionSnap))
  store.characters = JSON.parse(JSON.stringify(charSnap))
  initSociety()
  return store.society
}

let passed = 0, failed = 0
function assert(cond, msg) {
  if (cond) { passed++; console.log(`  ✓ ${msg}`) }
  else { failed++; console.error(`  ✗ ${msg}`) }
}
function test(name, fn) {
  console.log(`\n【${name}】`)
  try { fn() } catch (e) { failed++; console.error(`  ✗ 用例异常: ${e.message}`) }
}
const eventTexts = () => store.society.events.map(e => e.text).join('\n')

// ---------- 用例 1：饥荒期间大型文化活动被合理限制 ----------
test('饥荒期间大型文化活动被合理限制（硬排除或降级，而非照常举办）', () => {
  const s = resetWorld(7)
  s.foodStock = 10
  s.stability = 30
  s.treasury = 20
  s.security = 30
  ensureCrisis('famine', 'crisis', 70)

  const ctx = { s, w: store.world, g: G }
  const gf = EVENT_DEFS.find(d => d.id === 'grand_festival')
  assert(checkRequires(gf, ctx).length > 0, '饥荒危机中大型文化节的前置条件不通过（被直接排除）')

  for (let i = 0; i < 8; i++) runRuleTurn()
  assert(!eventTexts().includes('文化交流节盛大举办'), '连续 8 年推演中未出现大型文化交流节')

  // 降级路径：条件大体具备但财政不足 → 缩小规模而非取消或照常
  const s2 = resetWorld(21)
  s2.stability = 60; s2.treasury = 10; s2.orgCapacity = 60; s2.security = 60
  setRng(() => 0.001) // 强制概率判定通过
  runEventPhase({ s: s2, w: store.world, g: G }, ['culture'], 2)
  assert(eventTexts().includes('缩小为民间自发的小规模庆典'), '财政不足时文化活动降级为缩小规模，而非照常或禁绝')
})

// ---------- 用例 2：条件充分时大型文化活动可以举办 ----------
test('稳定/财政/组织/安全充分时大型文化活动可以举办', () => {
  const s = resetWorld(3)
  s.stability = 80; s.treasury = 80; s.orgCapacity = 70; s.security = 80
  s.happiness = 75; s.economy = 60
  const cultureBefore = s.culture

  let held = false
  for (let i = 0; i < 30 && !held; i++) {
    runRuleTurn()
    held = eventTexts().includes('文化交流节盛大举办')
  }
  assert(held, '30 年内大型文化交流节得以举办')
  assert(s.culture > cultureBefore, `举办后文化水平上升（${cultureBefore.toFixed(1)} → ${s.culture.toFixed(1)}）`)
})

// ---------- 用例 3：灾害能够引发后续危机（因果链） ----------
test('旱灾在低库存时触发饥荒危机，并逐年升级为全面饥荒', () => {
  const s = resetWorld(11)
  s.foodStock = 35 // 低存粮

  // 强制执行一次外部冲击（rng≈0 使旱灾概率判定通过；drought 位于 shock 首位）
  setRng(() => 0.001)
  runEventPhase({ s, w: store.world, g: G }, ['shock'], 1)
  const famine = findCrisis('famine')
  assert(!!famine, '旱灾后粮食库存告急，饥荒危机被创建')
  assert(eventTexts().includes('旱灾'), '事件流中记录了旱灾这一触发原因')

  // 恢复种子随机数继续推演，危饥应升级（developing → crisis），人口受损
  resetWorldKeepCrises(13)
  let crisisStage = famine.stage
  for (let i = 0; i < 8 && crisisStage !== 'crisis'; i++) {
    runRuleTurn()
    crisisStage = famine.stage
  }
  assert(crisisStage === 'crisis', `饥荒在数年内升级为全面危机（当前阶段: ${crisisStage}）`)

  // 封锁救济条件（国库耗尽、组织瘫痪），验证危机阶段本身造成人口损失
  s.treasury = 0
  s.orgCapacity = 10
  const popBefore = s.population
  runRuleTurn()
  runRuleTurn()
  assert(s.population < popBefore * 0.98,
    `全面饥荒造成人口损失（${Math.round(popBefore)} → ${Math.round(s.population)}）`)
})

/** 换种子但保留当前社会状态（仅重注入随机源） */
function resetWorldKeepCrises(seed) { setRng(mulberry32(seed)) }

// ---------- 用例 4：危机可以通过救济得到缓解 ----------
test('财政与组织能力充足时，政府救济能缓解饥荒', () => {
  const s = resetWorld(5)
  s.foodStock = 10
  s.treasury = 60
  s.orgCapacity = 50
  const famine = ensureCrisis('famine', 'crisis', 65)

  let relieved = false
  for (let i = 0; i < 6 && !relieved; i++) {
    runRuleTurn()
    relieved = eventTexts().includes('开仓放粮')
  }
  assert(relieved, '6 年内政府开仓放粮实施救济')
  assert(famine.stage === 'recovering' || !store.society.crises.includes(famine),
    `救济后饥荒进入缓解阶段（当前阶段: ${famine.stage}）`)
  assert(s.foodStock > 15, `救济后粮食库存回升（当前: ${s.foodStock.toFixed(1)}）`)
})

// ---------- 用例 5：随机数可复现 ----------
test('相同种子推演结果完全一致，不同种子结果不同', () => {
  resetWorld(99)
  for (let i = 0; i < 12; i++) runRuleTurn()
  const snap1 = JSON.stringify([store.society.history, store.society.events])

  resetWorld(99)
  for (let i = 0; i < 12; i++) runRuleTurn()
  const snap2 = JSON.stringify([store.society.history, store.society.events])

  resetWorld(100)
  for (let i = 0; i < 12; i++) runRuleTurn()
  const snap3 = JSON.stringify([store.society.history, store.society.events])

  assert(snap1 === snap2, '相同种子的 12 年推演结果完全一致')
  assert(snap1 !== snap3, '不同种子的推演结果不同')
})

// ---------- 用例 6：旧存档兼容 ----------
test('缺少新增字段的旧存档恢复后自动补齐默认值', () => {
  const oldSave = {
    world: worldSnap,
    factions: factionSnap,
    characters: [{ id: 1, name: '旧档人物', alive: true }],
    society: {
      turn: 5, year: 6, population: 900, economy: 50, stability: 50,
      culture: 40, happiness: 50, inequality: 40, history: [], events: []
    }
  }
  const ok = restoreState(JSON.stringify(oldSave))
  assert(ok === true, '旧存档恢复成功')
  assert(store.society.foodStock === 60, 'foodStock 补齐默认值 60')
  assert(store.society.treasury === 50, 'treasury 补齐默认值 50')
  assert(Array.isArray(store.society.crises), 'crises 补齐为空数组')
  assert(Array.isArray(store.society.pendingEffects), 'pendingEffects 补齐为空数组')
  assert(store.characters[0].coupProgress === 0, '人物 coupProgress 补齐默认值 0')
})

// ---------- 汇总 ----------
console.log(`\n========================================`)
console.log(`测试结果: ${passed} 通过, ${failed} 失败`)
if (failed > 0) process.exit(1)
