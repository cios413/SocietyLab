import { clamp } from '../store.js'

/**
 * 公地悲剧模拟
 * 一片公共牧场，牧民分「克制型」（可持续放牧）与「贪婪型」（尽量多放牧）。
 * 草场按逻辑斯蒂增长恢复，过度放牧导致崩溃。
 */

const CONSUMPTION = 0.35 // 每只羊每回合消耗的草

export function simulateCommons({ herders = 10, greedyRatio = 0.5, turns = 40, capacity = 120, regen = 0.35 } = {}) {
  const greedyCount = Math.round(herders * greedyRatio)
  const agents = Array.from({ length: herders }, (_, i) => ({
    id: i,
    greedy: i < greedyCount,
    sheep: 2,
    wealth: 0
  }))

  let grass = capacity * 0.8
  const history = [{ turn: 0, grass: Math.round(grass), sheep: agents.reduce((s, a) => s + a.sheep, 0) }]

  for (let t = 1; t <= turns; t++) {
    // 1. 草场恢复（逻辑斯蒂增长）
    const beforeRegen = grass
    grass = Math.min(capacity, grass + capacity * regen * (1 - grass / capacity))
    const regenAmount = grass - beforeRegen

    // 2. 牧民决定是否增加羊
    // 克制者的目标份额：草场健康状态下人均可持续牧羊数
    const fairShare = Math.max(2, Math.floor(capacity * 0.45 / agents.length))
    let addedGreedy = 0, addedRestrained = 0
    for (const a of agents) {
      if (a.greedy) {
        a.sheep += 2 // 贪婪者无脑扩张
        addedGreedy += 2
      } else if (grass > capacity * 0.55 && a.sheep < fairShare) {
        a.sheep += 1 // 克制者只在草场健康时适度扩张
        addedRestrained += 1
      }
    }

    // 3. 草场消耗
    const totalSheep = agents.reduce((s, a) => s + a.sheep, 0)
    const consumed = totalSheep * CONSUMPTION
    grass -= consumed

    // 4. 草场透支 → 羊饿死、财富缩水
    let starved = false, sheepLost = 0
    if (grass < 0) {
      starved = true
      const deficit = -grass
      for (const a of agents) {
        const loss = Math.min(a.sheep, Math.ceil(deficit * (a.sheep / totalSheep) * 1.5))
        a.sheep -= loss
        a.wealth -= loss * 3
        sheepLost += loss
      }
      grass = 0
    }

    // 5. 存活的羊产出收益（草场越健康产出越高）
    const health = clamp(grass / capacity, 0, 1)
    for (const a of agents) {
      a.wealth += a.sheep * (0.5 + health)
    }

    history.push({
      turn: t,
      grass: Math.round(grass),
      sheep: agents.reduce((s, a) => s + a.sheep, 0),
      regenAmount: Math.round(regenAmount * 10) / 10,
      consumed: Math.round(consumed * 10) / 10,
      addedGreedy,
      addedRestrained,
      starved,
      sheepLost
    })
  }

  // 崩溃判定：最后 1/4 回合的平均草场低于容量 15%（生态系统被压垮，无法恢复）
  const tailLen = Math.max(3, Math.floor(turns * 0.25))
  const tail = history.slice(-tailLen)
  const avgTailGrass = tail.reduce((s, p) => s + p.grass, 0) / tail.length
  const collapsed = avgTailGrass < capacity * 0.15

  const greedy = agents.filter(a => a.greedy)
  const restrained = agents.filter(a => !a.greedy)
  const avg = arr => arr.length ? Math.round(arr.reduce((s, a) => s + a.wealth, 0) / arr.length * 10) / 10 : 0

  return {
    history,
    collapsed,
    finalGrass: Math.round(grass),
    greedyAvgWealth: avg(greedy),
    restrainedAvgWealth: avg(restrained),
    greedyCount,
    restrainedCount: agents.length - greedyCount,
    agents: agents.map(a => ({
      id: a.id,
      greedy: a.greedy,
      sheep: a.sheep,
      wealth: Math.round(a.wealth * 10) / 10
    }))
  }
}
