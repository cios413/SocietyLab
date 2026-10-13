<template>
  <div class="app-shell">
    <header class="topbar">
      <div class="brand">
        <span class="logo">⬡</span>
        <div>
          <h1>社会推演实验室</h1>
          <p class="subtitle">{{ store.world.name }} · 第 {{ store.society?.year || 1 }} 年</p>
        </div>
      </div>
      <div class="topbar-actions">
        <div class="engine-switch">
          <button :class="{ primary: store.engine === 'rule' }" @click="store.engine = 'rule'">规则引擎</button>
          <button :class="{ primary: store.engine === 'llm' }" @click="store.engine = 'llm'">大模型引擎</button>
        </div>
        <button @click="showCloud = true">☁ {{ cloud.loggedIn ? cloud.email : '登录 / 云端' }}</button>
        <button @click="showSettings = true">⚙ 模型设置</button>
      </div>
    </header>

    <nav class="tabs">
      <button v-for="t in tabs" :key="t.key" :class="{ active: tab === t.key }" @click="tab = t.key">{{ t.label }}</button>
    </nav>

    <main class="content">
      <WorldSetup v-if="tab === 'world'" />
      <CharacterPanel v-else-if="tab === 'characters'" />
      <Timeline v-else-if="tab === 'timeline'" />
      <MetricsDashboard v-else-if="tab === 'metrics'" />
      <Experiments v-else-if="tab === 'experiments'" />
    </main>

    <SettingsModal v-if="showSettings" @close="showSettings = false" />
    <CloudModal v-if="showCloud" @close="showCloud = false" />
  </div>
</template>

<script setup>
import { ref, watch } from 'vue'
import { store, initSociety, loadLocal, saveLocal } from './store'
import { cloud } from './engine/cloud'
import WorldSetup from './components/WorldSetup.vue'
import CharacterPanel from './components/CharacterPanel.vue'
import Timeline from './components/Timeline.vue'
import MetricsDashboard from './components/MetricsDashboard.vue'
import Experiments from './components/Experiments.vue'
import SettingsModal from './components/SettingsModal.vue'
import CloudModal from './components/CloudModal.vue'

const tab = ref('timeline')
const tabs = [
  { key: 'timeline', label: '⏳ 推演时间线' },
  { key: 'world', label: '🌍 世界观设定' },
  { key: 'characters', label: '👥 人物与阵营' },
  { key: 'metrics', label: '📊 社会指标' },
  { key: 'experiments', label: '🧪 经典实验' }
]
const showSettings = ref(false)
const showCloud = ref(false)

// 启动：优先恢复本地上次进度（游客模式自动续玩），无存档则初始化
if (!store.society) {
  if (!loadLocal()) initSociety()
}

// 每年变化后自动本地存档（含手动修改人物后的下一次推演）
watch(() => store.society?.year, () => saveLocal())
</script>

<style scoped>
.app-shell { max-width: 1100px; margin: 0 auto; padding: 20px; }
.topbar { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 12px; }
.brand { display: flex; align-items: center; gap: 12px; }
.logo { font-size: 34px; color: var(--accent); }
h1 { font-size: 20px; margin: 0; }
.subtitle { margin: 2px 0 0; font-size: 13px; color: var(--text-dim); }
.topbar-actions { display: flex; gap: 10px; align-items: center; }
.engine-switch { display: flex; gap: 0; }
.engine-switch button { border-radius: 0; }
.engine-switch button:first-child { border-radius: 8px 0 0 8px; }
.engine-switch button:last-child { border-radius: 0 8px 8px 0; margin-left: -1px; }
.tabs { display: flex; gap: 8px; margin: 20px 0 16px; border-bottom: 1px solid var(--border); padding-bottom: 0; flex-wrap: wrap; }
.tabs button { border: none; background: none; border-radius: 8px 8px 0 0; padding: 10px 16px; color: var(--text-dim); }
.tabs button.active { color: var(--accent); background: var(--panel); border: 1px solid var(--border); border-bottom-color: var(--panel); margin-bottom: -1px; }
</style>
