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

const PANEL_HTML = "<!doctype html>\n<html lang=\"pt-BR\">\n<head>\n<meta charset=\"utf-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1\">\n<meta name=\"robots\" content=\"noindex, nofollow\">\n<title>InstaBot · Painel</title>\n<style>\n:root{\n  --bg:#f5f5f8;--card:#ffffff;--text:#17171f;--muted:#6c6c7d;--line:#e5e5ee;--soft:#f0f0f5;\n  --accent:#d1307f;--accent-2:#7a3ce0;--accent-soft:#fbe8f2;\n  --ok:#15924a;--ok-soft:#e3f6ea;--warn:#b86a00;--warn-soft:#fff3dc;--err:#d02a2a;--err-soft:#fde8e8;--info:#2463d6;--info-soft:#e6efff;\n  --bubble:#efeff4;--input:#ffffff;--shadow:0 1px 2px rgba(20,20,40,.05),0 6px 20px rgba(20,20,40,.05);\n  --radius:14px;\n}\n@media (prefers-color-scheme:dark){\n  :root{--bg:#0e0e13;--card:#17171f;--text:#ececf2;--muted:#9c9cae;--line:#2a2a37;--soft:#20202a;\n  --accent-soft:#3a1a2c;--ok-soft:#10301d;--warn-soft:#33270f;--err-soft:#3a1616;--info-soft:#14223d;\n  --bubble:#262632;--input:#111118;--shadow:none}\n}\n*{box-sizing:border-box}\nhtml,body{margin:0}\nbody{font:15px/1.45 system-ui,-apple-system,\"Segoe UI\",Roboto,Helvetica,Arial,sans-serif;background:var(--bg);color:var(--text);-webkit-font-smoothing:antialiased}\na{color:var(--accent)}\nh1{font-size:24px;margin:0;letter-spacing:-.01em}\nh2{font-size:18px;margin:0 0 6px}\nh3{font-size:16px;margin:0 0 4px}\np{margin:0 0 10px}\ncode,.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}\nbutton,input,select,textarea{font:inherit;color:inherit}\ninput,select,textarea{width:100%;background:var(--input);border:1px solid var(--line);border-radius:10px;padding:9px 11px;outline:none;transition:border-color .15s,box-shadow .15s}\ninput:focus,select:focus,textarea:focus{border-color:var(--accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--accent) 18%,transparent)}\ntextarea{resize:vertical;min-height:84px;line-height:1.45}\nlabel.lbl{display:block;font-weight:600;font-size:13px;margin:12px 0 5px;color:var(--text)}\nbutton{cursor:pointer;border:1px solid var(--line);background:var(--card);border-radius:10px;padding:8px 14px;font-weight:600;transition:background .15s,transform .05s,border-color .15s}\nbutton:hover{background:var(--soft)}\nbutton:active{transform:translateY(1px)}\nbutton:disabled{opacity:.4;cursor:default}\nbutton.primary{background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;border:0}\nbutton.primary:hover{filter:brightness(1.06)}\nbutton.danger{color:var(--err)}\nbutton.ghost{background:transparent;border-color:transparent}\nbutton.ghost:hover{background:var(--soft)}\nbutton.small{padding:5px 10px;font-size:13px;border-radius:8px}\nbutton.icon{padding:4px 8px;font-size:14px;border-radius:8px;min-width:32px}\n.hint{color:var(--muted);font-size:13px}\n.center{text-align:center}\n.spacer{flex:1}\n.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}\n.grid2{display:grid;grid-template-columns:1fr 1fr;gap:10px}\n@media(max-width:640px){.grid2{grid-template-columns:1fr}}\n\n/* topo */\nheader.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:18px;padding:10px 20px;background:color-mix(in srgb,var(--card) 92%,transparent);backdrop-filter:blur(10px);border-bottom:1px solid var(--line)}\n.brand{font-weight:800;font-size:17px;display:flex;align-items:center;gap:8px;white-space:nowrap}\n.logo{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;color:#fff;background:linear-gradient(135deg,#f9ce34,#ee2a7b 50%,#6228d7);font-size:15px}\nheader nav{display:flex;gap:4px;overflow-x:auto;scrollbar-width:none}\nheader nav a{padding:7px 12px;border-radius:9px;text-decoration:none;color:var(--muted);font-weight:600;white-space:nowrap}\nheader nav a:hover{background:var(--soft);color:var(--text)}\nheader nav a.on{background:var(--accent-soft);color:var(--accent)}\n.acc{margin-left:auto;display:flex;align-items:center;gap:8px;font-weight:600;font-size:14px;white-space:nowrap}\n.acc img{width:28px;height:28px;border-radius:50%;object-fit:cover;background:var(--soft)}\n@media(max-width:760px){header.top{flex-wrap:wrap;gap:8px;padding:10px 12px}.acc{margin-left:auto}header nav{order:3;width:100%}}\nmain{max-width:1100px;margin:0 auto;padding:22px 16px 120px}\n.head-row{display:flex;align-items:center;gap:12px;margin:4px 0 18px;flex-wrap:wrap}\n.head-row h1{flex:1}\n\n.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px;box-shadow:var(--shadow);margin-bottom:16px}\n.banner{padding:12px 14px;border-radius:12px;margin-bottom:14px;font-weight:500}\n.banner.warn{background:var(--warn-soft);color:var(--warn)}\n.banner.info{background:var(--info-soft);color:var(--info)}\n.banner.err{background:var(--err-soft);color:var(--err)}\n.pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:99px;font-size:12px;font-weight:700;background:var(--soft);color:var(--muted)}\n.pill.ok{background:var(--ok-soft);color:var(--ok)}\n.pill.warn{background:var(--warn-soft);color:var(--warn)}\n.pill.err{background:var(--err-soft);color:var(--err)}\n.pill.info{background:var(--info-soft);color:var(--info)}\n\n/* switch */\n.switch{position:relative;display:inline-block;width:42px;height:24px;flex:none}\n.switch input{opacity:0;width:0;height:0;position:absolute}\n.switch span{position:absolute;inset:0;background:var(--line);border-radius:99px;transition:.2s;cursor:pointer}\n.switch span:before{content:\"\";position:absolute;width:18px;height:18px;left:3px;top:3px;background:#fff;border-radius:50%;transition:.2s;box-shadow:0 1px 3px rgba(0,0,0,.25)}\n.switch input:checked+span{background:var(--ok)}\n.switch input:checked+span:before{transform:translateX(18px)}\n\n/* lista de automações */\n.auto-list{display:flex;flex-direction:column;gap:10px}\n.auto{display:flex;align-items:center;gap:14px;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:14px 16px;box-shadow:var(--shadow)}\n.auto.off{opacity:.6}\n.auto-ic{width:42px;height:42px;border-radius:12px;display:grid;place-items:center;font-size:21px;background:var(--accent-soft);flex:none}\n.auto-main{flex:1;min-width:0;cursor:pointer}\n.auto-name{font-weight:700;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.auto-sum{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.auto-stats{font-size:12px;color:var(--muted);margin-top:3px}\n.auto-act{display:flex;gap:4px;align-items:center;flex:none}\n@media(max-width:640px){.auto{flex-wrap:wrap}.auto-act{width:100%;justify-content:flex-end}}\n.empty{text-align:center;padding:40px 20px}\n.empty .big{font-size:44px}\n\n/* modal */\n.overlay{position:fixed;inset:0;background:rgba(10,10,20,.5);z-index:50;display:flex;align-items:flex-start;justify-content:center;padding:5vh 12px;overflow:auto;animation:fade .15s}\n.modal{background:var(--card);border-radius:18px;padding:22px;width:100%;max-width:560px;box-shadow:0 20px 60px rgba(0,0,0,.3)}\n.modal.wide{max-width:860px}\n.modal-foot{display:flex;gap:8px;align-items:center;margin-top:18px}\n@keyframes fade{from{opacity:0}to{opacity:1}}\n.tpl-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}\n@media(max-width:560px){.tpl-grid{grid-template-columns:1fr}}\n.tpl{text-align:left;padding:14px;border-radius:12px;font-weight:400;display:flex;gap:12px;align-items:flex-start}\n.tpl b{display:block;margin-bottom:2px}\n.tpl .ic{font-size:24px;line-height:1}\n.tpl small{color:var(--muted)}\n\n/* editor */\n.editor{display:grid;grid-template-columns:minmax(0,1fr) 340px;gap:20px;align-items:start}\n@media(max-width:960px){.editor{grid-template-columns:1fr}.ed-preview{position:static!important}}\n.ed-preview{position:sticky;top:76px}\n.sec-title{display:flex;align-items:center;gap:10px;margin-bottom:6px}\n.step{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,var(--accent),var(--accent-2));color:#fff;font-weight:800;font-size:13px;display:grid;place-items:center;flex:none}\n.blk{border:1px solid var(--line);border-radius:12px;margin-bottom:10px;background:var(--card)}\n.blk-head{display:flex;align-items:center;justify-content:space-between;padding:8px 10px 8px 14px;border-bottom:1px solid var(--line);background:var(--soft);border-radius:12px 12px 0 0}\n.blk-type{font-weight:700;font-size:14px}\n.blk-ctl{display:flex;gap:2px}\n.blk-body{padding:12px 14px}\n.ta-foot{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:5px;flex-wrap:wrap}\n.vars{font-size:12px;color:var(--muted);display:flex;gap:4px;align-items:center;flex-wrap:wrap}\n.vars button{padding:1px 7px;font-size:12px;border-radius:6px;font-weight:600}\n.count{font-size:12px;color:var(--muted)}\n.count.over{color:var(--err);font-weight:700}\n.btns{margin-top:10px;display:flex;flex-direction:column;gap:8px}\n.btn-row{display:grid;grid-template-columns:178px 150px 1fr 34px;gap:6px;align-items:center}\n.btn-row.opt{grid-template-columns:180px 1fr 34px}\n@media(max-width:700px){.btn-row{grid-template-columns:1fr 1fr 34px}.btn-row>*:nth-child(3){grid-column:1/3}.btn-row.opt{grid-template-columns:1fr 34px}.btn-row.opt>*:nth-child(2){grid-column:1/2}.btn-row.opt>*:nth-child(3){grid-column:2/3;grid-row:1/3}}\n.add-row{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}\n.add-row button{border-style:dashed}\n.imgpick{display:flex;gap:12px;align-items:flex-start}\n.imgpick img,.imgph{width:110px;height:110px;border-radius:10px;object-fit:cover;background:var(--soft);flex:none;display:grid;place-items:center;color:var(--muted);font-size:12px;text-align:center}\n.imgpick-ctl{flex:1;display:flex;flex-direction:column;gap:6px;align-items:flex-start}\n.imgpick-ctl details{width:100%}\n.imgpick-ctl summary{cursor:pointer;font-size:13px;color:var(--muted);margin:2px 0 6px}\n.chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}\n.chip{background:var(--accent-soft);color:var(--accent);border-radius:99px;padding:2px 10px;font-size:12px;font-weight:700}\n.posts-sel{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}\n.posts-sel img{width:56px;height:56px;border-radius:8px;object-fit:cover;background:var(--soft)}\n.seg{display:inline-flex;background:var(--soft);border-radius:10px;padding:3px;gap:3px;flex-wrap:wrap}\n.seg button{border:0;background:transparent;padding:6px 12px;border-radius:8px;font-size:13px}\n.seg button.on{background:var(--card);box-shadow:0 1px 3px rgba(0,0,0,.12);color:var(--accent)}\n.savebar{position:fixed;left:0;right:0;bottom:0;z-index:30;background:color-mix(in srgb,var(--card) 94%,transparent);backdrop-filter:blur(10px);border-top:1px solid var(--line);padding:12px 16px}\n.savebar-in{max-width:1100px;margin:0 auto;display:flex;gap:10px;align-items:center}\n\n/* prévia (celular) */\n.phone{background:var(--card);border:1px solid var(--line);border-radius:28px;padding:10px;box-shadow:var(--shadow)}\n.phone-head{display:flex;align-items:center;gap:8px;padding:6px 8px 10px;border-bottom:1px solid var(--line);font-weight:700;font-size:14px}\n.phone-head img,.phone-head .av{width:26px;height:26px;border-radius:50%;background:linear-gradient(135deg,#f9ce34,#ee2a7b,#6228d7)}\n.pv{padding:12px 6px;display:flex;flex-direction:column;gap:6px;min-height:300px;max-height:68vh;overflow:auto}\n.pv-bot{align-self:flex-start;background:var(--bubble);border-radius:18px 18px 18px 6px;padding:9px 13px;max-width:88%;font-size:14px;word-wrap:break-word;overflow-wrap:anywhere}\n.pv-user{align-self:flex-end;background:linear-gradient(135deg,#7a3ce0,#d1307f);color:#fff;border-radius:18px 18px 6px 18px;padding:9px 13px;max-width:80%;font-size:14px}\n.pv-btn{margin:8px -5px -3px;background:var(--card);border-radius:10px;padding:7px;text-align:center;font-weight:700;font-size:13px}\n.pv-btn+.pv-btn{margin-top:5px}\n.pv-link{color:#3b6fe0;text-decoration:underline}\n.pv-img{align-self:flex-start;max-width:70%}\n.pv-img img{width:100%;border-radius:16px;display:block}\n.pv-card{align-self:flex-start;width:82%;background:var(--bubble);border-radius:16px;overflow:hidden;font-size:14px}\n.pv-card img{width:100%;aspect-ratio:1.91/1;object-fit:cover;display:block;background:var(--soft)}\n.pv-card .pc-b{padding:9px 12px}\n.pv-card .pc-t{font-weight:700}\n.pv-card .pc-s{color:var(--muted);font-size:13px}\n.pv-qr{display:flex;flex-wrap:wrap;gap:5px;justify-content:flex-end}\n.pv-qr span{border:1.5px solid #7a3ce0;color:#7a3ce0;border-radius:99px;padding:4px 11px;font-size:13px;font-weight:600}\n.pv-note{font-size:12px;color:var(--muted);background:var(--soft);border-radius:10px;padding:7px 10px}\n.pv-sep{text-align:center;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em;margin:6px 0}\n.pv-typing{align-self:flex-start;background:var(--bubble);border-radius:18px;padding:10px 14px;display:flex;gap:4px}\n.pv-typing span{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:blink 1.2s infinite}\n.pv-typing span:nth-child(2){animation-delay:.2s}.pv-typing span:nth-child(3){animation-delay:.4s}\n@keyframes blink{0%,80%,100%{opacity:.25}40%{opacity:1}}\n.pv-empty{color:var(--muted);text-align:center;margin:auto;font-size:13px}\n\n/* galeria / posts */\n.gal-grid,.posts-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin-top:12px;max-height:60vh;overflow:auto}\n.gal-item{padding:0;border-radius:12px;overflow:hidden;text-align:left;font-weight:400;display:flex;flex-direction:column;position:relative}\n.gal-item img{width:100%;aspect-ratio:1;object-fit:cover;display:block;background:var(--soft)}\n.gal-item span{font-size:12px;padding:6px 8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--muted)}\n.gal-item .gal-ctl{display:flex;gap:4px;padding:0 6px 6px}\n.post{position:relative;border-radius:12px;overflow:hidden;cursor:pointer;border:3px solid transparent;background:var(--soft)}\n.post.on{border-color:var(--accent)}\n.post.on:after{content:\"✓\";position:absolute;top:6px;right:6px;width:24px;height:24px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:800}\n.post img{width:100%;aspect-ratio:1;object-fit:cover;display:block}\n.post-cap{display:block;font-size:11px;padding:5px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}\n.post-type{position:absolute;top:6px;left:6px;background:rgba(0,0,0,.6);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:6px}\n.upload{display:flex;align-items:center;justify-content:center;border:2px dashed var(--line);border-radius:12px;padding:18px;cursor:pointer;font-weight:600;color:var(--muted)}\n.upload:hover{border-color:var(--accent);color:var(--accent)}\n\n/* tabelas, registro */\n.table-wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:var(--radius)}\ntable{width:100%;border-collapse:collapse;font-size:14px}\nth,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line);white-space:nowrap}\nth{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.03em;background:var(--soft)}\ntr:last-child td{border-bottom:0}\n.search{max-width:360px;margin-bottom:12px}\n.logs{display:flex;flex-direction:column;gap:6px}\n.log{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:10px 12px;display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start}\n.log time{font-size:12px;color:var(--muted);white-space:nowrap}\n.log .msg{grid-column:1/-1;font-size:14px;overflow-wrap:anywhere}\n.log details{grid-column:1/-1}\n.log summary{font-size:12px;color:var(--muted);cursor:pointer}\n.log pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:var(--soft);padding:8px;border-radius:8px;margin:6px 0 0;max-height:300px;overflow:auto}\n\n/* configurações */\n.check{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px dashed var(--line)}\n.check:last-child{border-bottom:0}\n.check .st{width:24px;text-align:center;font-size:17px}\n.check .tx{flex:1}\n.copy{display:flex;gap:6px}\n.copy input{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px}\n.acc-card{display:flex;align-items:center;gap:12px;padding:12px;border-radius:12px;background:var(--soft)}\n.acc-card img{width:48px;height:48px;border-radius:50%;object-fit:cover}\n\n/* login */\n.login{min-height:100vh;display:grid;place-items:center;padding:20px}\n.login .card{width:100%;max-width:380px;text-align:center;padding:30px}\n.login .logo{width:56px;height:56px;font-size:28px;border-radius:16px;margin:0 auto 14px}\n\n#toast{position:fixed;bottom:84px;left:50%;transform:translateX(-50%);z-index:80;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none}\n.toast{background:#1d1d27;color:#fff;padding:10px 16px;border-radius:12px;font-weight:600;box-shadow:0 8px 30px rgba(0,0,0,.25);animation:fade .2s;max-width:90vw}\n.toast.err{background:var(--err)}\n.toast.ok{background:#15924a}\n.spinner{display:inline-block;width:16px;height:16px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .7s linear infinite;vertical-align:-3px}\n@keyframes spin{to{transform:rotate(360deg)}}\n</style>\n</head>\n<body>\n<div id=\"app\"><div class=\"login\"><span class=\"spinner\"></span></div></div>\n<div id=\"toast\"></div>\n<script>\n'use strict';\nconst $ = (s, el = document) => el.querySelector(s);\nconst $$ = (s, el = document) => [...el.querySelectorAll(s)];\nconst app = $('#app');\nconst esc = (s) => String(s ?? '').replace(/[&<>\"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c]));\nconst S = { st: null, autos: [], draft: null, dirty: false, media: null, prevHash: '', skipHash: false };\n\nconst TRIG = {\n  comment: { icon: '💬', label: 'Comentário → Direct', desc: 'Quando alguém comenta uma palavra-chave num post ou reels, o bot responde o comentário e manda uma DM.' },\n  dm_keyword: { icon: '🔑', label: 'Palavra-chave no Direct', desc: 'Quando alguém manda no Direct uma mensagem com a palavra-chave.' },\n  welcome: { icon: '👋', label: 'Boas-vindas', desc: 'Na primeira mensagem que uma pessoa te manda no Direct.' },\n  ref_link: { icon: '🔗', label: 'Link da bio / stories (ig.me)', desc: 'Um link que você coloca na bio ou no story. Quem clica abre seu Direct e recebe a mensagem.' },\n  story_reply: { icon: '📸', label: 'Resposta ao story', desc: 'Quando alguém responde um story seu (pode exigir uma palavra-chave).' },\n  story_mention: { icon: '📣', label: 'Menção no story', desc: 'Quando alguém te marca num story.' },\n  default: { icon: '🤖', label: 'Resposta padrão', desc: 'Quando nenhuma outra automação reconhece a mensagem. No máximo 1 vez a cada 24h por pessoa.' },\n  manual: { icon: '🧩', label: 'Sub-fluxo (botão)', desc: 'Só roda quando a pessoa clica num botão \"Continuar fluxo\" que aponta para ele. Use para criar menus e etapas.' },\n};\nconst BLK = {\n  text: { icon: '📝', label: 'Texto' },\n  image: { icon: '🖼️', label: 'Imagem' },\n  card: { icon: '🃏', label: 'Cartão (imagem + título + botões)' },\n  quick: { icon: '⚡', label: 'Respostas rápidas' },\n  delay: { icon: '⏳', label: 'Pausa (\"digitando…\")' },\n};\n\nfunction newAutomation(type) {\n  const base = { name: TRIG[type].label, enabled: true, trigger: { type, keywords: [], match: 'word', posts: [], ref: '' }, once_per_user: false, public_replies: [], opening: { text: '', buttons: [] }, messages: [] };\n  switch (type) {\n    case 'comment':\n      base.name = 'Comentário → link do grupo';\n      base.trigger.keywords = ['eu quero', 'quero', 'link'];\n      base.public_replies = ['Te mandei no direct! 📩', 'Enviado! Confere seu direct 💌', 'Prontinho, olha o direct ✨'];\n      base.opening = { text: 'Oiee! 🖤✨\\n\\nGRUPO VIP de promoções 🌟👇\\nhttps://\\n\\nQualquer dúvida é só me chamar aqui 💕', buttons: [] };\n      break;\n    case 'dm_keyword':\n      base.name = 'Direct: grupo';\n      base.trigger.keywords = ['grupo'];\n      base.messages = [{ type: 'text', text: 'Oi {primeiro_nome}! 💖 Aqui está o link do grupo 👇', buttons: [{ type: 'url', title: 'ENTRAR NO GRUPO 🛍️', url: '' }] }];\n      break;\n    case 'welcome':\n      base.name = 'Boas-vindas no Direct';\n      base.messages = [{ type: 'text', text: 'Oiee {primeiro_nome}! 💖 Que bom te ver por aqui!\\n\\nEntra no meu grupo VIP de promoções 👇', buttons: [{ type: 'url', title: 'LINK DO GRUPO 🛍️', url: '' }] }];\n      break;\n    case 'ref_link':\n      base.name = 'Link da bio';\n      base.trigger.ref = 'grupo';\n      base.messages = [{ type: 'text', text: 'Oiee! 💖 Aqui está o link do grupo VIP 👇', buttons: [{ type: 'url', title: 'LINK DO GRUPO 🛍️', url: '' }] }];\n      break;\n    case 'story_reply':\n      base.name = 'Resposta ao story';\n      base.messages = [{ type: 'text', text: 'Obrigada por responder meu story! 💖', buttons: [] }];\n      break;\n    case 'story_mention':\n      base.name = 'Menção no story';\n      base.messages = [{ type: 'text', text: 'Ahh obrigada pela menção! 🥰', buttons: [] }];\n      break;\n    case 'default':\n      base.name = 'Resposta padrão';\n      base.messages = [{ type: 'text', text: 'Oi! Recebi sua mensagem e já já te respondo 💖', buttons: [] }];\n      break;\n    case 'manual':\n      base.name = 'Sub-fluxo';\n      base.messages = [{ type: 'text', text: '', buttons: [] }];\n      break;\n  }\n  return base;\n}\nfunction newBlock(type) {\n  if (type === 'text') return { type, text: '', buttons: [] };\n  if (type === 'image') return { type, media_id: '', media_ext: '', url: '' };\n  if (type === 'card') return { type, title: '', subtitle: '', media_id: '', media_ext: '', url: '', buttons: [{ type: 'url', title: 'Ver agora', url: '' }] };\n  if (type === 'quick') return { type, text: 'Escolha uma opção 👇', options: [{ title: 'Opção 1', target: '' }, { title: 'Opção 2', target: '' }] };\n  return { type: 'delay', seconds: 2 };\n}\n\n// ---------------------------------------------------------------- utilidades\nfunction toast(msg, type = '') {\n  const el = document.createElement('div');\n  el.className = 'toast ' + type;\n  el.textContent = msg;\n  $('#toast').appendChild(el);\n  setTimeout(() => el.remove(), type === 'err' ? 6000 : 2800);\n}\nasync function api(path, opts = {}) {\n  const init = { method: opts.method || 'GET', headers: { 'x-ib': '1' }, credentials: 'same-origin' };\n  if (opts.body !== undefined) {\n    if (opts.raw) {\n      init.body = opts.body;\n      init.headers['content-type'] = opts.type;\n      if (opts.filename) init.headers['x-filename'] = encodeURIComponent(opts.filename);\n    } else {\n      init.headers['content-type'] = 'application/json';\n      init.body = JSON.stringify(opts.body);\n    }\n  }\n  const res = await fetch('/api/' + path, init);\n  let data = {};\n  try { data = await res.json(); } catch {}\n  if (res.status === 401 && data.error === 'auth') { showLogin(!!data.setup); throw new Error('auth'); }\n  if (res.status === 503 && data.error === 'setup') { showSetup(data.detail); throw new Error('setup'); }\n  if (!res.ok) throw new Error(data.error || 'Erro ' + res.status);\n  return data;\n}\nfunction ago(ts) {\n  if (!ts) return 'nunca';\n  const s = Math.round((Date.now() - ts) / 1000);\n  if (s < 60) return 'agora mesmo';\n  if (s < 3600) return 'há ' + Math.round(s / 60) + ' min';\n  if (s < 86400) return 'há ' + Math.round(s / 3600) + ' h';\n  return 'há ' + Math.round(s / 86400) + ' dia(s)';\n}\nconst fmtDate = (ts) => (ts ? new Date(ts).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');\nconst bytes = (s) => new TextEncoder().encode(s || '').length;\nfunction getPath(obj, path) { return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj); }\nfunction setPath(obj, path, v) {\n  const ks = path.split('.');\n  let o = obj;\n  for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];\n  o[ks[ks.length - 1]] = v;\n}\nasync function copy(text) {\n  try { await navigator.clipboard.writeText(text); toast('Copiado! ✅', 'ok'); }\n  catch { prompt('Copie o texto abaixo:', text); }\n}\nfunction fill(t, v) {\n  return String(t || '').replace(/\\{(nome|primeiro_nome|username|usuario)\\}/gi, (_, k) => {\n    k = k.toLowerCase();\n    return k === 'nome' ? v.name : k === 'primeiro_nome' ? v.name.split(' ')[0] : v.username;\n  });\n}\nfunction fmtMsg(t) {\n  return esc(t).replace(/(https?:\\/\\/[^\\s<]+|\\b[\\w.-]+\\.(?:com|com\\.br|br|net|me|io|link|ly)(?:\\/[^\\s<]*)?)/g, '<span class=\"pv-link\">$1</span>').replace(/\\n/g, '<br>');\n}\nconst imgSrc = (m) => (m.media_id ? '/media/' + m.media_id + '.' + (m.media_ext || 'jpg') : m.url || '');\n\n// ---------------------------------------------------------------- modais\nfunction modal(inner, cls = '') {\n  const ov = document.createElement('div');\n  ov.className = 'overlay';\n  ov.innerHTML = `<div class=\"modal ${cls}\">${inner}</div>`;\n  document.body.appendChild(ov);\n  const box = ov.firstElementChild;\n  ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeModal(box); });\n  box.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(box); });\n  return box;\n}\nfunction closeModal(box) { if (box && box.parentElement) box.parentElement.remove(); }\ndocument.addEventListener('keydown', (e) => { if (e.key === 'Escape') { const ov = $$('.overlay').pop(); if (ov) ov.remove(); } });\nfunction confirmBox(msg, okLabel = 'Confirmar', danger = false) {\n  return new Promise((resolve) => {\n    const m = modal(`<h2>Tem certeza?</h2><p>${msg}</p><div class=\"modal-foot\"><span class=\"spacer\"></span><button data-close id=\"cb-no\">Cancelar</button><button class=\"${danger ? 'danger' : 'primary'}\" id=\"cb-ok\">${esc(okLabel)}</button></div>`);\n    $('#cb-ok', m).onclick = () => { closeModal(m); resolve(true); };\n    $('#cb-no', m).onclick = () => resolve(false);\n  });\n}\n\n// ---------------------------------------------------------------- login / setup\nfunction showSetupPassword() {\n  S.st = null;\n  app.innerHTML = `<div class=\"login\"><form class=\"card\" id=\"setup-form\">\n    <div class=\"logo\">✦</div><h1>Bem-vinda ao InstaBot!</h1><p class=\"hint\">Primeiro acesso: crie a senha do seu painel.</p>\n    <input type=\"password\" id=\"pw1\" placeholder=\"Nova senha (mín. 8 caracteres)\" autocomplete=\"new-password\" minlength=\"8\" required autofocus>\n    <input type=\"password\" id=\"pw2\" placeholder=\"Repita a senha\" autocomplete=\"new-password\" minlength=\"8\" required style=\"margin-top:8px\">\n    <button class=\"primary\" style=\"width:100%;margin-top:12px\" type=\"submit\">Criar senha e entrar</button>\n    <p class=\"hint\" style=\"margin-top:14px\">Guarde bem essa senha. Ela protege o seu bot.</p>\n  </form></div>`;\n  $('#setup-form').onsubmit = async (e) => {\n    e.preventDefault();\n    if ($('#pw1').value !== $('#pw2').value) return toast('As senhas não são iguais.', 'err');\n    const btn = e.target.querySelector('button');\n    btn.disabled = true;\n    try {\n      await api('setup', { method: 'POST', body: { password: $('#pw1').value } });\n      toast('Senha criada ✅', 'ok');\n      await boot();\n    } catch (err) {\n      if (err.message !== 'auth') toast(err.message, 'err');\n      btn.disabled = false;\n    }\n  };\n}\nfunction showLogin(setup) {\n  if (setup) return showSetupPassword();\n  S.st = null;\n  app.innerHTML = `<div class=\"login\"><form class=\"card\" id=\"login-form\">\n    <div class=\"logo\">✦</div><h1>InstaBot</h1><p class=\"hint\">Entre com a senha do painel</p>\n    <input type=\"password\" id=\"pw\" placeholder=\"Senha\" autocomplete=\"current-password\" required autofocus>\n    <button class=\"primary\" style=\"width:100%;margin-top:12px\" type=\"submit\">Entrar</button>\n    <p class=\"hint\" style=\"margin-top:14px\">É a senha que você criou no primeiro acesso ao painel.</p>\n  </form></div>`;\n  $('#login-form').onsubmit = async (e) => {\n    e.preventDefault();\n    const btn = e.target.querySelector('button');\n    btn.disabled = true;\n    try {\n      await api('login', { method: 'POST', body: { password: $('#pw').value } });\n      await boot();\n    } catch (err) {\n      if (err.message !== 'auth') toast(err.message, 'err');\n      btn.disabled = false;\n    }\n  };\n}\nfunction showSetup(detail) {\n  app.innerHTML = `<div class=\"login\"><div class=\"card\" style=\"max-width:520px;text-align:left\">\n    <div class=\"logo\">✦</div><h1 style=\"text-align:center\">Quase lá!</h1>\n    <div class=\"banner warn\" style=\"margin-top:14px\">${esc(detail)}</div>\n    <p class=\"hint\">Depois de ajustar na Cloudflare, clique em <b>Deploy</b> (ou aguarde alguns segundos) e recarregue esta página.</p>\n    <button class=\"primary\" onclick=\"location.reload()\">Recarregar</button></div></div>`;\n}\n\n// ---------------------------------------------------------------- layout\nconst NAV = [['autos', '⚡ Automações'], ['media', '🖼️ Imagens'], ['contacts', '👥 Contatos'], ['logs', '📋 Registro'], ['settings', '⚙️ Configurações']];\nfunction layout(content) {\n  const acc = S.st.account;\n  const view = (location.hash.slice(1) || 'autos').split('/')[0];\n  const cur = view === 'edit' || view === 'new' ? 'autos' : view;\n  return `<header class=\"top\"><div class=\"brand\"><span class=\"logo\">✦</span> InstaBot</div>\n    <nav>${NAV.map(([k, l]) => `<a href=\"#${k}\" class=\"${cur === k ? 'on' : ''}\">${l}</a>`).join('')}</nav>\n    <div class=\"acc\">${acc ? `${acc.picture ? `<img src=\"${esc(acc.picture)}\" alt=\"\">` : ''}<span>@${esc(acc.username)}</span>` : '<a href=\"#settings\" class=\"pill warn\">Instagram não conectado</a>'}</div>\n  </header><main>${content}</main>`;\n}\n\n// ---------------------------------------------------------------- inicialização / rotas\nasync function boot() {\n  try {\n    const st = await api('state');\n    S.st = st;\n    S.autos = st.automations;\n    route();\n  } catch (e) {\n    if (e.message !== 'auth' && e.message !== 'setup') app.innerHTML = `<div class=\"login\"><div class=\"card\"><h2>Ops!</h2><p>${esc(e.message)}</p><button onclick=\"location.reload()\">Tentar de novo</button></div></div>`;\n  }\n}\nasync function refreshState() {\n  const st = await api('state');\n  S.st = st;\n  S.autos = st.automations;\n}\nwindow.addEventListener('hashchange', () => {\n  if (S.skipHash) { S.skipHash = false; return; }\n  const leavingEditor = /^#(edit|new)/.test(S.prevHash) && S.dirty;\n  if (leavingEditor && !confirm('Você tem alterações não salvas. Sair mesmo assim?')) {\n    S.skipHash = true;\n    location.hash = S.prevHash;\n    return;\n  }\n  if (leavingEditor) S.dirty = false;\n  route();\n});\nwindow.addEventListener('beforeunload', (e) => { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });\nfunction route() {\n  if (!S.st) return;\n  S.prevHash = location.hash;\n  const [view, arg] = (location.hash.slice(1) || 'autos').split('/');\n  window.scrollTo(0, 0);\n  if (view === 'edit' || view === 'new') return openEditor(view, arg);\n  S.draft = null;\n  S.dirty = false;\n  if (view === 'media') return renderMedia();\n  if (view === 'contacts') return renderContacts();\n  if (view === 'logs') return renderLogs();\n  if (view === 'settings') return renderSettings();\n  return renderAutos();\n}\n\n// ---------------------------------------------------------------- automações (lista)\nfunction summary(a) {\n  const t = a.trigger;\n  const kw = t.keywords.length ? '\"' + t.keywords.slice(0, 3).join('\", \"') + '\"' + (t.keywords.length > 3 ? ' +' + (t.keywords.length - 3) : '') : 'qualquer texto';\n  switch (t.type) {\n    case 'comment': return `Comentário com ${kw} · ${t.posts.length ? t.posts.length + ' post(s) escolhido(s)' : 'todos os posts'}`;\n    case 'dm_keyword': return `Direct com ${kw}`;\n    case 'ref_link': return `ig.me/m/${S.st.account ? S.st.account.username : 'voce'}?ref=${t.ref}`;\n    case 'story_reply': return 'Resposta ao story' + (t.keywords.length ? ' com ' + kw : '');\n    default: return TRIG[t.type].desc;\n  }\n}\nfunction renderAutos() {\n  const list = S.autos;\n  const warn = [];\n  if (!S.st.account) warn.push(`<div class=\"banner warn\">⚠️ O Instagram ainda não está conectado. <a href=\"#settings\">Ir para Configurações →</a></div>`);\n  if (!S.st.bot_enabled) warn.push(`<div class=\"banner warn\">⏸️ O bot está desligado — nenhuma mensagem será enviada. <a href=\"#settings\">Ligar</a></div>`);\n  app.innerHTML = layout(`${warn.join('')}\n    <div class=\"head-row\"><h1>Automações</h1><button class=\"primary\" data-act=\"new\">+ Nova automação</button></div>\n    ${list.length ? `<div class=\"auto-list\">${list.map((a, i) => `\n      <div class=\"auto ${a.enabled ? '' : 'off'}\">\n        <div class=\"auto-ic\">${TRIG[a.trigger.type].icon}</div>\n        <div class=\"auto-main\" data-act=\"edit\" data-id=\"${esc(a.id)}\">\n          <div class=\"auto-name\">${esc(a.name)}</div>\n          <div class=\"auto-sum\">${esc(summary(a))}</div>\n          <div class=\"auto-stats\">▶ ${a.runs || 0} disparo(s) · último ${ago(a.last_run)}${a.once_per_user ? ' · 1x por pessoa' : ''}</div>\n        </div>\n        <div class=\"auto-act\">\n          <button class=\"icon ghost\" data-act=\"move\" data-dir=\"-1\" data-i=\"${i}\" ${i === 0 ? 'disabled' : ''} title=\"Subir prioridade\">↑</button>\n          <button class=\"icon ghost\" data-act=\"move\" data-dir=\"1\" data-i=\"${i}\" ${i === list.length - 1 ? 'disabled' : ''} title=\"Descer prioridade\">↓</button>\n          <button class=\"small\" data-act=\"edit\" data-id=\"${esc(a.id)}\">Editar</button>\n          <button class=\"icon ghost\" data-act=\"dup\" data-id=\"${esc(a.id)}\" title=\"Duplicar\">⧉</button>\n          <button class=\"icon ghost danger\" data-act=\"del\" data-id=\"${esc(a.id)}\" title=\"Excluir\">🗑</button>\n          <label class=\"switch\" title=\"Ligar/desligar\"><input type=\"checkbox\" data-act-change=\"toggle\" data-id=\"${esc(a.id)}\" ${a.enabled ? 'checked' : ''}><span></span></label>\n        </div>\n      </div>`).join('')}</div>\n      <p class=\"hint center\" style=\"margin-top:14px\">Se duas automações servirem para a mesma mensagem, vale a de cima (use ↑ ↓ para mudar).</p>`\n    : `<div class=\"card empty\"><div class=\"big\">✨</div><h2>Nenhuma automação ainda</h2><p class=\"hint\">Comece pela mais usada: comentário vira DM.</p>\n        <div class=\"row\" style=\"justify-content:center;margin-top:12px\"><button class=\"primary\" onclick=\"location.hash='#new/comment'\">💬 Comentário → Direct</button><button onclick=\"location.hash='#new/welcome'\">👋 Boas-vindas</button><button data-act=\"new\">Ver todas</button></div></div>`}`);\n}\nfunction chooseTemplate() {\n  const m = modal(`<h2>Nova automação</h2><p class=\"hint\">Escolha o que vai disparar a automação:</p>\n    <div class=\"tpl-grid\">${Object.entries(TRIG).map(([k, t]) => `<button class=\"tpl\" data-type=\"${k}\"><span class=\"ic\">${t.icon}</span><span><b>${t.label}</b><small>${t.desc}</small></span></button>`).join('')}</div>\n    <div class=\"modal-foot\"><span class=\"spacer\"></span><button data-close>Cancelar</button></div>`, 'wide');\n  m.addEventListener('click', (e) => {\n    const b = e.target.closest('.tpl');\n    if (!b) return;\n    closeModal(m);\n    location.hash = '#new/' + b.dataset.type;\n  });\n}\n\n// ---------------------------------------------------------------- editor\nfunction openEditor(view, arg) {\n  if (view === 'edit') {\n    const a = S.autos.find((x) => x.id === arg);\n    if (!a) { toast('Automação não encontrada', 'err'); location.hash = '#autos'; return; }\n    S.draft = JSON.parse(JSON.stringify(a));\n  } else {\n    S.draft = newAutomation(TRIG[arg] ? arg : 'comment');\n  }\n  S.dirty = view === 'new';\n  app.innerHTML = layout(`<div id=\"ed\"></div>`) + `<div class=\"savebar\"><div class=\"savebar-in\"><button data-act=\"cancel\">← Voltar</button><span class=\"spacer\"></span><span class=\"hint\" id=\"dirty-flag\"></span><button class=\"primary\" data-act=\"save\">💾 Salvar automação</button></div></div>`;\n  renderEditorBody();\n}\n\nfunction varsBar(id) {\n  return `<span class=\"vars\">Inserir: ${['{nome}', '{primeiro_nome}', '{username}'].map((v) => `<button type=\"button\" data-act=\"var\" data-target=\"${id}\" data-v=\"${v}\">${v}</button>`).join('')}</span>`;\n}\nlet taSeq = 0;\nfunction textArea(path, value, placeholder, limitKind) {\n  const id = 'ta' + ++taSeq;\n  return `<textarea id=\"${id}\" data-bind=\"${path}\" data-limit=\"${limitKind || 'text'}\" rows=\"5\" placeholder=\"${esc(placeholder || 'Escreva a mensagem… (emojis e links são permitidos)')}\">${esc(value)}</textarea>\n    <div class=\"ta-foot\">${varsBar(id)}<span class=\"count\" data-count-for=\"${id}\"></span></div>`;\n}\nfunction targetSelect(path, val, allowNone) {\n  const others = S.autos.filter((a) => a.id !== S.draft.id);\n  const selfLabel = S.draft.trigger.type === 'comment' ? '▶ Mensagens do passo 4' : '↻ Repetir esta automação';\n  let opts = '';\n  if (allowNone) opts += `<option value=\"\" ${!val ? 'selected' : ''}>— só registrar a escolha —</option>`;\n  opts += `<option value=\"self\" ${val === 'self' || (!allowNone && !val) ? 'selected' : ''}>${selfLabel}</option>`;\n  opts += others.map((a) => `<option value=\"${esc(a.id)}\" ${val === a.id ? 'selected' : ''}>${TRIG[a.trigger.type].icon} ${esc(a.name)}</option>`).join('');\n  return `<select data-bind=\"${path}\">${opts}</select>`;\n}\nfunction buttonsEditor(path, buttons) {\n  return `<div class=\"btns\">${buttons.map((b, i) => `\n    <div class=\"btn-row\">\n      <select data-bind=\"${path}.${i}.type\" data-rerender=\"1\">\n        <option value=\"url\" ${b.type === 'url' ? 'selected' : ''}>🔗 Abrir link</option>\n        <option value=\"flow\" ${b.type === 'flow' ? 'selected' : ''}>▶ Continuar fluxo</option>\n      </select>\n      <input data-bind=\"${path}.${i}.title\" maxlength=\"20\" placeholder=\"Texto do botão (até 20)\" value=\"${esc(b.title)}\">\n      ${b.type === 'flow' ? targetSelect(`${path}.${i}.target`, b.target, false) : `<input data-bind=\"${path}.${i}.url\" placeholder=\"https://seulink.com\" value=\"${esc(b.url)}\">`}\n      <button type=\"button\" class=\"icon ghost danger\" data-act=\"btn-del\" data-path=\"${path}\" data-i=\"${i}\" title=\"Remover botão\">✕</button>\n    </div>`).join('')}\n    ${buttons.length < 3 ? `<div><button type=\"button\" class=\"small\" data-act=\"btn-add\" data-path=\"${path}\">+ Adicionar botão</button> <span class=\"hint\">até 3 botões</span></div>` : ''}\n  </div>`;\n}\nfunction imagePicker(path, m) {\n  const src = imgSrc(m);\n  return `<div class=\"imgpick\">${src ? `<img src=\"${esc(src)}\" alt=\"\">` : '<div class=\"imgph\">sem imagem</div>'}\n    <div class=\"imgpick-ctl\">\n      <button type=\"button\" class=\"small\" data-act=\"img-pick\" data-path=\"${path}\">${m.media_id ? 'Trocar imagem' : '🖼️ Escolher ou enviar imagem'}</button>\n      ${src ? `<button type=\"button\" class=\"small ghost danger\" data-act=\"img-clear\" data-path=\"${path}\">Remover imagem</button>` : ''}\n      <details ${m.url && !m.media_id ? 'open' : ''}><summary>ou usar o link de uma imagem da internet</summary>\n        <input data-bind=\"${path}.url\" placeholder=\"https://site.com/foto.jpg\" value=\"${esc(m.url || '')}\"></details>\n    </div></div>`;\n}\nfunction blockHtml(m, i, n) {\n  const p = 'messages.' + i;\n  let body = '';\n  if (m.type === 'text') body = textArea(p + '.text', m.text, '', m.buttons.length ? 'button' : 'text') + buttonsEditor(p + '.buttons', m.buttons);\n  else if (m.type === 'image') body = imagePicker(p, m) + '<p class=\"hint\" style=\"margin-top:8px\">JPG, PNG ou GIF. A imagem é enviada como foto no Direct.</p>';\n  else if (m.type === 'card') body = `<div class=\"grid2\"><div><label class=\"lbl\">Título (até 80)</label><input data-bind=\"${p}.title\" maxlength=\"80\" value=\"${esc(m.title)}\" placeholder=\"Ex.: Cupom 50% OFF na SHEIN\"></div>\n      <div><label class=\"lbl\">Subtítulo (opcional, até 80)</label><input data-bind=\"${p}.subtitle\" maxlength=\"80\" value=\"${esc(m.subtitle)}\" placeholder=\"Ex.: Válido só hoje\"></div></div>\n      <label class=\"lbl\">Imagem do cartão</label>${imagePicker(p, m)}<label class=\"lbl\">Botões</label>${buttonsEditor(p + '.buttons', m.buttons)}`;\n  else if (m.type === 'quick') body = textArea(p + '.text', m.text, 'Pergunta… ex.: O que você procura?', 'text') + `<label class=\"lbl\">Opções (botões que somem depois do clique — até 13)</label>\n      <div class=\"btns\">${m.options.map((o, j) => `<div class=\"btn-row opt\">\n        <input data-bind=\"${p}.options.${j}.title\" maxlength=\"20\" placeholder=\"Texto (até 20)\" value=\"${esc(o.title)}\">\n        ${targetSelect(`${p}.options.${j}.target`, o.target, true)}\n        <button type=\"button\" class=\"icon ghost danger\" data-act=\"opt-del\" data-path=\"${p}.options\" data-i=\"${j}\">✕</button></div>`).join('')}\n        ${m.options.length < 13 ? `<div><button type=\"button\" class=\"small\" data-act=\"opt-add\" data-path=\"${p}.options\">+ Adicionar opção</button></div>` : ''}</div>\n      <p class=\"hint\" style=\"margin-top:8px\">Cada opção pode abrir outra automação (ex.: um \"Sub-fluxo\"). Se não abrir nada, o texto escolhido é tratado como uma mensagem normal (e pode bater numa palavra-chave).</p>`;\n  else if (m.type === 'delay') body = `<div class=\"row\"><span>Esperar</span><input type=\"number\" min=\"1\" max=\"10\" data-bind=\"${p}.seconds\" value=\"${m.seconds}\" style=\"width:80px\"><span>segundos mostrando \"digitando…\"</span></div><p class=\"hint\" style=\"margin-top:6px\">Máximo de 10s por pausa (e ~20s somando todas).</p>`;\n  return `<div class=\"blk\" id=\"blk-${i}\"><div class=\"blk-head\"><span class=\"blk-type\">${BLK[m.type].icon} ${BLK[m.type].label}</span><span class=\"blk-ctl\">\n      <button type=\"button\" class=\"icon ghost\" data-act=\"blk-move\" data-i=\"${i}\" data-dir=\"-1\" ${i === 0 ? 'disabled' : ''} title=\"Subir\">↑</button>\n      <button type=\"button\" class=\"icon ghost\" data-act=\"blk-move\" data-i=\"${i}\" data-dir=\"1\" ${i === n - 1 ? 'disabled' : ''} title=\"Descer\">↓</button>\n      <button type=\"button\" class=\"icon ghost danger\" data-act=\"blk-del\" data-i=\"${i}\" title=\"Remover\">✕</button></span></div>\n    <div class=\"blk-body\">${body}</div></div>`;\n}\nfunction triggerFields(a) {\n  const t = a.trigger;\n  const kwInput = (label, hint) => `<label class=\"lbl\">${label}</label>\n    <input data-bind=\"trigger.keywords\" data-kind=\"list\" value=\"${esc(t.keywords.join(', '))}\" placeholder=\"Ex.: eu quero, quero, link\">\n    <p class=\"hint\" style=\"margin-top:4px\">${hint}</p>\n    <label class=\"lbl\">Como comparar</label>\n    <div class=\"seg\">${[['word', 'Contém a palavra'], ['partial', 'Contém o trecho'], ['exact', 'Mensagem exata']].map(([k, l]) => `<button type=\"button\" class=\"${t.match === k ? 'on' : ''}\" data-act=\"match\" data-v=\"${k}\">${l}</button>`).join('')}</div>\n    <p class=\"hint\" style=\"margin-top:6px\">${{ word: '\"quero\" dispara com \"eu quero!!\" mas não com \"queroo\". Maiúsculas e acentos não importam.', partial: '\"quero\" dispara com qualquer texto que tenha \"quero\" dentro, até \"queroo\".', exact: 'Só dispara se a mensagem for exatamente a palavra-chave.' }[t.match]}</p>`;\n  switch (t.type) {\n    case 'comment':\n      return kwInput('Palavras-chave (separe por vírgula)', 'Deixe vazio para responder <b>qualquer</b> comentário.') + `\n        <label class=\"lbl\">Em quais posts?</label>\n        <div class=\"seg\"><button type=\"button\" class=\"${t.posts.length ? '' : 'on'}\" data-act=\"posts-all\">Todos os posts e reels</button><button type=\"button\" class=\"${t.posts.length ? 'on' : ''}\" data-act=\"posts-pick\">Escolher posts</button></div>\n        ${t.posts.length ? `<div class=\"posts-sel\">${t.posts.map((p) => `<a href=\"${esc(p.permalink)}\" target=\"_blank\" rel=\"noopener\" title=\"${esc(p.caption)}\"><img src=\"${esc(p.thumb)}\" alt=\"\" onerror=\"this.style.visibility='hidden'\"></a>`).join('')}<button type=\"button\" class=\"small\" data-act=\"posts-pick\">Alterar</button></div>` : ''}`;\n    case 'dm_keyword':\n      return kwInput('Palavras-chave (separe por vírgula)', 'Obrigatório. Ex.: grupo, cupom, preço');\n    case 'story_reply':\n      return kwInput('Palavras-chave (opcional)', 'Deixe vazio para responder <b>qualquer</b> resposta ao story.');\n    case 'ref_link': {\n      const user = S.st.account ? S.st.account.username : 'seu_usuario';\n      const link = `https://ig.me/m/${user}?ref=${t.ref || 'codigo'}`;\n      return `<label class=\"lbl\">Código do link</label><input data-bind=\"trigger.ref\" data-rerender-blur=\"1\" maxlength=\"60\" value=\"${esc(t.ref)}\" placeholder=\"ex.: grupo\">\n        <p class=\"hint\" style=\"margin-top:4px\">Só letras minúsculas, números, - e _. Cada link diferente pode ter sua própria automação.</p>\n        <label class=\"lbl\">Seu link (coloque na bio, nos stories ou onde quiser)</label>\n        <div class=\"copy\"><input readonly value=\"${esc(link)}\" id=\"ref-link\"><button type=\"button\" data-act=\"copy\" data-src=\"ref-link\">Copiar</button></div>\n        <p class=\"hint\" style=\"margin-top:6px\">Ao clicar, a pessoa abre seu Direct e recebe a mensagem. Em alguns casos o Instagram pede que ela toque em \"Enviar\" primeiro.</p>`;\n    }\n    default:\n      return '';\n  }\n}\nfunction renderEditorBody() {\n  const a = S.draft;\n  const t = a.trigger;\n  const isComment = t.type === 'comment';\n  const ed = $('#ed');\n  if (!ed) return;\n  taSeq = 0;\n  const hasFlowBtn = a.opening.buttons.some((b) => b.type === 'flow');\n  ed.innerHTML = `\n  <div class=\"head-row\"><h1>${a.id ? 'Editar automação' : 'Nova automação'}</h1></div>\n  <div class=\"editor\">\n    <div class=\"ed-main\">\n      <section class=\"card\">\n        <div class=\"row\" style=\"justify-content:space-between\"><div style=\"flex:1;min-width:220px\"><label class=\"lbl\" style=\"margin-top:0\">Nome (só você vê)</label><input data-bind=\"name\" value=\"${esc(a.name)}\" maxlength=\"80\"></div>\n          <label class=\"row\" style=\"gap:8px;margin-top:18px\"><label class=\"switch\"><input type=\"checkbox\" data-bind=\"enabled\" ${a.enabled ? 'checked' : ''}><span></span></label> Ligada</label></div>\n      </section>\n\n      <section class=\"card\">\n        <div class=\"sec-title\"><span class=\"step\">1</span><h3>Gatilho: ${TRIG[t.type].icon} ${TRIG[t.type].label}</h3></div>\n        <p class=\"hint\">${TRIG[t.type].desc}</p>\n        ${triggerFields(a)}\n        ${t.type !== 'manual' && t.type !== 'default' ? `<label class=\"row\" style=\"gap:8px;margin-top:14px\"><label class=\"switch\"><input type=\"checkbox\" data-bind=\"once_per_user\" ${a.once_per_user ? 'checked' : ''}><span></span></label> Enviar só <b>1 vez por pessoa</b></label>` : ''}\n      </section>\n\n      ${isComment ? `\n      <section class=\"card\">\n        <div class=\"sec-title\"><span class=\"step\">2</span><h3>Resposta pública no comentário</h3></div>\n        <p class=\"hint\">Uma por linha — o bot sorteia uma a cada comentário, para não parecer robô. Deixe vazio para não responder publicamente.</p>\n        <textarea data-bind=\"public_replies\" data-kind=\"lines\" rows=\"3\" placeholder=\"Te mandei no direct! 📩\">${esc(a.public_replies.join('\\n'))}</textarea>\n      </section>\n      <section class=\"card\">\n        <div class=\"sec-title\"><span class=\"step\">3</span><h3>Mensagem no Direct (resposta ao comentário)</h3></div>\n        <p class=\"hint\">Regra da Meta: aqui vai <b>uma única mensagem</b> (texto + até 3 botões). Imagens e mais mensagens só podem ser enviadas depois que a pessoa clicar num botão ▶ <b>Continuar fluxo</b> ou responder.</p>\n        ${textArea('opening.text', a.opening.text, 'Oiee! 🖤✨ Aqui está o link…', a.opening.buttons.length ? 'button' : 'opening')}\n        ${buttonsEditor('opening.buttons', a.opening.buttons)}\n      </section>` : ''}\n\n      <section class=\"card\">\n        <div class=\"sec-title\"><span class=\"step\">${isComment ? 4 : 2}</span><h3>${isComment ? 'Mensagens depois do clique (opcional)' : 'Mensagens'}</h3></div>\n        <p class=\"hint\">${isComment ? (hasFlowBtn ? 'Enviadas quando a pessoa clicar no botão ▶ Continuar fluxo da mensagem acima.' : '⚠️ Para usar esta parte, adicione na mensagem acima um botão do tipo <b>▶ Continuar fluxo</b>.') : 'Enviadas em sequência, de cima para baixo.'}</p>\n        <div id=\"blocks\">${a.messages.map((m, i) => blockHtml(m, i, a.messages.length)).join('') || (isComment ? '' : '<p class=\"hint\">Nenhuma mensagem ainda — adicione abaixo.</p>')}</div>\n        <div class=\"add-row\">${Object.entries(BLK).map(([k, b]) => `<button type=\"button\" class=\"small\" data-act=\"blk-add\" data-type=\"${k}\">+ ${b.icon} ${b.label.split(' (')[0]}</button>`).join('')}</div>\n      </section>\n    </div>\n    <aside class=\"ed-preview\">\n      <div class=\"phone\"><div class=\"phone-head\">${S.st.account && S.st.account.picture ? `<img src=\"${esc(S.st.account.picture)}\" alt=\"\">` : '<span class=\"av\"></span>'} ${esc(S.st.account ? S.st.account.username : 'sua_conta')}</div><div class=\"pv\" id=\"preview\"></div></div>\n      <p class=\"hint center\" style=\"margin-top:8px\">Prévia aproximada de como chega no Direct</p>\n    </aside>\n  </div>`;\n  $$('textarea[data-limit]', ed).forEach(updateCounter);\n  renderPreview();\n  updateDirty();\n}\nfunction updateDirty() { const f = $('#dirty-flag'); if (f) f.textContent = S.dirty ? 'Alterações não salvas' : ''; }\nfunction updateCounter(ta) {\n  const el = $(`[data-count-for=\"${ta.id}\"]`);\n  if (!el) return;\n  const kind = ta.dataset.limit;\n  if (kind === 'button') {\n    const n = [...ta.value].length;\n    el.textContent = `${n} / 640 caracteres (mensagem com botões)`;\n    el.classList.toggle('over', n > 640);\n  } else {\n    const n = bytes(ta.value);\n    el.textContent = `${n} / 1000` + (kind === 'opening' ? ' (limite)' : n > 1000 ? ' — será dividida em mais mensagens' : '');\n    el.classList.toggle('over', kind === 'opening' ? n > 1000 : false);\n  }\n}\nfunction renderPreview() {\n  const box = $('#preview');\n  if (!box || !S.draft) return;\n  const a = S.draft;\n  const v = { username: 'maria.silva', name: 'Maria Silva' };\n  let h = '';\n  const bubble = (m) => {\n    if (m.type === 'delay') return '<div class=\"pv-typing\"><span></span><span></span><span></span></div>';\n    if (m.type === 'image') { const src = imgSrc(m); return src ? `<div class=\"pv-img\"><img src=\"${esc(src)}\" alt=\"\"></div>` : '<div class=\"pv-bot hint\">[imagem]</div>'; }\n    if (m.type === 'card') { const src = imgSrc(m); return `<div class=\"pv-card\">${src ? `<img src=\"${esc(src)}\" alt=\"\">` : ''}<div class=\"pc-b\"><div class=\"pc-t\">${esc(fill(m.title, v) || 'Título')}</div>${m.subtitle ? `<div class=\"pc-s\">${esc(fill(m.subtitle, v))}</div>` : ''}${m.buttons.map((b) => `<div class=\"pv-btn\">${esc(b.title || 'Botão')}</div>`).join('')}</div></div>`; }\n    if (m.type === 'quick') return `<div class=\"pv-bot\">${fmtMsg(fill(m.text, v) || '👇')}</div>${m.options.length ? `<div class=\"pv-qr\">${m.options.map((o) => `<span>${esc(o.title || '…')}</span>`).join('')}</div>` : ''}`;\n    if (!m.text && !(m.buttons || []).length) return '';\n    return `<div class=\"pv-bot\">${fmtMsg(fill(m.text, v))}${(m.buttons || []).map((b) => `<div class=\"pv-btn\">${b.type === 'url' ? '🔗 ' : ''}${esc(b.title || 'Botão')}</div>`).join('')}</div>`;\n  };\n  const t = a.trigger;\n  if (t.type === 'comment') {\n    h += `<div class=\"pv-note\">💬 <b>@maria.silva</b> comentou: “${esc(t.keywords[0] || 'qualquer coisa')}”</div>`;\n    if (a.public_replies.length) h += `<div class=\"pv-note\">↪️ Você respondeu no post: “${esc(fill(a.public_replies[0], v))}”</div>`;\n    h += bubble({ type: 'text', text: a.opening.text, buttons: a.opening.buttons });\n    if (a.messages.length) h += '<div class=\"pv-sep\">depois que ela clicar em ▶</div>' + a.messages.map(bubble).join('');\n  } else {\n    const intro = { dm_keyword: t.keywords[0] || 'oi', welcome: 'Oii, tudo bem?', ref_link: '(clicou no link da bio)', story_reply: '🔥🔥 (respondeu seu story)', story_mention: '(te marcou num story)', default: 'uma mensagem qualquer', manual: '(clicou num botão)' }[t.type];\n    h += `<div class=\"pv-user\">${esc(intro)}</div>` + a.messages.map(bubble).join('');\n  }\n  box.innerHTML = h;\n}\n\nfunction validateDraft() {\n  const a = S.draft;\n  const t = a.trigger;\n  const errs = [];\n  const btnErr = (btns, where) => btns.forEach((b, i) => {\n    if (!b.title.trim()) errs.push(`${where}: o botão ${i + 1} está sem texto.`);\n    if (b.type === 'url' && !b.url.trim()) errs.push(`${where}: o botão \"${b.title || i + 1}\" está sem link.`);\n  });\n  if (t.type === 'dm_keyword' && !t.keywords.length) errs.push('Coloque pelo menos uma palavra-chave.');\n  if (t.type === 'ref_link' && !t.ref) errs.push('Defina o código do link.');\n  if (t.type === 'comment') {\n    if (!a.opening.text.trim() && !a.opening.buttons.length && !a.public_replies.length) errs.push('Escreva a mensagem do Direct (passo 3) ou uma resposta pública (passo 2).');\n    if (a.opening.buttons.length && [...a.opening.text].length > 640) errs.push('A mensagem do passo 3 passou de 640 caracteres (limite com botões).');\n    if (!a.opening.buttons.length && bytes(a.opening.text) > 1000) errs.push('A mensagem do passo 3 passou do limite de 1000.');\n    btnErr(a.opening.buttons, 'Passo 3');\n  } else if (!a.messages.length) errs.push('Adicione pelo menos uma mensagem.');\n  a.messages.forEach((m, i) => {\n    const w = `Mensagem ${i + 1}`;\n    if (m.type === 'text') { if (!m.text.trim() && !m.buttons.length) errs.push(`${w}: texto vazio.`); btnErr(m.buttons, w); }\n    if (m.type === 'image' && !m.media_id && !m.url) errs.push(`${w}: escolha uma imagem.`);\n    if (m.type === 'card') { if (!m.title.trim()) errs.push(`${w}: o cartão precisa de um título.`); btnErr(m.buttons, w); }\n    if (m.type === 'quick' && !m.options.length) errs.push(`${w}: adicione pelo menos uma opção.`);\n  });\n  return errs;\n}\nasync function saveDraft() {\n  const errs = validateDraft();\n  if (errs.length) {\n    modal(`<h2>Falta pouco 🙂</h2><ul>${errs.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><div class=\"modal-foot\"><span class=\"spacer\"></span><button class=\"primary\" data-close>Ok</button></div>`);\n    return;\n  }\n  const a = S.draft;\n  if (a.trigger.type === 'comment' && a.messages.length && !a.opening.buttons.some((b) => b.type === 'flow')) {\n    const ok = await confirmBox('As mensagens do passo 4 só são enviadas se a mensagem do passo 3 tiver um botão <b>▶ Continuar fluxo</b>. Salvar mesmo assim?', 'Salvar assim');\n    if (!ok) return;\n  }\n  const btn = $('[data-act=\"save\"]');\n  btn.disabled = true;\n  try {\n    const saved = a.id ? await api('automations/' + a.id, { method: 'PUT', body: a }) : await api('automations', { method: 'POST', body: a });\n    S.dirty = false;\n    await refreshState();\n    toast('Automação salva! ✅', 'ok');\n    if (!a.id) { S.prevHash = '#edit/' + saved.id; S.skipHash = true; location.hash = '#edit/' + saved.id; S.draft.id = saved.id; renderEditorBody(); }\n    else { S.draft = JSON.parse(JSON.stringify(S.autos.find((x) => x.id === saved.id) || saved)); renderEditorBody(); }\n  } catch (e) {\n    if (e.message !== 'auth') toast(e.message, 'err');\n  } finally {\n    btn.disabled = false;\n  }\n}\n\n// ---------------------------------------------------------------- imagens\nasync function prepareImage(file) {\n  if (file.type === 'image/gif') {\n    if (file.size > 8e6) throw new Error(file.name + ': GIF maior que 8 MB.');\n    return { blob: file, type: 'image/gif' };\n  }\n  let img;\n  try {\n    img = await createImageBitmap(file);\n  } catch {\n    throw new Error(file.name + ': formato não suportado. Use JPG ou PNG.');\n  }\n  const max = 1440;\n  const sc = Math.min(1, max / Math.max(img.width, img.height));\n  const c = document.createElement('canvas');\n  c.width = Math.round(img.width * sc);\n  c.height = Math.round(img.height * sc);\n  const ctx = c.getContext('2d');\n  ctx.fillStyle = '#fff';\n  ctx.fillRect(0, 0, c.width, c.height);\n  ctx.drawImage(img, 0, 0, c.width, c.height);\n  let q = 0.88, blob;\n  do { blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', q)); q -= 0.12; } while (blob.size > 3e6 && q > 0.4);\n  return { blob, type: 'image/jpeg' };\n}\nasync function uploadFiles(files) {\n  const out = [];\n  for (const f of files) {\n    try {\n      toast('Enviando ' + f.name + '…');\n      const { blob, type } = await prepareImage(f);\n      const name = f.name.replace(/\\.(heic|png|webp|jpeg|jpg|gif)$/i, '') + (type === 'image/gif' ? '.gif' : '.jpg');\n      out.push(await api('media', { method: 'POST', raw: true, body: blob, type, filename: name }));\n    } catch (e) {\n      if (e.message !== 'auth') toast(e.message, 'err');\n    }\n  }\n  if (out.length) toast(out.length + ' imagem(ns) enviada(s) ✅', 'ok');\n  return out;\n}\nfunction openGallery(onPick) {\n  const m = modal(`<h2>Escolher imagem</h2>\n    ${S.st.media_enabled ? '<label class=\"upload\"><input type=\"file\" accept=\"image/*\" multiple hidden id=\"gal-file\"><span>⬆️ Enviar imagem do computador</span></label>' : '<div class=\"banner warn\">O armazenamento de imagens (KV \"MEDIA\") ainda não foi ligado ao Worker. Veja o guia — ou use o link de uma imagem.</div>'}\n    <div class=\"gal-grid\" id=\"gal\"><span class=\"spinner\"></span></div>\n    <div class=\"modal-foot\"><span class=\"spacer\"></span><button data-close>Fechar</button></div>`, 'wide');\n  async function draw() {\n    try {\n      const d = await api('media');\n      S.media = d.items;\n      $('#gal', m).innerHTML = d.items.length ? d.items.map((x) => `<button class=\"gal-item\" data-id=\"${esc(x.id)}\"><img src=\"/media/${esc(x.id)}.${esc(x.ext)}\" loading=\"lazy\" alt=\"\"><span>${esc(x.name)}</span></button>`).join('') : '<p class=\"hint\">Nenhuma imagem ainda. Envie a primeira acima.</p>';\n    } catch (e) { $('#gal', m).innerHTML = `<p class=\"hint\">${esc(e.message)}</p>`; }\n  }\n  $('#gal', m).addEventListener('click', (e) => {\n    const b = e.target.closest('.gal-item');\n    if (!b) return;\n    const x = S.media.find((i) => i.id === b.dataset.id);\n    closeModal(m);\n    onPick(x);\n  });\n  const f = $('#gal-file', m);\n  if (f) f.onchange = async () => {\n    const up = await uploadFiles(f.files);\n    f.value = '';\n    if (up.length === 1) { closeModal(m); onPick(up[0]); } else draw();\n  };\n  draw();\n}\nasync function renderMedia() {\n  app.innerHTML = layout(`<div class=\"head-row\"><h1>Imagens</h1></div>\n    ${S.st.media_enabled ? '<label class=\"upload card\" style=\"box-shadow:none\"><input type=\"file\" accept=\"image/*\" multiple hidden id=\"up-file\"><span>⬆️ Clique para enviar imagens (JPG, PNG ou GIF)</span></label>' : '<div class=\"banner warn\">O armazenamento de imagens (binding KV com o nome <b>MEDIA</b>) ainda não foi ligado ao Worker. Veja o passo 4 do guia.</div>'}\n    <div class=\"gal-grid\" id=\"media-grid\" style=\"max-height:none\"><span class=\"spinner\"></span></div>`);\n  const f = $('#up-file');\n  if (f) f.onchange = async () => { await uploadFiles(f.files); f.value = ''; drawMedia(); };\n  drawMedia();\n}\nasync function drawMedia() {\n  const g = $('#media-grid');\n  try {\n    const d = await api('media');\n    S.media = d.items;\n    g.innerHTML = d.items.length ? d.items.map((x) => `<div class=\"gal-item card\" style=\"padding:0;margin:0\"><img src=\"/media/${esc(x.id)}.${esc(x.ext)}\" loading=\"lazy\" alt=\"\"><span>${esc(x.name)} · ${(x.size / 1024).toFixed(0)} KB</span>\n      <div class=\"gal-ctl\"><button class=\"small\" data-act=\"copy-text\" data-text=\"${esc(x.url)}\">Copiar link</button><button class=\"small ghost danger\" data-act=\"media-del\" data-id=\"${esc(x.id)}\">Excluir</button></div></div>`).join('') : '<p class=\"hint\">Nenhuma imagem ainda.</p>';\n  } catch (e) { if (e.message !== 'auth') g.innerHTML = `<p class=\"hint\">${esc(e.message)}</p>`; }\n}\n\n// ---------------------------------------------------------------- posts\nfunction openPostsPicker() {\n  const sel = new Map(S.draft.trigger.posts.map((p) => [p.id, p]));\n  let items = [];\n  let after = null;\n  const m = modal(`<h2>Escolher posts e reels</h2><p class=\"hint\">Marque onde essa automação vale. Clique de novo para desmarcar.</p>\n    <div class=\"posts-grid\" id=\"pg\"><span class=\"spinner\"></span></div>\n    <div class=\"modal-foot\"><button id=\"pg-more\" class=\"ghost\" hidden>Carregar mais</button><span class=\"spacer\"></span><button data-close>Cancelar</button><button class=\"primary\" id=\"pg-ok\">Usar selecionados</button></div>`, 'wide');\n  const typeLabel = (p) => (p.media_product_type === 'REELS' ? 'Reels' : p.media_type === 'CAROUSEL_ALBUM' ? 'Carrossel' : p.media_type === 'VIDEO' ? 'Vídeo' : 'Post');\n  function draw() {\n    $('#pg', m).innerHTML = items.length ? items.map((p) => `<div class=\"post ${sel.has(p.id) ? 'on' : ''}\" data-id=\"${esc(p.id)}\"><img src=\"${esc(p.thumbnail_url || p.media_url || '')}\" loading=\"lazy\" alt=\"\"><span class=\"post-type\">${typeLabel(p)}</span><span class=\"post-cap\">${esc((p.caption || 'sem legenda').slice(0, 60))}</span></div>`).join('') : '<p class=\"hint\">Nenhum post encontrado.</p>';\n    $('#pg-more', m).hidden = !after;\n  }\n  async function load() {\n    try {\n      const d = await api('posts' + (after ? '?after=' + encodeURIComponent(after) : ''));\n      items = items.concat(d.items);\n      after = d.after;\n      draw();\n    } catch (e) { if (e.message !== 'auth') $('#pg', m).innerHTML = `<p class=\"hint\">${esc(e.message)}</p>`; }\n  }\n  $('#pg', m).addEventListener('click', (e) => {\n    const el = e.target.closest('.post');\n    if (!el) return;\n    const id = el.dataset.id;\n    if (sel.has(id)) sel.delete(id);\n    else { const p = items.find((x) => x.id === id); sel.set(id, { id, caption: (p.caption || '').slice(0, 120), thumb: p.thumbnail_url || p.media_url || '', permalink: p.permalink || '' }); }\n    el.classList.toggle('on');\n  });\n  $('#pg-more', m).onclick = load;\n  $('#pg-ok', m).onclick = () => { S.draft.trigger.posts = [...sel.values()]; S.dirty = true; closeModal(m); renderEditorBody(); };\n  load();\n}\n\n// ---------------------------------------------------------------- contatos\nasync function renderContacts() {\n  app.innerHTML = layout(`<div class=\"head-row\"><h1>Contatos</h1><button data-act=\"export-csv\">⬇️ Exportar planilha (CSV)</button></div>\n    <input class=\"search\" id=\"c-q\" placeholder=\"🔎 Buscar por @usuário ou nome\"><div id=\"c-list\"><span class=\"spinner\"></span></div>`);\n  let timer;\n  $('#c-q').addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(drawContacts, 300); });\n  drawContacts();\n}\nasync function drawContacts() {\n  const q = $('#c-q') ? $('#c-q').value.trim() : '';\n  const box = $('#c-list');\n  try {\n    const d = await api('contacts' + (q ? '?q=' + encodeURIComponent(q) : ''));\n    box.innerHTML = `<p class=\"hint\">${d.total} contato(s)${d.total > d.items.length ? ' — mostrando os ' + d.items.length + ' mais recentes' : ''}</p>` + (d.items.length ? `<div class=\"table-wrap\"><table><thead><tr><th>Usuário</th><th>Nome</th><th>Veio por</th><th>Primeira vez</th><th>Última interação</th><th>Interações</th></tr></thead><tbody>\n      ${d.items.map((c) => `<tr><td>${c.username ? `<a href=\"https://instagram.com/${esc(c.username)}\" target=\"_blank\" rel=\"noopener\">@${esc(c.username)}</a>` : '<span class=\"hint\">' + esc(c.id) + '</span>'}</td><td>${esc(c.name || '')}</td><td>${esc(c.source || '')}</td><td>${fmtDate(c.first_seen)}</td><td>${ago(c.last_seen)}</td><td>${c.interactions || 0}</td></tr>`).join('')}</tbody></table></div>` : '<div class=\"card empty\"><div class=\"big\">👥</div><p class=\"hint\">Os contatos aparecem aqui quando alguém comenta ou manda mensagem.</p></div>');\n  } catch (e) { if (e.message !== 'auth') box.innerHTML = `<p class=\"hint\">${esc(e.message)}</p>`; }\n}\nasync function exportCsv() {\n  const d = await api('contacts?all=1');\n  const rows = [['usuario', 'nome', 'origem', 'primeira_vez', 'ultima_interacao', 'interacoes', 'id']];\n  d.items.forEach((c) => rows.push([c.username || '', c.name || '', c.source || '', fmtDate(c.first_seen), fmtDate(c.last_seen), c.interactions || 0, c.id]));\n  const csv = '﻿' + rows.map((r) => r.map((x) => '\"' + String(x).replace(/\"/g, '\"\"') + '\"').join(';')).join('\\n');\n  const a = document.createElement('a');\n  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));\n  a.download = 'contatos-instabot.csv';\n  a.click();\n}\n\n// ---------------------------------------------------------------- registro\nasync function renderLogs() {\n  app.innerHTML = layout(`<div class=\"head-row\"><h1>Registro</h1><button data-act=\"logs-reload\">↻ Atualizar</button><button class=\"ghost danger\" data-act=\"logs-clear\">Limpar</button></div>\n    <p class=\"hint\">Tudo o que o bot fez (e os erros, com a explicação). Útil para testar.</p><div class=\"logs\" id=\"logs\"><span class=\"spinner\"></span></div>`);\n  drawLogs();\n}\nconst LV = { ok: ['ok', '✅ ok'], info: ['info', 'ℹ️ info'], aviso: ['warn', '⚠️ aviso'], erro: ['err', '❌ erro'] };\nasync function drawLogs() {\n  const box = $('#logs');\n  try {\n    const d = await api('logs');\n    box.innerHTML = d.items.length ? d.items.map((l) => {\n      const lv = LV[l.level] || ['', l.level];\n      let data = l.data || '';\n      try { if (data && /^[\\[{]/.test(data)) data = JSON.stringify(JSON.parse(data), null, 2); } catch {}\n      return `<div class=\"log\"><span class=\"pill ${lv[0]}\">${lv[1]}</span><time>${fmtDate(l.ts)} · ${ago(l.ts)}</time><div class=\"msg\">${esc(l.msg)}</div>${data ? `<details><summary>detalhes</summary><pre>${esc(data)}</pre></details>` : ''}</div>`;\n    }).join('') : '<div class=\"card empty\"><div class=\"big\">📋</div><p class=\"hint\">Nada registrado ainda.</p></div>';\n  } catch (e) { if (e.message !== 'auth') box.innerHTML = `<p class=\"hint\">${esc(e.message)}</p>`; }\n}\n\n// ---------------------------------------------------------------- configurações\nfunction renderSettings() {\n  const st = S.st;\n  const acc = st.account;\n  const ck = (ok, label, extra = '') => `<div class=\"check\"><span class=\"st\">${ok ? '✅' : '⬜'}</span><span class=\"tx\">${label}${extra ? `<div class=\"hint\">${extra}</div>` : ''}</span></div>`;\n  const tokenDays = acc && acc.token_updated_at ? Math.floor((Date.now() - acc.token_updated_at) / 864e5) : null;\n  const copyField = (id, val) => `<div class=\"copy\"><input readonly id=\"${id}\" value=\"${esc(val)}\"><button type=\"button\" data-act=\"copy\" data-src=\"${id}\">Copiar</button></div>`;\n  app.innerHTML = layout(`<div class=\"head-row\"><h1>Configurações</h1></div>\n  <section class=\"card\">\n    <h2>Situação</h2>\n    ${ck(true, 'Banco de dados (D1) ligado')}\n    ${ck(st.media_enabled, 'Armazenamento de imagens (KV \"MEDIA\") ligado', st.media_enabled ? '' : 'Opcional, mas necessário para enviar imagens pelo painel.')}\n    ${ck(!!acc, 'Instagram conectado', acc ? '@' + esc(acc.username) : 'Cole o token no passo 1 abaixo.')}\n    ${ck(!!st.webhook_verified_at, 'Webhook verificado pela Meta', st.webhook_verified_at ? 'em ' + fmtDate(st.webhook_verified_at) : 'Faça o passo 2 abaixo no painel da Meta.')}\n    ${ck(!!st.last_event_at, 'Recebendo eventos do Instagram', st.last_event_at ? 'último ' + ago(st.last_event_at) : 'Assim que alguém comentar ou mandar mensagem, aparece aqui.')}\n    ${ck(st.app_secret_set, 'Chave secreta do app configurada (segurança)', st.app_secret_set ? '' : 'Recomendado — passo 3.')}\n    <div class=\"row\" style=\"margin-top:14px;justify-content:space-between\"><label class=\"row\" style=\"gap:10px\"><label class=\"switch\"><input type=\"checkbox\" data-act-change=\"bot-toggle\" ${st.bot_enabled ? 'checked' : ''}><span></span></label><b>Bot ${st.bot_enabled ? 'ligado' : 'desligado'}</b></label><span class=\"hint\">Desligado = recebe os eventos mas não responde nada.</span></div>\n  </section>\n\n  <section class=\"card\">\n    <h2>1. Conectar o Instagram</h2>\n    ${acc ? `<div class=\"acc-card\">${acc.picture ? `<img src=\"${esc(acc.picture)}\" alt=\"\">` : ''}<div style=\"flex:1\"><b>@${esc(acc.username)}</b><div class=\"hint\">${esc(acc.name || '')} · ID ${esc(acc.id)}</div>\n        ${acc.mode === 'fb'\n          ? `<div class=\"hint\">Conectado pelo Facebook · Página \"${esc(acc.page_name)}\" · ${acc.token_expires_at === 0 ? 'token permanente ✅' : acc.token_expires_at ? '⚠️ token expira em ' + fmtDate(acc.token_expires_at) : 'validade do token desconhecida'}</div>`\n          : `<div class=\"hint\">Token atualizado ${tokenDays === null ? '—' : tokenDays === 0 ? 'hoje' : 'há ' + tokenDays + ' dia(s)'} · renova sozinho antes de vencer</div>`}</div></div>\n      <div class=\"row\" style=\"margin-top:12px\">${acc.mode === 'fb' ? '' : '<button data-act=\"refresh-token\">↻ Renovar token agora</button>'}<button data-act=\"resubscribe\">↻ Assinar eventos de novo</button><button class=\"ghost danger\" data-act=\"disconnect\">Desconectar</button></div>\n      <details style=\"margin-top:14px\"><summary class=\"hint\" style=\"cursor:pointer\">Trocar de token / conta</summary>` : `<p class=\"hint\">Gere o token no painel da Meta (<b>Configuração da API com login do Facebook → Gerar tokens de acesso</b>, ou no <a href=\"https://developers.facebook.com/tools/explorer/\" target=\"_blank\" rel=\"noopener\">Explorador da Graph API</a>) e cole aqui. Aceita token do Facebook (começa com <code>EAA</code>) ou do Instagram (começa com <code>IG</code>).</p>`}\n    <label class=\"lbl\">Token de acesso</label>\n    <textarea id=\"tok\" rows=\"3\" placeholder=\"Cole aqui o token (EAA… ou IG…)\"></textarea>\n    <label class=\"lbl\">Chave secreta do aplicativo <span class=\"hint\">(Configurações do app → Básico → Chave secreta do aplicativo)</span></label>\n    <input type=\"password\" id=\"tok-secret\" placeholder=\"Recomendado: deixa o token permanente e protege o webhook\" autocomplete=\"off\">\n    <button class=\"primary\" data-act=\"connect\" style=\"margin-top:10px\">Conectar</button>\n    ${acc ? '</details>' : ''}\n  </section>\n\n  <section class=\"card\">\n    <h2>2. Webhook (cole no painel da Meta)</h2>\n    <p class=\"hint\">Na Meta, em <b>Configuração da API → Configurar webhooks</b> (ou no menu <b>Webhooks</b>, objeto <b>Instagram</b>):</p>\n    <label class=\"lbl\">URL de retorno de chamada (Callback URL)</label>${copyField('wh-url', st.webhook_url)}\n    <label class=\"lbl\">Token de verificação (Verify token)</label>${copyField('wh-tok', st.verify_token)}\n    <p class=\"hint\" style=\"margin-top:10px\">Depois de clicar em <b>Verificar e salvar</b>, ative as assinaturas destes campos: ${st.subscribe_fields.map((f) => `<code>${f}</code>`).join(', ')}.</p>\n  </section>\n\n  <section class=\"card\">\n    <h2>3. Chave secreta do app (recomendado)</h2>\n    <p class=\"hint\">Garante que só a Meta consegue mandar eventos para o seu bot. Na Meta: <b>Configurações do app → Básico → Chave secreta do aplicativo</b> (se você colou ela ao conectar, já está salva). ${st.app_secret_set ? '<span class=\"pill ok\">configurada</span>' : ''}</p>\n    <div class=\"copy\"><input type=\"password\" id=\"secret\" placeholder=\"${st.app_secret_set ? '•••••••• (deixe vazio e salve para remover)' : 'Cole a chave secreta aqui'}\" autocomplete=\"off\"><button data-act=\"save-secret\">Salvar</button></div>\n    <p class=\"hint\" style=\"margin-top:8px\">Se o Registro mostrar \"assinatura inválida\", a chave está errada — apague o campo e salve para desativar a checagem.</p>\n  </section>\n\n  <section class=\"card\">\n    <h2>4. Links exigidos pela Meta</h2>\n    <p class=\"hint\">Em <b>Configurações do app → Básico</b>:</p>\n    <label class=\"lbl\">URL da Política de Privacidade</label>${copyField('pp-url', st.privacy_url)}\n    <label class=\"lbl\">URL de exclusão de dados do usuário</label>${copyField('del-url', st.deletion_url)}\n  </section>\n\n  ${st.password_in_cloudflare ? '' : `<section class=\"card\">\n    <h2>Senha do painel</h2>\n    <div class=\"grid2\"><input type=\"password\" id=\"pw-cur\" placeholder=\"Senha atual\" autocomplete=\"current-password\"><span></span>\n    <input type=\"password\" id=\"pw-new\" placeholder=\"Nova senha (mín. 8)\" autocomplete=\"new-password\"><input type=\"password\" id=\"pw-new2\" placeholder=\"Repita a nova senha\" autocomplete=\"new-password\"></div>\n    <button data-act=\"change-pw\" style=\"margin-top:10px\">Trocar senha</button>\n  </section>`}\n\n  <section class=\"card\"><div class=\"row\"><span class=\"hint\" style=\"flex:1\">Sair deste navegador</span><button data-act=\"logout\">Sair</button></div></section>`);\n}\n\n// ---------------------------------------------------------------- ações (cliques)\nconst ACT = {\n  new: () => chooseTemplate(),\n  edit: (el) => { location.hash = '#edit/' + el.dataset.id; },\n  async dup(el) {\n    const a = S.autos.find((x) => x.id === el.dataset.id);\n    const c = JSON.parse(JSON.stringify(a));\n    delete c.id;\n    c.name = a.name + ' (cópia)';\n    c.enabled = false;\n    await api('automations', { method: 'POST', body: c });\n    await refreshState();\n    renderAutos();\n    toast('Duplicada (desligada) ✅', 'ok');\n  },\n  async del(el) {\n    const a = S.autos.find((x) => x.id === el.dataset.id);\n    if (!(await confirmBox(`Excluir a automação <b>${esc(a.name)}</b>? Isso não pode ser desfeito.`, 'Excluir', true))) return;\n    await api('automations/' + a.id, { method: 'DELETE' });\n    await refreshState();\n    renderAutos();\n    toast('Excluída', 'ok');\n  },\n  async move(el) {\n    const i = +el.dataset.i;\n    const j = i + +el.dataset.dir;\n    const ids = S.autos.map((a) => a.id);\n    [ids[i], ids[j]] = [ids[j], ids[i]];\n    await api('automations/reorder', { method: 'POST', body: { ids } });\n    await refreshState();\n    renderAutos();\n  },\n  cancel: () => { location.hash = '#autos'; },\n  save: () => saveDraft(),\n  match(el) { S.draft.trigger.match = el.dataset.v; S.dirty = true; renderEditorBody(); },\n  'posts-all'() { S.draft.trigger.posts = []; S.dirty = true; renderEditorBody(); },\n  'posts-pick'() {\n    if (!S.st.account) return toast('Conecte o Instagram primeiro (Configurações).', 'err');\n    openPostsPicker();\n  },\n  'blk-add'(el) {\n    S.draft.messages.push(newBlock(el.dataset.type));\n    S.dirty = true;\n    renderEditorBody();\n    const last = $('#blk-' + (S.draft.messages.length - 1));\n    if (last) last.scrollIntoView({ behavior: 'smooth', block: 'center' });\n  },\n  'blk-del'(el) { S.draft.messages.splice(+el.dataset.i, 1); S.dirty = true; renderEditorBody(); },\n  'blk-move'(el) {\n    const i = +el.dataset.i;\n    const j = i + +el.dataset.dir;\n    const ms = S.draft.messages;\n    [ms[i], ms[j]] = [ms[j], ms[i]];\n    S.dirty = true;\n    renderEditorBody();\n  },\n  'btn-add'(el) {\n    const list = getPath(S.draft, el.dataset.path);\n    list.push(S.draft.trigger.type === 'comment' && el.dataset.path === 'opening.buttons' && list.length && !list.some((b) => b.type === 'flow') ? { type: 'flow', title: 'Quero! 💖', target: 'self' } : { type: 'url', title: '', url: '' });\n    S.dirty = true;\n    renderEditorBody();\n  },\n  'btn-del'(el) { getPath(S.draft, el.dataset.path).splice(+el.dataset.i, 1); S.dirty = true; renderEditorBody(); },\n  'opt-add'(el) { getPath(S.draft, el.dataset.path).push({ title: '', target: '' }); S.dirty = true; renderEditorBody(); },\n  'opt-del'(el) { getPath(S.draft, el.dataset.path).splice(+el.dataset.i, 1); S.dirty = true; renderEditorBody(); },\n  'img-pick'(el) {\n    openGallery((x) => {\n      const m = getPath(S.draft, el.dataset.path);\n      m.media_id = x.id;\n      m.media_ext = x.ext;\n      m.url = '';\n      S.dirty = true;\n      renderEditorBody();\n    });\n  },\n  'img-clear'(el) { const m = getPath(S.draft, el.dataset.path); m.media_id = ''; m.media_ext = ''; m.url = ''; S.dirty = true; renderEditorBody(); },\n  var(el) {\n    const ta = document.getElementById(el.dataset.target);\n    if (!ta) return;\n    const s = ta.selectionStart ?? ta.value.length;\n    const e = ta.selectionEnd ?? ta.value.length;\n    ta.value = ta.value.slice(0, s) + el.dataset.v + ta.value.slice(e);\n    ta.focus();\n    ta.selectionStart = ta.selectionEnd = s + el.dataset.v.length;\n    ta.dispatchEvent(new Event('input', { bubbles: true }));\n  },\n  copy: (el) => copy(document.getElementById(el.dataset.src).value),\n  'copy-text': (el) => copy(el.dataset.text),\n  async 'media-del'(el) {\n    if (!(await confirmBox('Excluir esta imagem? Automações que usam ela vão ficar sem a imagem.', 'Excluir', true))) return;\n    await api('media/' + el.dataset.id, { method: 'DELETE' });\n    drawMedia();\n  },\n  'export-csv': () => exportCsv().catch((e) => toast(e.message, 'err')),\n  'logs-reload': () => drawLogs(),\n  async 'logs-clear'() {\n    if (!(await confirmBox('Apagar todo o registro?', 'Apagar', true))) return;\n    await api('logs', { method: 'DELETE' });\n    drawLogs();\n  },\n  async connect(el) {\n    const token = $('#tok').value.trim();\n    const secret = $('#tok-secret').value.trim();\n    if (!token) return toast('Cole o token primeiro.', 'err');\n    el.disabled = true;\n    el.innerHTML = '<span class=\"spinner\"></span> Conectando…';\n    try {\n      const r = await api('connect', { method: 'POST', body: { token, secret } });\n      await refreshState();\n      renderSettings();\n      if (r.subscribe && r.subscribe.ok) toast('Conectado como @' + r.account.username + ' ✅', 'ok');\n      else if (r.subscribe && r.subscribe.manual) { toast('Conectado como @' + r.account.username + ' ✅', 'ok'); (r.notes = r.notes || []).unshift(r.subscribe.error); }\n      else toast('Conectado, mas não consegui assinar os eventos: ' + (r.subscribe && r.subscribe.error), 'err');\n      if (r.notes && r.notes.length) modal(`<h2>Conectado, com observações</h2><ul>${r.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul><div class=\"modal-foot\"><span class=\"spacer\"></span><button class=\"primary\" data-close>Ok</button></div>`);\n    } catch (e) {\n      if (e.message !== 'auth') toast(e.message, 'err');\n      el.disabled = false;\n      el.textContent = 'Conectar';\n    }\n  },\n  async disconnect() {\n    if (!(await confirmBox('Desconectar o Instagram? O bot para de responder até você conectar de novo.', 'Desconectar', true))) return;\n    await api('disconnect', { method: 'POST', body: {} });\n    await refreshState();\n    renderSettings();\n  },\n  async 'refresh-token'(el) {\n    el.disabled = true;\n    try {\n      const r = await api('refresh-token', { method: 'POST', body: {} });\n      if (r.ok) toast('Token renovado ✅', 'ok');\n      else toast(r.error || 'Não foi possível renovar', 'err');\n      await refreshState();\n      renderSettings();\n    } catch (e) { if (e.message !== 'auth') toast(e.message, 'err'); el.disabled = false; }\n  },\n  async resubscribe(el) {\n    el.disabled = true;\n    try { const r = await api('subscribe', { method: 'POST', body: {} }); toast('Eventos assinados: ' + r.fields.join(', '), 'ok'); }\n    catch (e) { if (e.message !== 'auth') toast(e.message, 'err'); }\n    el.disabled = false;\n  },\n  async 'save-secret'() {\n    const v = $('#secret').value.trim();\n    await api('settings', { method: 'POST', body: { app_secret: v } });\n    await refreshState();\n    renderSettings();\n    toast(v ? 'Chave salva ✅' : 'Checagem de assinatura desativada', 'ok');\n  },\n  async logout() {\n    await api('logout', { method: 'POST', body: {} });\n    showLogin();\n  },\n  async 'change-pw'() {\n    const cur = $('#pw-cur').value, nw = $('#pw-new').value;\n    if (nw.length < 8) return toast('A nova senha precisa ter pelo menos 8 caracteres.', 'err');\n    if (nw !== $('#pw-new2').value) return toast('As novas senhas não são iguais.', 'err');\n    await api('password', { method: 'POST', body: { current: cur, password: nw } });\n    ['#pw-cur', '#pw-new', '#pw-new2'].forEach((s) => ($(s).value = ''));\n    toast('Senha alterada ✅', 'ok');\n  },\n};\ndocument.addEventListener('click', (e) => {\n  const el = e.target.closest('[data-act]');\n  if (!el || el.disabled) return;\n  const fn = ACT[el.dataset.act];\n  if (!fn) return;\n  e.preventDefault();\n  Promise.resolve(fn(el, e)).catch((err) => { if (err && err.message !== 'auth' && err.message !== 'setup') toast(err.message, 'err'); });\n});\ndocument.addEventListener('change', async (e) => {\n  const el = e.target;\n  if (el.dataset.actChange === 'toggle') {\n    const a = S.autos.find((x) => x.id === el.dataset.id);\n    a.enabled = el.checked;\n    try { await api('automations/' + a.id, { method: 'PUT', body: a }); el.closest('.auto').classList.toggle('off', !a.enabled); toast(a.enabled ? 'Ligada ✅' : 'Desligada', 'ok'); }\n    catch (err) { el.checked = !el.checked; a.enabled = el.checked; if (err.message !== 'auth') toast(err.message, 'err'); }\n    return;\n  }\n  if (el.dataset.actChange === 'bot-toggle') {\n    try { await api('settings', { method: 'POST', body: { bot_enabled: el.checked } }); await refreshState(); renderSettings(); toast(el.checked ? 'Bot ligado ✅' : 'Bot desligado', 'ok'); }\n    catch (err) { if (err.message !== 'auth') toast(err.message, 'err'); }\n    return;\n  }\n  if (el.dataset.bind && S.draft) {\n    bindInput(el);\n    if (el.dataset.rerender || el.dataset.rerenderBlur) renderEditorBody();\n  }\n});\ndocument.addEventListener('input', (e) => {\n  const el = e.target;\n  if (el.dataset && el.dataset.bind && S.draft && el.tagName !== 'SELECT' && el.type !== 'checkbox') bindInput(el);\n});\nfunction bindInput(el) {\n  let v;\n  if (el.type === 'checkbox') v = el.checked;\n  else if (el.dataset.kind === 'list') v = el.value.split(',').map((x) => x.trim()).filter(Boolean);\n  else if (el.dataset.kind === 'lines') v = el.value.split('\\n').map((x) => x.trim()).filter(Boolean);\n  else if (el.type === 'number') v = Number(el.value) || 1;\n  else v = el.value;\n  setPath(S.draft, el.dataset.bind, v);\n  S.dirty = true;\n  updateDirty();\n  if (el.tagName === 'TEXTAREA' && el.dataset.limit) updateCounter(el);\n  if (el.dataset.bind === 'trigger.ref') {\n    const clean = el.value.toLowerCase().replace(/[^a-z0-9_-]/g, '');\n    S.draft.trigger.ref = clean;\n    const l = $('#ref-link');\n    if (l) l.value = `https://ig.me/m/${S.st.account ? S.st.account.username : 'seu_usuario'}?ref=${clean || 'codigo'}`;\n  }\n  renderPreview();\n}\n\nboot();\n<\/script>\n</body>\n</html>\n";

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
  u.searchParams.set('access_token', s.ig_token || '');
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
  else if (r.code === 10 || r.code === 200 || m.includes('permission')) hint = ' → falta permissão no app da Meta ou "Permitir acesso às mensagens" está desligado no Instagram.';
  else if (r.code === 551 || m.includes('not available')) hint = ' → essa pessoa não pode receber mensagens agora.';
  else if (r.code === 4 || r.code === 613 || m.includes('limit')) hint = ' → limite de envio da Meta atingido, tente mais tarde.';
  return (r.code ? '[' + r.code + (r.sub ? '/' + r.sub : '') + '] ' : '') + r.error + hint;
}
const isWindowError = (r) => r && (r.sub === 2534022 || /window/i.test(r.error || ''));

