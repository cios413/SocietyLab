import { store, addEvent, recordHistory, clamp, rand01, genId, round1 } from '../store.js'
import { runRuleTurn } from './ruleEngine.js'
import { drawTurningPoint, maybeSpawnRuleNewcomer, evolveFactions } from './turningPoint.js'

/**
 * LLM 推演引擎：把当前社会状态压缩成提示词，调用 OpenAI 兼容接口，
 * 让大模型生成下一回合的事件与指标变化；失败时回退规则引擎。
 */

function buildPrompt(turningPoint) {
  const s = store.society
  const w = store.world
  const chars = store.characters.filter(c => c.alive).map(c =>
    `${c.name}(阵营:${(store.factions.find(f => f.id === c.factionId) || {}).name || '无'}, 野心${c.ambition}, 善良${c.kindness}, 激进${c.radicalism}, 财富${Math.round(c.wealth)}, 影响力${Math.round(c.influence)}, 幸福${Math.round(c.happiness)})`
  ).join('；')
  const factions = store.factions.map(f => `${f.name}(实力${f.power}, 凝聚力${f.cohesion}, 文化:${f.culture})`).join('；')
  const recent = s.events.slice(0, 5).map(e => `第${e.year}年: ${e.text}`).join('\n')
  const trend = s.history.slice(-4).map(h =>
    `第${h.year}年: 人口${h.population}，经济${Math.round(h.economy)}，稳定${Math.round(h.stability)}，幸福${Math.round(h.happiness)}`
  ).join('\n')
  const figureInstruction = turningPoint === 'hero'
    ? '本年概率判定：一位带领社会走出衰退的关键人物出现。请在 turningPoint 中创造此人，写明所属阵营，并给其行动设计有代价、有因果的正向事件。可以创建新阵营。'
    : turningPoint === 'disruptor'
      ? '本年概率判定：长期繁荣催生一位挑战现有秩序的关键人物。请在 turningPoint 中创造此人，写明所属阵营，并给其行动设计引发动荡的事件。可以创建新阵营。'
      : '本年没有关键人物出现；turningPoint 返回 null。普通人物或阵营仍可随事件发展。'

  return `你是一个社会模拟推演引擎。请根据以下社会状态，推演下一年的发展。

【世界观】${w.name}：${w.description}
【制度】${w.governance}，资源丰度${w.resourceAbundance}，技术水平${w.techLevel}，文化开放度${w.culturalOpenness}，环境压力${w.envPressure}
【当前第${s.year}年社会指标】人口${Math.round(s.population)}，经济${Math.round(s.economy)}/100，稳定${Math.round(s.stability)}/100，文化${Math.round(s.culture)}/100，幸福度${Math.round(s.happiness)}/100，不平等${Math.round(s.inequality)}/100
【阵营】${factions}
【人物】${chars}
【近年指标变化】
${trend || '(无)'}
【近期事件】
${recent || '(无)'}
【本年关键人物】${figureInstruction}

请严格以 JSON 返回（不要输出其他内容），格式：
{
  "summary": "一句话概括这一年的社会走向",
  "events": [
    {"text": "具体事件描述（可涉及上面的人物与阵营）", "type": "good|bad|crisis|info",
     "impact": {"economy": 0, "stability": 0, "culture": 0, "happiness": 0, "inequality": 0, "population": 0}}
  ],
  "characterChanges": [
    {"name": "现有人物名", "wealth": 0, "influence": 0, "happiness": 0, "factionName": null, "note": "一句话说明其遭遇"}
  ],
  "newFactions": [{"name": "新阵营名", "culture": "理念和来历", "power": 35, "cohesion": 60}],
  "factionChanges": [{"name": "已有阵营名", "powerDelta": 0, "cohesionDelta": 0, "culture": "可选的新理念"}],
  "newCharacters": [{"name": "新人物名", "factionName": "所属阵营名", "bio": "背景", "ambition": 50, "kindness": 50, "radicalism": 50, "wealth": 50, "influence": 50, "happiness": 50}],
  "turningPoint": null
}
如本年有关键人物，将 turningPoint 改为对象，字段与 newCharacters 相同，另加 "event": {"text": "该人物的具体行动", "type": "good|bad|crisis", "impact": {"economy": 0, "stability": 0, "happiness": 0, "inequality": 0, "population": 0}}。此事件不要再放入 events，以免重复结算。
要求：2-4个普通事件，impact 各字段为 -15 到 15 的数值（population 为 -0.1 到 0.1 的比例）。根据事件更新阵营实力、凝聚力；出现新运动或组织时创建新阵营，并使人物归属正确。没有充分因果理由时，newFactions 和 newCharacters 返回空数组；人物没有转投阵营时 factionName 返回 null。人物与阵营的变化要有因果逻辑，事件之间有连续性。人口降至 50 后仍可因正向增长重新上升。`
}

