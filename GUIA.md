# InstaBot: guia de instalação

O setup leva uns 20 minutos e custa **R$ 0**. Faça pelo computador.

Você vai precisar de:
- a conta do **GitHub**, onde fica o código do bot;
- a conta da **Cloudflare** (entrando com o GitHub) e o **Meta for Developers**;
- uma **segunda conta do Instagram** para testar (o bot ignora os comentários que você mesma faz).

> Os nomes dos botões podem mudar um pouco conforme o idioma ou alguma atualização dos sites. Se não achar algo, procure por um nome parecido.

---

## PARTE 1: Hospedagem grátis (GitHub + Cloudflare)

Funciona assim: o código fica num repositório seu no GitHub, e a Cloudflare publica sozinha. Quando o código é atualizado no GitHub, o bot se atualiza sozinho.

### 1.1 Repositório no GitHub ✅
O código já está no repositório **`lucaslorentz96-debug/chatcapivara1.0`**.

### 1.2 Conectar o repositório na Cloudflare
1. Entre em **dash.cloudflare.com → Workers & Pages → Create** (Criar).
2. Escolha **Import a repository** (Importar repositório) e depois **GitHub**.
   - Se o `chatcapivara1.0` não aparecer na lista, clique em **Add account / Configure GitHub app** (ou "Gerenciar acesso"). No GitHub, libere o acesso ao repositório (ou a todos) e salve.
3. Selecione o repositório **chatcapivara1.0** e confira:
   - **Build command:** deixe vazio
   - **Deploy command:** `npx wrangler deploy`
4. Clique em **Save and Deploy** (ou "Create and deploy").
5. Espere 1 ou 2 minutos. A Cloudflare cria sozinha o **banco de dados** e o **armazenamento de imagens**.

> **Já existe um Worker da tentativa que falhou?** Não precisa criar outro: abra esse Worker, vá em **Deployments** (ou Builds) e clique em **Retry build** (Tentar de novo). Ele falhou porque o repositório estava vazio, e agora o código já está lá.

### 1.3 Abrir o painel e criar a senha
1. O endereço do seu bot é **`https://chatcapivara1-0.lucaslorentz96.workers.dev`**.
2. O painel fica em **`https://chatcapivara1-0.lucaslorentz96.workers.dev/admin`**.
3. No primeiro acesso, o painel pede para **criar a senha**. Crie logo, porque quem abrir o endereço primeiro define a senha.
4. Vá em **⚙️ Configurações** e deixe essa aba aberta. Você vai copiar dados dela na parte 2.

> **Alternativa sem GitHub:** em Workers & Pages → Create → **Start with Hello World!**, clique em **Edit code**, cole todo o conteúdo do `worker.js` e clique em **Deploy**. Nesse caso, você também precisa criar à mão um banco D1 e um KV e ligá-los ao Worker em **Bindings**, com os nomes `DB` e `MEDIA`.

---

## PARTE 2: Meta for Developers (ligar o Instagram)

> Desde o fim de outubro de 2026, apps novos da Meta só oferecem duas opções: **login do Facebook** e **login unificado**. O bot usa o **login do Facebook**, o mesmo método que o ManyChat usa.

### Antes de começar: seu Instagram precisa estar ligado a uma Página do Facebook
No app do Instagram, vá em **Perfil → Editar perfil → Página**. Se aparecer o nome de uma Página, está pronto. Se não aparecer, toque em **Conectar ou criar** e siga os passos.

### 2.1 Criar o app
1. Entre em **developers.facebook.com → Meus apps → Criar app**.
2. Preencha:
   - Nome: `InstaBot Isa`
   - E-mail: o seu
3. No **caso de uso**, escolha **"Gerenciar mensagens e conteúdo no Instagram"**.
4. Se perguntar sobre portfólio empresarial, escolha **"Ainda não quero conectar"**. Depois, **Avançar** até **Ir para o painel**.

