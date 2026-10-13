/**
 *  iterated Prisoner's Dilemma 锦标赛
 *  收益: T(诱惑)=5 R(报酬)=3 P(惩罚)=1 S( sucker)=0
 */

export const PAYOFF_TABLE = {
  CC: [3, 3],
  CD: [0, 5],
  DC: [5, 0],
  DD: [1, 1]
}

export const STRATEGIES = {
  ALLC: {
    name: '老好人', desc: '永远合作',
    play: () => 'C'
  },
  ALLD: {
    name: '背叛者', desc: '永远背叛',
    play: () => 'D'
  },
  TFT: {
    name: '以牙还牙', desc: '首轮合作，之后复制对方上一轮',
    play: (my, opp) => (opp.length === 0 ? 'C' : opp[opp.length - 1])
  },
  GRIM: {
    name: '冷酷触发', desc: '合作直到被背叛一次，然后永远背叛',
    play: (my, opp) => (opp.includes('D') ? 'D' : 'C')
  },
  TF2T: {
    name: '宽容报复', desc: '对方连续背叛两次才反击',
    play: (my, opp) => {
      const n = opp.length
      return n >= 2 && opp[n - 1] === 'D' && opp[n - 2] === 'D' ? 'D' : 'C'
    }
  },
  PAVLOV: {
    name: '巴甫洛夫', desc: '赢留输变：上一轮得分>=3就重复，否则换边',
    play: (my, opp) => {
      const n = my.length
      if (n === 0) return 'C'
      const key = my[n - 1] + opp[n - 1]
      const score = PAYOFF_TABLE[key][0]
      const prev = my[n - 1]
      return score >= 3 ? prev : (prev === 'C' ? 'D' : 'C')
    }
  },
  RAND: {
    name: '随机者', desc: '每轮随机选择',
    play: () => (Math.random() < 0.5 ? 'C' : 'D')
  }
}

function match(keyA, keyB, rounds) {
  const a = STRATEGIES[keyA], b = STRATEGIES[keyB]
  const histA = [], histB = []
  let scoreA = 0, scoreB = 0
  for (let i = 0; i < rounds; i++) {
    const moveA = a.play(histA, histB)
    const moveB = b.play(histB, histA)
    histA.push(moveA)
    histB.push(moveB)
    const [sa, sb] = PAYOFF_TABLE[moveA + moveB]
    scoreA += sa
    scoreB += sb
  }
  return [scoreA, scoreB]
}

/** 单场对局的逐轮明细 */
export function matchDetailed(keyA, keyB, rounds) {
  const a = STRATEGIES[keyA], b = STRATEGIES[keyB]
  const histA = [], histB = []
  const roundsDetail = []
  let cumA = 0, cumB = 0
  for (let i = 0; i < rounds; i++) {
    const moveA = a.play(histA, histB)
    const moveB = b.play(histB, histA)
    histA.push(moveA)
    histB.push(moveB)
    const [sa, sb] = PAYOFF_TABLE[moveA + moveB]
    cumA += sa
    cumB += sb
    roundsDetail.push({ round: i + 1, moveA, moveB, scoreA: sa, scoreB: sb, cumA, cumB })
  }
  return { roundsDetail, totalA: cumA, totalB: cumB }
}

export function runTournament(rounds = 50) {
  const keys = Object.keys(STRATEGIES)
  const total = Object.fromEntries(keys.map(k => [k, 0]))
  const matrix = [] // matrix[i][j] = i 对 j 的得分
  for (let i = 0; i < keys.length; i++) {
    matrix.push([])
    for (let j = 0; j < keys.length; j++) {
      const [sa, sb] = match(keys[i], keys[j], rounds)
      matrix[i][j] = sa
      total[keys[i]] += sa
      if (i !== j) total[keys[j]] += sb
    }
  }
  const standings = keys
    .map(k => ({ key: k, name: STRATEGIES[k].name, desc: STRATEGIES[k].desc, score: total[k] }))
    .sort((x, y) => y.score - x.score)
  return { standings, matrix, keys, rounds }
}

/** 演化版：按上一轮得分比例复制策略，看哪种策略在种群中胜出 */
export function runEvolution(rounds = 30, generations = 12) {
  const keys = Object.keys(STRATEGIES)
  let population = keys.flatMap(k => Array(10).fill(k)) // 每种 10 个个体
  const snapshots = []
  for (let gen = 0; gen < generations; gen++) {
    // 计数
    const count = Object.fromEntries(keys.map(k => [k, 0]))
    population.forEach(k => count[k]++)
    snapshots.push({ gen, ...count })
    // 每个个体与随机对手对局得分
    const fitness = Object.fromEntries(keys.map(k => [k, 0]))
    for (const k of population) {
      const opp = population[Math.floor(Math.random() * population.length)]
      fitness[k] += match(k, opp, rounds)[0]
    }
    // 按平均适应度比例重生
    const avgFit = {}
    for (const k of keys) avgFit[k] = count[k] > 0 ? fitness[k] / count[k] : 0
    const totalFit = keys.reduce((s, k) => s + avgFit[k] * count[k], 0)
    const next = []
    for (const k of keys) {
      const expected = totalFit > 0 ? Math.round((avgFit[k] * count[k] / totalFit) * population.length) : 0
      for (let i = 0; i < expected; i++) next.push(k)
    }
    population = next.length ? next : keys.flatMap(k => Array(10).fill(k))
  }
  const count = Object.fromEntries(keys.map(k => [k, 0]))
  population.forEach(k => count[k]++)
  snapshots.push({ gen: generations, ...count })
  return { snapshots, keys }
}
