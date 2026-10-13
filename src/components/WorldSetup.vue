<template>
  <div class="grid2">
    <div class="card">
      <div class="card-head"><h2>世界观</h2><ExportButton /></div>
      <div class="field">
        <label>社会名称</label>
        <input v-model="store.world.name" placeholder="例如：新曙光殖民地" />
      </div>
      <div class="field">
        <label>世界观描述（历史、地理、核心矛盾等）</label>
        <textarea v-model="store.world.description" rows="5" placeholder="描述这个世界的基本设定..."></textarea>
      </div>
      <div class="field">
        <label>社会制度</label>
        <select v-model="store.world.governance">
          <option v-for="g in governances" :key="g">{{ g }}</option>
        </select>
      </div>
    </div>

    <div class="card">
      <h2>环境参数</h2>
      <div v-for="p in paramDefs" :key="p.key" class="field">
        <label>{{ p.label }} <span class="hint">{{ p.hint }}</span></label>
        <div class="range-row">
          <input type="range" min="0" max="100" v-model.number="store.world[p.key]" />
          <span class="range-val">{{ store.world[p.key] }}</span>
        </div>
      </div>
      <button class="primary" @click="applyReset" style="margin-top: 8px;">应用设定并重置推演</button>
      <p class="note">修改参数后需重置才会从新起点开始推演</p>
    </div>
  </div>
</template>

<script setup>
import { store, resetSimulation } from '../store'
import ExportButton from './ExportButton.vue'

const governances = ['部落制', '君主制', '共和制', '集权制', '无政府']
const paramDefs = [
  { key: 'resourceAbundance', label: '资源丰度', hint: '决定经济增长潜力' },
  { key: 'techLevel', label: '技术水平', hint: '影响经济与文化发展速度' },
  { key: 'culturalOpenness', label: '文化开放度', hint: '影响文化繁荣与思想碰撞' },
  { key: 'envPressure', label: '环境压力', hint: '越高则灾害、死亡率越高' }
]

function applyReset() {
  resetSimulation()
  alert('已用新设定重置社会，时间回到第 1 年')
}
</script>

<style scoped>
h2 { margin: 0; font-size: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.hint { font-weight: normal; opacity: .7; margin-left: 6px; }
.note { font-size: 12px; color: var(--text-dim); margin-top: 8px; }
</style>
