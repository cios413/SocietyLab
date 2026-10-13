<template>
  <div>
    <div class="grid2">
      <div class="card">
      <h2>公地悲剧模拟</h2>
      <p class="dim intro">
        一片公共牧场，每个牧民都想多放羊。克制者只在草场健康时适度扩张，贪婪者无脑扩张。
        验证问题：<strong>个体理性如何导致集体灾难？</strong>
      </p>
      <div class="field">
        <label>牧民人数</label>
        <div class="range-row"><input type="range" min="4" max="30" v-model.number="params.herders" /><span class="range-val">{{ params.herders }}</span></div>
      </div>
      <div class="field">
        <label>贪婪者比例</label>
        <div class="range-row"><input type="range" min="0" max="100" v-model.number="greedyPct" /><span class="range-val">{{ greedyPct }}%</span></div>
      </div>
      <div class="field">
        <label>草场容量</label>
        <div class="range-row"><input type="range" min="50" max="300" step="10" v-model.number="params.capacity" /><span class="range-val">{{ params.capacity }}</span></div>
      </div>
      <div class="field">
        <label>模拟回合</label>
        <div class="range-row"><input type="range" min="10" max="100" step="5" v-model.number="params.turns" /><span class="range-val">{{ params.turns }}</span></div>
      </div>
      <button class="primary" @click="run">运行模拟</button>

      <div v-if="result" class="result-box">
        <h3>结果</h3>
        <div class="result-grid">
          <div><span class="dim">最终草场</span><strong :style="{ color: result.finalGrass > params.capacity * 0.3 ? 'var(--good)' : 'var(--crisis)' }">{{ result.finalGrass }}</strong></div>
          <div><span class="dim">贪婪者平均财富</span><strong style="color: #f0b429">{{ result.greedyAvgWealth }}</strong></div>
          <div><span class="dim">克制者平均财富</span><strong style="color: var(--good)">{{ result.restrainedAvgWealth }}</strong></div>
          <div><span class="dim">公地崩溃</span><strong :style="{ color: result.collapsed ? 'var(--crisis)' : 'var(--good)' }">{{ result.collapsed ? '是' : '否' }}</strong></div>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>草场与羊群变化</h2>
      <div ref="chartEl" class="chart"></div>
      <div v-if="result" class="conclusion">
        <h3>结论</h3>
        <p>{{ conclusion }}</p>
      </div>
      </div>
    </div>

    <!-- 逐回合明细 -->
    <div v-if="result" class="card detail-card">
      <h2>逐回合推演明细</h2>
      <div class="turns-table-wrap">
        <table class="turns-table">
          <thead>
            <tr>
              <th>回合</th><th>草场恢复</th><th>新增羊(贪婪/克制)</th><th>放牧消耗</th>
              <th>草场存量</th><th>羊群总数</th><th>事件</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="h in result.history.slice(1)" :key="h.turn" :class="{ 'starve-row': h.starved }">
              <td>{{ h.turn }}</td>
              <td class="num good">+{{ h.regenAmount }}</td>
              <td class="num">+{{ h.addedGreedy }} / +{{ h.addedRestrained }}</td>
              <td class="num bad">-{{ h.consumed }}</td>
              <td class="num"><strong>{{ h.grass }}</strong></td>
              <td class="num">{{ h.sheep }}</td>
              <td><span v-if="h.starved" class="tag starve-tag">饥荒！{{ h.sheepLost }} 只羊饿死</span><span v-else class="dim2">—</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 牧民终局 -->
    <div v-if="result" class="card detail-card">
      <h2>牧民终局</h2>
      <div class="agents-grid">
        <div v-for="a in result.agents" :key="a.id" class="agent-chip" :class="{ greedy: a.greedy }">
          <strong>牧民 {{ a.id + 1 }}</strong>
          <span class="tag">{{ a.greedy ? '贪婪' : '克制' }}</span>
          <span class="dim2">羊 {{ a.sheep }} · 财富 {{ a.wealth }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { simulateCommons } from '../../experiments/commons'

const params = ref({ herders: 10, turns: 40, capacity: 120, regen: 0.35 })
const greedyPct = ref(50)
const result = ref(null)
const chartEl = ref(null)
let chart = null

const conclusion = computed(() => {
  const r = result.value
  if (!r) return ''
  if (r.collapsed) {
    return `公地在第 ${params.value.turns} 回合内崩溃了。贪婪者（${r.greedyCount} 人）的过度放牧拖垮了整个系统，最终贪婪者平均财富 ${r.greedyAvgWealth}、克制者 ${r.restrainedAvgWealth}——所有人都成了输家。这就是哈丁所说的「各自追求最优解导致的集体毁灭」，解决之道在于制度约束（配额、私有化或社群自治规则）。`
  }
  if (r.greedyAvgWealth > r.restrainedAvgWealth) {
    return `公地暂时存活，贪婪者平均财富（${r.greedyAvgWealth}）高于克制者（${r.restrainedAvgWealth}）——搭便车者短期获利。但注意草场曲线的走势：系统正逼近临界点。试试把贪婪者比例调高，观察崩溃何时到来。`
  }
  return `在贪婪者比例较低时，克制者的可持续策略维持住了公地，甚至积累了不逊于贪婪者的财富。这说明当多数成员遵守规则时，公共资源可以长期维持——契合奥斯特罗姆的「公共事务治理」理论。`
})

function run() {
  result.value = simulateCommons({ ...params.value, greedyRatio: greedyPct.value / 100 })
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
    xAxis: { type: 'category', data: h.map(p => p.turn), axisLine: { lineStyle: { color: '#2e3a55' } } },
    yAxis: [
      { type: 'value', name: '草场', max: params.value.capacity, splitLine: { lineStyle: { color: '#222c42' } } },
      { type: 'value', name: '羊群', splitLine: { show: false } }
    ],
    series: [
      { name: '草场存量', type: 'line', smooth: true, areaStyle: { opacity: 0.2 }, data: h.map(p => p.grass), itemStyle: { color: '#3ecf8e' }, lineStyle: { width: 2.5 } },
      { name: '羊群总数', type: 'line', smooth: true, yAxisIndex: 1, data: h.map(p => p.sheep), itemStyle: { color: '#f0b429' }, lineStyle: { width: 2.5, type: 'dashed' } }
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
.dim { color: var(--text-dim); font-size: 12px; display: block; }
.chart { width: 100%; height: 340px; }
.result-box { margin-top: 16px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.result-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.result-grid strong { font-size: 20px; display: block; margin-top: 2px; }
.conclusion { margin-top: 12px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.conclusion p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.detail-card { margin-top: 14px; }
.turns-table-wrap { max-height: 360px; overflow-y: auto; }
.turns-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.turns-table th { position: sticky; top: 0; background: var(--panel); color: var(--text-dim); font-weight: normal; padding: 6px; border-bottom: 1px solid var(--border); }
.turns-table td { text-align: center; padding: 5px; border-bottom: 1px solid var(--border); }
.turns-table .num { font-variant-numeric: tabular-nums; }
.turns-table .good { color: var(--good); }
.turns-table .bad { color: var(--crisis); }
.starve-row { background: rgba(239, 71, 111, .07); }
.starve-tag { color: var(--crisis); border-color: var(--crisis); }
.dim2 { color: var(--text-dim); font-size: 12px; }
.agents-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
.agent-chip { background: var(--panel-2); border: 1px solid var(--border); border-radius: 8px; padding: 10px; display: flex; flex-direction: column; gap: 5px; font-size: 12px; }
.agent-chip.greedy { border-color: rgba(240, 180, 41, .5); }
</style>