### 2.2 Permissões
1. No menu da esquerda, abra **Casos de uso** e clique em **Personalizar** no caso de uso do Instagram.
2. No menu interno, escolha **"Configuração da API com login do Facebook"**.
   - **Não** use "API setup with Unified login": essa opção exige portfólio empresarial.
3. No passo **"1. Adicionar permissões obrigatórias"**, clique nos dois botões:
   - **Add required messaging permissions**
   - **Add required content permissions**
4. No menu interno, abra **"Permissões e recursos"**, procure e clique em **Adicionar** nestas duas:
   - `instagram_manage_comments` (para responder comentários)
   - `pages_manage_metadata` (para o bot receber os eventos)

### 2.3 Gerar o token e conectar o bot
**Opção A, na própria página:** se a "Configuração da API com login do Facebook" tiver o passo **"Gerar tokens de acesso"**, conecte sua Página e o Instagram, clique em **Gerar token** e copie.

**Opção B, que sempre funciona: Explorador da Graph API**
1. Abra **developers.facebook.com/tools/explorer**.
2. À direita, preencha:
   - **Aplicativo da Meta:** `InstaBot Isa`
   - **Usuário ou Página:** "Token do usuário"
3. Em **Permissões**, adicione:
   - `instagram_basic`
   - `instagram_manage_messages`
   - `instagram_manage_comments`
   - `pages_show_list`
   - `pages_read_engagement`
   - `pages_manage_metadata`
   - `business_management`
4. Clique em **Generate Access Token** (Gerar token de acesso). Entre no Facebook e **marque a sua Página e a sua conta do Instagram**.
5. Copie o token. Ele começa com `EAA`.

**Depois, no painel do bot:**
1. Vá em **Configurações → 1. Conectar o Instagram** e cole o token.
2. No campo **Chave secreta do aplicativo**, cole a chave que fica na Meta em **Configurações do app → Básico → Chave secreta do aplicativo → Mostrar**.
3. Clique em **Conectar**. O bot transforma o token num **token permanente** da Página.

### 2.4 Configurar o webhook
1. Na "Configuração da API com login do Facebook", vá ao passo **"Configurar webhooks"**. Se não achar, use o menu da esquerda **Webhooks** e escolha o objeto **Instagram**.
2. Preencha:
   - **URL de retorno de chamada:** `https://chatcapivara1-0.lucaslorentz96.workers.dev/webhook`
   - **Verificar token:** copie do **painel → Configurações → 2** (começa com `ib_`)
3. Clique em **Verificar e salvar**.
4. Clique em **Assinar** (*Subscribe*) nestes campos:
   - `comments`
   - `messages`
   - `messaging_postbacks`
   - `messaging_referral`

### 2.5 Informações básicas do app
1. Abra **Configurações do app → Básico** e preencha:
   - **URL da Política de Privacidade:** `https://chatcapivara1-0.lucaslorentz96.workers.dev/privacidade`
   - **URL de exclusão de dados do usuário:** `https://chatcapivara1-0.lucaslorentz96.workers.dev/exclusao`
   - **Categoria:** "Negócios e páginas"
   - **Ícone:** qualquer imagem quadrada de 1024×1024
2. Clique em **Salvar alterações**.

### 2.6 Publicar o app
1. No menu da esquerda, clique em **Publicar** (ou mude o **Modo do app** para **Ao vivo**). Sem isso, o Instagram só avisa o bot sobre contas de teste.
2. Se a Meta pedir **Análise do app**, me avise que eu te ajudo com o pedido.

---

## PARTE 3: Instagram

### 3.1 Permitir acesso às mensagens
No app do Instagram (celular), vá em **Configurações e privacidade → Mensagens e respostas ao story → Ferramentas conectadas** e ligue **"Permitir acesso às mensagens"**.
(Como o ManyChat já funciona na sua conta, isso provavelmente já está ligado.)

### 3.2 Evitar respostas duplicadas com o ManyChat
Se o ManyChat e o InstaBot estiverem ligados com as **mesmas palavras-chave**, a pessoa recebe **duas DMs**.
- **Para testar:** crie no InstaBot uma automação com uma palavra que o ManyChat não usa, por exemplo **TESTEBOT**.
- **Quando estiver tudo certo:** no ManyChat, desligue as automações ou desconecte o Instagram (Configurações → Instagram → Desconectar).

