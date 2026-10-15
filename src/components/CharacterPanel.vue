<template>
  <div class="grid2">
    <!-- 阵营 -->
    <div class="card">
      <div class="card-head">
        <h2>阵营 ({{ store.factions.length }})</h2>
        <div class="head-actions"><ExportButton /><button @click="showFactionForm = !showFactionForm">+ 新建阵营</button></div>
      </div>

      <div v-if="showFactionForm" class="form-box">
        <div class="field"><label>阵营名称</label><input v-model="factionForm.name" /></div>
        <div class="field"><label>文化背景</label><textarea v-model="factionForm.culture" rows="2"></textarea></div>
        <div class="field">
          <label>实力</label>
          <div class="range-row"><input type="range" min="0" max="100" v-model.number="factionForm.power" /><span class="range-val">{{ factionForm.power }}</span></div>
        </div>
        <div class="field">
          <label>凝聚力</label>
          <div class="range-row"><input type="range" min="0" max="100" v-model.number="factionForm.cohesion" /><span class="range-val">{{ factionForm.cohesion }}</span></div>
        </div>
        <button class="primary" @click="addFaction">保存</button>
      </div>

      <div v-for="f in store.factions" :key="f.id" class="item">
        <div class="item-head">
          <strong>{{ f.name }}</strong>
          <button class="danger small" @click="removeFaction(f.id)">删除</button>
        </div>
        <p class="dim">{{ f.culture }}</p>
        <div class="mini-stats">
          <span>实力 {{ f.power }}</span>
          <div class="stat-bar"><div :style="{ width: f.power + '%', background: 'var(--accent)' }"></div></div>
          <span>凝聚力 {{ f.cohesion }}</span>
          <div class="stat-bar"><div :style="{ width: f.cohesion + '%', background: 'var(--good)' }"></div></div>
        </div>
      </div>
    </div>

    <!-- 人物 -->
    <div class="card">
      <div class="card-head">
        <h2>人物 ({{ aliveCount }} 存活)</h2>
        <button @click="showCharForm = !showCharForm">+ 新建人物</button>
      </div>

      <div v-if="showCharForm" class="form-box">
        <div class="grid2">
          <div class="field"><label>姓名</label><input v-model="charForm.name" /></div>
          <div class="field">
            <label>所属阵营</label>
            <select v-model.number="charForm.factionId">
              <option v-for="f in store.factions" :key="f.id" :value="f.id">{{ f.name }}</option>
            </select>
          </div>
        </div>
        <div class="field"><label>人物背景</label><textarea v-model="charForm.bio" rows="2"></textarea></div>
        <div v-for="t in traitDefs" :key="t.key" class="field">
          <label>{{ t.label }}</label>
          <div class="range-row"><input type="range" min="0" max="100" v-model.number="charForm[t.key]" /><span class="range-val">{{ charForm[t.key] }}</span></div>
        </div>
        <button class="primary" @click="addCharacter">保存</button>
      </div>

      <div v-for="c in store.characters" :key="c.id" class="item" :class="{ dead: !c.alive }">
        <div class="item-head">
          <strong>{{ c.name }} <span v-if="c.turningPoint" class="tag" :class="c.turningPoint === 'hero' ? 'hero-tag' : 'disruptor-tag'">{{ c.turningPoint === 'hero' ? '伟人' : '搅局者' }}</span> <span v-if="!c.alive" class="tag dead-tag">已死亡</span></strong>
          <div class="item-actions">
            <span class="tag">{{ factionName(c.factionId) }}</span>
            <button class="danger small" :aria-label="`删除人物${c.name}`" @click="removeCharacter(c.id)">删除</button>
          </div>
        </div>
        <p class="dim">{{ c.bio }}</p>
        <div class="mini-stats cols3">
          <span>财富</span><div class="stat-bar"><div :style="{ width: c.wealth + '%', background: '#f0b429' }"></div></div><em>{{ Math.round(c.wealth) }}</em>
          <span>影响力</span><div class="stat-bar"><div :style="{ width: c.influence + '%', background: 'var(--accent)' }"></div></div><em>{{ Math.round(c.influence) }}</em>
          <span>幸福度</span><div class="stat-bar"><div :style="{ width: c.happiness + '%', background: 'var(--good)' }"></div></div><em>{{ Math.round(c.happiness) }}</em>
        </div>
        <p class="traits">野心 {{ c.ambition }} · 善良 {{ c.kindness }} · 激进 {{ c.radicalism }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { store, genId, saveLocal } from '../store'
import ExportButton from './ExportButton.vue'

const showFactionForm = ref(false)
const showCharForm = ref(false)
const factionForm = ref({ name: '', culture: '', power: 50, cohesion: 50 })
const charForm = ref({ name: '', factionId: null, bio: '', ambition: 50, kindness: 50, radicalism: 30 })

const traitDefs = [
  { key: 'ambition', label: '野心' },
  { key: 'kindness', label: '善良' },
  { key: 'radicalism', label: '激进' }
]

const aliveCount = computed(() => store.characters.filter(c => c.alive).length)

function factionName(id) {
  return (store.factions.find(f => f.id === id) || {}).name || '无阵营'
}

function addFaction() {
  if (!factionForm.value.name.trim()) return
  store.factions.push({ id: genId(), ...factionForm.value })
  factionForm.value = { name: '', culture: '', power: 50, cohesion: 50 }
  showFactionForm.value = false
}

function removeFaction(id) {
  const i = store.factions.findIndex(f => f.id === id)
  if (i >= 0) store.factions.splice(i, 1)
}

function addCharacter() {
  if (!charForm.value.name.trim()) return
  store.characters.push({
    id: genId(), ...charForm.value,
    wealth: 40, influence: 30, happiness: 55, alive: true
  })
  charForm.value = { name: '', factionId: null, bio: '', ambition: 50, kindness: 50, radicalism: 30 }
  showCharForm.value = false
}

function removeCharacter(id) {
  const i = store.characters.findIndex(c => c.id === id)
  if (i < 0 || !window.confirm(`确定删除人物「${store.characters[i].name}」吗？`)) return
  store.characters.splice(i, 1)
  saveLocal()
}
</script>

<style scoped>
h2 { margin: 0; font-size: 16px; }
.card-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
.head-actions { display: flex; gap: 8px; }
.form-box { background: var(--panel-2); border-radius: 10px; padding: 14px; margin-bottom: 14px; }
.item { border-top: 1px solid var(--border); padding: 12px 0; }
.item.dead { opacity: .55; }
.item-head { display: flex; justify-content: space-between; align-items: center; }
.item-actions { display: flex; align-items: center; gap: 8px; }
.dim { color: var(--text-dim); font-size: 13px; margin: 6px 0; }
.traits { font-size: 12px; color: var(--text-dim); margin: 6px 0 0; }
.mini-stats { display: grid; grid-template-columns: 50px 1fr; gap: 6px 10px; align-items: center; font-size: 12px; color: var(--text-dim); }
.mini-stats.cols3 { grid-template-columns: 50px 1fr 30px; }
.mini-stats em { font-style: normal; text-align: right; }
button.small { padding: 3px 10px; font-size: 12px; }
.dead-tag { color: var(--crisis); border-color: var(--crisis); }
.hero-tag { color: var(--good); border-color: var(--good); }
.disruptor-tag { color: var(--crisis); border-color: var(--crisis); }
</style>
