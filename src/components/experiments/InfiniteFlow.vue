<template>
  <div>
    <div class="grid2">
      <div class="card">
        <div class="card-head">
          <h2>无限流生存游戏</h2>
          <ExportButton />
        </div>
        <p class="dim intro">
          每名玩家随机生成一种<strong>性格</strong>（冷血谋士、笑面虎、圣母、独狼……），
          性格直接决定其在背叛之夜的袭击目标、多数决中的投票策略。活到最后的人，往往不是因为最强，而是因为最懂人心。
        </p>
        <div class="field no-print">
          <label>玩家数量</label>
          <div class="range-row">
            <input type="range" min="6" max="24" v-model.number="playerCount" />
            <span class="range-val">{{ playerCount }}</span>
          </div>
        </div>
        <div class="btn-row no-print">
          <button class="primary" @click="start(false)">⚡ 一键推演到底</button>
          <button @click="start(true)">▶ 逐轮播放</button>
          <template v-if="playing">
            <button @click="paused = !paused">{{ paused ? '▶ 继续' : '⏸ 暂停' }}</button>
            <button class="danger" @click="stopPlay">停止</button>
          </template>
        </div>

        <div v-if="result && result.winner" class="winner-box" :class="{ revealed: finished }">
          <template v-if="finished">
            <h3>🏆 最终幸存者：{{ result.winner.name }}（{{ result.winner.personality.name }}）</h3>
            <p class="dim2">{{ result.winner.personality.desc }}</p>
            <p class="dim2">
              体 {{ result.winner.body }} · 智 {{ result.winner.int }} · 冷 {{ result.winner.calm }} ·
              运 {{ result.winner.luck }} · 善 {{ result.winner.moral }}
              <template v-if="result.winner.kills > 0"> · 击杀 {{ result.winner.kills }} 人</template>
            </p>
          </template>
          <p v-else class="dim2">推演进行中……</p>
        </div>

        <div v-if="result" class="players-grid">
          <div v-for="p in result.players" :key="p.id" class="player-chip" :class="{ dead: !p.alive && isRevealed(p) }">
            <strong>{{ p.name }} <span class="p-tag">{{ p.personality.name }}</span></strong>
            <span class="dim2">{{ p.personality.desc }}</span>
            <span v-if="isRevealed(p) && !p.alive" class="death-note">第{{ p.deathRound }}轮 · {{ p.deathCause }}</span>
            <span v-else class="dim2">体{{ p.body }} 智{{ p.int }} 冷{{ p.calm }} 运{{ p.luck }} 善{{ p.moral }}</span>
          </div>
        </div>
      </div>

      <div class="card">
        <h2>副本推进记录</h2>
        <div class="rounds-log">
          <div v-for="r in visibleRounds" :key="r.round" class="round-block">
            <h3>第 {{ r.round }} 轮 · {{ r.name }} <span class="tag">存活 {{ r.aliveAfter }} 人</span></h3>
            <!-- 故事 -->
            <p class="story">{{ aiStories[r.round]?.story || r.story }}</p>
            <!-- AI 续写 -->
            <div class="ai-row no-print">
              <button class="ai-btn" :disabled="aiLoading[r.round]" @click="narrate(r)">
                {{ aiLoading[r.round] ? '生成中...' : aiStories[r.round] ? '↻ 重新 AI 续写' : '✨ AI 续写本轮' }}
              </button>
              <span v-if="store.engine !== 'llm'" class="dim2">（需切换到大模型引擎并配置 API Key）</span>
            </div>
            <!-- 思考过程 -->
            <details v-if="aiStories[r.round]?.thinking" class="thinking">
              <summary>🧠 大模型思考过程</summary>
              <p>{{ aiStories[r.round].thinking }}</p>
            </details>
            <p v-if="aiStories[r.round] && !aiStories[r.round].thinking" class="dim2 no-print">该模型未返回思考过程</p>

            <ul>
              <li v-for="(d, i) in r.deaths" :key="i" class="death-line">☠ {{ d.name }} —— {{ d.cause }}</li>
            </ul>
            <!-- 属性检定明细 -->
            <table v-if="r.checks && r.checks.length" class="checks-table">
              <thead>
                <tr><th>玩家</th><th>性格</th><th>基础值</th><th>发挥</th><th>检定值</th><th>及格线</th><th>结果</th></tr>
              </thead>
              <tbody>
                <tr v-for="(c, i) in r.checks" :key="i" :class="{ fail: !c.survived }">
                  <td>{{ c.name }}</td>
                  <td>{{ c.personality }}</td>
                  <td class="num">{{ c.base }}</td>
                  <td class="num">+{{ c.roll }}</td>
                  <td class="num"><strong>{{ c.score }}</strong></td>
                  <td class="num">{{ c.lethal }}</td>
                  <td><span class="res" :class="c.survived ? 'pass' : 'die'">{{ c.survived ? '存活' : '死亡' }}</span></td>
                </tr>
              </tbody>
            </table>
            <!-- 决策明细（背叛/投票轮） -->
            <ul v-if="r.actions && r.actions.length" class="action-list">
              <li v-for="(a, i) in r.actions" :key="i">· {{ a }}</li>
            </ul>
          </div>
          <p v-if="!result" class="dim2">点击左侧按钮开始推演，副本将随机抽取、逐轮淘汰。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onUnmounted } from 'vue'
