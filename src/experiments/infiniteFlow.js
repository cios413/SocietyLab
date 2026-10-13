/**
 * 无限流生存游戏模拟（性格驱动版）
 * 每名玩家随机生成一种性格，性格决定其在背叛之夜、多数决处刑中的具体决策，
 * 每轮生成模板化故事文本；接入大模型后可逐轮 AI 续写。
 */

const NAMES = ['白夜', '秦川', '苏离', '洛水', '楚天', '顾寒', '林七', '沈默', '叶修', '许诺', '江澄', '安然', '陆离', '季风', '阿九', '半夏', '陈默', '周舟', '方糖', '顾里', '江南', '祁连', '苏叶', '白鹿']

// 性格库：决策倾向由 betrayal（袭击目标偏好）与 vote（投票偏好）定义
export const PERSONALITIES = [
  { key: 'mou', name: '冷血谋士', desc: '精于算计，只在必胜时出手', mod: { int: 15, calm: 10, moral: -15 }, betrayal: 'weakest', vote: 'threat' },
  { key: 'mang', name: '热血莽夫', desc: '凭一腔热血横冲直撞，专挑硬茬', mod: { body: 15, calm: -10, luck: 5 }, betrayal: 'strongest', vote: 'random' },
  { key: 'sheng', name: '圣母', desc: '宁可自己受伤也要护住别人', mod: { moral: 25, body: -5 }, betrayal: 'never', vote: 'evil', protect: true },
  { key: 'xiao', name: '笑面虎', desc: '表面和善，专挑信任他的人下手', mod: { calm: 10, moral: -20, int: 5 }, betrayal: 'ally', vote: 'ally' },
  { key: 'lang', name: '独狼', desc: '不相信任何人，也不给任何人机会', mod: { calm: 5, body: 5, moral: -5 }, betrayal: 'opportunist', vote: 'random', soloDefense: 15 },
  { key: 'yun', name: '天选锦鲤', desc: '运气好到离谱的普通人', mod: { luck: 30 }, betrayal: 'never', vote: 'follow' },
  { key: 'qiang', name: '墙头草', desc: '哪边风大往哪边倒', mod: {}, betrayal: 'never', vote: 'follow' },
  { key: 'xia', name: '仗义侠客', desc: '路见不平拔刀相助，绝不背后伤人', mod: { body: 10, moral: 15 }, betrayal: 'never', vote: 'evil', protect: true }
]

function randInt(min, max) { return Math.floor(min + Math.random() * (max - min + 1)) }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)] }
const clamp = (v, a = 1, b = 99) => Math.min(b, Math.max(a, v))

export function createPlayers(n = 12) {
  const shuffled = [...NAMES].sort(() => Math.random() - 0.5)
  const deck = [...PERSONALITIES].sort(() => Math.random() - 0.5)
  return Array.from({ length: n }, (_, i) => {
    const personality = deck[i % deck.length]
    const stats = {
      body: randInt(20, 90), int: randInt(20, 90), calm: randInt(20, 90),
      luck: randInt(10, 90), moral: randInt(10, 90)
    }
    for (const [k, v] of Object.entries(personality.mod)) stats[k] = clamp(stats[k] + v)
    return {
      id: i,
      name: shuffled[i % shuffled.length],
      ...stats,
      personality,
      alive: true, deathRound: null, deathCause: null, kills: 0
    }
  })
}

