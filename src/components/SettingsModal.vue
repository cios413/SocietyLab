<template>
  <div class="mask" @click.self="$emit('close')">
    <div class="modal card">
      <h2>大模型设置（OpenAI 兼容接口）</h2>
      <div class="field">
        <label>API 地址 Base URL</label>
        <input v-model="store.llm.baseUrl" placeholder="https://api.deepseek.com" />
      </div>
      <div class="field">
        <label>API Key</label>
        <input v-model="store.llm.apiKey" type="password" placeholder="sk-..." />
      </div>
      <div class="field">
        <label>模型名称</label>
        <input v-model="store.llm.model" placeholder="deepseek-chat / moonshot-v1-8k / qwen-plus ..." />
      </div>
      <p class="note">配置保存在浏览器 localStorage，不会上传到其他服务器。支持 DeepSeek、Kimi、通义、OpenAI 等兼容接口。</p>
      <div class="actions">
        <button @click="$emit('close')">取消</button>
        <button class="primary" @click="save">保存</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { store, saveLlmConfig } from '../store'
const emit = defineEmits(['close'])
function save() {
  saveLlmConfig()
  emit('close')
}
</script>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 420px; max-width: 92vw; }
h2 { margin: 0 0 16px; font-size: 16px; }
.note { font-size: 12px; color: var(--text-dim); }
.actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
</style>
