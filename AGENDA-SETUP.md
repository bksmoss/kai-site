# Agenda de reuniões — guia de configuração

Sistema de agendamento no próprio site, sem Calendly e sem mensalidade.

| Página | Endereço | Quem acessa |
|---|---|---|
| Agendamento (oculta) | `https://kaiarquitetura.com.br/agendar-reuniao` | quem tiver o link |
| Painel da administradora | `https://kaiarquitetura.com.br/kai-agenda-admin` | você, com senha |

Nenhuma das duas está linkada no site nem aparece no Google (`noindex` + `X-Robots-Tag`).

---

## Passo 1 — Criar o banco da agenda (KV)

1. Cloudflare → **Storage & Databases → KV → Create namespace**
2. Nome: `kai-agenda`
3. Copie o **Namespace ID** que aparece na lista
4. Abra `wrangler.toml` e troque `COLE_AQUI_O_ID_DO_KV` por esse ID
5. Commit + push (o deploy é automático pelo GitHub)

> Sem esse passo o site continua no ar normalmente, mas o agendamento dá erro.

---

## Passo 2 — Senha do painel

Cloudflare → **Workers & Pages → kai-site → Settings → Variables and Secrets → Add**.
Marque o tipo **Secret** (não "Text") nos dois:

| Nome | Valor |
|---|---|
| `ADMIN_PASSWORD` | a senha que você vai usar para entrar no painel |
| `SESSION_SECRET` | qualquer texto longo e aleatório (uns 40 caracteres) — nunca precisa lembrar dele |

O `SESSION_SECRET` é o que assina sua sessão e os botões "Confirmar / Recusar" que chegam no e‑mail. Se você trocar, todo mundo é deslogado e os links antigos param de funcionar.

---

## Passo 3 — E‑mail (Resend)

