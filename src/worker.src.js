/**
 * ============================================================================
 *  InstaBot — automação de Direct e comentários para Instagram
 *  Roda de graça no Cloudflare Workers, usando só a API oficial da Meta.
 * ============================================================================
 *
 *  O que precisa estar configurado no Worker (o wrangler.jsonc já cria sozinho):
 *    • Binding D1  com o nome  DB      → banco de dados (automações, contatos, registro)
 *    • Binding KV  com o nome  MEDIA   → imagens que você envia pelo painel
 *  A senha do painel é criada no primeiro acesso a /admin
 *  (ou, se preferir, defina o segredo ADMIN_PASSWORD na Cloudflare).
 *
 *  Painel:  https://SEU-WORKER.workers.dev/admin
 *  Webhook: https://SEU-WORKER.workers.dev/webhook
 */

const GRAPH_VERSION = 'v23.0';
const GRAPH = 'https://graph.instagram.com/' + GRAPH_VERSION; // conexão "login do Instagram" (token IG…)
const FB_GRAPH = 'https://graph.facebook.com/' + GRAPH_VERSION; // conexão "login do Facebook" (token EAA…, via Página)
const FB_PAGE_FIELDS = [['messages', 'messaging_postbacks', 'messaging_referrals', 'feed'], ['messages', 'messaging_postbacks'], ['messages'], ['feed']];
const FB_REQUIRED_SCOPES = ['instagram_basic', 'instagram_manage_messages', 'instagram_manage_comments'];
const SUBSCRIBE_FIELDS = ['comments', 'messages', 'messaging_postbacks', 'messaging_referral'];
const TRIGGERS = ['comment', 'dm_keyword', 'welcome', 'ref_link', 'story_reply', 'story_mention', 'default', 'manual'];
const DAY = 864e5;

const PANEL_HTML = __PANEL_HTML__;

export default {
  async fetch(request, env, ctx) {
    try {
      return await route(request, env, ctx);
    } catch (e) {
      console.error(e);
      return json({ error: 'Erro interno: ' + ((e && e.message) || e) }, 500);
    }
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(maintenance(env));
  },
};

// ---------------------------------------------------------------------------
// Roteamento
// ---------------------------------------------------------------------------
async function route(request, env, ctx) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const method = request.method;

  if (path === '/') return Response.redirect(url.origin + '/admin', 302);
  if (path === '/admin') return html(PANEL_HTML);
  if (path.startsWith('/media/') && (method === 'GET' || method === 'HEAD')) return serveMedia(path.slice(7), env);
  if (path === '/privacidade' || path === '/exclusao') return legalPage(path, env);
  if (path === '/oauth/callback') return oauthCallback(env, url);

  if (path === '/webhook') {
    if (!env.DB) return text('Banco D1 não configurado (binding DB).', 500);
    await ensureSchema(env);
    const s = await getSettings(env);
    if (method === 'GET') return webhookVerify(url, env, s);
    if (method === 'POST') return webhookReceive(request, env, ctx, s, url.origin);
    return text('Método não permitido', 405);
  }

  if (path.startsWith('/api/')) return api(request, env, ctx, url, path.slice(5), method);
  return text('Não encontrado', 404);
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------
const now = () => Date.now();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rid = (n = 12) => {
  let out = '';
  while (out.length < n) out += crypto.randomUUID().replace(/-/g, '');
  return out.slice(0, n);
};
const clip = (t, n) => {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const bytes = (s) => new TextEncoder().encode(s || '').length;

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}
function text(t, status = 200) {
  return new Response(t, { status, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
function html(h, status = 200) {
  return new Response(h, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-frame-options': 'DENY',
      'referrer-policy': 'no-referrer',
    },
  });
}
function escHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** Normaliza texto para comparar palavras-chave: minúsculas, sem acentos, sem pontuação. */
function norm(t) {
  return String(t || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\p{Extended_Pictographic}]+/gu, ' ')
    .trim();
}

function keywordMatch(trigger, message) {
  const kws = (trigger.keywords || []).map(norm).filter(Boolean);
  if (!kws.length) return true; // sem palavra-chave = qualquer mensagem
  const t = norm(message);
  if (!t) return false;
  const mode = trigger.match || 'word';
  return kws.some((k) => {
    if (mode === 'exact') return t === k;
    if (mode === 'partial') return t.replace(/ /g, '').includes(k.replace(/ /g, '')) || t.includes(k);
    return (' ' + t + ' ').includes(' ' + k + ' ');
  });
}

function render(t, vars = {}, isUrl = false) {
  if (!t) return '';
  return String(t).replace(/\{(nome|primeiro_nome|username|usuario)\}/gi, (_, k) => {
    k = k.toLowerCase();
    let v;
    if (k === 'nome') v = vars.name || vars.username || '';
    else if (k === 'primeiro_nome') v = (vars.name || '').trim().split(/\s+/)[0] || vars.username || '';
    else v = vars.username || '';
    return isUrl ? encodeURIComponent(v) : v;
  });
}

function splitText(t, max = 1000) {
  if (bytes(t) <= max) return [t];
  const out = [];
  let cur = '';
  for (const line of t.split('\n')) {
    const cand = cur ? cur + '\n' + line : line;
    if (bytes(cand) <= max) {
      cur = cand;
      continue;
    }
    if (cur) out.push(cur);
    if (bytes(line) <= max) {
      cur = line;
      continue;
    }
    cur = '';
    for (const ch of Array.from(line)) {
      if (bytes(cur + ch) > max) {
        out.push(cur);
        cur = ch;
      } else cur += ch;
    }
  }
  if (cur) out.push(cur);
  return out;
}

async function hmacHex(key, data) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = await crypto.subtle.sign('HMAC', k, payload);
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function safeEqual(a, b) {
  a = String(a);
  b = String(b);
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
function getCookie(req, name) {
  const h = req.headers.get('cookie') || '';
  for (const part of h.split(/;\s*/)) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i) === name) return decodeURIComponent(part.slice(i + 1));
  }
  return null;
}
async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}

// ---------------------------------------------------------------------------
// Banco de dados
// ---------------------------------------------------------------------------
let schemaReady = false;
async function ensureSchema(env) {
  if (schemaReady) return;
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT)'),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS automations (id TEXT PRIMARY KEY, pos INTEGER DEFAULT 0, data TEXT NOT NULL, runs INTEGER DEFAULT 0, last_run INTEGER, created_at INTEGER, updated_at INTEGER)'
    ),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS media (id TEXT PRIMARY KEY, name TEXT, mime TEXT, size INTEGER, created_at INTEGER)'),
    env.DB.prepare(
      'CREATE TABLE IF NOT EXISTS contacts (id TEXT PRIMARY KEY, username TEXT, name TEXT, source TEXT, first_seen INTEGER, last_seen INTEGER, first_dm INTEGER, last_bot INTEGER, last_default INTEGER, interactions INTEGER DEFAULT 0)'
    ),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS once_sent (auto_id TEXT, user_key TEXT, ts INTEGER, PRIMARY KEY (auto_id, user_key))'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS processed (id TEXT PRIMARY KEY, ts INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS logs (id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER, level TEXT, msg TEXT, data TEXT)'),
  ]);
  schemaReady = true;
}

async function getSettings(env) {
  const { results } = await env.DB.prepare('SELECT k, v FROM settings').all();
  const s = {};
  for (const r of results) s[r.k] = r.v;
  if (!s.verify_token || !s.session_secret) {
    await env.DB.batch([
      env.DB.prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)').bind('verify_token', 'ib_' + rid(24)),
      env.DB.prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)').bind('session_secret', rid(48)),
    ]);
    return getSettings(env);
  }
  return s;
}

async function setSettings(env, obj) {
  const stmts = Object.entries(obj).map(([k, v]) =>
    v === null || v === undefined
      ? env.DB.prepare('DELETE FROM settings WHERE k = ?').bind(k)
      : env.DB.prepare('INSERT INTO settings (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v').bind(k, String(v))
  );
  if (stmts.length) await env.DB.batch(stmts);
}

async function log(env, level, msg, data) {
  try {
    const d = data === undefined || data === null ? null : (typeof data === 'string' ? data : JSON.stringify(data)).slice(0, 4000);
    await env.DB.prepare('INSERT INTO logs (ts, level, msg, data) VALUES (?, ?, ?, ?)').bind(now(), level, String(msg).slice(0, 1000), d).run();
  } catch (e) {
    console.error('Falha ao gravar registro', e);
  }
}

