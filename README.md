# InstaBot

Bot de automação para Instagram (comentário → Direct, boas-vindas, palavras-chave, link da bio, stories), usando só a API oficial da Meta. Roda de graça no Cloudflare Workers.

- **Painel:** `https://chatcapivara1-0.lucaslorentz96.workers.dev/admin` (a senha é criada no primeiro acesso)
- **Passo a passo:** veja [GUIA.md](GUIA.md)

## Estrutura
| Arquivo | O que é |
|---|---|
| `worker.js` | O bot pronto (gerado — é ele que vai para a Cloudflare) |
| `src/worker.src.js` | Código do servidor (webhook, regras, API do painel) |
| `src/panel.html` | Painel de controle |
| `build.mjs` | Junta os dois em `worker.js` (`node build.mjs`) |
| `wrangler.jsonc` | Configuração da Cloudflare (cria banco e armazenamento sozinho) |

Cada push na branch `main` publica automaticamente na Cloudflare (Workers Builds).
