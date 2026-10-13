<template>
  <Teleport to="body">
    <div class="mask" @click.self="$emit('close')">
      <div class="modal card">
        <h2>云端存档</h2>

        <!-- 未配置后端 -->
        <template v-if="!cloud.url || !cloud.anonKey">
          <p class="dim">云端存档基于 Supabase（免费）实现。配置一次即可永久使用；不配置也能以游客模式自动保存到本浏览器。</p>
          <div class="field"><label>Supabase 项目 URL</label><input v-model="cfg.url" placeholder="https://xxxx.supabase.co" /></div>
          <div class="field"><label>anon public key</label><input v-model="cfg.anonKey" placeholder="eyJhbGciOi..." /></div>
          <details class="sql-box">
            <summary>首次使用？点这里查看建表 SQL（在 Supabase SQL 编辑器执行一次）</summary>
            <pre>create table saves (
  user_id uuid primary key references auth.users,
  data jsonb,
  updated_at timestamptz default now()
);
alter table saves enable row level security;
create policy "own" on saves for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);</pre>
            <p class="dim">同时在 Authentication → Sign In / Providers 中开启 Email，并关闭「Confirm email」可跳过邮箱验证。</p>
          </details>
          <div class="actions">
            <button class="primary" @click="saveCfg">保存配置</button>
            <button @click="$emit('close')">暂不登录（游客模式）</button>
          </div>
        </template>

        <!-- 已配置未登录 -->
        <template v-else-if="!cloud.loggedIn">
          <div class="field"><label>邮箱</label><input v-model="email" type="email" /></div>
          <div class="field"><label>密码（至少 6 位）</label><input v-model="password" type="password" /></div>
          <p v-if="msg" class="msg">{{ msg }}</p>
          <div class="actions">
            <button class="primary" :disabled="busy" @click="doSignIn">登录</button>
            <button :disabled="busy" @click="doSignUp">注册</button>
            <button @click="resetCfg">更换后端</button>
            <button @click="$emit('close')">暂不登录</button>
          </div>
        </template>

        <!-- 已登录 -->
        <template v-else>
          <p>已登录：<strong>{{ cloud.email }}</strong></p>
          <p v-if="cloudTime" class="dim">云端存档时间：{{ cloudTime }}</p>
          <p v-if="msg" class="msg">{{ msg }}</p>
          <div class="actions">
            <button class="primary" :disabled="busy" @click="doSave">☁ 保存当前进度到云端</button>
            <button :disabled="busy" @click="doLoad">⬇ 读取云端存档</button>
            <button @click="doSignOut">退出登录</button>
            <button @click="$emit('close')">关闭</button>
          </div>
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref } from 'vue'
import { cloud, saveCloudConfig, signUp, signIn, signOut, cloudSave, cloudLoad } from '../engine/cloud'
import { serializeState, restoreState } from '../store'

const emit = defineEmits(['close'])
const cfg = ref({ url: cloud.url, anonKey: cloud.anonKey })
const email = ref('')
const password = ref('')
const busy = ref(false)
const msg = ref('')
const cloudTime = ref('')

function saveCfg() {
  if (!cfg.value.url || !cfg.value.anonKey) { msg.value = '请填写完整'; return }
  saveCloudConfig(cfg.value.url, cfg.value.anonKey)
}

function resetCfg() {
  saveCloudConfig('', '')
  cloud.token = null
}

async function guard(fn) {
  busy.value = true
  msg.value = ''
  try { await fn() } catch (e) { msg.value = e.message } finally { busy.value = false }
}

const doSignIn = () => guard(async () => { await signIn(email.value, password.value) })
const doSignUp = () => guard(async () => {
  const r = await signUp(email.value, password.value)
  if (r.needConfirm) msg.value = '注册成功，请先到邮箱点击验证链接后再登录'
})
const doSignOut = () => { signOut(); msg.value = '' }

const doSave = () => guard(async () => {
  await cloudSave(serializeState())
  msg.value = '已保存到云端'
})
const doLoad = () => guard(async () => {
  const row = await cloudLoad()
  if (!row) { msg.value = '云端还没有存档'; return }
  cloudTime.value = new Date(row.updated_at).toLocaleString()
  if (restoreState(row.data)) {
    msg.value = '已恢复云端存档'
    setTimeout(() => emit('close'), 800)
  } else msg.value = '存档数据损坏'
})
</script>

<style scoped>
.mask { position: fixed; inset: 0; background: rgba(0,0,0,.6); display: flex; align-items: center; justify-content: center; z-index: 100; }
.modal { width: 520px; max-width: 92vw; max-height: 85vh; overflow-y: auto; }
h2 { margin: 0 0 12px; font-size: 16px; }
.dim { color: var(--text-dim); font-size: 13px; line-height: 1.6; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 14px; }
.msg { color: var(--bad); font-size: 13px; }
.sql-box { margin-top: 10px; }
.sql-box summary { cursor: pointer; font-size: 13px; color: var(--accent); }
.sql-box pre { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 10px; font-size: 12px; overflow-x: auto; }
</style>
