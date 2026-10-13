<template>
  <div>
    <div class="grid2">
      <div class="card">
        <h2>重复囚徒困境锦标赛</h2>
        <p class="dim intro">
          每种策略两两对局。收益：双方合作各得 3 分；一方背叛一方合作，背叛者得 5 分合作者得 0 分；双方背叛各得 1 分。
          验证问题：<strong>在重复博弈中，善良、报复与宽容，哪种策略最能生存？</strong>
        </p>
        <div class="field">
          <label>每场对局轮数</label>
          <div class="range-row">
            <input type="range" min="10" max="200" step="10" v-model.number="rounds" />
            <span class="range-val">{{ rounds }}</span>
          </div>
        </div>
        <div class="field">
          <label>模式</label>
          <div class="range-row">
            <button :class="{ primary: mode === 'tournament' }" @click="mode = 'tournament'">循环赛</button>
            <button :class="{ primary: mode === 'evolution' }" @click="mode = 'evolution'">演化模拟</button>
          </div>
        </div>
        <button class="primary" @click="run">开始锦标赛</button>

        <div v-if="result" style="margin-top: 16px;">
          <h3>策略排名（点击行查看对局详情）</h3>
          <table class="rank-table">
            <tr v-for="(s, i) in result.standings" :key="s.key" class="clickable" @click="pickStrategy(s.key)">
              <td class="rank">{{ i + 1 }}</td>
              <td><strong>{{ s.name }}</strong><br /><span class="dim">{{ s.desc }}</span></td>
              <td class="score">{{ s.score }}</td>
            </tr>
          </table>
        </div>
      </div>

      <div class="card">
        <h2>{{ mode === 'tournament' ? '总得分' : '种群占比演化' }}</h2>
        <div ref="chartEl" class="chart"></div>
        <div v-if="result" class="conclusion">
          <h3>结论</h3>
          <p>{{ conclusion }}</p>
        </div>
      </div>
    </div>

    <!-- 对局详情：逐轮出招 -->
    <div class="card detail-card">
      <h2>对局详情 · 逐轮推演</h2>
      <div class="matchup-row">
        <select v-model="detailA" @change="buildDetail"><option v-for="(s, k) in STRATEGIES" :key="k" :value="k">{{ s.name }}（{{ s.desc }}）</option></select>
        <span class="vs">VS</span>
        <select v-model="detailB" @change="buildDetail"><option v-for="(s, k) in STRATEGIES" :key="k" :value="k">{{ s.name }}（{{ s.desc }}）</option></select>
        <button class="primary" @click="playDetail">▶ 逐轮播放</button>
        <button v-if="playingDetail" @click="detailPaused = !detailPaused">{{ detailPaused ? '▶ 继续' : '⏸ 暂停' }}</button>
        <button @click="showAllDetail">显示全部</button>
      </div>

      <div v-if="detail" class="detail-body">
        <div class="scoreboard">
          <div class="side">
            <strong>{{ STRATEGIES[detailA].name }}</strong>
            <span class="big-score" style="color: var(--accent)">{{ shownScoreA }}</span>
          </div>
          <div class="round-indicator">第 {{ displayCount }} / {{ detail.roundsDetail.length }} 轮</div>
          <div class="side">
            <strong>{{ STRATEGIES[detailB].name }}</strong>
            <span class="big-score" style="color: var(--bad)">{{ shownScoreB }}</span>
          </div>
        </div>

        <div class="rounds-table-wrap">
          <table class="rounds-table">
            <thead>
              <tr><th>轮次</th><th>{{ STRATEGIES[detailA].name }}出招</th><th>{{ STRATEGIES[detailB].name }}出招</th><th>本轮得分</th><th>累计得分</th></tr>
            </thead>
            <tbody>
              <tr v-for="r in visibleRounds" :key="r.round">
                <td>{{ r.round }}</td>
                <td><span class="move" :class="r.moveA === 'C' ? 'coop' : 'defect'">{{ r.moveA === 'C' ? '合作' : '背叛' }}</span></td>
                <td><span class="move" :class="r.moveB === 'C' ? 'coop' : 'defect'">{{ r.moveB === 'C' ? '合作' : '背叛' }}</span></td>
                <td class="num">{{ r.scoreA }} : {{ r.scoreB }}</td>
                <td class="num">{{ r.cumA }} : {{ r.cumB }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <p v-else class="dim">选择两个策略后点击「逐轮播放」，观察每一轮双方如何根据对方的历史行为做出决策。</p>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import * as echarts from 'echarts'
import { runTournament, runEvolution, matchDetailed, STRATEGIES } from '../../experiments/prisoners'

const rounds = ref(50)
const mode = ref('tournament')
const result = ref(null)
const evolution = ref(null)
const chartEl = ref(null)
let chart = null

// ---- 对局详情 ----
const detailA = ref('TFT')
const detailB = ref('ALLD')
const detail = ref(null)
const displayCount = ref(0)
const playingDetail = ref(false)
const detailPaused = ref(false)
let playTimer = null

const visibleRounds = computed(() => detail.value ? detail.value.roundsDetail.slice(0, displayCount.value) : [])
const shownScoreA = computed(() => visibleRounds.value.length ? visibleRounds.value[visibleRounds.value.length - 1].cumA : 0)
const shownScoreB = computed(() => visibleRounds.value.length ? visibleRounds.value[visibleRounds.value.length - 1].cumB : 0)

function pickStrategy(key) {
  detailA.value = key
  buildDetail()
}

function buildDetail() {
  stopPlay()
  detail.value = matchDetailed(detailA.value, detailB.value, Math.min(rounds.value, 60))
  displayCount.value = detail.value.roundsDetail.length
}

function playDetail() {
  buildDetail()
  displayCount.value = 0
  playingDetail.value = true
  detailPaused.value = false
  playTimer = setInterval(() => {
    if (!detail.value || displayCount.value >= detail.value.roundsDetail.length) {
      stopPlay()
      return
    }
    if (!detailPaused.value) displayCount.value++
  }, 200)
}

function showAllDetail() {
  buildDetail()
}

function stopPlay() {
  clearInterval(playTimer)
  playTimer = null
  playingDetail.value = false
  detailPaused.value = false
}

const NAME_COLOR = ['#5b8cff', '#3ecf8e', '#f0b429', '#b47aff', '#ef476f', '#4dd0e1', '#93a0bd']

const conclusion = computed(() => {
  if (mode.value === 'evolution' && evolution.value) {
    const last = evolution.value.snapshots[evolution.value.snapshots.length - 1]
    const entries = Object.entries(last).filter(([k]) => k !== 'gen').sort((a, b) => b[1] - a[1])
    const winner = STRATEGIES[entries[0][0]].name
    return `经过 ${evolution.value.snapshots.length - 1} 代繁衍，「${winner}」占据种群主导地位。` +
      `在演化压力下，懂得反击但不记仇的策略往往最终胜出——纯粹的善良会被剥削，纯粹的背叛则陷入互相伤害的泥潭。`
  }
  if (!result.value) return ''
  const top = result.value.standings[0]
  const alld = result.value.standings.find(s => s.key === 'ALLD')
  return `「${top.name}」以 ${top.score} 分夺冠。而永远背叛的「背叛者」排名第 ${result.value.standings.indexOf(alld) + 1}——` +
    `它能在单次博弈中占便宜，但在重复博弈里会被其他策略的报复机制反噬。这解释了合作为何能在自利个体中演化出来。`
})

function run() {
  if (mode.value === 'tournament') {
    result.value = runTournament(rounds.value)
    evolution.value = null
  } else {
    evolution.value = runEvolution(Math.max(10, Math.floor(rounds.value / 2)))
    result.value = null
  }
  renderChart()
}

function renderChart() {
  if (!chart) return
  if (mode.value === 'tournament' && result.value) {
    const st = [...result.value.standings].reverse()
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: {},
      grid: { left: 80, right: 30, top: 10, bottom: 30 },
      xAxis: { type: 'value', splitLine: { lineStyle: { color: '#222c42' } } },
      yAxis: { type: 'category', data: st.map(s => s.name), axisLine: { lineStyle: { color: '#2e3a55' } } },
      series: [{
        type: 'bar', data: st.map((s, i) => ({ value: s.score, itemStyle: { color: NAME_COLOR[st.length - 1 - i % NAME_COLOR.length], borderRadius: [0, 4, 4, 0] } })),
        label: { show: true, position: 'right', color: '#93a0bd' }
      }]
    }, true)
  } else if (mode.value === 'evolution' && evolution.value) {
    const { snapshots, keys } = evolution.value
    chart.setOption({
      backgroundColor: 'transparent',
      tooltip: { trigger: 'axis' },
      legend: { textStyle: { color: '#93a0bd' }, top: 0, type: 'scroll' },
      grid: { left: 40, right: 20, top: 40, bottom: 30 },
      xAxis: { type: 'category', data: snapshots.map(s => '第' + s.gen + '代'), axisLine: { lineStyle: { color: '#2e3a55' } } },
      yAxis: { type: 'value', name: '个体数', splitLine: { lineStyle: { color: '#222c42' } } },
      series: keys.map((k, i) => ({
        name: STRATEGIES[k].name, type: 'line', stack: 'total', areaStyle: { opacity: 0.4 },
        data: snapshots.map(s => s[k]), itemStyle: { color: NAME_COLOR[i % NAME_COLOR.length] }, symbolSize: 4
      }))
    }, true)
  }
}

