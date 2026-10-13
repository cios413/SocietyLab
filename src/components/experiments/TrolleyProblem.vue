<template>
  <div class="grid2">
    <div class="card">
      <h2>电车难题 · 你的选择</h2>
      <p class="dim intro">先做出你自己的选择，再运行群体模拟，看看你和大众的位置。</p>

      <div v-for="sc in SCENARIOS" :key="sc.id" class="scenario">
        <h3>{{ sc.title }}</h3>
        <p class="story">{{ sc.story }}</p>
        <div class="choice-row">
          <button :class="{ primary: myChoices[sc.id] === 'action' }" @click="choose(sc.id, 'action')">{{ sc.actionLabel }}</button>
          <button :class="{ primary: myChoices[sc.id] === 'inaction' }" @click="choose(sc.id, 'inaction')">{{ sc.inactionLabel }}</button>
        </div>
      </div>
    </div>

    <div class="card">
      <h2>群体模拟</h2>
      <div class="field">
        <label>虚拟人数</label>
        <div class="range-row">
          <input type="range" min="50" max="1000" step="50" v-model.number="population" />
          <span class="range-val">{{ population }}</span>
        </div>
      </div>
      <div class="field">
        <label>群体平均功利主义倾向（0=纯义务论，100=纯功利主义）</label>
        <div class="range-row">
          <input type="range" min="0" max="100" v-model.number="utilMean" />
          <span class="range-val">{{ utilMean }}</span>
        </div>
      </div>
      <button class="primary" @click="runSim">运行模拟</button>

      <div v-if="results" class="sim-results">
        <div v-for="sc in SCENARIOS" :key="sc.id" class="scenario-result">
          <h3>
            {{ sc.title }}
            <span v-if="myChoices[sc.id]" class="tag mine">你选了「{{ myChoices[sc.id] === 'action' ? '干预' : '不干预' }}」</span>
          </h3>
          <div class="vote-bar">
            <div class="vote-action" :style="{ width: results[sc.id].actionPct + '%' }">
              {{ results[sc.id].actionPct }}%
            </div>
            <div class="vote-inaction" :style="{ width: results[sc.id].inactionPct + '%' }">
              {{ results[sc.id].inactionPct }}%
            </div>
          </div>
          <p class="labels"><span style="color: var(--crisis)">干预 {{ results[sc.id].action }} 人</span> · <span style="color: var(--good)">不干预 {{ results[sc.id].inaction }} 人</span></p>
          <p class="insight">{{ sc.insight }}</p>
        </div>
        <div class="conclusion">
          <h3>实验说明了什么</h3>
          <p>四个场景的功利计算完全相同（1 条命换 5 条命），但干预率从经典扳道岔到器官移植急剧下降——
            决定人们选择的不是结果，而是「伤害的直接性」与「是否把人当作手段」。
            拖动功利主义倾向滑块，可以看到整个群体向功利主义或义务论漂移。</p>
        </div>

        <!-- 个体决策散点图 -->
        <div class="scatter-box">
          <h3>个体决策明细（每个点 = 一个虚拟人）</h3>
          <div class="field">
            <label>查看场景</label>
            <select v-model="scatterScenario" @change="renderScatter">
              <option v-for="sc in SCENARIOS" :key="sc.id" :value="sc.id">{{ sc.title }}</option>
            </select>
          </div>
          <div ref="scatterEl" class="scatter-chart"></div>
          <p class="dim note">横轴是该虚拟人的功利主义倾向，纵轴是模型算出的干预概率；红点选择干预，绿点选择不干预。场景「直接伤害」越强，高功利者也会被压到绿区。</p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, nextTick } from 'vue'
import * as echarts from 'echarts'
import { SCENARIOS, simulatePopulation } from '../../experiments/trolley'

const population = ref(300)
const utilMean = ref(50)
const myChoices = ref({})
const results = ref(null)
const scatterScenario = ref('classic')
const scatterEl = ref(null)
let scatterChart = null

function choose(id, choice) {
  myChoices.value = { ...myChoices.value, [id]: choice }
}

function runSim() {
  const r = {}
  for (const sc of SCENARIOS) {
    r[sc.id] = simulatePopulation(sc, population.value, utilMean.value, true)
  }
  results.value = r
  nextTick(renderScatter)
}

function renderScatter() {
  if (!scatterEl.value) return
  if (!scatterChart) scatterChart = echarts.init(scatterEl.value)
  const agents = results.value?.[scatterScenario.value]?.agents || []
  const jitter = () => (Math.random() - 0.5) * 6
  const acted = agents.filter(a => a.action).map(a => [a.u, a.p + jitter(), a.p])
  const refused = agents.filter(a => !a.action).map(a => [a.u, a.p + jitter(), a.p])
  scatterChart.setOption({
    backgroundColor: 'transparent',
    tooltip: { formatter: p => `功利倾向 ${p.data[0]}<br/>干预概率 ${p.data[2]}%<br/>选择：${p.seriesName}` },
    legend: { textStyle: { color: '#93a0bd' }, top: 0 },
    grid: { left: 45, right: 20, top: 40, bottom: 40 },
    xAxis: { type: 'value', name: '功利主义倾向', max: 100, splitLine: { lineStyle: { color: '#222c42' } } },
    yAxis: { type: 'value', name: '干预概率(%)', min: -10, max: 110, splitLine: { lineStyle: { color: '#222c42' } } },
    series: [
      { name: '选择干预', type: 'scatter', data: acted, itemStyle: { color: '#ef476f', opacity: 0.6 }, symbolSize: 7 },
      { name: '选择不干预', type: 'scatter', data: refused, itemStyle: { color: '#3ecf8e', opacity: 0.6 }, symbolSize: 7 }
    ]
  }, true)
}

function resize() { scatterChart?.resize() }
onMounted(() => window.addEventListener('resize', resize))
onUnmounted(() => { window.removeEventListener('resize', resize); scatterChart?.dispose() })
</script>

<style scoped>
h2 { margin: 0 0 10px; font-size: 16px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.intro { font-size: 13px; }
.dim { color: var(--text-dim); }
.scenario { border-top: 1px solid var(--border); padding: 14px 0; }
.story { font-size: 13px; line-height: 1.7; color: var(--text-dim); margin: 0 0 10px; }
.choice-row { display: flex; gap: 10px; }
.choice-row button { flex: 1; font-size: 13px; }
.sim-results { margin-top: 16px; }
.scenario-result { border-top: 1px solid var(--border); padding: 14px 0; }
.tag.mine { color: var(--accent); border-color: var(--accent); margin-left: 8px; }
.vote-bar { display: flex; height: 26px; border-radius: 6px; overflow: hidden; font-size: 12px; font-weight: 700; }
.vote-action { background: var(--crisis); color: #fff; display: flex; align-items: center; justify-content: center; min-width: 0; transition: width .5s; }
.vote-inaction { background: var(--good); color: #06281c; display: flex; align-items: center; justify-content: center; min-width: 0; transition: width .5s; }
.labels { font-size: 12px; margin: 6px 0 0; }
.insight { font-size: 12px; color: var(--text-dim); line-height: 1.6; margin: 6px 0 0; }
.conclusion { margin-top: 14px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.conclusion p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.scatter-box { margin-top: 16px; border-top: 1px solid var(--border); padding-top: 14px; }
.scatter-chart { width: 100%; height: 300px; }
.note { font-size: 12px; line-height: 1.6; }
</style>