const SCENARIOS = [
  { id: 'bridge', name: '玻璃栈桥', desc: '脚下是钢化玻璃与普通玻璃相间的栈桥，踏错一步就是万丈深渊。', score: p => p.luck * 0.5 + p.calm * 0.3 + p.body * 0.2, lethal: 52, deathCause: '踩中了普通玻璃，坠入深渊' },
  { id: 'doll', name: '一二三木头人', desc: '巨型木偶唱着歌谣，回头的瞬间任何细微的移动都会招来子弹。', score: p => p.body * 0.4 + p.calm * 0.6, lethal: 48, deathCause: '在木偶回头时没能稳住身体' },
  { id: 'maze', name: '毒气密室', desc: '密室缓缓注入毒气，唯一的生路是解开墙上的连环机关。', score: p => p.int * 0.7 + p.calm * 0.3, lethal: 50, deathCause: '没能在毒气弥漫前解开机关' },
  { id: 'flood', name: '涨水牢笼', desc: '铁笼沉入水池，水位不断上涨，只有憋气最久的人才能等到闸门开启。', score: p => p.body * 0.6 + p.luck * 0.4, lethal: 55, deathCause: '在水淹没头顶前没能撑到闸门开启' },
  { id: 'pill', name: '毒酒抉择', desc: '两杯外观完全相同的酒，一杯无毒一杯剧毒，必须选一杯饮下。', score: p => p.luck * 0.5 + p.int * 0.5, lethal: 50, deathCause: '选中了那杯毒酒' },
  { id: 'betrayal', name: '背叛之夜', desc: '灯光熄灭。黑暗中，心怀恶意的人开始猎杀同类，善良的人则结成同盟互保。', special: 'betrayal' },
  { id: 'vote', name: '多数决处刑', desc: '所有人必须投票处决一名玩家，得票最多者立即死亡。', special: 'vote' }
]