O envio usa o [Resend](https://resend.com) — plano gratuito de 3.000 e‑mails por mês, muito mais que o suficiente.

1. Crie a conta e vá em **Domains → Add Domain**
2. Use o subdomínio **`send.kaiarquitetura.com.br`** (importante: subdomínio, para não mexer no SPF do Zoho e não atrapalhar o `contato@`)
3. O Resend mostra 3 registros DNS. Adicione todos no Cloudflare (**DNS → Records**), com a nuvem **cinza (DNS only)**
4. Espere ficar "Verified" (costuma levar poucos minutos)
5. **API Keys → Create API Key** (permissão *Sending access*) e copie a chave
6. No Cloudflare, adicione como **Secret**:

| Nome | Valor |
|---|---|
| `RESEND_API_KEY` | `re_...` |

7. Em `wrangler.toml`, confirme que `MAIL_FROM` usa o domínio verificado:
   `MAIL_FROM = "KAI Arquitetura <agenda@send.kaiarquitetura.com.br>"`

**Enquanto isso não estiver pronto:** o aviso de novo pedido já chega por e‑mail pelo FormSubmit (o mesmo do formulário de contato do site, já configurado em `wrangler.toml`). O que *não* funciona sem o Resend é o e‑mail de confirmação **para o cliente** — nesse caso o painel avisa na tela e você manda o link por WhatsApp.

---

## Passo 4 — Telegram: sua central de notificações

O Telegram é a central de avisos só sua, separada do WhatsApp (onde ficam clientes e fornecedores). Depois de conectado, ele entrega **três coisas**:

1. **Novo pedido de reunião** — na hora, com botões *Confirmar* e *Recusar* (resolve tudo pelo celular, sem abrir o painel)
2. **Resumo da agenda toda manhã** — a lista de reuniões do dia, no horário que você escolher (padrão 7h)
3. **Lembrete 30 min antes** de cada reunião — e se faltar 30 min para uma reunião que você ainda **não confirmou**, ele te cutuca

Os itens 2 e 3 você liga/desliga e ajusta no painel → aba **Ajustes** → *Avisos no Telegram*.

### Como conectar
1. No Telegram, converse com **@BotFather** → `/newbot` → escolha um nome → ele devolve um **token**
2. Mande qualquer mensagem para o seu bot novo (procure pelo @nome que você criou)
3. Abra `https://api.telegram.org/bot<SEU_TOKEN>/getUpdates` no navegador e copie o número em `"chat":{"id": ...}`
4. Cloudflare → **kai-site → Settings → Variables and Secrets → Add**, como **Secret**:
   - `TELEGRAM_BOT_TOKEN` = o token do BotFather
   - `TELEGRAM_CHAT_ID` = o número do passo 3
5. **Deploy**

> O resumo diário e os lembretes dependem do Cron Trigger (o "despertador" do Worker), que já vai no `wrangler.toml` — não precisa configurar nada à mão. Confira em **kai-site → Settings → Trigger events** que existe um cron `*/5 * * * *`.

### ntfy — alternativa sem cadastro (opcional)
Se um dia não quiser Telegram, dá para receber só o aviso de novo pedido pelo app **ntfy**:
1. Instale o app **ntfy** (Android/iOS)
2. Inscreva‑se num tópico com nome difícil de adivinhar, ex.: `kai-agenda-x7k2m9`
3. Cloudflare → **Secret**: `NTFY_TOPIC` = `kai-agenda-x7k2m9`

(O ntfy recebe só o item 1. O resumo diário e os lembretes saem apenas pelo Telegram.)

---

## Passo 5 — Link da reunião

Entre no painel → aba **Ajustes** → cole o link da sua sala fixa.

Recomendação: **Google Meet**. Abra [meet.new](https://meet.new), a sala fica ativa para sempre e o link pode ser reusado. O cliente entra pelo navegador, sem instalar nada e sem limite de tempo em conversa 1‑a‑1.

Na hora de confirmar cada reunião, o painel já preenche esse link — mas você pode trocar por um link novo naquela reunião específica, se preferir uma sala exclusiva.

---

## Como você usa no dia a dia

1. Cliente entra no link, escolhe dia e horário, preenche nome e e‑mail
2. O horário fica **imediatamente reservado** (ninguém mais consegue pegar)
3. Você recebe o aviso por e‑mail (e Telegram, se configurar)
4. Você clica em **Confirmar** — no e‑mail, no Telegram ou no painel
5. O cliente recebe automaticamente o e‑mail com o link da reunião e um convite `.ics` para adicionar na agenda dele

Se **recusar**, o horário volta a ficar livre e o cliente recebe um e‑mail avisando, com o link para escolher outro dia.

---

## Painel — o que dá para configurar

| Aba | Para quê |
|---|---|
| **Reuniões** | confirmar, recusar, ver contato e observações do cliente |
| **Meus horários** | faixas de atendimento de cada dia da semana; dia sem faixa = folga |
| **Férias e bloqueios** | períodos em que nada aparece para o cliente. Tem botão de **travar os próximos 7 dias** com um clique |
| **Ajustes** | link e nome da plataforma, e‑mail que recebe os pedidos, frase da página |

Regras de encaixe (aba *Meus horários*):

- **Duração** — tamanho da reunião (padrão 45 min)
- **Intervalo** — respiro entre uma e outra (padrão 15 min)
- **Antecedência mínima** — impede agendamento em cima da hora (padrão 12 h)
- **Aceitar até** — quantos dias no futuro a agenda fica aberta (padrão 60)

Datas passadas nunca aparecem — o cálculo é feito no servidor, no horário de Brasília, então não adianta o cliente mexer no relógio do computador.

---

## Notas técnicas

- Tudo roda no Worker `kai-site` já existente. O site estático continua sendo servido igual; o Worker só entra nas rotas `/api/*`.
- Custo: **R$ 0**. Cabe folgado no plano gratuito do Workers e do KV (1.000 gravações/dia — cada reunião usa 2).
- O KV é *eventualmente consistente*. Em teoria dois clientes clicando no mesmo segundo, no mesmo horário, poderiam colidir. Com o volume de um escritório de arquitetura isso é praticamente impossível, e a segunda pessoa veria o erro "esse horário acabou de ser reservado".
- Reuniões canceladas ficam guardadas por 1 ano em `arch:<id>`.
- Para testar local: `npx wrangler dev` (precisa do Node instalado). O cookie do painel é `Secure`, então em `http://localhost` o login não gruda — use `npx wrangler dev --local-protocol https`.
