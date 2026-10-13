import { store, addEvent, recordHistory, clamp } from '../store.js'
import { runRuleTurn } from './ruleEngine.js'

/**
 * LLM 推演引擎：把当前社会状态压缩成提示词，调用 OpenAI 兼容接口，
 * 让大模型生成下一回合的事件与指标变化；失败时回退规则引擎。
 */

function buildPrompt() {
  const s = store.society
  const w = store.world
  const chars = store.characters.filter(c => c.alive).map(c =>
    `${c.name}(阵营:${(store.factions.find(f => f.id === c.factionId) || {}).name || '无'}, 野心${c.ambition}, 善良${c.kindness}, 激进${c.radicalism}, 财富${Math.round(c.wealth)}, 影响力${Math.round(c.influence)}, 幸福${Math.round(c.happiness)})`
  ).join('；')
  const factions = store.factions.map(f => `${f.name}(实力${f.power}, 凝聚力${f.cohesion}, 文化:${f.culture})`).join('；')
  const recent = s.events.slice(0, 5).map(e => `第${e.year}年: ${e.text}`).join('\n')

  return `你是一个社会模拟推演引擎。请根据以下社会状态，推演下一年的发展。

【世界观】${w.name}：${w.description}
【制度】${w.governance}，资源丰度${w.resourceAbundance}，技术水平${w.techLevel}，文化开放度${w.culturalOpenness}，环境压力${w.envPressure}
【当前第${s.year}年社会指标】人口${Math.round(s.population)}，经济${Math.round(s.economy)}/100，稳定${Math.round(s.stability)}/100，文化${Math.round(s.culture)}/100，幸福度${Math.round(s.happiness)}/100，不平等${Math.round(s.inequality)}/100
【阵营】${factions}
【人物】${chars}
【近期事件】
${recent || '(无)'}

请严格以 JSON 返回（不要输出其他内容），格式：
{
  "summary": "一句话概括这一年的社会走向",
  "events": [
    {"text": "具体事件描述（可涉及上面的人物与阵营）", "type": "good|bad|crisis|info",
     "impact": {"economy": 0, "stability": 0, "culture": 0, "happiness": 0, "inequality": 0, "population": 0}}
  ],
  "characterChanges": [
    {"name": "人物名", "wealth": 0, "influence": 0, "happiness": 0, "note": "一句话说明其遭遇"}
  ]
}
要求：2-4个事件，impact 各字段为 -15 到 15 的数值（population 为 -0.1 到 0.1 的比例），推演要有因果逻辑、反映世界观设定，事件之间有连续性。`
}

export async function runLlmTurn() {
  const s = store.society
  const { baseUrl, apiKey, model } = store.llm
  if (!apiKey) throw new Error('请先在「设置」中填写 API Key')

  store.llmBusy = true
  try {
    const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是严谨的社会模拟推演引擎，只输出 JSON。' },
          { role: 'user', content: buildPrompt() }
        ],
        temperature: 0.9,
        response_format: { type: 'json_object' }
      })
    })
    if (!resp.ok) throw new Error(`API 请求失败: ${resp.status} ${resp.statusText}`)
    const data = await resp.json()
    const content = data.choices?.[0]?.message?.content || ''
    const result = JSON.parse(content)

    // 应用回合推进
    s.turn += 1
    s.year += 1

    // 应用事件影响
    for (const evt of (result.events || [])) {
      const imp = evt.impact || {}
      if (imp.economy) s.economy = clamp(s.economy + imp.economy, 5, 100)
      if (imp.stability) s.stability = clamp(s.stability + imp.stability, 2, 100)
      if (imp.culture) s.culture = clamp(s.culture + imp.culture, 5, 100)
      if (imp.happiness) s.happiness = clamp(s.happiness + imp.happiness, 0, 100)
      if (imp.inequality) s.inequality = clamp(s.inequality + imp.inequality, 5, 95)
      if (imp.population) s.population = Math.max(50, s.population * (1 + imp.population))
      addEvent(evt.text, evt.type || 'info')
    }
    if (result.summary) addEvent(`【年度总结】${result.summary}`, 'summary')

    // 应用人物变化
    for (const ch of (result.characterChanges || [])) {
      const c = store.characters.find(x => x.name === ch.name && x.alive)
      if (!c) continue
      if (ch.wealth) c.wealth = clamp(c.wealth + ch.wealth)
      if (ch.influence) c.influence = clamp(c.influence + ch.influence)
      if (ch.happiness) c.happiness = clamp(c.happiness + ch.happiness)
      if (ch.note) addEvent(`${c.name}：${ch.note}`, 'character')
    }

    // 人口自然变化
    s.population = Math.max(50, s.population * (1 + (s.happiness - 45) * 0.0008))

    recordHistory()
    return result
  } catch (e) {
    addEvent(`大模型推演失败（${e.message}），本回合已回退为规则引擎推演`, 'bad')
    return runRuleTurn()
  } finally {
    store.llmBusy = false
  }
}