export function simulateInfiniteFlow(playerCount = 12) {
  const players = createPlayers(playerCount)
  const rounds = []
  const deck = [...SCENARIOS].sort(() => Math.random() - 0.5)
  let roundNum = 0
  const alive = () => players.filter(p => p.alive)

  while (alive().length > 1 && deck.length > 0) {
    roundNum++
    const sc = deck.shift()
    const deaths = [], notes = [], checks = [], actions = []

    if (sc.special === 'betrayal') {
      // 背叛之夜：性格决定是否出手、袭击谁
      const protectors = alive().filter(p => p.personality.protect)
      if (protectors.length) notes.push(`${protectors.map(p => `${p.name}(${p.personality.name})`).join('、')} 主动守夜，庇护身边的人`)

      for (const k of alive()) {
        const style = k.personality.betrayal
        if (style === 'never') continue
        // 谋士/独狼只有在善恶够低时才动手；莽夫看心情
        const willAttack = style === 'ally' ? k.moral < 55 : style === 'strongest' ? Math.random() < 0.6 : k.moral < 40
        if (!willAttack) { if (style !== 'never' && Math.random() < 0.3) actions.push(`${k.name}(${k.personality.name}) 在黑暗中按兵不动，静静观察`) ; continue }

        const targets = alive().filter(p => p.id !== k.id)
        if (!targets.length) break
        let victim
        if (style === 'weakest') victim = [...targets].sort((a, b) => a.body - b.body)[0]
        else if (style === 'strongest') victim = [...targets].sort((a, b) => b.body - a.body)[0]
        else if (style === 'ally') victim = pick([...targets].sort((a, b) => b.moral - a.moral).slice(0, 3)) // 专挑信任他的好人
        else victim = pick(targets)
        if (!victim || !victim.alive) continue

        const protected_ = protectors.length > 0 && victim.personality.key !== 'xiao'
        const solo = victim.personality.soloDefense || 0
        const attack = k.body + randInt(0, 40)
        const defense = victim.body + victim.calm * 0.5 + randInt(0, 40) + (protected_ ? 25 : 0) + solo
        actions.push(`${k.name}(${k.personality.name}) 摸黑扑向 ${victim.name}(${victim.personality.name})`)
        if (attack > defense) {
          victim.alive = false
          victim.deathRound = roundNum
          victim.deathCause = `在背叛之夜被 ${k.name}(${k.personality.name}) 所杀`
          k.kills++
          deaths.push({ name: victim.name, cause: victim.deathCause })
        } else {
          notes.push(`${victim.name} ${protected_ ? '在守夜者掩护下' : solo ? '凭借独狼的警觉' : '堪堪'}挡下了这一击`)
        }
      }
      if (!deaths.length) notes.push('这一夜无人丧命，但每个人都听到了黑暗中的脚步声')
    } else if (sc.special === 'vote') {
      // 多数决处刑：性格决定投票策略
      const votes = new Map()
      const voterList = alive()
      const castVote = (p, frontRunner) => {
        const candidates = voterList.filter(x => x.id !== p.id)
        let target
        switch (p.personality.vote) {
          case 'threat': target = [...candidates].sort((a, b) => (b.body + b.int + b.calm) - (a.body + a.int + a.calm))[0]; break
          case 'evil': target = [...candidates].sort((a, b) => a.moral - b.moral)[0]; break
          case 'ally': target = [...candidates].sort((a, b) => b.moral - a.moral)[0]; break
          case 'follow': target = frontRunner || pick(candidates); break
          default: target = pick(candidates)
        }
        votes.set(target.id, (votes.get(target.id) || 0) + 1)
        actions.push(`${p.name}(${p.personality.name}) 投给了 ${target.name}`)
        return target
      }
      // 两阶段：非墙头草先投，墙头草跟风投当前最高票
      for (const p of voterList.filter(x => x.personality.vote !== 'follow')) castVote(p)
      const front = [...votes.entries()].sort((a, b) => b[1] - a[1])[0]
      const frontRunner = front ? players.find(p => p.id === front[0]) : null
      for (const p of voterList.filter(x => x.personality.vote === 'follow')) castVote(p, frontRunner)

      const maxVotes = Math.max(...votes.values())
      const tied = [...votes.entries()].filter(([, v]) => v === maxVotes).map(([id]) => id)
      const out = players.find(p => p.id === pick(tied))
      out.alive = false
      out.deathRound = roundNum
      out.deathCause = `被多数决投票处决（${maxVotes} 票）`
      deaths.push({ name: out.name, cause: out.deathCause })
      notes.push(`投票结果：${out.name}(${out.personality.name}) 以 ${maxVotes} 票被处决`)
    } else {
      // 属性检定副本
      for (const p of alive()) {
        const base = sc.score(p)
        const roll = randInt(0, 35)
        const score = base + roll
        const survived = score >= sc.lethal
        checks.push({ name: p.name, personality: p.personality.name, base: Math.round(base), roll, score: Math.round(score), lethal: sc.lethal, survived })
        if (!survived) {
          p.alive = false
          p.deathRound = roundNum
          p.deathCause = sc.deathCause
          deaths.push({ name: p.name, cause: sc.deathCause })
        }
      }
      if (!deaths.length) notes.push('奇迹般地，本轮无人死亡')
      else notes.push(`${alive().length} 人通过了「${sc.name}」`)
    }

    rounds.push({
      round: roundNum, name: sc.name, desc: sc.desc,
      deaths, notes, checks, actions,
      aliveAfter: alive().length,
      story: buildStory(sc, checks, deaths, notes, actions)
    })
  }

  // 决出胜者
  let winner = null
  if (alive().length === 1) {
    winner = alive()[0]
  } else if (alive().length > 1) {
    winner = [...alive()].sort((a, b) =>
      (b.body + b.int + b.calm + b.luck + b.kills * 30) - (a.body + a.int + a.calm + a.luck + a.kills * 30)
    )[0]
    const finalDeaths = alive().filter(p => p.id !== winner.id).map(p => {
      p.alive = false
      p.deathRound = roundNum + 1
      p.deathCause = '在最终审判中评分落败'
      return { name: p.name, cause: p.deathCause }
    })
    rounds.push({
      round: roundNum + 1, name: '最终审判',
      desc: '副本耗尽仍有多名幸存者，主神按综合评分宣判最终胜者。',
      deaths: finalDeaths, notes: [`${winner.name}(${winner.personality.name}) 综合评分最高，成为最终胜者`],
      checks: [], actions: [], aliveAfter: 1,
      story: `灯光最后一次亮起，${winner.name} 独自站在场地中央。主神的声音冰冷而宏大：胜者，${winner.name}。`
    })
  }

  return { players, rounds, winner }
}

// ---------- 模板故事生成 ----------
function buildStory(sc, checks, deaths, notes, actions) {
  const parts = [sc.desc]
  if (checks.length) {
    const best = [...checks].sort((a, b) => b.score - a.score)[0]
    if (best) parts.push(`${best.name} 表现最为出色（检定 ${best.score}），动作干净利落。`)
    const narrow = checks.filter(c => !c.survived && c.lethal - c.score <= 5)
    for (const c of narrow) parts.push(`${c.name} 只差一步——检定 ${c.score} 对及格线 ${c.lethal}，一线之隔。`)
  }
  for (const a of actions.slice(0, 4)) parts.push(a + '。')
  for (const d of deaths) parts.push(`${d.name} ${d.cause}。`)
  for (const n of notes) parts.push(n + '。')
  return parts.join('')
}
