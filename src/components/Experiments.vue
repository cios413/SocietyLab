<template>
  <div>
    <div class="sub-tabs no-print">
      <button v-for="t in subs" :key="t.key" :class="{ active: sub === t.key }" @click="sub = t.key">{{ t.label }}</button>
      <ExportButton class="exp-export" />
    </div>
    <PrisonersDilemma v-if="sub === 'pd'" />
    <TrolleyProblem v-else-if="sub === 'trolley'" />
    <CommonsGame v-else-if="sub === 'commons'" />
    <InfiniteFlow v-else-if="sub === 'infinite'" />
    <UltimatumGame v-else-if="sub === 'ultimatum'" />
  </div>
</template>

<script setup>
import { ref } from 'vue'
import PrisonersDilemma from './experiments/PrisonersDilemma.vue'
import TrolleyProblem from './experiments/TrolleyProblem.vue'
import CommonsGame from './experiments/CommonsGame.vue'
import InfiniteFlow from './experiments/InfiniteFlow.vue'
import UltimatumGame from './experiments/UltimatumGame.vue'
import ExportButton from './ExportButton.vue'

const sub = ref('pd')
const subs = [
  { key: 'pd', label: '囚徒困境' },
  { key: 'trolley', label: '电车难题' },
  { key: 'commons', label: '公地悲剧' },
  { key: 'infinite', label: '无限流生存' },
  { key: 'ultimatum', label: '最后通牒' }
]
</script>

<style scoped>
.sub-tabs { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; }
.sub-tabs button.active { background: var(--accent); border-color: var(--accent); color: #fff; }
.exp-export { margin-left: auto; }
</style>
