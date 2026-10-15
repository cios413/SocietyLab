import assert from 'node:assert/strict'
import test from 'node:test'
import { turningPointChance, drawTurningPoint } from '../src/engine/turningPoint.js'
import { store, setRng, genId, initSociety } from '../src/store.js'
import { runLlmTurn } from '../src/engine/llmEngine.js'
import { runRuleTurn } from '../src/engine/ruleEngine.js'

const declineHistory = [
  { year: 8, population: 500, economy: 48, stability: 45, happiness: 42 },
  { year: 9, population: 300, economy: 35, stability: 30, happiness: 25 },
  { year: 10, population: 50, economy: 20, stability: 2, happiness: 0 }
]
const prosperityHistory = [
  { year: 8, population: 1100, economy: 75, stability: 75, happiness: 75 },
  { year: 9, population: 1150, economy: 80, stability: 80, happiness: 80 },
  { year: 10, population: 1200, economy: 85, stability: 85, happiness: 85 }
]

test('衰退越严重，复兴人物出现概率越高', () => {
  const mild = turningPointChance({ year: 10, population: 450, economy: 42, stability: 40, happiness: 38 }, declineHistory)
  const severe = turningPointChance({ year: 10, population: 50, economy: 20, stability: 2, happiness: 0 }, declineHistory)
  assert.equal(mild.kind, 'hero')
  assert.equal(severe.kind, 'hero')
  assert.ok(severe.probability > mild.probability)
  assert.equal(drawTurningPoint({ year: 10, population: 50, economy: 20, stability: 2, happiness: 0 }, declineHistory, [], () => 0.99), null)
})

test('连续繁荣才可能产生动荡人物，近期已有关键人物则暂缓', () => {
  const prosperous = { year: 10, population: 1200, economy: 90, stability: 90, happiness: 90 }
  assert.equal(turningPointChance(prosperous, prosperityHistory).kind, 'disruptor')
  assert.equal(turningPointChance(prosperous, prosperityHistory, [{ turningPoint: 'hero', emergenceYear: 9 }]).probability, 0)
  assert.equal(turningPointChance({ ...prosperous, happiness: 50 }, prosperityHistory).kind, null)
})

async function runMockTurn(society, response) {
  const originalFetch = globalThis.fetch
  store.society = society
  store.factions = [{ id: 150, name: '旧议会', culture: '秩序', power: 50, cohesion: 50 }]
  store.characters = [{ id: 151, name: '旧居民', factionId: 150, bio: '', ambition: 50, kindness: 50, radicalism: 50, wealth: 50, influence: 50, happiness: 50, alive: true }]
  store.llm.apiKey = 'test-key'
  let prompt = ''
  globalThis.fetch = async (_url, options) => {
    prompt = JSON.parse(options.body).messages[1].content
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify(response) } }] }) }
  }
  setRng(() => 0)
  try {
    await runLlmTurn()
    return prompt
  } finally {
    globalThis.fetch = originalFetch
    setRng(null)
    store.llm.apiKey = ''
  }
}

test('衰退回合创建伟人、新阵营，并把行动影响写入年度状态', async () => {
  const prompt = await runMockTurn({
    turn: 9, year: 10, population: 50, economy: 20, stability: 2,
    culture: 30, happiness: 0, inequality: 80, history: declineHistory, events: []
  }, {
    summary: '改革开始', events: [{ text: '粮仓仍然紧张', type: 'bad', impact: {} }],
    newFactions: [{ name: '新生联盟', culture: '协作', power: 40, cohesion: 70 }],
    factionChanges: [{ name: '旧议会', powerDelta: -5, cohesionDelta: -4 }],
    newCharacters: [], characterChanges: [],
    turningPoint: {
      name: '江澈', factionName: '新生联盟', bio: '组织改革的医生',
      ambition: 70, kindness: 90, radicalism: 30, influence: 65,
      event: { text: '江澈组织粮食改革', type: 'good', impact: { stability: 10, happiness: 10, population: 0.1 } }
    }
  })
  const figure = store.characters.find(c => c.name === '江澈')
  assert.match(prompt, /一位带领社会走出衰退的关键人物出现/)
  assert.equal(figure.turningPoint, 'hero')
  assert.equal(figure.factionId, store.factions.find(f => f.name === '新生联盟').id)
  assert.ok(store.factions.find(f => f.name === '旧议会').power < 50)
  assert.ok(store.society.events.some(e => e.text.includes('江澈组织粮食改革')))
  assert.ok(store.society.population > 50)
  assert.ok(store.society.happiness > 0)
  assert.ok(genId() > figure.id)
})

