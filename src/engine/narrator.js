import { store } from '../store.js'

/**
 * LLM 叙述模块：把一轮无限流副本的事件交给大模型续写成小说段落。
 * 若模型返回 reasoning_content（如 deepseek-reasoner），一并返回思考过程。
 */
export async function narrateRound(round, players) {
  const { baseUrl, apiKey, model } = store.llm
  if (!apiKey) throw new Error('未配置 API Key')

  const cast = players.map(p =>
    `${p.name}(${p.personality.name}：${p.personality.desc})${p.alive ? '' : '（已死亡）'}`
  ).join('；')
  const events = [
    ...round.actions,
    ...round.deaths.map(d => `${d.name} ${d.cause}`),
    ...round.notes
  ].join('；') || '全员平安通过'

  const resp = await fetch(`${baseUrl.replace(/\/$/, '')}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: '你是无限流小说写手，用紧张凝练的中文把游戏回合改写成 150 字以内的小说段落，突出人物性格驱动的抉择。只输出小说正文。' },
        { role: 'user', content: `副本「${round.name}」：${round.desc}\n出场人物：${cast}\n本轮事件：${events}\n存活人数：${round.aliveAfter}` }
      ],
      temperature: 1.1
    })
  })
  if (!resp.ok) throw new Error(`API 请求失败: ${resp.status}`)
  const data = await resp.json()
  const msg = data.choices?.[0]?.message || {}
  return {
    story: msg.content || '',
    thinking: msg.reasoning_content || null // 部分推理模型会返回思考过程
  }
}