async function markProcessed(env, key) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO processed (id, ts) VALUES (?, ?)').bind(key, now()).run();
  return ((r.meta && r.meta.changes) || 0) > 0;
}
async function markOnce(env, autoId, userKey) {
  const r = await env.DB.prepare('INSERT OR IGNORE INTO once_sent (auto_id, user_key, ts) VALUES (?, ?, ?)').bind(autoId, String(userKey), now()).run();
  return ((r.meta && r.meta.changes) || 0) > 0;
}
async function bumpRuns(env, id) {
  await env.DB.prepare('UPDATE automations SET runs = COALESCE(runs, 0) + 1, last_run = ? WHERE id = ?').bind(now(), id).run();
}

async function maintenance(env) {
  if (!env.DB) return;
  await ensureSchema(env);
  const s = await getSettings(env);
  await refreshToken(env, s, false);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM processed WHERE ts < ?').bind(now() - 7 * DAY),
    env.DB.prepare('DELETE FROM logs WHERE id <= (SELECT id FROM logs ORDER BY id DESC LIMIT 1 OFFSET 1500)'),
  ]);
}

// ---------------------------------------------------------------------------
// Automações: limpeza/validação dos dados vindos do painel
// ---------------------------------------------------------------------------
const str = (v, max) => (typeof v === 'string' ? v : v === undefined || v === null ? '' : String(v)).slice(0, max);

function cleanUrl(u) {
  u = str(u, 1500).trim();
  if (u && !/^https?:\/\//i.test(u)) u = 'https://' + u;
  return u;
}
function cleanButtons(list) {
  return (Array.isArray(list) ? list : [])
    .slice(0, 3)
    .map((b) => {
      b = b || {};
      return b.type === 'flow'
        ? { type: 'flow', title: str(b.title, 20).trim(), target: str(b.target, 40) || 'self' }
        : { type: 'url', title: str(b.title, 20).trim(), url: cleanUrl(b.url) };
    })
    .filter((b) => b.title && (b.type === 'flow' || b.url));
}
function cleanMsg(m) {
  m = m || {};
  switch (m.type) {
    case 'text':
      return { type: 'text', text: str(m.text, 2000), buttons: cleanButtons(m.buttons) };
    case 'image':
      return { type: 'image', media_id: str(m.media_id, 40), media_ext: str(m.media_ext, 5), url: m.url ? cleanUrl(m.url) : '' };
    case 'card':
      return {
        type: 'card',
        title: str(m.title, 80),
        subtitle: str(m.subtitle, 80),
        media_id: str(m.media_id, 40),
        media_ext: str(m.media_ext, 5),
        url: m.url ? cleanUrl(m.url) : '',
        buttons: cleanButtons(m.buttons),
      };
    case 'quick':
      return {
        type: 'quick',
        text: str(m.text, 1000),
        options: (Array.isArray(m.options) ? m.options : [])
          .slice(0, 13)
          .map((o) => ({ title: str(o && o.title, 20).trim(), target: str(o && o.target, 40) }))
          .filter((o) => o.title),
      };
    case 'delay':
      return { type: 'delay', seconds: Math.min(10, Math.max(1, Math.round(Number(m.seconds) || 2))) };
  }
  return null;
}
function cleanAutomation(a, id) {
  a = a || {};
  const t = a.trigger || {};
  const type = TRIGGERS.includes(t.type) ? t.type : 'comment';
  const opening = a.opening || {};
  return {
    id: id || 'a' + rid(10),
    name: str(a.name, 80).trim() || 'Sem nome',
    enabled: a.enabled !== false,
    trigger: {
      type,
      keywords: (Array.isArray(t.keywords) ? t.keywords : [])
        .map((k) => str(k, 100).trim())
        .filter(Boolean)
        .slice(0, 60),
      match: ['word', 'partial', 'exact'].includes(t.match) ? t.match : 'word',
      posts: (Array.isArray(t.posts) ? t.posts : [])
        .filter((p) => p && p.id)
        .slice(0, 100)
        .map((p) => ({ id: str(p.id, 40), caption: str(p.caption, 120), thumb: str(p.thumb, 1500), permalink: str(p.permalink, 300) })),
      ref: str(t.ref, 60)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, ''),
    },
    once_per_user: !!a.once_per_user,
    public_replies: (Array.isArray(a.public_replies) ? a.public_replies : [])
      .map((r) => str(r, 2000).trim())
      .filter(Boolean)
      .slice(0, 30),
    opening: { text: str(opening.text, 2000), buttons: cleanButtons(opening.buttons) },
    messages: (Array.isArray(a.messages) ? a.messages : []).slice(0, 40).map(cleanMsg).filter(Boolean),
  };
}