onMounted(() => {
  chart = echarts.init(chartEl.value)
  run()
  window.addEventListener('resize', resize)
})
function resize() { chart?.resize() }
onUnmounted(() => { stopPlay(); window.removeEventListener('resize', resize); chart?.dispose() })
</script>

<style scoped>
h2 { margin: 0 0 10px; font-size: 16px; }
h3 { margin: 0 0 8px; font-size: 14px; }
.intro { font-size: 13px; line-height: 1.6; }
.dim { color: var(--text-dim); font-size: 12px; }
.chart { width: 100%; height: 380px; }
.rank-table { width: 100%; border-collapse: collapse; }
.rank-table td { padding: 8px 6px; border-top: 1px solid var(--border); font-size: 13px; }
.rank { font-size: 18px; font-weight: 700; color: var(--accent); width: 30px; }
.score { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; }
.conclusion { margin-top: 12px; background: var(--panel-2); border-radius: 10px; padding: 12px 14px; }
.conclusion p { margin: 0; font-size: 13px; line-height: 1.7; color: var(--text-dim); }
.range-row button { flex: 1; }
.clickable { cursor: pointer; }
.clickable:hover td { background: var(--panel-2); }
.detail-card { margin-top: 14px; }
.matchup-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.matchup-row select { flex: 1; min-width: 200px; width: auto; }
.vs { font-weight: 700; color: var(--crisis); }
.scoreboard { display: flex; justify-content: space-between; align-items: center; background: var(--panel-2); border-radius: 10px; padding: 14px 20px; margin: 14px 0; }
.scoreboard .side { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 120px; }
.big-score { font-size: 32px; font-weight: 700; font-variant-numeric: tabular-nums; }
.round-indicator { font-size: 13px; color: var(--text-dim); }
.rounds-table-wrap { max-height: 320px; overflow-y: auto; }
.rounds-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.rounds-table th { position: sticky; top: 0; background: var(--panel); color: var(--text-dim); font-weight: normal; padding: 6px; border-bottom: 1px solid var(--border); }
.rounds-table td { text-align: center; padding: 5px; border-bottom: 1px solid var(--border); }
.rounds-table .num { font-variant-numeric: tabular-nums; }
.move { display: inline-block; padding: 2px 10px; border-radius: 5px; font-size: 12px; font-weight: 700; }
.move.coop { background: rgba(62, 207, 142, .15); color: var(--good); }
.move.defect { background: rgba(239, 71, 111, .15); color: var(--crisis); }
</style>
