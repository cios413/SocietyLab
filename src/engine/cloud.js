/**
 * 云端存档：基于 Supabase REST/Auth 接口（零依赖）。
 * 用户需在 login 弹窗中填入自己 Supabase 项目的 URL 和 anon key。
 * 建表 SQL（在 Supabase SQL 编辑器执行一次）：
 *   create table saves (
 *     user_id uuid primary key references auth.users,
 *     data jsonb,
 *     updated_at timestamptz default now()
 *   );
 *   alter table saves enable row level security;
 *   create policy "own" on saves for all
 *     using (auth.uid() = user_id) with check (auth.uid() = user_id);
 */

const CONF_KEY = 'society-sim-cloud'

export const cloud = {
  url: '', anonKey: '',
  token: null, email: null, userId: null,
  get loggedIn() { return !!this.token }
}

// 载入持久化的配置与会话
try {
  const saved = JSON.parse(localStorage.getItem(CONF_KEY) || 'null')
  if (saved) Object.assign(cloud, saved)
} catch (e) { /* ignore */ }

function persist() {
  localStorage.setItem(CONF_KEY, JSON.stringify({
    url: cloud.url, anonKey: cloud.anonKey,
    token: cloud.token, email: cloud.email, userId: cloud.userId
  }))
}

export function saveCloudConfig(url, anonKey) {
  cloud.url = url.replace(/\/$/, '')
  cloud.anonKey = anonKey
  persist()
}

function authHeaders() {
  return {
    'Content-Type': 'application/json',
    'apikey': cloud.anonKey,
    'Authorization': `Bearer ${cloud.token || cloud.anonKey}`
  }
}

async function authCall(path, body) {
  const resp = await fetch(`${cloud.url}/auth/v1/${path}`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(body)
  })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error_description || data.msg || data.message || `请求失败 ${resp.status}`)
  return data
}

export async function signUp(email, password) {
  const data = await authCall('signup', { email, password })
  // 关闭邮箱验证时直接返回 access_token；开启时需要用户去邮箱点确认
  if (data.access_token) setSession(data)
  return { needConfirm: !data.access_token }
}

export async function signIn(email, password) {
  const data = await authCall('token?grant_type=password', { email, password })
  setSession(data)
}

function setSession(data) {
  cloud.token = data.access_token
  cloud.userId = data.user?.id
  cloud.email = data.user?.email
  persist()
}

export function signOut() {
  cloud.token = null
  cloud.userId = null
  cloud.email = null
  persist()
}

/** 保存到云端（按用户 upsert 单条存档） */
export async function cloudSave(stateJson) {
  const resp = await fetch(`${cloud.url}/rest/v1/saves`, {
    method: 'POST',
    headers: { ...authHeaders(), 'Prefer': 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: cloud.userId, data: JSON.parse(stateJson), updated_at: new Date().toISOString() })
  })
  if (!resp.ok) throw new Error(`云端保存失败 ${resp.status}：${await resp.text()}`)
}

/** 读取云端存档，无存档时返回 null */
export async function cloudLoad() {
  const resp = await fetch(`${cloud.url}/rest/v1/saves?user_id=eq.${cloud.userId}&select=data,updated_at`, {
    headers: authHeaders()
  })
  if (!resp.ok) throw new Error(`云端读取失败 ${resp.status}`)
  const rows = await resp.json()
  return rows.length ? rows[0] : null
}
