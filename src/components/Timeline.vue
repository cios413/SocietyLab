<template>
  <div class="layout">
    <div>
      <div class="card controls">
        <div class="control-row no-print">
          <button class="primary" :disabled="store.llmBusy" @click="step(1)">
            {{ store.llmBusy ? '推演中...' : '▶ 推演 1 年' }}
          </button>
          <button :disabled="store.llmBusy" @click="step(10)">推演 10 年</button>
          <button v-if="!autoRunning" :disabled="store.llmBusy" @click="autoRun">自动推演</button>
          <template v-else>
            <button @click="togglePause">{{ paused ? '▶ 继续' : '⏸ 暂停' }}</button>
            <button class="danger" @click="stopAuto">停止</button>
          </template>
          <button class="danger" @click="onReset">重置</button>
          <ExportButton />
        </div>
        <p class="engine-note">
          当前引擎：<strong>{{ store.engine === 'llm' ? '大模型（' + store.llm.model + '）' : '规则引擎（离线）' }}</strong>
          <span v-if="autoRunning && paused" class="warn"> · 已暂停</span>
          <span v-if="store.engine === 'llm' && !store.llm.apiKey" class="warn"> · 未配置 API Key，请点右上角「模型设置」</span>
        </p>
      </div>

      <div class="card" style="margin-top: 14px;">
        <h2>事件编年史</h2>
        <div class="event-list">
          <div v-for="(e, i) in store.society.events" :key="i" class="event" :class="e.type">
            <span class="year">第 {{ e.year }} 年</span>
            <span class="dot"></span>
            <p>{{ e.text }}</p>
          </div>
        </div>
      </div>
    </div>

    <div class="side">
      <div class="card stat-card" v-for="m in metricCards" :key="m.label">
        <div class="stat-label">{{ m.label }}</div>
        <div class="stat-value" :style="{ color: m.color }">{{ m.value }}</div>
        <div class="stat-bar"><div :style="{ width: m.pct + '%', background: m.color }"></div></div>
      </div>
      <div class="card stat-card">
        <div class="stat-label">人口</div>
        <div class="stat-value">{{ Math.round(store.society.population).toLocaleString() }}</div>
        <div class="stat-label dim-small">不平等程度 {{ Math.round(store.society.inequality) }}</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, onUnmounted } from 'vue'
import { store, resetSimulation } from '../store'
import { runRuleTurn } from '../engine/ruleEngine'
import { runLlmTurn } from '../engine/llmEngine'
import ExportButton from './ExportButton.vue'

let autoTimer = null
const autoRunning = ref(false)
const paused = ref(false)

const metricCards = computed(() => {
  const s = store.society
  return [
    { label: '居民幸福指数', value: Math.round(s.happiness), pct: s.happiness, color: 'var(--good)' },
    { label: '经济', value: Math.round(s.economy), pct: s.economy, color: '#f0b429' },
    { label: '稳定度', value: Math.round(s.stability), pct: s.stability, color: s.stability < 30 ? 'var(--crisis)' : 'var(--accent)' },
    { label: '文化', value: Math.round(s.culture), pct: s.culture, color: '#b47aff' }
  ]
})

async function runOne() {
  if (store.engine === 'llm') await runLlmTurn()
  else runRuleTurn()
}

async function step(n) {
  if (store.engine === 'llm') {
    for (let i = 0; i < n; i++) await runOne() // LLM 串行，避免并发写状态
  } else {
    for (let i = 0; i < n; i++) runRuleTurn()
  }
}

function autoRun() {
  paused.value = false
  autoRunning.value = true
  const interval = store.engine === 'llm' ? 2500 : 600
  autoTimer = setInterval(async () => {
    if (paused.value || store.llmBusy) return
    await runOne()
  }, interval)
}

function togglePause() {
  paused.value = !paused.value
}

function stopAuto() {
  clearInterval(autoTimer)
  autoTimer = null
  autoRunning.value = false
  paused.value = false
}

function onReset() {
  stopAuto()
  resetSimulation()
}

onUnmounted(stopAuto)
</script>

<style scoped>
.layout { display: grid; grid-template-columns: 1fr 240px; gap: 14px; }
@media (max-width: 900px) { .layout { grid-template-columns: 1fr; } }
.control-row { display: flex; gap: 10px; flex-wrap: wrap; }
.engine-note { font-size: 13px; color: var(--text-dim); margin: 10px 0 0; }
.warn { color: var(--bad); }
h2 { margin: 0 0 12px; font-size: 16px; }
.event-list { max-height: 520px; overflow-y: auto; }
.event { display: flex; gap: 10px; align-items: baseline; padding: 8px 0; border-top: 1px solid var(--border); }
.event .year { flex-shrink: 0; font-size: 12px; color: var(--text-dim); min-width: 58px; }
.event .dot { flex-shrink: 0; width: 8px; height: 8px; border-radius: 50%; background: var(--text-dim); }
.event.good .dot { background: var(--good); }
.event.bad .dot { background: var(--bad); }
.event.crisis .dot { background: var(--crisis); }
.event.summary .dot { background: var(--accent); }
.event.character .dot { background: #b47aff; }
.event p { margin: 0; font-size: 14px; line-height: 1.5; }
.event.crisis p { color: #ffb3c4; }
.event.summary p { color: var(--accent); }
.side { display: flex; flex-direction: column; gap: 12px; }
.stat-card { padding: 14px; }
.stat-label { font-size: 13px; color: var(--text-dim); }
.stat-value { font-size: 26px; font-weight: 700; margin: 4px 0 8px; font-variant-numeric: tabular-nums; }
.dim-small { font-size: 12px; margin-top: 6px; }
</style>