---

## PARTE 4: Testar

1. No painel, crie uma automação **💬 Comentário → Direct** com a palavra-chave `testebot`, escreva a mensagem e clique em **Salvar**.
2. Com a **outra conta** do Instagram, comente `testebot` num post seu.
3. Em alguns segundos, a outra conta deve receber a DM e uma resposta no comentário.
4. No painel, abra **📋 Registro** para ver o que aconteceu. Se der erro, aparece o motivo explicado.

---

## O que dá para criar no painel

| Gatilho | Quando dispara |
|---|---|
| 💬 Comentário → Direct | Alguém comenta a palavra-chave (em todos os posts ou só nos escolhidos) |
| 🔑 Palavra-chave no Direct | Alguém manda a palavra-chave no Direct |
| 👋 Boas-vindas | Primeira mensagem que a pessoa te manda |
| 🔗 Link da bio (ig.me) | Alguém clica no seu link `ig.me/m/dicasdaisaoliveira?ref=…` |
| 📸 Resposta ao story | Alguém responde um story seu |
| 📣 Menção no story | Alguém te marca num story |
| 🤖 Resposta padrão | Nenhuma outra automação reconheceu a mensagem (no máx. 1x a cada 24h por pessoa) |
| 🧩 Sub-fluxo | Só quando a pessoa clica num botão que aponta para ele (menus e etapas) |

Tipos de mensagem: **texto** (com emojis, links e até 3 botões), **imagem**, **cartão** (imagem + título + botões), **respostas rápidas** (opções clicáveis) e **pausa "digitando…"**.

Variáveis que você pode usar no texto: `{nome}`, `{primeiro_nome}`, `{username}`.

**Regra da Meta sobre comentários:** a primeira DM, a que responde o comentário, é **uma única mensagem**, com texto e até 3 botões. Para mandar imagens e outras mensagens depois, coloque nessa DM um botão **▶ Continuar fluxo**. Quando a pessoa clica, o bot manda o resto.

---

## Problemas comuns

| O que aparece | O que fazer |
|---|---|
| Painel mostra "Quase lá!" | O banco de dados não foi ligado. Veja em Workers & Pages → instabot → Deployments se o último deploy terminou com sucesso. |
| Cloudflare diz "Fetching repository failed" | A Cloudflare não tem acesso ao repositório: libere em "Configure GitHub app" (passo 1.2), ou o repositório ainda está vazio. |
| "Webhook verificado" não fica ✅ | Confira se copiou certinho a URL e o token de verificação (2.4). |
| Ninguém recebe nada e o "Recebendo eventos" não fica ✅ | O app ainda está em Desenvolvimento (2.6), ou os campos não foram assinados (2.4). Clique também em **Assinar eventos de novo** no painel. |
| Registro diz "assinatura inválida" | A chave secreta está errada (2.5). Cole de novo ou apague o campo e salve. |
| Registro diz "token expirado" `[190]` | Gere um token novo (2.3) e conecte de novo. |
| Registro diz "falta permissão" | Confira as permissões (2.2) e o "Permitir acesso às mensagens" (3.1). |
| Comentei e não aconteceu nada | Comente com **outra conta**: o bot ignora os seus próprios comentários. |

---

## Atualizar o bot no futuro
É automático: quando o código muda no repositório `chatcapivara1.0` do GitHub, a Cloudflare publica a versão nova em 1 ou 2 minutos. Suas automações, imagens e contatos **não se perdem**, porque ficam no banco de dados, não no código.

## Limites do plano grátis (sobra muito)
- **Cloudflare Workers:** 100 mil acessos por dia.
- **D1 (banco):** 5 GB e 100 mil gravações por dia.
- **KV (imagens):** 1 GB e mil envios de imagem por dia.
- **Meta:** existe um limite de DMs automáticas por hora, que vale igual para o ManyChat.