async function loadAutomations(env) {
  const { results } = await env.DB.prepare('SELECT id, data, runs, last_run FROM automations ORDER BY pos ASC, created_at ASC').all();
  const out = [];
  for (const r of results) {
    try {
      const a = cleanAutomation(JSON.parse(r.data), r.id);
      a.runs = r.runs || 0;
      a.last_run = r.last_run || null;
      out.push(a);
    } catch (e) {
      console.error('Automação inválida', r.id, e);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// API do Instagram (Graph API)
// ---------------------------------------------------------------------------
async function ig(s, method, path, params = {}, body) {
  const u = new URL(path.startsWith('http') ? path : (s.api_mode === 'fb' ? FB_GRAPH : GRAPH) + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.searchParams.set(k, v);
  if (s.ig_token) u.searchParams.set('access_token', s.ig_token);
  const init = { method, headers: {} };
  if (body) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  let res, data;
  try {
    res = await fetch(u.toString(), init);
    data = await res.json().catch(() => ({}));
  } catch (e) {
    return { ok: false, error: 'Falha de rede: ' + ((e && e.message) || e) };
  }
  if (!res.ok || (data && data.error)) {
    const er = (data && data.error) || {};
    return {
      ok: false,
      status: res.status,
      code: er.code,
      sub: er.error_subcode,
      error: er.error_user_msg || er.message || 'HTTP ' + res.status,
    };
  }
  return { ok: true, data };
}

function explain(r) {
  if (!r || r.ok) return '';
  let hint = '';
  const m = String(r.error || '').toLowerCase();
  if (r.code === 190) hint = ' → token expirado ou inválido: gere um novo na Meta e conecte de novo em Configurações.';
  else if (r.sub === 2534022 || m.includes('window') || m.includes('janela')) hint = ' → fora da janela de 24h (a pessoa precisa interagir de novo).';
  else if (r.code === 100 && r.sub === 33) hint = ' → a conta do Instagram não está liberada para este app/token (no login unificado: confira se a conta foi escolhida no login e se a configuração tem as permissões certas).';
  else if (r.code === 10 || r.code === 200 || m.includes('permission')) hint = ' → falta permissão no app da Meta ou "Permitir acesso às mensagens" está desligado no Instagram.';
  else if (r.code === 551 || m.includes('not available')) hint = ' → essa pessoa não pode receber mensagens agora.';
  else if (r.code === 4 || r.code === 613 || m.includes('limit')) hint = ' → limite de envio da Meta atingido, tente mais tarde.';
  return (r.code ? '[' + r.code + (r.sub ? '/' + r.sub : '') + '] ' : '') + r.error + hint;
}
const isWindowError = (r) => r && (r.sub === 2534022 || /window/i.test(r.error || ''));

// Login do Facebook clássico: mensagens saem pela Página. Login do Instagram / unificado: pela própria conta.
const messagesPath = (s) => '/' + (s.api_mode === 'fb' && s.fb_page_id ? s.fb_page_id : s.ig_user_id || 'me') + '/messages';
function sendMessage(s, recipient, message) {
  return ig(s, 'POST', messagesPath(s), {}, { recipient, message });
}
function senderAction(s, id, action) {
  return ig(s, 'POST', messagesPath(s), {}, { recipient: { id }, sender_action: action });
}

async function subscribeWebhooks(s) {
  const fb = s.api_mode === 'fb' && !!s.fb_page_id; // via Página
  const unified = s.api_mode === 'fb' && !s.fb_page_id; // login unificado (sem Página)
  const tries = fb ? FB_PAGE_FIELDS : [SUBSCRIBE_FIELDS, ['comments', 'messages', 'messaging_postbacks'], ['comments', 'messages']];
  const path = fb ? '/' + s.fb_page_id + '/subscribed_apps' : unified ? '/' + s.ig_user_id + '/subscribed_apps' : '/me/subscribed_apps';
  let last;
  for (const f of tries) {
    const r = await ig(s, 'POST', path, { subscribed_fields: f.join(',') });
    if (r.ok) return { ok: true, fields: f };
    last = r;
  }
  if (fb) return { ok: false, manual: true, error: 'Conectado pela Página, mas sem a permissão pages_manage_metadata o Instagram NÃO avisa o bot sobre comentários e mensagens. Solução: conecte pela "Opção A · Conectar com a Meta" (login unificado), que não precisa dessa permissão. Detalhe técnico: ' + (last && last.error ? last.error : '') };
  if (unified) return { ok: false, manual: true, error: 'O bot não conseguiu inscrever a conta sozinho (pode ser normal no login unificado). Confira na Meta, em "3. Configurar webhooks", se os campos comments, messages, messaging_postbacks e messaging_referral estão assinados. Detalhe técnico: ' + explain(last) };
  return { ok: false, error: explain(last) };
}

/** Conecta usando um token do Facebook (de usuário, Página ou usuário do sistema). */
async function connectFacebook(s, token, secret) {
  const t = { ig_token: token, api_mode: 'fb' };
  const me = await ig(t, 'GET', '/me', { fields: 'id,name' });
  if (!me.ok) return { error: 'O Facebook não aceitou esse token: ' + explain(me) };
  const notes = [];
  const igFields = 'instagram_business_account{id,username,name,profile_picture_url}';
  const pageList = (tok) => ig({ ig_token: tok, api_mode: 'fb' }, 'GET', '/me/accounts', { fields: 'id,name,access_token,' + igFields, limit: '100' });
  let pages = [];
  let acc = await pageList(token);
  if (acc.ok) {
    // Token de usuário com Páginas: troca por um de longa duração para que o token da Página não expire.
    const hasPages = (acc.data.data || []).some((p) => p.instagram_business_account);
    if (secret && hasPages) {
      const app = await ig(t, 'GET', '/app', { fields: 'id' });
      const ex = app.ok && app.data.id
        ? await ig(t, 'GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: app.data.id, client_secret: secret, fb_exchange_token: token })
        : app;
      if (ex.ok && ex.data.access_token) {
        const acc2 = await pageList(ex.data.access_token);
        if (acc2.ok) acc = acc2;
      } else notes.push('Não consegui transformar em token permanente (' + explain(ex) + '). A chave secreta não confere com este app: copie a "Chave secreta do aplicativo" em Configurações do app → Básico (não a chave do Instagram).');
    }
    pages = (acc.data.data || []).filter((p) => p.instagram_business_account);
  } else {
    // Provavelmente já é um token de Página.
    const pg = await ig(t, 'GET', '/' + me.data.id, { fields: 'id,name,' + igFields });
    if (pg.ok && pg.data.instagram_business_account) pages = [{ id: pg.data.id, name: pg.data.name, access_token: token, instagram_business_account: pg.data.instagram_business_account }];
  }
  if (!pages.length) {
    // Login unificado / usuário do sistema: o token dá acesso direto à conta do Instagram, sem Página.
    const dbg0 = await ig(t, 'GET', '/debug_token', { input_token: token });
    const d0 = dbg0.ok && dbg0.data && dbg0.data.data ? dbg0.data.data : {};
    const ids = [...new Set((d0.granular_scopes || []).filter((g) => /^instagram/.test(g.scope || '')).flatMap((g) => g.target_ids || []))];
    if (!ids.length) {
      const asg = await ig(t, 'GET', '/me/assigned_instagram_accounts', { fields: 'id' });
      if (asg.ok) for (const x of asg.data.data || []) if (x && x.id) ids.push(String(x.id));
    }
    let direct = null;
    let lastErr = null;
    for (const id of ids) {
      const a = await ig(t, 'GET', '/' + id, { fields: 'id,username,name,profile_picture_url' });
      if (a.ok && a.data && a.data.id) {
        if (!direct || String(a.data.username || '').toLowerCase() === String(s.ig_username || '').toLowerCase()) direct = a.data;
      } else lastErr = a;
    }
    if (direct) {
      if (Array.isArray(d0.scopes)) {
        const missing = FB_REQUIRED_SCOPES.filter((x) => !d0.scopes.includes(x));
        if (missing.length) notes.push('Faltam permissões no token: ' + missing.join(', ') + '. Adicione na configuração do app e conecte de novo.');
      }
      if (d0.expires_at) notes.push('Este token expira em ' + new Date(d0.expires_at * 1000).toLocaleDateString('pt-BR') + '.');
      return {
        ok: true,
        notes,
        settings: {
          api_mode: 'fb',
          ig_token: token,
          ig_user_id: String(direct.id),
          ig_app_scoped_id: '',
          ig_username: direct.username || '',
          ig_name: direct.name || '',
          ig_picture: direct.profile_picture_url || '',
          fb_page_id: null,
          fb_page_name: null,
          token_updated_at: now(),
          token_expires_at: d0.expires_at ? d0.expires_at * 1000 : dbg0.ok ? 0 : '',
          token_refresh_tried: null,
        },
      };
    }
    return {
      error:
        'Não encontrei a sua conta do Instagram nesse token.' +
        (lastErr ? ' A Meta respondeu: ' + explain(lastErr) : '') +
        ' Confira: (1) ao fazer login/gerar o token você escolheu a sua conta do Instagram (e a Página, se pedir); (2) as permissões instagram_basic, instagram_manage_messages e instagram_manage_comments estão na configuração.',
    };
  }
  const want = String(s.ig_username || '').toLowerCase();
  const page = pages.find((p) => String(p.instagram_business_account.username || '').toLowerCase() === want) || pages[0];
  const igAcc = page.instagram_business_account;
  const dbg = await ig({ ig_token: page.access_token, api_mode: 'fb' }, 'GET', '/debug_token', { input_token: page.access_token });
  const info = dbg.ok && dbg.data && dbg.data.data ? dbg.data.data : null;
  if (info && Array.isArray(info.scopes)) {
    const missing = FB_REQUIRED_SCOPES.filter((x) => !info.scopes.includes(x));
    if (missing.length) notes.push('Faltam permissões no token: ' + missing.join(', ') + '. Adicione no app da Meta e gere o token de novo.');
  }
  if (info && info.expires_at) notes.push('Este token expira em ' + new Date(info.expires_at * 1000).toLocaleDateString('pt-BR') + '. Cole a chave secreta do aplicativo ao conectar para ele não expirar.');
  if (pages.length > 1) notes.push('Encontrei ' + pages.length + ' Páginas com Instagram; usei @' + igAcc.username + '.');
  return {
    ok: true,
    notes,
    settings: {
      api_mode: 'fb',
      ig_token: page.access_token,
      ig_user_id: String(igAcc.id),
      ig_app_scoped_id: '',
      ig_username: igAcc.username || '',
      ig_name: igAcc.name || page.name || '',
      ig_picture: igAcc.profile_picture_url || '',
      fb_page_id: String(page.id),
      fb_page_name: page.name || '',
      token_updated_at: now(),
      token_expires_at: info ? (info.expires_at ? info.expires_at * 1000 : 0) : '',
      token_refresh_tried: null,
    },
  };
}

async function refreshToken(env, s, force) {
  if (!s.ig_token) return { ok: false, error: 'Instagram não conectado' };
  if (s.api_mode === 'fb') return { ok: true, skipped: true, error: force ? 'Conexão pelo Facebook: o token da Página não precisa ser renovado.' : undefined };
  const t = now();
  const age = t - Number(s.token_updated_at || 0);
  if (!force) {
    if (age < 5 * DAY) return { ok: true, skipped: true };
    if (t - Number(s.token_refresh_tried || 0) < 6 * 3600e3) return { ok: true, skipped: true };
  }
  await setSettings(env, { token_refresh_tried: t });
  const r = await ig(s, 'GET', 'https://graph.instagram.com/refresh_access_token', { grant_type: 'ig_refresh_token' });
  if (!r.ok || !r.data.access_token) {
    await log(env, 'erro', 'Não consegui renovar o token do Instagram. Se continuar, gere um token novo na Meta.', explain(r));
    return { ok: false, error: explain(r) };
  }
  await setSettings(env, { ig_token: r.data.access_token, token_updated_at: now(), token_expires_in: r.data.expires_in || '' });
  s.ig_token = r.data.access_token;
  await log(env, 'info', 'Token do Instagram renovado automaticamente ✅');
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Montagem das mensagens
// ---------------------------------------------------------------------------
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/gif': 'gif' };
function imageUrl(m, c) {
  if (m.media_id) return c.origin + '/media/' + m.media_id + '.' + (m.media_ext || 'jpg');
  return m.url || '';
}
const resolveTarget = (t, c) => (!t || t === 'self' ? c.autoId : t);

function buttonsPayload(list, c) {
  return (list || []).slice(0, 3).map((b) =>
    b.type === 'flow'
      ? { type: 'postback', title: b.title, payload: 'RUN:' + resolveTarget(b.target, c) }
      : { type: 'web_url', url: render(b.url, c.vars, true), title: b.title }
  );
}

function buttonTemplate(t, btns) {
  return { attachment: { type: 'template', payload: { template_type: 'button', text: t || '👇', buttons: btns } } };
}

function textPayloads(t, buttons, c) {
  const btns = buttonsPayload(buttons, c);
  if (!t.trim() && !btns.length) return [];
  if (btns.length) {
    if (t.length <= 640) return [buttonTemplate(t, btns)];
    return [...splitText(t, 1000).map((p) => ({ text: p })), buttonTemplate('👇', btns)];
  }
  return splitText(t, 1000).map((p) => ({ text: p }));
}

function buildPayloads(m, c) {
  switch (m.type) {
    case 'text':
      return textPayloads(render(m.text, c.vars), m.buttons, c);
    case 'image': {
      const url = imageUrl(m, c);
      return url ? [{ attachment: { type: 'image', payload: { url } } }] : [];
    }
    case 'card': {
      const el = { title: render(m.title, c.vars) || '✨' };
      if (m.subtitle) el.subtitle = render(m.subtitle, c.vars);
      const img = imageUrl(m, c);
      if (img) el.image_url = img;
      const btns = buttonsPayload(m.buttons, c);
      if (btns.length) el.buttons = btns;
      return [{ attachment: { type: 'template', payload: { template_type: 'generic', elements: [el] } } }];
    }
    case 'quick': {
      const opts = (m.options || []).slice(0, 13).map((o) => ({
        content_type: 'text',
        title: o.title,
        payload: o.target ? 'RUN:' + resolveTarget(o.target, c) : 'QR:' + o.title,
      }));
      const t = render(m.text, c.vars) || '👇';
      return [opts.length ? { text: t, quick_replies: opts } : { text: t }];
    }
  }
  return [];
}

/** Versão só-texto de uma mensagem com botões (usada se o Instagram recusar o formato). */
function fallbackPayload(p) {
  const a = p.attachment;
  if (p.quick_replies) return { text: p.text };
  if (!a || a.type !== 'template') return null;
  const links = (btns) => (btns || []).filter((b) => b.type === 'web_url').map((b) => b.title + ': ' + b.url);
  let parts = [];
  if (a.payload.template_type === 'button') parts = [a.payload.text, ...links(a.payload.buttons)];
  else if (a.payload.template_type === 'generic') {
    const el = a.payload.elements[0] || {};
    parts = [el.title, el.subtitle, ...links(el.buttons)];
  }
  const t = parts.filter((x) => x && x !== '👇').join('\n\n');
  return t ? { text: splitText(t, 1000)[0] } : null;
}

async function sendWithFallback(s, recipient, payload, notes) {
  const r = await sendMessage(s, recipient, payload);
  if (r.ok || isWindowError(r) || r.code === 190) return r;
  const alt = fallbackPayload(payload);
  if (!alt) return r;
  const r2 = await sendMessage(s, recipient, alt);
  if (r2.ok) notes.push('Formato com botões recusado (' + explain(r) + '), enviado como texto.');
  return r2.ok ? r2 : r;
}

async function runMessages(env, s, auto, recipientId, vars, origin) {
  const c = { autoId: auto.id, origin, vars };
  const res = { sent: 0, failed: 0, errors: [] };
  let budget = 20000; // o Worker pode continuar trabalhando ~30s depois de responder à Meta
  for (const m of auto.messages || []) {
    if (m.type === 'delay') {
      const ms = Math.min(10, Math.max(1, m.seconds || 1)) * 1000;
      if (ms > budget) continue;
      budget -= ms;
      await senderAction(s, recipientId, 'typing_on');
      await sleep(ms);
      continue;
    }
    for (const p of buildPayloads(m, c)) {
      const r = await sendWithFallback(s, { id: recipientId }, p, res.errors);
      if (r.ok) res.sent++;
      else {
        res.failed++;
        res.errors.push(explain(r));
        if (isWindowError(r) || r.code === 190) return res;
      }
      await sleep(300);
    }
  }
  return res;
}

function openingPayload(auto, c) {
  const t = render(auto.opening.text, c.vars);
  const btns = buttonsPayload(auto.opening.buttons, c);
  if (btns.length) return buttonTemplate(t.length > 640 ? t.slice(0, 639) + '…' : t, btns);
  return { text: splitText(t, 1000)[0] };
}

// ---------------------------------------------------------------------------
// Webhook
// ---------------------------------------------------------------------------
async function webhookVerify(url, env, s) {
  const mode = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const challenge = url.searchParams.get('hub.challenge') || '';
  if (mode === 'subscribe' && token && safeEqual(token, s.verify_token)) {
    await setSettings(env, { webhook_verified_at: now() });
    await log(env, 'ok', 'Webhook verificado pela Meta ✅');
    return text(challenge);
  }
  await log(env, 'aviso', 'A Meta tentou verificar o webhook com um token errado. Copie o "Token de verificação" do painel.');
  return text('Token de verificação inválido', 403);
}

async function validSignature(buf, header, secrets) {
  if (!header || !header.startsWith('sha256=')) return false;
  const got = header.slice(7).toLowerCase();
  for (const sec of secrets) if (safeEqual(got, await hmacHex(sec, buf))) return true;
  return false;
}

async function webhookReceive(request, env, ctx, s, origin) {
  const buf = await request.arrayBuffer();
  if (s.app_secret) {
    const secrets = s.app_secret
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    if (!(await validSignature(buf, request.headers.get('x-hub-signature-256'), secrets))) {
      ctx.waitUntil(
        log(env, 'erro', 'Evento ignorado: assinatura inválida. Confira se a "Chave secreta do app" nas Configurações é a do app do Instagram (ou apague o campo para desativar a checagem).')
      );
      return text('ok');
    }
  }
  let body;
  try {
    body = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return text('JSON inválido', 400);
  }
  ctx.waitUntil(
    processWebhook(env, s, body, origin).catch((e) => log(env, 'erro', 'Erro ao processar evento: ' + ((e && e.message) || e), String((e && e.stack) || '').slice(0, 1500)))
  );
  return text('EVENT_RECEIVED');
}

async function processWebhook(env, s, body, origin) {
  await setSettings(env, { last_event_at: now() });
  if (body.object !== 'instagram') {
    await log(env, 'info', 'Evento recebido de outro tipo: ' + body.object, body);
    return;
  }
  if (s.bot_enabled === '0') return;
  if (!s.ig_token) {
    await log(env, 'aviso', 'Evento recebido, mas o Instagram ainda não foi conectado no painel.');
    return;
  }
  await refreshToken(env, s, false);
  for (const entry of body.entry || []) {
    for (const ch of entry.changes || []) {
      if (ch.field === 'comments' || ch.field === 'live_comments') await handleComment(env, s, ch.value || {}, origin);
      else await log(env, 'info', 'Evento recebido (ainda não usado pelo bot): ' + ch.field, ch.value);
    }
    for (const ev of entry.messaging || []) await handleMessaging(env, s, ev, origin);
  }
  if (Math.random() < 0.05) await maintenance(env);
}

function isSelf(s, id, username) {
  if (id && (String(id) === String(s.ig_user_id) || String(id) === String(s.ig_app_scoped_id))) return true;
  if (username && s.ig_username && String(username).toLowerCase() === String(s.ig_username).toLowerCase()) return true;
  return false;
}

async function handleComment(env, s, v, origin) {
  const commentId = v.id;
  if (!commentId) return;
  const from = v.from || {};
  const msgText = v.text || '';
  const mediaId = v.media && v.media.id;
  if (isSelf(s, from.id, from.username)) return; // ignora os próprios comentários (inclusive as respostas do bot)
  if (!(await markProcessed(env, 'c:' + commentId))) return; // a Meta às vezes reenvia o mesmo evento

  const who = from.username ? '@' + from.username : from.id || 'alguém';
  if (from.id) {
    const t = now();
    await env.DB.prepare(
      `INSERT INTO contacts (id, username, source, first_seen, last_seen, interactions) VALUES (?1, ?2, 'comentário', ?3, ?3, 1)
       ON CONFLICT(id) DO UPDATE SET username = COALESCE(?2, username), last_seen = ?3, interactions = interactions + 1`
    )
      .bind(String(from.id), from.username || null, t)
      .run();
  }

  const autos = (await loadAutomations(env)).filter((a) => a.enabled && a.trigger.type === 'comment');
  // automações de posts específicos têm prioridade sobre as de "todos os posts"
  const ordered = [...autos.filter((a) => a.trigger.posts.length), ...autos.filter((a) => !a.trigger.posts.length)];
  const auto = ordered.find((a) => (!a.trigger.posts.length || a.trigger.posts.some((p) => p.id === mediaId)) && keywordMatch(a.trigger, msgText));
  if (!auto) {
    await log(env, 'info', `Comentário de ${who} sem automação correspondente: "${clip(msgText, 80)}"`);
    return;
  }
  if (auto.once_per_user && !(await markOnce(env, auto.id, from.id || from.username || commentId))) {
    await log(env, 'info', `${who} já recebeu "${auto.name}" antes — ignorado (configurado para 1 vez por pessoa).`);
    return;
  }

  const vars = { username: from.username || '', name: '' };
  const c = { autoId: auto.id, origin, vars };
  const notes = [];
  let dmOk = null;
  let pubOk = null;

  if (auto.opening.text.trim() || auto.opening.buttons.length) {
    const r = await sendWithFallback(s, { comment_id: commentId }, openingPayload(auto, c), notes);
    dmOk = r.ok;
    if (!r.ok) notes.push('DM: ' + explain(r));
    else if (from.id) await env.DB.prepare('UPDATE contacts SET last_bot = ? WHERE id = ?').bind(now(), String(from.id)).run();
  }
  if (auto.public_replies.length) {
    const r = await ig(s, 'POST', '/' + commentId + '/replies', { message: render(pick(auto.public_replies), vars) });
    pubOk = r.ok;
    if (!r.ok) notes.push('Resposta no comentário: ' + explain(r));
  }

  await bumpRuns(env, auto.id);
  const failedAll = dmOk === false && pubOk !== true;
  const level = failedAll ? 'erro' : dmOk === false || pubOk === false ? 'aviso' : 'ok';
  const done = [dmOk ? 'DM enviada' : null, pubOk ? 'comentário respondido' : null].filter(Boolean).join(' + ');
  await log(env, level, `Comentário de ${who}: "${clip(msgText, 60)}" → ${auto.name}${done ? ' · ' + done : ''}`, notes.length ? notes.join(' | ') : undefined);
}

async function touchContact(env, s, id) {
  const t = now();
  const row = await env.DB.prepare('SELECT * FROM contacts WHERE id = ?').bind(id).first();
  const isNewDm = !row || !row.first_dm;
  let username = (row && row.username) || null;
  let name = (row && row.name) || null;
  if (!username || !name) {
    const p = await ig(s, 'GET', '/' + id, { fields: 'name,username' });
    if (p.ok) {
      username = p.data.username || username;
      name = p.data.name || name;
    }
  }
  await env.DB.prepare(
    `INSERT INTO contacts (id, username, name, source, first_seen, last_seen, first_dm, interactions) VALUES (?1, ?2, ?3, 'direct', ?4, ?4, ?4, 1)
     ON CONFLICT(id) DO UPDATE SET username = COALESCE(?2, username), name = COALESCE(?3, name), last_seen = ?4, first_dm = COALESCE(first_dm, ?4), interactions = interactions + 1`
  )
    .bind(id, username, name, t)
    .run();
  return { contact: { ...(row || {}), id, username, name }, isNewDm };
}

async function handleMessaging(env, s, ev, origin) {
  const msg = ev.message;
  const pb = ev.postback;
  if (msg && (msg.is_echo || msg.is_deleted || msg.is_unsupported)) return;
  if (!msg && !pb && !ev.referral) return; // leitura, reação, edição etc.
  const senderId = ev.sender && ev.sender.id ? String(ev.sender.id) : '';
  if (!senderId || isSelf(s, senderId)) return;

  const mid = (msg && msg.mid) || (pb && pb.mid);
  if (mid) {
    if (!(await markProcessed(env, 'm:' + mid))) return;
  } else if (ev.referral) {
    const key = 'r:' + senderId + ':' + (ev.referral.ref || '') + ':' + Math.floor((ev.timestamp || now()) / 60000);
    if (!(await markProcessed(env, key))) return;
  }

  const msgText = (msg && msg.text) || '';
  const { contact, isNewDm } = await touchContact(env, s, senderId);
  const who = contact.username ? '@' + contact.username : senderId;
  const vars = { username: contact.username || '', name: contact.name || '' };

  // Pedido de exclusão de dados (exigência da Meta / LGPD)
  if (/^(excluir|apagar|deletar) (os )?(meus )?dados$/.test(norm(msgText))) {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM contacts WHERE id = ?').bind(senderId),
      env.DB.prepare('DELETE FROM once_sent WHERE user_key = ?').bind(senderId),
    ]);
    await sendMessage(s, { id: senderId }, { text: 'Pronto! Seus dados foram apagados do nosso sistema de mensagens automáticas. ✅' });
    await log(env, 'info', `${who} pediu exclusão de dados — apagado.`);
    return;
  }

  const autos = await loadAutomations(env);
  const enabled = autos.filter((a) => a.enabled);
  const payload = (pb && pb.payload) || (msg && msg.quick_reply && msg.quick_reply.payload) || '';
  const ref = (ev.referral && ev.referral.ref) || (pb && pb.referral && pb.referral.ref) || (msg && msg.referral && msg.referral.ref) || '';
  const atts = (msg && msg.attachments) || [];
  let auto = null;
  let why = '';

  if (payload.startsWith('RUN:')) {
    auto = autos.find((a) => a.id === payload.slice(4)) || null;
    why = 'clicou em "' + clip((pb && pb.title) || msgText || 'botão', 30) + '"';
    if (!auto) await log(env, 'aviso', `${who} clicou num botão que aponta para uma automação que não existe mais.`);
  }
  if (!auto && ref) {
    auto = enabled.find((a) => a.trigger.type === 'ref_link' && a.trigger.ref === norm(ref).replace(/ /g, '')) || null;
    if (!auto) auto = enabled.find((a) => a.trigger.type === 'ref_link' && a.trigger.ref.toLowerCase() === String(ref).toLowerCase()) || null;
    why = 'abriu o link (ref=' + clip(ref, 30) + ')';
  }
  if (!auto && atts.some((x) => x && x.type === 'story_mention')) {
    auto = enabled.find((a) => a.trigger.type === 'story_mention') || null;
    why = 'te mencionou num story';
  }
  if (!auto && msg && msg.reply_to && msg.reply_to.story) {
    auto = enabled.find((a) => a.trigger.type === 'story_reply' && keywordMatch(a.trigger, msgText)) || null;
    why = 'respondeu seu story';
  }
  if (!auto && msgText && !payload.startsWith('RUN:')) {
    auto = enabled.find((a) => a.trigger.type === 'dm_keyword' && a.trigger.keywords.length && keywordMatch(a.trigger, msgText)) || null;
    why = 'mandou "' + clip(msgText, 40) + '"';
  }
  const recentBot = contact.last_bot && now() - contact.last_bot < 10 * 60e3;
  if (!auto && isNewDm && !recentBot && !payload) {
    auto = enabled.find((a) => a.trigger.type === 'welcome') || null;
    why = 'mandou a primeira mensagem';
  }
  if (!auto && !recentBot && !payload && (msgText || atts.length) && (!contact.last_default || now() - contact.last_default > DAY)) {
    auto = enabled.find((a) => a.trigger.type === 'default') || null;
    why = 'mandou mensagem (resposta padrão)';
    if (auto) await env.DB.prepare('UPDATE contacts SET last_default = ? WHERE id = ?').bind(now(), senderId).run();
  }
  if (!auto) return;

  if (auto.once_per_user && !(await markOnce(env, auto.id, senderId))) {
    await log(env, 'info', `${who} já recebeu "${auto.name}" antes — ignorado (1 vez por pessoa).`);
    return;
  }

  const res = await runMessages(env, s, auto, senderId, vars, origin);
  await env.DB.prepare('UPDATE contacts SET last_bot = ? WHERE id = ?').bind(now(), senderId).run();
  await bumpRuns(env, auto.id);
  const level = res.failed ? (res.sent ? 'aviso' : 'erro') : 'ok';
  await log(env, level, `${who} ${why} → ${auto.name} · ${res.sent} mensagem(ns) enviada(s)`, res.errors.length ? res.errors.join(' | ') : undefined);
}

// ---------------------------------------------------------------------------
// Imagens (armazenadas no KV "MEDIA")
// ---------------------------------------------------------------------------
async function serveMedia(name, env) {
  const id = String(name).replace(/\.[a-z0-9]{2,5}$/i, '');
  if (!env.MEDIA || !/^[a-z0-9]{6,40}$/i.test(id)) return text('Não encontrado', 404);
  const obj = await env.MEDIA.getWithMetadata(id, { type: 'stream' });
  if (!obj || !obj.value) return text('Não encontrado', 404);
  return new Response(obj.value, {
    headers: {
      'content-type': (obj.metadata && obj.metadata.mime) || 'image/jpeg',
      'cache-control': 'public, max-age=31536000, immutable',
      'access-control-allow-origin': '*',
    },
  });
}

// ---------------------------------------------------------------------------
// Páginas exigidas pela Meta
// ---------------------------------------------------------------------------
async function legalPage(path, env) {
  let user = 'esta conta';
  try {
    if (env.DB) {
      await ensureSchema(env);
      const s = await getSettings(env);
      if (s.ig_username) user = '@' + s.ig_username;
    }
  } catch {}
  const u = escHtml(user);
  const isPrivacy = path === '/privacidade';
  const body = isPrivacy
    ? `<h1>Política de Privacidade</h1>
<p>Este aplicativo é usado exclusivamente pela conta do Instagram <b>${u}</b> para responder automaticamente mensagens no Direct e comentários.</p>
<h2>Quais dados usamos</h2>
<ul><li>Identificador e nome de usuário do Instagram de quem interage com a conta;</li><li>Texto de mensagens e comentários enviados para a conta;</li><li>Data e hora das interações.</li></ul>
<h2>Para que usamos</h2>
<p>Somente para enviar as respostas automáticas solicitadas pela própria pessoa (por exemplo, ao comentar uma palavra-chave) e para registro interno de atendimento.</p>
<h2>Compartilhamento</h2>
<p>Não vendemos nem compartilhamos esses dados com terceiros. Os dados ficam armazenados em infraestrutura da Cloudflare e são processados por meio da API oficial da Meta.</p>
<h2>Exclusão</h2>
<p>Para apagar seus dados, envie a mensagem <b>EXCLUIR MEUS DADOS</b> no Direct de ${u}. A exclusão é automática. Veja também a página <a href="/exclusao">Exclusão de dados</a>.</p>`
    : `<h1>Exclusão de dados</h1>
<p>Para apagar todos os seus dados do sistema de mensagens automáticas de <b>${u}</b>:</p>
<ol><li>Abra o Direct do Instagram de ${u};</li><li>Envie a mensagem <b>EXCLUIR MEUS DADOS</b>;</li><li>Você receberá uma confirmação automática de que seus dados foram apagados.</li></ol>
<p>Se preferir, envie o pedido por mensagem e a exclusão será feita manualmente em até 30 dias.</p>`;
  return html(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${isPrivacy ? 'Política de Privacidade' : 'Exclusão de dados'}</title>
<style>body{font:16px/1.6 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:720px;margin:0 auto;padding:32px 16px;color:#1d1d24;background:#fff}h1{font-size:26px}h2{font-size:18px;margin-top:28px}a{color:#c13584}</style></head><body>${body}<p style="margin-top:40px;color:#777;font-size:13px">Atualizado em ${new Date().getFullYear()}.</p></body></html>`);
}

// ---------------------------------------------------------------------------
// Conexão: finalização comum e login pela Meta (OAuth)
// ---------------------------------------------------------------------------
async function finishConnect(env, upd, notes) {
  await setSettings(env, upd);
  const s2 = await getSettings(env);
  const sub = await subscribeWebhooks(s2);
  const via = s2.api_mode === 'fb' ? (s2.fb_page_id ? ` (via Página do Facebook "${s2.fb_page_name}")` : ' (login unificado da Meta)') : '';
  const details = [sub.ok ? 'Eventos assinados: ' + sub.fields.join(', ') : sub.error, ...notes].join(' | ');
  await log(env, sub.ok && !notes.length ? 'ok' : 'aviso', `Instagram conectado: @${s2.ig_username}${via}`, details);
  return { ok: true, account: accountInfo(s2), subscribe: sub, notes };
}

async function oauthCallback(env, url) {
  if (!env.DB) return text('Banco D1 não configurado (binding DB).', 500);
  await ensureSchema(env);
  const s = await getSettings(env);
  const back = (q) => Response.redirect(url.origin + '/admin?' + q + '#settings', 302);
  const fail = async (msg) => {
    await log(env, 'erro', 'Conexão pelo login da Meta falhou: ' + msg);
    return back('oauth_error=' + encodeURIComponent(msg));
  };
  const metaErr = url.searchParams.get('error_description') || url.searchParams.get('error_message') || url.searchParams.get('error_reason') || url.searchParams.get('error');
  if (metaErr) return fail('a Meta respondeu: ' + metaErr);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state') || '';
  const [st, ts] = String(s.oauth_state || '').split(':');
  if (!code || !st || !safeEqual(state, st) || now() - Number(ts) > 30 * 60e3) return fail('link de login inválido ou expirado. Clique em "Conectar com a Meta" de novo no painel.');
  await setSettings(env, { oauth_state: null });
  if (!s.app_secret || !s.oauth_app_id) return fail('falta a chave secreta do aplicativo. Cole ela no painel e tente de novo.');
  const ex = await ig({ api_mode: 'fb' }, 'GET', '/oauth/access_token', { client_id: s.oauth_app_id, client_secret: s.app_secret, redirect_uri: url.origin + '/oauth/callback', code });
  if (!ex.ok || !ex.data.access_token) return fail('a Meta não liberou o token: ' + explain(ex) + ' (confira a chave secreta e se o URL de redirecionamento foi salvo na Meta).');
  const fb = await connectFacebook(s, ex.data.access_token, s.app_secret);
  if (!fb.ok) return fail(fb.error);
  const res = await finishConnect(env, fb.settings, fb.notes);
  return back('connected=1' + (res.subscribe.ok ? '' : '&sub=0'));
}

// ---------------------------------------------------------------------------
// API do painel
// ---------------------------------------------------------------------------
// A senha pode vir do segredo ADMIN_PASSWORD (Cloudflare) ou ser criada no primeiro acesso ao painel.
const sessionKey = (env, s) => s.session_secret + '|' + (env.ADMIN_PASSWORD || s.admin_hash || '');
const sessionCookie = (token) => `ib_session=${token}; Path=/; Max-Age=${30 * 86400}; HttpOnly; Secure; SameSite=Strict`;
async function makeSession(env, s) {
  const exp = now() + 30 * DAY;
  return exp + '.' + (await hmacHex(sessionKey(env, s), 'sess.' + exp));
}
async function checkSession(request, env, s) {
  if (!env.ADMIN_PASSWORD && !s.admin_hash) return false;
  const c = getCookie(request, 'ib_session');
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < now()) return false;
  return safeEqual(sig, await hmacHex(sessionKey(env, s), 'sess.' + exp));
}
async function hashPassword(pw, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new TextEncoder().encode(salt), iterations: 10000 }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function newPasswordHash(pw) {
  const salt = rid(24);
  return salt + ':' + (await hashPassword(pw, salt));
}
async function checkPassword(env, s, pw) {
  pw = String(pw || '');
  if (env.ADMIN_PASSWORD) return safeEqual(await hmacHex('pw', pw), await hmacHex('pw', env.ADMIN_PASSWORD));
  if (!s.admin_hash) return false;
  const [salt, hash] = s.admin_hash.split(':');
  return safeEqual(await hashPassword(pw, salt), hash || '');
}

function accountInfo(s) {
  if (!s.ig_token) return null;
  return {
    id: s.ig_user_id,
    username: s.ig_username,
    name: s.ig_name,
    picture: s.ig_picture,
    token_updated_at: Number(s.token_updated_at || 0),
    mode: s.api_mode === 'fb' ? 'fb' : 'ig',
    page_name: s.fb_page_name || '',
    unified: s.api_mode === 'fb' && !s.fb_page_id,
    token_expires_at: s.token_expires_at === '' || s.token_expires_at === undefined ? null : Number(s.token_expires_at),
  };
}

async function api(request, env, ctx, url, r, method) {
  if (!env.DB) return json({ error: 'setup', detail: 'O banco de dados D1 ainda não foi ligado ao Worker. Crie o binding com o nome DB (veja o guia).' }, 503);
  await ensureSchema(env);
  const s = await getSettings(env);
  const origin = url.origin;
  const needsSetup = !env.ADMIN_PASSWORD && !s.admin_hash;

  if (method !== 'GET' && request.headers.get('x-ib') !== '1') return json({ error: 'Requisição inválida' }, 400);

  if (r === 'setup' && method === 'POST') {
    if (!needsSetup) return json({ error: 'A senha do painel já foi criada. Entre com ela.' }, 400);
    const b = await readJson(request);
    const pw = String(b.password || '');
    if (pw.length < 8) return json({ error: 'Use pelo menos 8 caracteres.' }, 400);
    const v = await newPasswordHash(pw);
    const res = await env.DB.prepare('INSERT OR IGNORE INTO settings (k, v) VALUES (?, ?)').bind('admin_hash', v).run();
    if (!res.meta.changes) return json({ error: 'A senha do painel já foi criada. Entre com ela.' }, 400);
    s.admin_hash = v;
    await log(env, 'ok', 'Senha do painel criada.');
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env, s)) });
  }
  if (r === 'login' && method === 'POST') {
    if (needsSetup) return json({ error: 'auth', setup: true }, 401);
    const b = await readJson(request);
    if (!(await checkPassword(env, s, b.password))) {
      await sleep(800);
      return json({ error: 'Senha incorreta' }, 401);
    }
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env, s)) });
  }
  if (r === 'logout' && method === 'POST') {
    return json({ ok: true }, 200, { 'set-cookie': 'ib_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict' });
  }
  if (!(await checkSession(request, env, s))) return json({ error: 'auth', setup: needsSetup }, 401);

  if (r === 'password' && method === 'POST') {
    if (env.ADMIN_PASSWORD) return json({ error: 'A senha está definida na Cloudflare (segredo ADMIN_PASSWORD). Troque por lá.' }, 400);
    const b = await readJson(request);
    if (!(await checkPassword(env, s, b.current))) {
      await sleep(800);
      return json({ error: 'Senha atual incorreta.' }, 400);
    }
    const pw = String(b.password || '');
    if (pw.length < 8) return json({ error: 'A nova senha precisa ter pelo menos 8 caracteres.' }, 400);
    s.admin_hash = await newPasswordHash(pw);
    await setSettings(env, { admin_hash: s.admin_hash });
    await log(env, 'info', 'Senha do painel alterada.');
    return json({ ok: true }, 200, { 'set-cookie': sessionCookie(await makeSession(env, s)) });
  }

  // ---- estado geral
  if (r === 'state' && method === 'GET') {
    const automations = await loadAutomations(env);
    const cnt = await env.DB.prepare('SELECT COUNT(*) AS n FROM contacts').first();
    return json({
      account: accountInfo(s),
      origin,
      webhook_url: origin + '/webhook',
      verify_token: s.verify_token,
      app_secret_set: !!s.app_secret,
      bot_enabled: s.bot_enabled !== '0',
      media_enabled: !!env.MEDIA,
      password_in_cloudflare: !!env.ADMIN_PASSWORD,
      webhook_verified_at: Number(s.webhook_verified_at || 0),
      last_event_at: Number(s.last_event_at || 0),
      privacy_url: origin + '/privacidade',
      oauth_redirect_url: origin + '/oauth/callback',
      oauth_login_url: s.oauth_login_url || '',
      deletion_url: origin + '/exclusao',
      subscribe_fields: SUBSCRIBE_FIELDS,
      contacts: (cnt && cnt.n) || 0,
      automations,
    });
  }

  // ---- automações
  if (r === 'automations' && method === 'POST') {
    const a = cleanAutomation(await readJson(request));
    const mx = await env.DB.prepare('SELECT COALESCE(MAX(pos), 0) AS m FROM automations').first();
    await env.DB.prepare('INSERT INTO automations (id, pos, data, runs, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)')
      .bind(a.id, ((mx && mx.m) || 0) + 1, JSON.stringify(a), now(), now())
      .run();
    return json(a);
  }
  if (r === 'automations/reorder' && method === 'POST') {
    const b = await readJson(request);
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).slice(0, 500);
    if (ids.length) await env.DB.batch(ids.map((id, i) => env.DB.prepare('UPDATE automations SET pos = ? WHERE id = ?').bind(i + 1, id)));
    return json({ ok: true });
  }
  let m = r.match(/^automations\/([\w-]{1,40})$/);
  if (m) {
    const id = m[1];
    if (method === 'PUT') {
      const a = cleanAutomation(await readJson(request), id);
      const res = await env.DB.prepare('UPDATE automations SET data = ?, updated_at = ? WHERE id = ?').bind(JSON.stringify(a), now(), id).run();
      if (!res.meta.changes) return json({ error: 'Automação não encontrada' }, 404);
      return json(a);
    }
    if (method === 'DELETE') {
      await env.DB.batch([
        env.DB.prepare('DELETE FROM automations WHERE id = ?').bind(id),
        env.DB.prepare('DELETE FROM once_sent WHERE auto_id = ?').bind(id),
      ]);
      return json({ ok: true });
    }
  }

  // ---- imagens
  if (r === 'media' && method === 'GET') {
    const { results } = await env.DB.prepare('SELECT id, name, mime, size, created_at FROM media ORDER BY created_at DESC LIMIT 500').all();
    return json({ items: results.map((x) => ({ ...x, ext: EXT[x.mime] || 'jpg', url: origin + '/media/' + x.id + '.' + (EXT[x.mime] || 'jpg') })) });
  }
  if (r === 'media' && method === 'POST') {
    if (!env.MEDIA) return json({ error: 'O armazenamento de imagens ainda não foi ligado ao Worker (binding KV com o nome MEDIA).' }, 400);
    const mime = (request.headers.get('content-type') || '').split(';')[0].trim();
    if (!EXT[mime]) return json({ error: 'Formato não suportado. Use JPG, PNG ou GIF.' }, 400);
    const buf = await request.arrayBuffer();
    if (!buf.byteLength) return json({ error: 'Arquivo vazio' }, 400);
    if (buf.byteLength > 8 * 1024 * 1024) return json({ error: 'Imagem maior que 8 MB (limite do Instagram).' }, 400);
    const id = rid(16);
    let name = 'imagem';
    try {
      name = decodeURIComponent(request.headers.get('x-filename') || 'imagem').slice(0, 120);
    } catch {}
    await env.MEDIA.put(id, buf, { metadata: { mime, name } });
    await env.DB.prepare('INSERT INTO media (id, name, mime, size, created_at) VALUES (?, ?, ?, ?, ?)').bind(id, name, mime, buf.byteLength, now()).run();
    return json({ id, name, mime, size: buf.byteLength, ext: EXT[mime], url: origin + '/media/' + id + '.' + EXT[mime] });
  }
  m = r.match(/^media\/([a-z0-9]{6,40})$/i);
  if (m && method === 'DELETE') {
    if (env.MEDIA) await env.MEDIA.delete(m[1]);
    await env.DB.prepare('DELETE FROM media WHERE id = ?').bind(m[1]).run();
    return json({ ok: true });
  }

  // ---- posts do Instagram (para escolher em quais posts a automação vale)
  if (r === 'posts' && method === 'GET') {
    if (!s.ig_token) return json({ error: 'Conecte o Instagram primeiro (Configurações).' }, 400);
    const res = await ig(s, 'GET', '/' + (s.api_mode === 'fb' ? s.ig_user_id : 'me') + '/media', {
      fields: 'id,caption,media_type,media_product_type,thumbnail_url,media_url,permalink,timestamp',
      limit: '30',
      after: url.searchParams.get('after') || undefined,
    });
    if (!res.ok) return json({ error: explain(res) }, 400);
    const p = res.data.paging || {};
    return json({ items: res.data.data || [], after: p.next && p.cursors ? p.cursors.after : null });
  }

  // ---- contatos
  if (r === 'contacts' && method === 'GET') {
    const q = (url.searchParams.get('q') || '').trim();
    const all = url.searchParams.get('all') === '1';
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
    const limit = all ? 20000 : 100;
    const where = q ? 'WHERE username LIKE ?1 OR name LIKE ?1' : '';
    const stmt = env.DB.prepare(`SELECT * FROM contacts ${where} ORDER BY last_seen DESC LIMIT ${limit} OFFSET ${offset}`);
    const { results } = q ? await stmt.bind('%' + q + '%').all() : await stmt.all();
    const total = await (q ? env.DB.prepare(`SELECT COUNT(*) AS n FROM contacts ${where}`).bind('%' + q + '%') : env.DB.prepare('SELECT COUNT(*) AS n FROM contacts')).first();
    return json({ items: results, total: (total && total.n) || 0 });
  }

  // ---- registro (logs)
  if (r === 'logs' && method === 'GET') {
    const before = Number(url.searchParams.get('before')) || 0;
    const stmt = before
      ? env.DB.prepare('SELECT * FROM logs WHERE id < ? ORDER BY id DESC LIMIT 100').bind(before)
      : env.DB.prepare('SELECT * FROM logs ORDER BY id DESC LIMIT 100');
    const { results } = await stmt.all();
    return json({ items: results });
  }
  if (r === 'logs' && method === 'DELETE') {
    await env.DB.prepare('DELETE FROM logs').run();
    return json({ ok: true });
  }

  // ---- configurações
  if (r === 'settings' && method === 'POST') {
    const b = await readJson(request);
    const upd = {};
    if ('app_secret' in b) upd.app_secret = String(b.app_secret || '').trim() || null;
    if ('bot_enabled' in b) upd.bot_enabled = b.bot_enabled ? '1' : '0';
    if ('regen_verify' in b && b.regen_verify) upd.verify_token = 'ib_' + rid(24);
    await setSettings(env, upd);
    return json({ ok: true });
  }
  if (r === 'connect' && method === 'POST') {
    const b = await readJson(request);
    const token = String(b.token || '').replace(/\s+/g, '');
    if (token.length < 20) return json({ error: 'Cole o token de acesso completo.' }, 400);
    const secret = String(b.secret || '').trim();
    let upd = null;
    let notes = [];
    let igError = null;
    if (!token.startsWith('EAA')) {
      // Token do "login do Instagram" (graph.instagram.com)
      const me = await ig({ ig_token: token }, 'GET', '/me', { fields: 'user_id,username,name,profile_picture_url,account_type' });
      if (me.ok) {
        const d = me.data;
        upd = {
          api_mode: 'ig',
          ig_token: token,
          ig_user_id: String(d.user_id || d.id),
          ig_app_scoped_id: String(d.id || ''),
          ig_username: d.username || '',
          ig_name: d.name || '',
          ig_picture: d.profile_picture_url || '',
          fb_page_id: null,
          fb_page_name: null,
          token_updated_at: now(),
          token_expires_at: null,
          token_refresh_tried: null,
        };
      } else igError = me;
    }
    if (!upd) {
      // Token do "login do Facebook" (graph.facebook.com, via Página)
      const fb = await connectFacebook(s, token, secret);
      if (!fb.ok) return json({ error: fb.error + (igError ? ' (Como token do Instagram também não funcionou: ' + explain(igError) + ')' : '') }, 400);
      upd = fb.settings;
      notes = fb.notes;
      if (secret) upd.app_secret = secret; // também serve para conferir a assinatura dos eventos
    }
    return json(await finishConnect(env, upd, notes));
  }
  if (r === 'oauth/start' && method === 'POST') {
    const b = await readJson(request);
    const secret = String(b.secret || '').trim();
    let lu;
    try {
      lu = new URL(String(b.login_url || '').trim());
    } catch {
      return json({ error: 'Cole o "URL de login" completo que aparece na Meta (começa com https://).' }, 400);
    }
    if (lu.protocol !== 'https:' || !/(^|\.)(facebook|instagram)\.com$/i.test(lu.hostname)) return json({ error: 'Esse não parece ser o URL de login da Meta (precisa ser um endereço facebook.com ou instagram.com).' }, 400);
    const appId = lu.searchParams.get('client_id') || lu.searchParams.get('app_id');
    if (!appId) return json({ error: 'Não encontrei o ID do app nesse URL. Copie o "URL de login" inteiro da Meta.' }, 400);
    if (!secret && !s.app_secret) return json({ error: 'Cole também a Chave secreta do aplicativo (Configurações do app → Básico).' }, 400);
    const state = rid(32);
    lu.searchParams.set('redirect_uri', origin + '/oauth/callback');
    lu.searchParams.set('state', state);
    if (!lu.searchParams.get('response_type')) lu.searchParams.set('response_type', 'code');
    await setSettings(env, { oauth_state: state + ':' + now(), oauth_app_id: appId, oauth_login_url: String(b.login_url).trim(), ...(secret ? { app_secret: secret } : {}) });
    return json({ url: lu.toString() });
  }
  if (r === 'disconnect' && method === 'POST') {
    await setSettings(env, { ig_token: null, ig_user_id: null, ig_app_scoped_id: null, ig_username: null, ig_name: null, ig_picture: null, token_updated_at: null, api_mode: null, fb_page_id: null, fb_page_name: null, token_expires_at: null });
    await log(env, 'info', 'Instagram desconectado do painel.');
    return json({ ok: true });
  }
  if (r === 'refresh-token' && method === 'POST') {
    return json(await refreshToken(env, s, true));
  }
  if (r === 'diagnose' && method === 'GET') {
    const checks = [];
    const add = (ok, label, detail) => checks.push({ ok: !!ok, label, detail: detail || '' });
    if (!s.ig_token) {
      add(false, 'Instagram conectado', 'Conecte o Instagram primeiro.');
      return json({ checks });
    }
    const fbMode = s.api_mode === 'fb';
    const acc = await ig(s, 'GET', '/' + (fbMode ? s.ig_user_id : 'me'), { fields: fbMode ? 'id,username' : 'user_id,username' });
    add(acc.ok, 'O token acessa a conta @' + s.ig_username, acc.ok ? '' : explain(acc));
    const saPath = '/' + (fbMode ? s.fb_page_id || s.ig_user_id : 'me') + '/subscribed_apps';
    const sa = await ig(s, 'GET', saPath);
    const saList = sa.ok ? sa.data.data || [] : [];
    add(sa.ok && saList.length > 0, 'A conta está inscrita no app (para receber eventos)', sa.ok ? JSON.stringify(saList) : explain(sa));
    let appId = s.oauth_app_id;
    if (!appId) {
      const a = await ig({ ...s, api_mode: 'fb' }, 'GET', '/app', { fields: 'id' });
      if (a.ok) appId = a.data.id;
    }
    let token = null;
    if (appId && s.app_secret) {
      const at = { api_mode: 'fb', ig_token: appId + '|' + s.app_secret };
      const subs = await ig(at, 'GET', '/' + appId + '/subscriptions');
      if (subs.ok) {
        const insta = (subs.data.data || []).find((x) => x.object === 'instagram');
        const fields = insta ? (insta.fields || []).map((f) => (typeof f === 'string' ? f : f.name)) : [];
        const cbOk = insta && insta.callback_url === origin + '/webhook';
        add(insta && insta.active !== false && cbOk, 'Webhook do Instagram configurado no app', insta ? 'URL: ' + insta.callback_url + ' · ativo: ' + insta.active + (cbOk ? '' : ' · ⚠️ a URL deveria ser ' + origin + '/webhook') : 'Nenhum webhook do Instagram configurado no app.');
        if (insta) {
          const missing = ['comments', 'messages'].filter((f) => !fields.includes(f));
          add(!missing.length, 'Campos assinados no webhook', fields.join(', ') + (missing.length ? ' · faltam: ' + missing.join(', ') : ''));
        }
      } else add(false, 'Ler a configuração de webhook do app', explain(subs));
      const dbg = await ig(at, 'GET', '/debug_token', { input_token: s.ig_token });
      if (dbg.ok && dbg.data && dbg.data.data) {
        const d = dbg.data.data;
        token = { type: d.type, is_valid: d.is_valid, expires_at: d.expires_at, scopes: d.scopes || [], app_id: d.app_id };
        add(d.is_valid, 'Token válido (' + (d.type || '?') + ')', 'Permissões: ' + (d.scopes || []).join(', '));
      }
      const app = await ig(at, 'GET', '/' + appId, { fields: 'name,link' });
      if (app.ok) add(true, 'App da Meta: ' + (app.data.name || appId), 'ID ' + appId);
    } else add(false, 'Ler a configuração de webhook do app', 'Falta a chave secreta do aplicativo ou o ID do app.');
    add(!!s.last_event_at, 'Eventos já recebidos do Instagram', s.last_event_at ? 'Último: ' + new Date(Number(s.last_event_at)).toISOString() : 'Nenhum evento chegou até agora.');
    await log(env, 'info', 'Diagnóstico executado', checks.map((c) => (c.ok ? '✅ ' : '❌ ') + c.label + (c.detail ? ' — ' + c.detail : '')).join('\n'));
    return json({ checks, token, app_id: appId || null });
  }
  if (r === 'fix-webhook' && method === 'POST') {
    let appId = s.oauth_app_id;
    if (!appId) {
      const a = await ig({ ...s, api_mode: 'fb' }, 'GET', '/app', { fields: 'id' });
      if (a.ok) appId = a.data.id;
    }
    if (!appId || !s.app_secret) return json({ error: 'Falta a chave secreta do aplicativo ou o ID do app (conecte pela Opção A).' }, 400);
    const at = { api_mode: 'fb', ig_token: appId + '|' + s.app_secret };
    const tries = [SUBSCRIBE_FIELDS, ['comments', 'messages', 'messaging_postbacks'], ['comments', 'messages']];
    let last;
    for (const f of tries) {
      const res = await ig(at, 'POST', '/' + appId + '/subscriptions', { object: 'instagram', callback_url: origin + '/webhook', verify_token: s.verify_token, fields: f.join(','), include_values: 'true' });
      if (res.ok) {
        await log(env, 'ok', 'Webhook do Instagram configurado automaticamente: ' + f.join(', '));
        return json({ ok: true, fields: f });
      }
      last = res;
    }
    await log(env, 'erro', 'Não consegui configurar o webhook automaticamente', explain(last));
    return json({ error: explain(last) }, 400);
  }
  if (r === 'subscribe' && method === 'POST') {
    if (!s.ig_token) return json({ error: 'Conecte o Instagram primeiro.' }, 400);
    const sub = await subscribeWebhooks(s);
    await log(env, sub.ok ? 'ok' : 'erro', sub.ok ? 'Eventos assinados: ' + sub.fields.join(', ') : 'Falha ao assinar eventos: ' + sub.error);
    return json(sub, sub.ok ? 200 : 400);
  }

  return json({ error: 'Rota não encontrada' }, 404);
}