// No login do Facebook as mensagens saem pela Página; no login do Instagram, pela própria conta.
const messagesPath = (s) => '/' + (s.api_mode === 'fb' ? s.fb_page_id : s.ig_user_id || 'me') + '/messages';
function sendMessage(s, recipient, message) {
  return ig(s, 'POST', messagesPath(s), {}, { recipient, message });
}
function senderAction(s, id, action) {
  return ig(s, 'POST', messagesPath(s), {}, { recipient: { id }, sender_action: action });
}

async function subscribeWebhooks(s) {
  const fb = s.api_mode === 'fb';
  const tries = fb ? FB_PAGE_FIELDS : [SUBSCRIBE_FIELDS, ['comments', 'messages', 'messaging_postbacks'], ['comments', 'messages']];
  const path = fb ? '/' + s.fb_page_id + '/subscribed_apps' : '/me/subscribed_apps';
  let last;
  for (const f of tries) {
    const r = await ig(s, 'POST', path, { subscribed_fields: f.join(',') });
    if (r.ok) return { ok: true, fields: f };
    last = r;
  }
  if (fb) return { ok: false, manual: true, error: 'O bot não conseguiu se inscrever sozinho na Página (falta a permissão pages_manage_metadata, e tudo bem). Faça isso na Meta: em "Configuração da API com login do Facebook", no passo de tokens/webhooks, ative a "Assinatura do webhook" da sua Página. Detalhe técnico: ' + explain(last) };
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
    // Token de usuário: troca por um de longa duração para que o token da Página não expire.
    if (secret) {
      const app = await ig(t, 'GET', '/app', { fields: 'id' });
      const ex = app.ok && app.data.id
        ? await ig(t, 'GET', '/oauth/access_token', { grant_type: 'fb_exchange_token', client_id: app.data.id, client_secret: secret, fb_exchange_token: token })
        : app;
      if (ex.ok && ex.data.access_token) {
        const acc2 = await pageList(ex.data.access_token);
        if (acc2.ok) acc = acc2;
      } else notes.push('Não consegui transformar em token permanente (' + explain(ex) + '). Confira a chave secreta do aplicativo.');
    }
    pages = (acc.data.data || []).filter((p) => p.instagram_business_account);
  } else {
    // Provavelmente já é um token de Página.
    const pg = await ig(t, 'GET', '/' + me.data.id, { fields: 'id,name,' + igFields });
    if (pg.ok && pg.data.instagram_business_account) pages = [{ id: pg.data.id, name: pg.data.name, access_token: token, instagram_business_account: pg.data.instagram_business_account }];
  }
  if (!pages.length) {
    return {
      error:
        'Não encontrei nenhuma Página do Facebook com uma conta profissional do Instagram ligada a ela, para esse token. Confira: (1) seu Instagram está conectado a uma Página do Facebook; (2) ao gerar o token, você marcou essa Página e a conta do Instagram; (3) as permissões pages_show_list e instagram_basic foram concedidas.',
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
    await setSettings(env, upd);
    const s2 = await getSettings(env);
    const sub = await subscribeWebhooks(s2);
    const via = s2.api_mode === 'fb' ? ` (via Página do Facebook "${s2.fb_page_name}")` : '';
    const details = [sub.ok ? 'Eventos assinados: ' + sub.fields.join(', ') : 'Não consegui assinar os eventos: ' + sub.error, ...notes].join(' | ');
    await log(env, sub.ok && !notes.length ? 'ok' : 'aviso', `Instagram conectado: @${s2.ig_username}${via}`, details);
    return json({ ok: true, account: accountInfo(s2), subscribe: sub, notes });
  }
  if (r === 'disconnect' && method === 'POST') {
    await setSettings(env, { ig_token: null, ig_user_id: null, ig_app_scoped_id: null, ig_username: null, ig_name: null, ig_picture: null, token_updated_at: null, api_mode: null, fb_page_id: null, fb_page_name: null, token_expires_at: null });
    await log(env, 'info', 'Instagram desconectado do painel.');
    return json({ ok: true });
  }
  if (r === 'refresh-token' && method === 'POST') {
    return json(await refreshToken(env, s, true));
  }
  if (r === 'subscribe' && method === 'POST') {
    if (!s.ig_token) return json({ error: 'Conecte o Instagram primeiro.' }, 400);
    const sub = await subscribeWebhooks(s);
    await log(env, sub.ok ? 'ok' : 'erro', sub.ok ? 'Eventos assinados: ' + sub.fields.join(', ') : 'Falha ao assinar eventos: ' + sub.error);
    return json(sub, sub.ok ? 200 : 400);
  }

  return json({ error: 'Rota não encontrada' }, 404);
}