import { simulateInfiniteFlow } from '../../experiments/infiniteFlow'
import { narrateRound } from '../../engine/narrator'
import { store } from '../../store'
import ExportButton from '../ExportButton.vue'

const playerCount = ref(12)
const result = ref(null)
const displayCount = ref(0)
const playing = ref(false)
const paused = ref(false)
const aiStories = ref({})
const aiLoading = ref({})
let timer = null

const visibleRounds = computed(() => result.value ? result.value.rounds.slice(0, displayCount.value) : [])
const finished = computed(() => result.value && displayCount.value >= result.value.rounds.length)

function isRevealed(p) {
  if (!result.value) return false
  if (p.alive) return displayCount.value > 0
  return displayCount.value >= p.deathRound
}

function start(play) {
  stopPlay()
  aiStories.value = {}
  result.value = simulateInfiniteFlow(playerCount.value)
  if (play) {
    displayCount.value = 0
    playing.value = true
    paused.value = false
    timer = setInterval(() => {
      if (displayCount.value >= result.value.rounds.length) { stopPlay(); return }
      if (!paused.value) displayCount.value++
    }, 1200)
  } else {
    displayCount.value = result.value.rounds.length
  }
}

function stopPlay() {
  clearInterval(timer)
  timer = null
  playing.value = false
  paused.value = false
}

async function narrate(round) {
  if (store.engine !== 'llm') { alert('请先在顶部切换到大模型引擎并在「模型设置」中配置 API Key'); return }
  aiLoading.value = { ...aiLoading.value, [round.round]: true }
  try {
    const r = await narrateRound(round, result.value.players)
    aiStories.value = { ...aiStories.value, [round.round]: r }
  } catch (e) {
    alert('AI 续写失败：' + e.message)
  } finally {
    aiLoading.value = { ...aiLoading.value, [round.round]: false }
  }
}

onUnmounted(stopPlay)
</script>

<style scoped>
h2 { margin: 0; font-size: 16px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.intro { font-size: 13px; line-height: 1.6; }
.dim { color: var(--text-dim); }
.dim2 { color: var(--text-dim); font-size: 12px; }
.btn-row { display: flex; gap: 10px; flex-wrap: wrap; }
.winner-box { margin-top: 14px; background: var(--panel-2); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; }
.winner-box.revealed { border-color: #f0b429; }
.players-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 8px; margin-top: 14px; }
.player-chip { background: var(--panel-2); border: 1px solid var(--good); border-radius: 8px; padding: 8px 10px; font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.player-chip.dead { border-color: var(--crisis); opacity: .65; }
.p-tag { font-size: 11px; color: #b47aff; font-weight: normal; }
.death-note { color: var(--crisis); font-size: 11px; line-height: 1.4; }
.rounds-log { max-height: 620px; overflow-y: auto; }
.round-block { border-top: 1px solid var(--border); padding: 12px 0; }
.round-block ul { margin: 8px 0 0; padding-left: 4px; list-style: none; }
.story { font-size: 13px; line-height: 1.8; color: var(--text); background: var(--panel-2); border-left: 3px solid var(--accent); border-radius: 0 8px 8px 0; padding: 10px 12px; margin: 8px 0; }
.ai-row { display: flex; align-items: center; gap: 8px; margin: 6px 0; }
.ai-btn { padding: 3px 10px; font-size: 12px; border-color: #b47aff; color: #b47aff; }
.thinking { background: var(--bg); border: 1px dashed var(--border); border-radius: 8px; padding: 8px 12px; margin: 6px 0; }
.thinking summary { cursor: pointer; font-size: 12px; color: var(--accent); }
.thinking p { font-size: 12px; color: var(--text-dim); line-height: 1.7; white-space: pre-wrap; }
.death-line { color: #ffb3c4; font-size: 13px; padding: 2px 0; }
.checks-table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
.checks-table th { color: var(--text-dim); font-weight: normal; padding: 4px; border-bottom: 1px solid var(--border); text-align: center; }
.checks-table td { text-align: center; padding: 4px; border-bottom: 1px solid var(--border); }
.checks-table .num { font-variant-numeric: tabular-nums; }
.checks-table tr.fail { background: rgba(239, 71, 111, .07); }
.res { display: inline-block; padding: 1px 8px; border-radius: 5px; font-size: 11px; font-weight: 700; }
.res.pass { background: rgba(62, 207, 142, .15); color: var(--good); }
.res.die { background: rgba(239, 71, 111, .15); color: var(--crisis); }
.action-list li { color: var(--text-dim); font-size: 12px; padding: 1px 0; }
</style>