function delta(value, limit) {
  const number = Number(value)
  return Number.isFinite(number) ? clamp(number, -limit, limit) : 0
}

function applyEvent(s, evt) {
  if (!evt || typeof evt !== 'object') return
  const imp = evt.impact || {}
  s.economy = clamp(s.economy + delta(imp.economy, 15), 5, 100)
  s.stability = clamp(s.stability + delta(imp.stability, 15), 2, 100)
  s.culture = clamp(s.culture + delta(imp.culture, 15), 5, 100)
  s.happiness = clamp(s.happiness + delta(imp.happiness, 15), 0, 100)
  s.inequality = clamp(s.inequality + delta(imp.inequality, 15), 5, 95)
  s.population = Math.max(50, s.population * (1 + delta(imp.population, 0.1)))
  if (typeof evt.text === 'string' && evt.text.trim()) addEvent(evt.text, evt.type || 'info')
}

function ensureFaction(name, culture = '') {
  if (typeof name !== 'string' || !name.trim()) return null
  const cleanName = name.trim()
  let faction = store.factions.find(f => f.name === cleanName)
  if (!faction) {
    faction = { id: genId(), name: cleanName, culture: String(culture || '新兴社会组织'), power: 35, cohesion: 55 }
    store.factions.push(faction)
    addEvent(`新阵营「${cleanName}」形成`, 'info')
  }
  return faction
}

function applyNewFactions(items) {
  for (const raw of (Array.isArray(items) ? items : []).slice(0, 3)) {
    if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) continue
    const existing = store.factions.find(f => f.name === raw.name.trim())
    const faction = ensureFaction(raw.name, raw.culture)
    if (!existing && faction) {
      faction.power = Number.isFinite(Number(raw.power)) ? clamp(Number(raw.power)) : 35
      faction.cohesion = Number.isFinite(Number(raw.cohesion)) ? clamp(Number(raw.cohesion)) : 55
    }
  }
}

function applyFactionChanges(items) {
  for (const change of (Array.isArray(items) ? items : []).slice(0, 10)) {
    const faction = store.factions.find(f => f.name === change?.name)
    if (!faction) continue
    faction.power = clamp(round1(faction.power + delta(change.powerDelta, 15)))
    faction.cohesion = clamp(round1(faction.cohesion + delta(change.cohesionDelta, 15)))
    if (typeof change.culture === 'string' && change.culture.trim()) faction.culture = change.culture.trim()
  }
}

