<template>
  <div class="card">
    <div class="card-head"><h2>社会指标演化曲线</h2><ExportButton /></div>
    <div ref="chartEl" class="chart"></div>
    <h2 style="margin-top: 20px;">居民幸福指数 & 人口</h2>
    <div ref="chartEl2" class="chart"></div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import * as echarts from 'echarts'
import { store } from '../store'
import ExportButton from './ExportButton.vue'

const chartEl = ref(null)
const chartEl2 = ref(null)
let chart1, chart2

const COLORS = { economy: '#f0b429', stability: '#5b8cff', culture: '#b47aff', happiness: '#3ecf8e', inequality: '#ef476f' }

function render() {
  const h = store.society?.history || []
  const years = h.map(p => '第' + p.year + '年')
  const line = (key, name) => ({ name, type: 'line', smooth: true, data: h.map(p => p[key]), lineStyle: { width: 2.5 }, itemStyle: { color: COLORS[key] }, symbolSize: 5 })

  chart1.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#93a0bd' }, top: 0 },
    grid: { left: 40, right: 20, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: years, axisLine: { lineStyle: { color: '#2e3a55' } } },
    yAxis: { type: 'value', max: 100, splitLine: { lineStyle: { color: '#222c42' } } },
    series: [line('economy', '经济'), line('stability', '稳定度'), line('culture', '文化'), line('happiness', '幸福指数'), line('inequality', '不平等')]
  })

  chart2.setOption({
    backgroundColor: 'transparent',
    tooltip: { trigger: 'axis' },
    legend: { textStyle: { color: '#93a0bd' }, top: 0 },
    grid: { left: 50, right: 50, top: 40, bottom: 30 },
    xAxis: { type: 'category', data: years, axisLine: { lineStyle: { color: '#2e3a55' } } },
    yAxis: [
      { type: 'value', max: 100, name: '幸福指数', splitLine: { lineStyle: { color: '#222c42' } } },
      { type: 'value', name: '人口', splitLine: { show: false } }
    ],
    series: [
      { name: '幸福指数', type: 'line', smooth: true, areaStyle: { opacity: 0.15 }, data: h.map(p => p.happiness), itemStyle: { color: COLORS.happiness }, lineStyle: { width: 2.5 } },
      { name: '人口', type: 'bar', yAxisIndex: 1, data: h.map(p => p.population), itemStyle: { color: '#2e3a55', borderRadius: [3, 3, 0, 0] } }
    ]
  })
}

let stopWatch = null
onMounted(() => {
  chart1 = echarts.init(chartEl.value)
  chart2 = echarts.init(chartEl2.value)
  render()
  stopWatch = watch(() => store.society?.history?.length, render)
  window.addEventListener('resize', resize)
})

function resize() { chart1?.resize(); chart2?.resize() }

onUnmounted(() => {
  stopWatch?.()
  window.removeEventListener('resize', resize)
  chart1?.dispose(); chart2?.dispose()
})
</script>

<style scoped>
h2 { margin: 0 0 10px; font-size: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.card-head h2 { margin: 0; }
.chart { width: 100%; height: 340px; }
</style>
