/**
 * 最后通牒博弈
 * 提议者从 100 金币中提出分给响应者 x；响应者接受则按提议分配，拒绝则双方归零。
 * 纯理性预测：提议 1，且任何 ≥1 都会被接受。
 * 实际演化：公平感使拒绝普遍存在，提议向公平区间收敛。
 */

function gaussian(mean, std) {
  let s = 0
  for (let i = 0; i < 6; i++) s += Math.random()
  return mean + (s - 3) * std / 1.225
}
const clamp = (v, a, b) => Math.min(b, Math.max(a, v))

export function simulateUltimatum({ proposers = 40, responders = 40, rounds = 60, learning = true } = {}) {
  const ps = Array.from({ length: proposers }, (_, i) => ({
    id: i, generosity: clamp(gaussian(35, 14), 5, 80), adj: 0, wealth: 0, rejected: 0, accepted: 0
  }))
  const rs = Array.from({ length: responders }, (_, i) => ({
    id: i, threshold: clamp(gaussian(30, 12), 0, 70), wealth: 0, rejected: 0, accepted: 0
  }))

  const history = []
  for (let r = 1; r <= rounds; r++) {
    let offerSum = 0, acceptCount = 0
    const deals = []
    for (const p of ps) {
      const resp = rs[Math.floor(Math.random() * rs.length)]
      const offer = clamp(Math.round(p.generosity + p.adj), 1, 99)
      const accepted = offer >= resp.threshold
      offerSum += offer
      if (accepted) {
        p.wealth += 100 - offer
        resp.wealth += offer
        p.accepted++
        resp.accepted++
        if (learning) p.adj -= 1.5 // 被接受就试着再压低一点
      } else {
        p.rejected++
        resp.rejected++
        if (learning) p.adj += 3 // 被拒绝就提高报价
      }
      deals.push({ proposer: p.id, responder: resp.id, offer, threshold: Math.round(resp.threshold), accepted })
    }
    history.push({
      round: r,
      avgOffer: Math.round(offerSum / ps.length * 10) / 10,
      acceptRate: Math.round(acceptCount / ps.length * 1000) / 10,
      deals
    })
  }

  const richestP = [...ps].sort((a, b) => b.wealth - a.wealth)[0]
  const totalRejections = ps.reduce((s, p) => s + p.rejected, 0)
  return {
    history,
    finalAvgOffer: history[history.length - 1].avgOffer,
    finalAcceptRate: history[history.length - 1].acceptRate,
    totalRejections,
    richestProposer: { id: richestP.id, wealth: richestP.wealth, generosity: Math.round(richestP.generosity) },
    avgThreshold: Math.round(rs.reduce((s, x) => s + x.threshold, 0) / rs.length * 10) / 10
  }
}
