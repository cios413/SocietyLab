import { clamp } from '../store.js'

/**
 * 电车难题群体模拟
 * 每个虚拟人被赋予「功利主义倾向」u（0-100）与「亲手伤害厌恶」，
 * 根据场景的「直接伤害程度」决定是否干预。
 */

export const SCENARIOS = [
  {
    id: 'classic',
    title: '经典扳道岔',
    story: '一辆失控电车正冲向轨道上的 5 个人。你站在道岔旁，拉动拉杆电车会切换到另一条轨道——但那条轨道上有 1 个人。拉，还是不拉？',
    actionLabel: '拉动拉杆（救5杀1）',
    inactionLabel: '什么都不做',
    directness: 0.25, // 间接伤害
    insight: '约 90% 的人选择拉杆——典型的功利主义计算：5 条命 > 1 条命。'
  },
  {
    id: 'fatman',
    title: '天桥上的胖子',
    story: '同样的失控电车，这次没有道岔。你站在天桥上，身边有个体型足够大的陌生人，把他推下去能挡住电车救下 5 个人。推，还是不推？',
    actionLabel: '把他推下去（救5杀1）',
    inactionLabel: '什么都不做',
    directness: 0.95, // 亲手、直接伤害
    insight: '只有约 10% 的人选择推。结果完全相同，但「亲手杀人」触发了强烈的义务论直觉——不能把人当作手段。'
  },
  {
    id: 'loop',
    title: '环形轨道变体',
    story: '电车冲向 5 个人，你可以扳道岔让它进入一条环形岔道，岔道上有 1 个胖子能挡住电车——但电车停下后仍会绕回主轨。如果岔道上没人，电车绕回后照样撞死 5 人。扳，还是不扳？',
    actionLabel: '扳道岔（利用那1人）',
    inactionLabel: '什么都不做',
    directness: 0.6,
    insight: '这个变体用来检验「双重效应原则」：那 1 个人的死是救 5 人的「手段」而非「副作用」，接受度介于前两者之间。'
  },
  {
    id: 'transplant',
    title: '器官移植',
    story: '你是医生，有 5 个病人分别急需心、肝、两个肾和肺，找不到供体都会死。这时一个来做体检的健康年轻人，血型组织配型全部吻合。偷偷牺牲他 1 人能救活 5 人。做，还是不做？',
    actionLabel: '牺牲他（救5杀1）',
    inactionLabel: '拒绝',
    directness: 1.0,
    insight: '几乎所有人拒绝。它与扳道岔在功利计算上等价，却触及了制度信任——如果医院会杀健康人，谁还敢看病？'
  }
]

/**
 * @param {object} scenario 场景
 * @param {number} n 虚拟人数
 * @param {number} utilMean 群体平均功利主义倾向 (0-100)
 * @param {boolean} withAgents 是否返回每个虚拟人的决策明细
 */
export function simulatePopulation(scenario, n = 300, utilMean = 50, withAgents = false) {
  let action = 0
  const agents = []
  for (let i = 0; i < n; i++) {
    // 个体功利倾向：正态分布
    const u = gaussian(utilMean, 18) / 100
    // 义务论厌恶：亲手伤害时，非功利者强烈抵触
    const aversion = scenario.directness * (1 - u) * 1.1
    // 选择干预的概率
    let p = u * 1.2 + 0.08 - aversion + gaussian(0, 0.06)
    p = clamp(p, 0.01, 0.99)
    const chose = Math.random() < p
    if (chose) action++
    if (withAgents) agents.push({ id: i, u: Math.round(u * 1000) / 10, p: Math.round(p * 1000) / 10, action: chose })
  }
  const inaction = n - action
  return {
    action, inaction,
    actionPct: Math.round(action / n * 1000) / 10,
    inactionPct: Math.round(inaction / n * 1000) / 10,
    agents: withAgents ? agents : undefined
  }
}

function gaussian(mean, std) {
  let s = 0
  for (let i = 0; i < 6; i++) s += Math.random()
  return mean + (s - 3) * std / 1.225
}
