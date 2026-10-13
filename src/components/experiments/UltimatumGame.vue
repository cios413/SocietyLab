<template>
  <div>
    <div class="grid2">
      <div class="card">
        <h2>最后通牒博弈</h2>
        <p class="dim intro">
          提议者从 100 金币中提出分给响应者 x：响应者接受就按提议分，拒绝则双方一分不得。
          纯理性预测是「提议 1 金币且必然被接受」，验证问题：<strong>公平感如何碾压纯理性？</strong>
        </p>
        <div class="field">
          <label>提议者 / 响应者人数</label>
          <div class="range-row"><input type="range" min="10" max="100" step="10" v-model.number="people" /><span class="range-val">{{ people }}</span></div>
        </div>
        <div class="field">
          <label>演化回合数</label>
          <div class="range-row"><input type="range" min="10" max="200" step="10" v-model.number="rounds" /><span class="range-val">{{ rounds }}</span></div>
        </div>
        <div class="field">
          <label>提议者是否根据拒绝经验调整报价</label>
          <div class="range-row">
            <button :class="{ primary: learning }" @click="learning = true">允许学习</button>
            <button :class="{ primary: !learning }" @click="learning = false">不学习</button>
          </div>
        </div>
        <button class="primary" @click="run">运行模拟</button>

        <div v-if="result" class="result-box">
          <div class="result-grid">
            <div><span class="dim2">最终平均提议</span><strong style="color: var(--accent)">{{ result.finalAvgOffer }}</strong></div>
            <div><span class="dim2">最终接受率</span><strong style="color: var(--good)">{{ result.finalAcceptRate }}%</strong></div>
            <div><span class="dim2">总拒绝次数</span><strong style="color: var(--crisis)">{{ result.totalRejections }}</strong></div>
            <div><span class="dim2">响应者平均底线</span><strong style="color: var(--bad)">{{ result.avgThreshold }}</strong></div>
          </div>
        </div>
        <div v-if="result" class="conclusion">
          <h3>结论</h3>
          <p>{{ conclusion }}</p>
        </div>
      </div>

      <div class="card">
        <h2>报价与接受率演化</h2>
        <div ref="chartEl" class="chart"></div>
      </div>
    </div>

    <div v-if="result" class="card detail-card">
      <h2>逐回合推演明细（点击回合行展开全部交易）</h2>
      <div class="turns-wrap">
        <table class="turns-table">
          <thead>
            <tr><th>回合</th><th>平均提议</th><th>接受率</th><th>交易数</th></tr>
          </thead>
          <tbody>
            <template v-for="h in result.history" :key="h.round">
              <tr class="round-row" @click="toggleRound(h.round)">
                <td>{{ h.round }} <span class="dim2">{{ expandedRound === h.round ? '▲' : '▼' }}</span></td>
                <td class="num">{{ h.avgOffer }}</td>
                <td class="num" :style="{ color: h.acceptRate > 70 ? 'var(--good)' : h.acceptRate > 40 ? 'var(--bad)' : 'var(--crisis)' }">{{ h.acceptRate }}%</td>
                <td class="num">{{ h.deals.length }}</td>
              </tr>
              <tr v-if="expandedRound === h.round" class="deals-row">
                <td colspan="4">
                  <div class="deals-grid">
                    <span v-for="(e, i) in h.deals" :key="i" class="deal" :class="{ rej: !e.accepted }">
                      提议者{{ e.proposer + 1 }}→响应者{{ e.responder + 1 }}：出 {{ e.offer }} / 底线 {{ e.threshold }} {{ e.accepted ? '✓' : '✗' }}
                    </span>
                  </div>
                </td>
              </tr>
            </template>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { simulateUltimatum } from '../../experiments/ultimatum'

const people = ref(40)
const rounds = ref(60)
const learning = ref(true)
const result = ref(null)
const chartEl = ref(null)
const expandedRound = ref(null)
let chart = null

function toggleRound(r) {
  expandedRound.value = expandedRound.value === r ? null : r
}

const conclusion = computed(() => {
  const r = result.value
  if (!r) return ''
  if (!learning.value) {
    return `不允许学习时，平均提议停留在 ${r.finalAvgOffer}，接受率 ${r.finalAcceptRate}%——大量提议撞上响应者的公平底线（平均 ${r.avgThreshold}），${r.totalRejections} 次交易双输。开启「允许学习」再跑一次，观察报价如何被惩罚拉回公平区间。`
  }
  return `经过 ${rounds.value} 轮演化，平均提议收敛到 ${r.finalAvgOffer}——远高于纯理性预测的 1。因为低于底线的报价会被拒绝（共 ${r.totalRejections} 次双输），提议者被迫学会「公平」。这正是行为博弈论的核心发现：对公平的偏好本身就是一种演化稳定策略。`
})

function run() {
  result.value = simulateUltimatum({ proposers: people.value, responders: people.value, rounds: rounds.value, learning: learning.value })
  renderChart()
}

function renderChart() {
  if (!chart || !result.value) return
  const h = result.value.history
  chart.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#93a0bd' }, top: 0 },
    grid: { left: 45, right: 45, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: h.map(p => p.round), axisLine: { lineStyle: { color: '#2e3a55' } } },
    yAxis: [
      { type: 'value', name: '平均提议', max: 100, splitLine: { lineStyle: { color: '#222c42' } } },
      { type: 'value', name: '接受率%', max: 100, splitLine: { show: false } }
    ],
    series: [
      { name: '平均提议', type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, data: h.map(p => p.avgOffer), itemStyle: { color: '#5b8cff' }, lineStyle: { width: 2.5 } },
      { name: '接受率', type: 'line', smooth: true, yAxisIndex: 1, data: h.map(p => p.acceptRate), itemStyle: { color: '#3ecf8e' }, lineStyle: { width: 2.5, type: 'dashed' } }
    ]
  }, true)
}

onMounted(() => {
  chart = echarts.init(chartEl.value)
  run()
  window.addEventListener('resize', resize)
})
function resize() { chart?.resize() }
onUnmounted(() => { window.removeEventListener('resize', resize); chart?.dispose() })
</script>

<style scoped>
h2 { margin: 0 0 10px; font-size: 16px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.intro { font-size: 13px; line-height: 1.6; }
.dim { color: var(--text-dim); }
.dim2 { color: var(--text-dim); font-size: 12px; display: block; }
.chart { width: 100%; height: 340px; }
.result-box { margin-top: 16px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.result-grid strong { font-size: 20px; display: block; margin-top: 2px; }
.conclusion { margin-top: 12px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.conclusion p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.range-row button { flex: 1; }
.detail-card { margin-top: 14px; }
.turns-wrap { max-height: 360px; overflow-y: auto; }
.turns-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.turns-table th { position: sticky; top: 0; background: var(--panel); color: var(--text-dim); font-weight: normal; padding: 6px; border-bottom: 1px solid var(--border); }
.turns-table td { padding: 5px; border-bottom: 1px solid var(--border); vertical-align: top; }
.turns-table .num { text-align: center; font-variant-numeric: tabular-nums; }
.examples { display: flex; flex-direction: column; gap: 3px; }
.deal { font-size: 12px; color: var(--good); }
.deal.rej { color: var(--crisis); }
.round-row { cursor: pointer; }
.round-row:hover td { background: var(--panel-2); }
.deals-row td { background: var(--bg); }
.deals-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 4px 12px; padding: 6px 0; }
</style>
