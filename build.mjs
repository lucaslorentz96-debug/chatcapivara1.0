// Gera o worker.js final (um arquivo só, para colar na Cloudflare).
// Uso: node build.mjs
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync(new URL('./src/worker.src.js', import.meta.url), 'utf8');
const panel = readFileSync(new URL('./src/panel.html', import.meta.url), 'utf8');
if (!src.includes('__PANEL_HTML__')) throw new Error('placeholder não encontrado');
const out = src.replace('__PANEL_HTML__', () => JSON.stringify(panel).replace(/<\/script/gi, '<\\/script'));
writeFileSync(new URL('./worker.js', import.meta.url), out);
console.log('worker.js gerado:', (out.length / 1024).toFixed(1), 'KB');
