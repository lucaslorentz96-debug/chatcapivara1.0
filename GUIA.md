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
   - **Project name:** `instabot`
   - **Build command:** deixe vazio
   - **Deploy command:** `npx wrangler deploy`
4. Clique em **Save and Deploy** (ou "Create and deploy").
5. Espere 1 ou 2 minutos. A Cloudflare cria sozinha o **banco de dados** e o **armazenamento de imagens**.

> **Já existe um Worker da tentativa que falhou?** Não precisa criar outro: abra esse Worker, vá em **Deployments** (ou Builds) e clique em **Retry build** (Tentar de novo). Ele falhou porque o repositório estava vazio, e agora o código já está lá.

### 1.3 Abrir o painel e criar a senha
1. No Worker, copie o endereço que aparece. É algo como `https://instabot.SEU-SUBDOMINIO.workers.dev`.
2. Abra esse endereço com **`/admin`** no final: `https://instabot.SEU-SUBDOMINIO.workers.dev/admin`
3. No primeiro acesso, o painel pede para **criar a senha**. Crie logo, porque quem abrir o endereço primeiro define a senha.
4. Vá em **⚙️ Configurações** e deixe essa aba aberta. Você vai copiar dados dela na parte 2.

> **Alternativa sem GitHub:** em Workers & Pages → Create → **Start with Hello World!**, clique em **Edit code**, cole todo o conteúdo do `worker.js` e clique em **Deploy**. Nesse caso, você também precisa criar à mão um banco D1 e um KV e ligá-los ao Worker em **Bindings**, com os nomes `DB` e `MEDIA`.

---

## PARTE 2: Meta for Developers (ligar o Instagram)

### 2.1 Criar o app
1. Entre em **developers.facebook.com → Meus apps → Criar app**.
2. No nome, coloque **`InstaBot Isa`** e informe o seu e-mail.
3. No **caso de uso**, escolha **"Gerenciar mensagens e conteúdo no Instagram"** (em inglês: *Manage messaging & content on Instagram*).
4. Se perguntar sobre **portfólio empresarial**, pode pular ("Não quero conectar agora").
5. Conclua a criação do app.

### 2.2 Abrir a configuração da API
1. No painel do app, abra **Casos de uso** e clique em **Personalizar** no caso de uso do Instagram.
2. Entre em **"Configuração da API com login do Instagram"** (*API setup with Instagram business login*).
3. Confira se estas permissões estão na lista. Se aparecer um botão "Adicionar" ao lado de alguma, clique nele:
   - `instagram_business_basic`
   - `instagram_business_manage_messages`
   - `instagram_business_manage_comments`

### 2.3 Gerar o token e conectar no painel
1. Na mesma página, encontre **"Gerar tokens de acesso"** e clique em **Adicionar conta**.
2. Entre com o Instagram **@dicasdaisaoliveira** e autorize tudo.
3. Clique em **Gerar token** ao lado da conta e copie o token. Ele começa com `IG…`.
4. No **painel do bot → Configurações → 1. Conectar o Instagram**, cole o token e clique em **Conectar**.
5. Deve aparecer "Conectado como @dicasdaisaoliveira ✅".

### 2.4 Configurar o webhook (por onde o Instagram avisa o bot)
1. Na página da Meta, encontre **"Configurar webhooks"**.
2. Copie do **painel do bot → Configurações → 2. Webhook** e cole na Meta:
   - **URL de retorno de chamada** (Callback URL)
   - **Verificar token** (Verify token)
3. Clique em **Verificar e salvar**. No painel do bot deve aparecer ✅ "Webhook verificado pela Meta".
4. Logo abaixo aparece a lista de campos. Clique em **Assinar** (Subscribe) em:
   - `comments`
   - `messages`
   - `messaging_postbacks`
   - `messaging_referral`

### 2.5 Chave secreta (segurança)
1. No topo da mesma página da Meta aparece a **"Chave secreta do app do Instagram"** (*Instagram app secret*). Clique em **Mostrar** e copie.
2. Cole no **painel do bot → Configurações → 3. Chave secreta** e clique em **Salvar**.

### 2.6 Links de privacidade e publicar o app
1. Na Meta, abra **Configurações do app → Básico**.
2. Copie do **painel do bot → Configurações → 4** e cole em:
   - **URL da Política de Privacidade**
   - **URL de exclusão de dados do usuário** (ou "Instruções de exclusão de dados")
3. Escolha uma **Categoria**, por exemplo "Negócios e páginas".
4. Se pedir **ícone do app**, use qualquer imagem quadrada de 1024×1024, por exemplo sua foto de perfil.
5. Clique em **Salvar alterações**.
6. Volte ao painel inicial do app e clique em **Publicar** (ou mude o **Modo do app** de *Desenvolvimento* para *Ao vivo*).

> **Por que publicar?** No modo Desenvolvimento, o Instagram só avisa o bot sobre contas cadastradas como testadoras. Como o app é usado só na sua própria conta, a Meta permite publicar com o **Acesso Padrão**, sem análise.
> Se mesmo assim a Meta exigir **Análise do app** (App Review) para alguma permissão, me avise que eu te ajudo com o pedido.

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
