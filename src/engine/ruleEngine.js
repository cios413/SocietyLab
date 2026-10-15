import { store, addEvent, recordHistory, clamp, rand, rand01 } from '../store.js'
import {
  applyImpact, runEventPhase, updateResources, updateCrises, applyAftermath,
  findCrisis, ensureCrisis
} from './eventSystem.js'
import { drawTurningPoint, spawnRuleTurningPoint, maybeSpawnRuleNewcomer, evolveFactions } from './turningPoint.js'

/**
 * 规则推演引擎：每回合根据世界参数、人物属性与事件规则系统推进社会演化。
 *
 * 年度结算顺序（可解释、可追溯）：
 *   1. 外部冲击   —— 灾害/机遇等外生事件，先做前置条件检查，可能触发危机
 *   2. 资源与危机 —— 粮食/粮价/财政/治安结算；危机持续、缓解或升级
 *   3. 人物与事件 —— 人物属性更新与资源驱动的行动；文化/社会事件执行
 *   4. 社会指标   —— 经济/不平等/稳定/文化/幸福/人口更新（原有公式不变）
 *   5. 后续影响   —— 事件 aftermath 逐年结算，记录历史
 *   6. 人物与阵营 —— 根据社会走势出现关键人物或普通新人物，阵营持续演化
 */

const GOVERNANCE_TRAITS = {
  '部落制': { stabilityBase: 55, econMod: 0.9, cultureMod: 1.0, unrestMod: 1.2 },
  '君主制': { stabilityBase: 62, econMod: 1.0, cultureMod: 0.95, unrestMod: 1.0 },
  '共和制': { stabilityBase: 60, econMod: 1.1, cultureMod: 1.15, unrestMod: 0.9 },
  '集权制': { stabilityBase: 70, econMod: 0.95, cultureMod: 0.8, unrestMod: 1.4 },
  '无政府': { stabilityBase: 40, econMod: 0.85, cultureMod: 1.1, unrestMod: 1.6 }
}

export function runRuleTurn() {
  const s = store.society
  const w = store.world
  const g = GOVERNANCE_TRAITS[w.governance] || GOVERNANCE_TRAITS['共和制']
  const ctx = { s, w, g }

  s.turn += 1
  s.year += 1

  // --- 1. 外部冲击（最多 1 起/年；不满足前置条件的冲击直接排除） ---
  runEventPhase(ctx, ['shock'], 1)

  // --- 2. 资源与危机状态：粮食→粮价→民生，财政/治安/组织能力；危机推进 ---
  updateResources(ctx)
  updateCrises(ctx)

  // --- 3. 人物决策与社会/文化事件执行 ---
  simulateCharacters(s, g)
  runEventPhase(ctx, ['culture', 'social'], 2)

  // --- 4. 社会指标更新（原有公式） ---
  updateIndicators(ctx)

  // --- 5. 后续影响结算 ---
  applyAftermath(ctx)

  // --- 6. 社会转折人物与阵营演化 ---
  const turningPoint = drawTurningPoint(s, s.history, store.characters, rand01)
  if (turningPoint) spawnRuleTurningPoint(turningPoint, s)
  else maybeSpawnRuleNewcomer(s, rand01)
  evolveFactions(s)

  recordHistory()
  return s.events[0]
}

// ---------- 社会指标（保留原有公式与系数） ----------
function updateIndicators(ctx) {
  const { s, w, g } = ctx

  // 经济
  const econGrowth = (w.techLevel * 0.06 + w.resourceAbundance * 0.04) * g.econMod
    - w.envPressure * 0.05 + rand(-3, 3)
  s.economy = clamp(s.economy + econGrowth, 5, 100)

  // 不平等
  const ineqDrift = (s.economy > 60 ? 1.2 : -0.5) + rand(-1.5, 1.5)
  s.inequality = clamp(s.inequality + ineqDrift, 5, 95)

  // 稳定度：向目标值收敛
  const stabTarget = g.stabilityBase - s.inequality * 0.35 + (s.economy - 50) * 0.25 + s.happiness * 0.15
  s.stability = clamp(s.stability + (stabTarget - s.stability) * 0.25 + rand(-4, 4), 2, 100)

  // 文化
  const cultureGrowth = (w.culturalOpenness * 0.05 + s.stability * 0.02) * g.cultureMod + rand(-1.5, 2)
  s.culture = clamp(s.culture + cultureGrowth, 5, 100)

  // 社会整体幸福度（人物均值与社会状况加权）
  const alive = store.characters.filter(c => c.alive)
  const charAvg = alive.length ? alive.reduce((sum, c) => sum + c.happiness, 0) / alive.length : 50
  const socialHappy = 30 + s.economy * 0.25 + s.stability * 0.25 + s.culture * 0.1 - s.inequality * 0.2 - w.envPressure * 0.1
  s.happiness = clamp(charAvg * 0.5 + socialHappy * 0.5, 0, 100)

  // 人口
  const birthFactor = (s.happiness - 40) * 0.001 + (s.economy - 40) * 0.0008
  const deathFactor = w.envPressure * 0.0004 + (s.stability < 30 ? 0.02 : 0)
  s.population = Math.max(50, s.population * (1 + birthFactor - deathFactor))

  // 持续低稳定 + 高不平等 → 叛乱危机（状态机接管后续影响，替代旧的一次性扣值）
  if (s.stability < 22) {
    ensureCrisis('rebellion', 'crisis', 70)
  } else if (s.stability < 32 && s.inequality > 50) {
    ensureCrisis('rebellion', 'developing', 35)
  }
}