test('繁荣回合可出现搅局者；模型遗漏人物时仍能落地到人物与阵营', async () => {
  const prompt = await runMockTurn({
    turn: 9, year: 10, population: 1200, economy: 90, stability: 90,
    culture: 80, happiness: 90, inequality: 20, history: prosperityHistory, events: []
  }, { summary: '表面平静', events: [], newFactions: [], factionChanges: [], newCharacters: [], characterChanges: [], turningPoint: null })
  const figure = store.characters.find(c => c.turningPoint === 'disruptor')
  assert.match(prompt, /长期繁荣催生一位挑战现有秩序的关键人物/)
  assert.ok(figure)
  assert.ok(store.factions.some(f => f.id === figure.factionId))
  assert.ok(store.society.events.some(e => e.text.includes(figure.name)))
  assert.ok(store.society.stability < 90)
})

test('普通事件也能催生新阵营、人物，并改变既有人物的归属', async () => {
  await runMockTurn({
    turn: 4, year: 5, population: 900, economy: 55, stability: 55,
    culture: 55, happiness: 55, inequality: 35,
    history: [{ year: 3, population: 900, economy: 55, stability: 55, happiness: 55 }], events: []
  }, {
    summary: '商路开通', events: [{ text: '新商路带来机会', type: 'good', impact: { economy: 5 } }],
    newFactions: [{ name: '商路协会', culture: '互通贸易', power: 25, cohesion: 60 }],
    factionChanges: [{ name: '旧议会', powerDelta: -3, cohesionDelta: 2 }],
    newCharacters: [{ name: '叶宁', factionName: '商路协会', bio: '商队领袖', ambition: 65 }],
    characterChanges: [{ name: '旧居民', factionName: '商路协会', influence: 4, note: '加入商会' }],
    turningPoint: null
  })
  const faction = store.factions.find(f => f.name === '商路协会')
  assert.ok(faction)
  assert.equal(store.characters.find(c => c.name === '叶宁').factionId, faction.id)
  assert.equal(store.characters.find(c => c.name === '旧居民').factionId, faction.id)
  assert.equal(store.characters.some(c => c.turningPoint), false)
  assert.ok(store.factions.find(f => f.name === '旧议会').power < 50)
})

test('大模型没有新增普通人物时，也保留按年份出现新人物的机会', async () => {
  await runMockTurn({
    turn: 7, year: 8, population: 900, economy: 55, stability: 55,
    culture: 55, happiness: 55, inequality: 35,
    history: [{ year: 8, population: 900, economy: 55, stability: 55, happiness: 55 }], events: []
  }, { summary: '平稳一年', events: [], newFactions: [], factionChanges: [], newCharacters: [], characterChanges: [], turningPoint: null })
  assert.ok(store.characters.some(c => c.emergenceYear === 9 && !c.turningPoint))
})

function resetRuleWorld() {
  store.world = {
    name: '测试社会', description: '', resourceAbundance: 60, techLevel: 35,
    culturalOpenness: 50, governance: '共和制', envPressure: 30
  }
  store.factions = [{ id: 1, name: '旧议会', culture: '秩序', power: 50, cohesion: 50 }]
  store.characters = [{
    id: 2, name: '旧居民', factionId: 1, bio: '', ambition: 50, kindness: 50,
    radicalism: 30, wealth: 50, influence: 50, happiness: 55, alive: true
  }]
  initSociety()
  setRng(() => 0)
  return store.society
}

test('规则引擎在严重低谷生成伟人，并同步人物、阵营和指标', () => {
  try {
    const s = resetRuleWorld()
    s.year = 10; s.turn = 9
    s.population = 50; s.economy = 12; s.stability = 2; s.happiness = 0
    s.history = structuredClone(declineHistory)
    runRuleTurn()
    const hero = store.characters.find(c => c.turningPoint === 'hero')
    assert.ok(hero)
    assert.ok(store.factions.some(f => f.id === hero.factionId))
    assert.ok(s.events.some(e => e.text.includes(hero.name)))
    assert.ok(s.population > 50)
  } finally {
    setRng(null)
  }
})

test('规则引擎在持续繁荣时生成搅局者', () => {
  try {
    const s = resetRuleWorld()
    s.year = 10; s.turn = 9
    s.population = 1200; s.economy = 90; s.stability = 90
    s.happiness = 90; s.culture = 85; s.inequality = 20
    store.characters[0].happiness = 90
    s.history = structuredClone(prosperityHistory)
    runRuleTurn()
    const disruptor = store.characters.find(c => c.turningPoint === 'disruptor')
    assert.ok(disruptor)
    assert.ok(s.events.some(e => e.text.includes(disruptor.name)))
  } finally {
    setRng(null)
  }
})

test('规则引擎在普通年份也会出现新人物，阵营实力随年份变化', () => {
  try {
    const s = resetRuleWorld()
    s.year = 8; s.turn = 7
    const oldPower = store.factions[0].power
    runRuleTurn()
    assert.ok(store.characters.some(c => c.emergenceYear === s.year && !c.turningPoint))
    assert.notEqual(store.factions[0].power, oldPower)
  } finally {
    setRng(null)
  }
})