function createCharacter(raw, turningPoint = null) {
  if (!raw || typeof raw !== 'object') return null
  let name = typeof raw.name === 'string' ? raw.name.trim() : ''
  if (!name && turningPoint) name = `${turningPoint === 'hero' ? '重建者' : '变革者'}·${store.society.year}`
  if (!name) return null
  if (store.characters.some(c => c.name === name)) {
    if (!turningPoint) return null
    name = `${name}·${store.society.year}`
  }
  const fallbackFaction = turningPoint
    ? `${turningPoint === 'hero' ? '复兴联盟' : '新秩序派'}·${store.society.year}`
    : ''
  const faction = ensureFaction(raw.factionName || fallbackFaction, raw.bio)
  const defaults = turningPoint === 'hero'
    ? { ambition: 75, kindness: 80, radicalism: 35, wealth: 35, influence: 65, happiness: 55 }
    : { ambition: 85, kindness: 25, radicalism: 80, wealth: 60, influence: 65, happiness: 60 }
  const value = (key, fallback) => Number.isFinite(Number(raw[key])) ? clamp(Number(raw[key])) : fallback
  const c = {
    id: genId(), name, factionId: faction?.id ?? null,
    bio: typeof raw.bio === 'string' && raw.bio.trim() ? raw.bio.trim() :
      (turningPoint === 'hero' ? '在社会危机中崭露头角的组织者' : '在繁荣年代崛起的秩序挑战者'),
    ambition: value('ambition', defaults.ambition),
    kindness: value('kindness', defaults.kindness),
    radicalism: value('radicalism', defaults.radicalism),
    wealth: value('wealth', defaults.wealth),
    influence: value('influence', defaults.influence),
    happiness: value('happiness', defaults.happiness),
    alive: true
  }
  if (turningPoint) {
    c.turningPoint = turningPoint
    c.emergenceYear = store.society.year
  }
  store.characters.push(c)
  return c
}

function applyTurningPoint(s, raw, kind) {
  const c = createCharacter(raw || {}, kind)
  if (!c) return
  const fallback = kind === 'hero'
    ? { text: `${c.name}带领${store.factions.find(f => f.id === c.factionId)?.name || '居民'}整合资源、推动改革，社会开始走出低谷`, type: 'good', impact: { economy: 5, stability: 10, happiness: 10, inequality: -3, population: 0.1 } }
    : { text: `${c.name}集结支持者挑战现有秩序，社会矛盾迅速激化`, type: 'bad', impact: { stability: -10, happiness: -6, inequality: 4 } }
  const event = raw?.event && typeof raw.event.text === 'string' ? raw.event : fallback
  applyEvent(s, { ...event, text: event.text.includes(c.name) ? event.text : `${c.name}：${event.text}` })
}

export async function runLlmTurn() {
  const s = store.society
  const { baseUrl, apiKey, model } = store.llm
  if (!apiKey) throw new Error('请先在「设置」中填写 API Key')

  store.llmBusy = true
  try {
    const turningPoint = drawTurningPoint(s, s.history, store.characters, rand01)
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
          { role: 'user', content: buildPrompt(turningPoint) }
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
    for (const evt of (Array.isArray(result.events) ? result.events : [])) {
      applyEvent(s, evt)
    }
    if (result.summary) addEvent(`【年度总结】${result.summary}`, 'summary')

    applyNewFactions(result.newFactions)
    applyFactionChanges(result.factionChanges)
    let newCharacterCount = 0
    for (const raw of (Array.isArray(result.newCharacters) ? result.newCharacters : []).slice(0, 3)) {
      const c = createCharacter(raw)
      if (c) {
        newCharacterCount++
        addEvent(`新人物${c.name}加入${store.factions.find(f => f.id === c.factionId)?.name || '社会'}`, 'character')
      }
    }

    // 应用人物变化
    for (const ch of (Array.isArray(result.characterChanges) ? result.characterChanges : [])) {
      const c = store.characters.find(x => x.name === ch.name && x.alive)
      if (!c) continue
      c.wealth = clamp(c.wealth + delta(ch.wealth, 15))
      c.influence = clamp(c.influence + delta(ch.influence, 15))
      c.happiness = clamp(c.happiness + delta(ch.happiness, 15))
      if (ch.factionName) c.factionId = ensureFaction(ch.factionName)?.id ?? c.factionId
      if (ch.note) addEvent(`${c.name}：${ch.note}`, 'character')
    }

    if (turningPoint) applyTurningPoint(s, result.turningPoint, turningPoint)
    else if (!newCharacterCount) maybeSpawnRuleNewcomer(s, rand01)
    evolveFactions(s)

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