// ---------- 人物模拟 ----------
function simulateCharacters(s, g) {
  const alive = store.characters.filter(c => c.alive)
  for (const c of alive) {
    // 财富：受经济、野心影响
    const wealthDelta = (s.economy - 50) * 0.06 + (c.ambition - 50) * 0.05 + rand(-4, 4)
    c.wealth = clamp(c.wealth + wealthDelta, 0, 100)

    // 影响力：受野心、财富、阵营实力影响
    const faction = store.factions.find(f => f.id === c.factionId)
    const infDelta = (c.ambition - 45) * 0.05 + (c.wealth - 50) * 0.03 + (faction ? (faction.power - 50) * 0.02 : 0) + rand(-3, 3)
    c.influence = clamp(c.influence + infDelta, 0, 100)

    // 幸福度：财富、社会稳定、善良（善良者在低不平等中更幸福）
    const happyDelta = (c.wealth - c.happiness) * 0.08
      + (s.stability - 50) * 0.06
      - (1 - c.kindness / 100) * (s.inequality - 50) * 0.08
      + rand(-4, 4)
    c.happiness = clamp(c.happiness + happyDelta, 0, 100)

    // 激进且不幸、且有起码号召力的人物可能制造事端
    if (c.radicalism > 65 && c.happiness < 35 && c.influence >= 15 && rand01() < 0.35 * g.unrestMod) {
      applyImpact({ stability: -6, economy: -3 })
      c.influence = clamp(c.influence + 5)
      const r = findCrisis('rebellion')
      if (r && r.stage !== 'recovering') r.severity = clamp(r.severity + 5, 0, 100)
      addEvent(`${c.name} 因对现状极度不满，煽动了一场抗议活动，社会稳定性下降`, 'bad')
    }

    // 政变：需要动机（野心+乱世）与资源（影响力+财富），分阶段积累，而非一次判定
    simulateCoup(c, s)

    // 善良高影响人物可能调和社会（消耗自身影响力）
    if (c.kindness > 70 && c.influence > 55 && s.stability < 55 && rand01() < 0.25) {
      applyImpact({ stability: 5, happiness: 4 })
      c.influence = clamp(c.influence - 3, 0, 100)
      const r = findCrisis('rebellion')
      if (r && r.stage !== 'recovering') {
        r.severity = clamp(r.severity - 15, 0, 100)
        addEvent(`${c.name} 出面调解各方矛盾，叛乱势力的支持者开始动摇`, 'good')
      } else {
        addEvent(`${c.name} 出面调解各方矛盾，社会紧张局势得到缓解`, 'good')
      }
    }

    // 极端环境下人物可能死亡：动荡 / 饥荒 / 战争
    const deathRisk =
      (s.stability < 20 ? 0.04 : 0) +
      (findCrisis('famine')?.stage === 'crisis' ? 0.03 : 0) +
      (findCrisis('war') ? 0.02 : 0)
    if (deathRisk > 0 && rand01() < deathRisk) {
      c.alive = false
      const famine = findCrisis('famine')
      const cause = famine?.stage === 'crisis' ? '在饥荒中饿死' : findCrisis('war') ? '在战乱中丧生' : '在社会动荡中丧生'
      addEvent(`${c.name} ${cause}`, 'crisis')
    }
  }
}

/**
 * 政变是多阶段过程：
 *   动机（野心>75 且 稳定<45）+ 资源（影响力>55 且 财富>30）同时具备时，
 *   逐年积累政变筹备度（消耗财富），积累速度受治安压制；
 *   筹备度满后发动政变，成功率取决于自身实力与国家机器的对比；
 *   条件不再具备时筹备瓦解衰减。
 */
function simulateCoup(c, s) {
  if (c.coupProgress === undefined) c.coupProgress = 0
  const hasMotive = c.ambition > 75 && s.stability < 45
  const hasMeans = c.influence > 55 && c.wealth > 30

  if (hasMotive && hasMeans) {
    const gain = Math.max(0, (c.influence - 50) * 0.15 + (c.wealth - 30) * 0.1 + rand(0, 6))
    c.coupProgress = clamp(c.coupProgress + gain - s.security * 0.05, 0, 100)
    c.wealth = clamp(c.wealth - 2, 0, 100) // 招揽党羽、囤积资源的持续开销
    if (c.coupProgress >= 30 && !c.coupNoticed && rand01() < 0.3) {
      c.coupNoticed = true
      addEvent(`${c.name} 暗中招揽党羽，坊间已有其图谋不轨的传闻`, 'info')
    }
    if (c.coupProgress >= 100) attemptCoup(c, s)
  } else if (c.coupProgress > 0) {
    c.coupProgress = Math.max(0, c.coupProgress - 15)
    if (c.coupProgress === 0) c.coupNoticed = false
  }
}

function attemptCoup(c, s) {
  const power = c.influence + c.wealth * 0.5
  const defense = s.security + s.orgCapacity * 0.5
  if (rand01() < power / (power + defense + 1)) {
    applyImpact({ stability: -10, inequality: 6 })
    c.influence = clamp(c.influence + 15)
    c.wealth = clamp(c.wealth + 10)
    ensureCrisis('rebellion', 'crisis', 60)
    addEvent(`${c.name} 经过多年经营发动政变并成功夺权，旧秩序被颠覆`, 'crisis')
  } else {
    c.influence = clamp(c.influence - 25)
    c.wealth = clamp(c.wealth - 20)
    addEvent(`${c.name} 的政变图谋被挫败，其势力遭到清算`, 'bad')
  }
  c.coupProgress = 0
  c.coupNoticed = false
}
