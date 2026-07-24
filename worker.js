/**
 * KAI Arquitetura — API de agendamento de reunioes.
 *
 * Serve o site estatico normalmente (env.ASSETS) e adiciona as rotas /api/*.
 * Os dados ficam no KV (binding AGENDA):
 *   config              -> configuracao da agenda (horarios, bloqueios, link de reuniao)
 *   bk:<data>:<hora>    -> reserva ocupando aquele horario
 *   bkid:<id>           -> ponteiro do id para a chave acima
 *   arch:<id>           -> reservas canceladas/recusadas (historico)
 */

const TZ = 'America/Sao_Paulo';

const CONFIG_PADRAO = {
  timezone: TZ,
  duracaoMin: 45,          // duracao da reuniao
  intervaloMin: 15,        // respiro entre uma reuniao e outra
  antecedenciaHoras: 12,   // nao aceita agendamento para daqui a menos de X horas
  diasAFrente: 60,         // ate quantos dias no futuro o cliente pode marcar
  // 0 = domingo ... 6 = sabado
  semana: {
    0: [],
    1: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
    2: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
    3: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
    4: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '18:00' }],
    5: [{ inicio: '09:00', fim: '12:00' }, { inicio: '14:00', fim: '17:00' }],
    6: [],
  },
  bloqueios: [],           // [{ inicio:'2026-12-20', fim:'2027-01-05', motivo:'Ferias' }]
  linkReuniao: '',         // link fixo da sala (Google Meet / Zoom / Teams)
  plataforma: 'Google Meet',
  emailAviso: 'contato@kaiarquitetura.com.br',
  mensagemTopo: 'Escolha o melhor dia e horario para conversarmos sobre o seu projeto.',
  avisoDiario: '07:00',    // horario do resumo da agenda no Telegram ('' = desligado)
  lembrete30Min: true,     // lembrete no Telegram 30 min antes de cada reuniao
};

/* ============================ utilitarios ============================ */

const enc = new TextEncoder();

function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers },
  });
}

function b64url(buf) {
  const bytes = new Uint8Array(buf);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(msg)));
}

// comparacao em tempo constante (evita vazar o token por timing)
function iguais(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function escapar(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

/* ---------- datas no fuso de Sao Paulo ---------- */

// Quantos minutos o fuso esta deslocado do UTC nesse instante.
function offsetFuso(date, timeZone) {
  const partes = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date).map((p) => [p.type, p.value])
  );
  const comoUTC = Date.UTC(
    +partes.year, +partes.month - 1, +partes.day,
    partes.hour === '24' ? 0 : +partes.hour, +partes.minute, +partes.second
  );
  return (comoUTC - date.getTime()) / 60000;
}

// Hora de parede no fuso -> instante real (Date em UTC).
function paraUTC(ano, mes, dia, hora, minuto, timeZone = TZ) {
  const palpite = Date.UTC(ano, mes - 1, dia, hora, minuto);
  const off1 = offsetFuso(new Date(palpite), timeZone);
  const off2 = offsetFuso(new Date(palpite - off1 * 60000), timeZone);
  return new Date(palpite - off2 * 60000);
}

// 'YYYY-MM-DD' + 'HH:MM' -> Date
function instante(data, hora, timeZone = TZ) {
  const [a, m, d] = data.split('-').map(Number);
  const [hh, mm] = hora.split(':').map(Number);
  return paraUTC(a, m, d, hh, mm, timeZone);
}

function hojeNoFuso(timeZone = TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date()); // YYYY-MM-DD
}

// Hora de parede atual no fuso, como 'HH:MM'.
function horaNoFuso(timeZone = TZ) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone, hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date());
}

function somarDias(data, n) {
  const [a, m, d] = data.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function diaDaSemana(data) {
  const [a, m, d] = data.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

function minutos(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function hhmm(min) {
  return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0');
}

const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

function dataValida(s) {
  if (!RE_DATA.test(s)) return false;
  const [a, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function dataPorExtenso(data, hora) {
  const dt = instante(data, hora || '12:00');
  const f = new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  }).format(dt);
  return f.charAt(0).toUpperCase() + f.slice(1);
}

/* ============================ config ============================ */

async function lerConfig(env) {
  const bruto = await env.AGENDA.get('config', 'json');
  if (!bruto) return { ...CONFIG_PADRAO };
  return { ...CONFIG_PADRAO, ...bruto, semana: { ...CONFIG_PADRAO.semana, ...(bruto.semana || {}) } };
}

function sanearConfig(entrada, atual) {
  const c = { ...atual };
  const num = (v, min, max, padrao) => {
    const n = Math.round(Number(v));
    return Number.isFinite(n) && n >= min && n <= max ? n : padrao;
  };

  c.duracaoMin = num(entrada.duracaoMin, 15, 240, atual.duracaoMin);
  c.intervaloMin = num(entrada.intervaloMin, 0, 120, atual.intervaloMin);
  c.antecedenciaHoras = num(entrada.antecedenciaHoras, 0, 720, atual.antecedenciaHoras);
  c.diasAFrente = num(entrada.diasAFrente, 1, 365, atual.diasAFrente);

  if (entrada.semana && typeof entrada.semana === 'object') {
    const semana = {};
    for (let d = 0; d <= 6; d++) {
      const faixas = Array.isArray(entrada.semana[d]) ? entrada.semana[d] : [];
      semana[d] = faixas
        .filter((f) => f && RE_HORA.test(f.inicio) && RE_HORA.test(f.fim) && minutos(f.fim) > minutos(f.inicio))
        .map((f) => ({ inicio: f.inicio, fim: f.fim }))
        .sort((a, b) => minutos(a.inicio) - minutos(b.inicio))
        .slice(0, 6);
    }
    c.semana = semana;
  }

  if (Array.isArray(entrada.bloqueios)) {
    c.bloqueios = entrada.bloqueios
      .filter((b) => b && dataValida(b.inicio) && dataValida(b.fim || b.inicio) && (b.fim || b.inicio) >= b.inicio)
      .map((b) => ({ inicio: b.inicio, fim: b.fim || b.inicio, motivo: String(b.motivo || '').slice(0, 80) }))
      .slice(0, 200);
  }

  if (typeof entrada.linkReuniao === 'string') c.linkReuniao = entrada.linkReuniao.trim().slice(0, 300);
  if (typeof entrada.plataforma === 'string') c.plataforma = entrada.plataforma.trim().slice(0, 40);
  if (typeof entrada.emailAviso === 'string') c.emailAviso = entrada.emailAviso.trim().slice(0, 120);
  if (typeof entrada.mensagemTopo === 'string') c.mensagemTopo = entrada.mensagemTopo.trim().slice(0, 300);

  // '' desliga o resumo diario; qualquer outra coisa precisa ser HH:MM valido
  if (typeof entrada.avisoDiario === 'string') {
    const v = entrada.avisoDiario.trim();
    c.avisoDiario = v === '' || RE_HORA.test(v) ? v : atual.avisoDiario;
  }
  if (typeof entrada.lembrete30Min === 'boolean') c.lembrete30Min = entrada.lembrete30Min;

  return c;
}

function estaBloqueado(cfg, data) {
  return (cfg.bloqueios || []).some((b) => data >= b.inicio && data <= b.fim);
}

/* ============================ horarios ============================ */

// Gera os horarios livres entre duas datas (inclusive), ja descontando
// passado, antecedencia minima, bloqueios e reunioes ja marcadas.
async function horariosLivres(env, cfg, de, ate) {
  const hoje = hojeNoFuso(cfg.timezone);
  const limite = somarDias(hoje, cfg.diasAFrente);
  const inicio = de < hoje ? hoje : de;
  const fim = ate > limite ? limite : ate;
  if (inicio > fim) return {};

  // reunioes ja marcadas no periodo
  const ocupados = new Set();
  let cursor;
  do {
    const pagina = await env.AGENDA.list({ prefix: 'bk:', cursor, limit: 1000 });
    for (const chave of pagina.keys) {
      // formato bk:AAAA-MM-DD:HH:MM — a hora tambem tem ':', entao junta o resto
      const partes = chave.name.split(':');
      const data = partes[1];
      const hora = partes.slice(2).join(':');
      if (data >= inicio && data <= fim) ocupados.add(data + ' ' + hora);
    }
    cursor = pagina.list_complete ? null : pagina.cursor;
  } while (cursor);

  const agora = Date.now();
  const minimo = agora + cfg.antecedenciaHoras * 3600 * 1000;
  const passo = cfg.duracaoMin + cfg.intervaloMin;
  const resultado = {};

  for (let data = inicio; data <= fim; data = somarDias(data, 1)) {
    if (estaBloqueado(cfg, data)) continue;

    const faixas = cfg.semana[diaDaSemana(data)] || [];
    const doDia = [];

    for (const faixa of faixas) {
      const ini = minutos(faixa.inicio);
      const termino = minutos(faixa.fim);
      for (let m = ini; m + cfg.duracaoMin <= termino; m += passo) {
        const hora = hhmm(m);
        if (ocupados.has(data + ' ' + hora)) continue;
        if (instante(data, hora, cfg.timezone).getTime() < minimo) continue;
        doDia.push(hora);
      }
    }

    if (doDia.length) resultado[data] = doDia;
  }

  return resultado;
}

// Confere se um horario especifico continua valido (usado na hora de reservar).
async function horarioValido(env, cfg, data, hora) {
  if (!dataValida(data) || !RE_HORA.test(hora)) return 'Data ou horario invalido.';
  if (estaBloqueado(cfg, data)) return 'Esse dia nao esta disponivel.';

  const hoje = hojeNoFuso(cfg.timezone);
  if (data < hoje) return 'Nao e possivel agendar em uma data que ja passou.';
  if (data > somarDias(hoje, cfg.diasAFrente)) return 'Essa data esta muito distante.';

  const minimo = Date.now() + cfg.antecedenciaHoras * 3600 * 1000;
  if (instante(data, hora, cfg.timezone).getTime() < minimo) {
    return `As reunioes precisam ser marcadas com pelo menos ${cfg.antecedenciaHoras}h de antecedencia.`;
  }

  const passo = cfg.duracaoMin + cfg.intervaloMin;
  const faixas = cfg.semana[diaDaSemana(data)] || [];
  const encaixa = faixas.some((f) => {
    const ini = minutos(f.inicio);
    const termino = minutos(f.fim);
    const m = minutos(hora);
    return m >= ini && m + cfg.duracaoMin <= termino && (m - ini) % passo === 0;
  });
  if (!encaixa) return 'Esse horario nao esta na agenda.';

  if (await env.AGENDA.get('bk:' + data + ':' + hora)) return 'Esse horario acabou de ser reservado. Escolha outro, por favor.';
  return null;
}

/* ============================ e-mail / avisos ============================ */

async function enviarEmail(env, { para, assunto, html, texto, anexos }) {
  const chave = env.RESEND_API_KEY;
  if (!chave) return { ok: false, motivo: 'RESEND_API_KEY nao configurada' };

  const corpo = {
    from: env.MAIL_FROM || 'KAI Arquitetura <agenda@kaiarquitetura.com.br>',
    to: Array.isArray(para) ? para : [para],
    subject: assunto,
    html,
    text: texto,
  };
  if (env.MAIL_REPLY_TO) corpo.reply_to = env.MAIL_REPLY_TO;
  if (anexos && anexos.length) corpo.attachments = anexos;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: 'Bearer ' + chave, 'content-type': 'application/json' },
      body: JSON.stringify(corpo),
    });
    if (!r.ok) return { ok: false, motivo: 'Resend ' + r.status + ': ' + (await r.text()).slice(0, 300) };
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String(e) };
  }
}

// Plano B: usa o mesmo FormSubmit ja usado no formulario de contato do site,
// para que o aviso chegue mesmo antes de configurar o Resend.
async function avisoFormSubmit(env, reserva) {
  const hash = env.FORMSUBMIT_HASH;
  if (!hash) return { ok: false, motivo: 'FORMSUBMIT_HASH nao configurada' };
  const base = env.SITE_URL || 'https://kaiarquitetura.com.br';
  try {
    const r = await fetch('https://formsubmit.co/ajax/' + hash, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
        // Sem Origin/Referer o FormSubmit recusa e responde 200 com success:false.
        origin: base,
        referer: base + '/agendar-reuniao',
      },
      body: JSON.stringify({
        _subject: `Nova reuniao solicitada — ${reserva.date} as ${reserva.time}`,
        Nome: reserva.name,
        Email: reserva.email,
        Telefone: reserva.phone || '-',
        Assunto: reserva.subject || '-',
        Dia: dataParaBR(reserva.date),
        Horario: `${reserva.time} - ${reserva.endTime}`,
        Mensagem: reserva.notes || '-',
        Painel: base + '/kai-agenda-admin',
      }),
    });

    // O FormSubmit responde 200 mesmo quando recusa: o que vale e o campo success.
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok || String(corpo.success) !== 'true') {
      return { ok: false, motivo: `FormSubmit ${r.status}: ${corpo.message || 'resposta inesperada'}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: String(e) };
  }
}

async function avisoTelegram(env, texto) {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return { ok: false, motivo: 'Telegram nao configurado' };
  try {
    const r = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      // texto puro: os links de confirmacao tem '&' e o parser HTML do Telegram engasga
      body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, text: texto, disable_web_page_preview: true }),
    });
    return r.ok ? { ok: true } : { ok: false, motivo: 'Telegram ' + r.status };
  } catch (e) {
    return { ok: false, motivo: String(e) };
  }
}

async function avisoNtfy(env, titulo, texto) {
  if (!env.NTFY_TOPIC) return { ok: false, motivo: 'ntfy nao configurado' };
  try {
    const r = await fetch('https://ntfy.sh/' + env.NTFY_TOPIC, {
      method: 'POST',
      headers: { title: titulo, priority: 'high', tags: 'calendar' },
      body: texto,
    });
    return r.ok ? { ok: true } : { ok: false, motivo: 'ntfy ' + r.status };
  } catch (e) {
    return { ok: false, motivo: String(e) };
  }
}

function dataParaBR(data) {
  const [a, m, d] = data.split('-');
  return `${d}/${m}/${a}`;
}

/* ---------- convite de calendario (.ics) ---------- */

function paraICS(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// ';', ',', '\' e quebras de linha sao especiais no formato iCalendar
function escICS(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function montarICS(reserva, cfg, organizador) {
  const ini = instante(reserva.date, reserva.time, cfg.timezone);
  const fim = new Date(ini.getTime() + cfg.duracaoMin * 60000);
  const link = reserva.meetingLink || cfg.linkReuniao || '';
  const descricao = [
    `Reuniao com ${escICS(reserva.name)}.`,
    reserva.subject ? `Assunto: ${escICS(reserva.subject)}` : '',
    link ? `Link: ${escICS(link)}` : '',
  ].filter(Boolean).join('\\n');

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//KAI Arquitetura//Agenda//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${reserva.id}@kaiarquitetura.com.br`,
    `DTSTAMP:${paraICS(new Date())}`,
    `DTSTART:${paraICS(ini)}`,
    `DTEND:${paraICS(fim)}`,
    'SUMMARY:Reuniao — KAI Arquitetura',
    `DESCRIPTION:${descricao}`,
    link ? `LOCATION:${escICS(link)}` : 'LOCATION:Online',
    `ORGANIZER;CN=KAI Arquitetura:mailto:${organizador}`,
    `ATTENDEE;CN=${escICS(reserva.name)};RSVP=TRUE:mailto:${reserva.email}`,
    'STATUS:CONFIRMED',
    'BEGIN:VALARM',
    'TRIGGER:-PT30M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reuniao KAI Arquitetura em 30 minutos',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function base64(str) {
  const bytes = enc.encode(str);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

/* ---------- modelos de e-mail ---------- */

function moldura(titulo, conteudo) {
  return `<!DOCTYPE html><html lang="pt-BR"><body style="margin:0;padding:24px;background:#F7F3EF;font-family:Helvetica,Arial,sans-serif;color:#1C1C1C;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
    <tr><td style="background:#1C1C1C;padding:22px 28px;">
      <span style="color:#fff;font-size:18px;letter-spacing:3px;font-weight:600;">KAI ARQUITETURA</span>
    </td></tr>
    <tr><td style="padding:28px;">
      <h1 style="margin:0 0 18px;font-size:20px;font-weight:600;color:#1C1C1C;">${titulo}</h1>
      ${conteudo}
    </td></tr>
    <tr><td style="padding:16px 28px;background:#F7F3EF;font-size:12px;color:#8a8078;">
      KAI Arquitetura · kaiarquitetura.com.br · contato@kaiarquitetura.com.br
    </td></tr>
  </table></body></html>`;
}

function linhas(pares) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;font-size:14px;line-height:1.7;">` +
    pares.filter(([, v]) => v).map(([k, v]) =>
      `<tr><td style="padding:5px 0;color:#8a8078;width:110px;vertical-align:top;">${escapar(k)}</td>
           <td style="padding:5px 0;color:#1C1C1C;">${v}</td></tr>`
    ).join('') + `</table>`;
}

function botao(href, rotulo, cor) {
  return `<a href="${escapar(href)}" style="display:inline-block;padding:12px 24px;background:${cor};color:#fff;border-radius:999px;font-size:14px;font-weight:600;text-decoration:none;">${escapar(rotulo)}</a>`;
}

/* ============================ autenticacao do admin ============================ */

const DURACAO_SESSAO = 12 * 3600 * 1000;

async function criarSessao(env) {
  const exp = Date.now() + DURACAO_SESSAO;
  return exp + '.' + (await hmac(env.SESSION_SECRET, 'sessao:' + exp));
}

async function sessaoValida(env, token) {
  if (!token || !env.SESSION_SECRET) return false;
  const [exp, assinatura] = token.split('.');
  if (!exp || !assinatura || Number(exp) < Date.now()) return false;
  return iguais(assinatura, await hmac(env.SESSION_SECRET, 'sessao:' + exp));
}

function lerCookie(req, nome) {
  const cru = req.headers.get('cookie') || '';
  for (const parte of cru.split(';')) {
    const [k, ...resto] = parte.trim().split('=');
    if (k === nome) return resto.join('=');
  }
  return null;
}

async function exigirAdmin(req, env) {
  return sessaoValida(env, lerCookie(req, 'kai_admin'));
}

// Token de acao usado nos links "Confirmar"/"Recusar" que vao no e-mail.
async function tokenAcao(env, id, acao) {
  if (!env.SESSION_SECRET) return null; // sem segredo nao existe link valido
  return hmac(env.SESSION_SECRET, `acao:${acao}:${id}`);
}

/* ============================ rotas ============================ */

async function rotaHorarios(req, env) {
  const url = new URL(req.url);
  const cfg = await lerConfig(env);
  const hoje = hojeNoFuso(cfg.timezone);
  const de = dataValida(url.searchParams.get('de') || '') ? url.searchParams.get('de') : hoje;
  const ate = dataValida(url.searchParams.get('ate') || '') ? url.searchParams.get('ate') : somarDias(de, 45);

  return json({
    hoje,
    timezone: cfg.timezone,
    duracaoMin: cfg.duracaoMin,
    antecedenciaHoras: cfg.antecedenciaHoras,
    ultimaData: somarDias(hoje, cfg.diasAFrente),
    plataforma: cfg.plataforma,
    mensagemTopo: cfg.mensagemTopo,
    dias: await horariosLivres(env, cfg, de, ate),
  });
}

async function rotaAgendar(req, env, ctx) {
  let dados;
  try {
    dados = await req.json();
  } catch {
    return json({ erro: 'Pedido invalido.' }, 400);
  }

  // campo-isca: preenchido = robo. Responde "ok" sem gravar nada.
  if (dados.website) {
    return json({ ok: true, id: '', resumo: { data: String(dados.data || ''), hora: String(dados.hora || ''), fim: '' } });
  }

  const nome = String(dados.nome || '').trim().slice(0, 80);
  const email = String(dados.email || '').trim().slice(0, 120);
  const telefone = String(dados.telefone || '').trim().slice(0, 30);
  const assunto = String(dados.assunto || '').trim().slice(0, 120);
  const obs = String(dados.observacoes || '').trim().slice(0, 800);
  const data = String(dados.data || '');
  const hora = String(dados.hora || '');

  if (nome.length < 2) return json({ erro: 'Informe seu nome.' }, 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return json({ erro: 'Informe um e-mail valido.' }, 400);

  const cfg = await lerConfig(env);
  const problema = await horarioValido(env, cfg, data, hora);
  if (problema) return json({ erro: problema, recarregar: true }, 409);

  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  const reserva = {
    id, date: data, time: hora,
    endTime: hhmm(minutos(hora) + cfg.duracaoMin),
    name: nome, email, phone: telefone, subject: assunto, notes: obs,
    status: 'pendente',
    createdAt: new Date().toISOString(),
    meetingLink: '',
  };

  const chave = `bk:${data}:${hora}`;
  await env.AGENDA.put(chave, JSON.stringify(reserva));
  await env.AGENDA.put('bkid:' + id, chave);

  // A reserva ja esta gravada: se o aviso falhar, o cliente nao pode ser penalizado.
  ctx.waitUntil(avisarKarina(env, cfg, reserva).catch((e) => console.error('falha ao avisar:', e)));

  return json({
    ok: true,
    id,
    mensagem: 'Pedido enviado! Voce recebera a confirmacao por e-mail.',
    resumo: { data, hora, fim: reserva.endTime, extenso: dataParaBR(data) },
  });
}

async function avisarKarina(env, cfg, reserva) {
  const base = env.SITE_URL || 'https://kaiarquitetura.com.br';
  const tConf = await tokenAcao(env, reserva.id, 'confirmar');
  const tRec = await tokenAcao(env, reserva.id, 'recusar');
  // Sem SESSION_SECRET nao da para gerar link de 1 clique: manda para o painel.
  const urlConf = tConf ? `${base}/api/acao?id=${reserva.id}&a=confirmar&t=${tConf}` : `${base}/kai-agenda-admin`;
  const urlRec = tRec ? `${base}/api/acao?id=${reserva.id}&a=recusar&t=${tRec}` : `${base}/kai-agenda-admin`;

  const html = moldura('Novo pedido de reuniao', `
    ${linhas([
      ['Quando', `<strong>${escapar(dataPorExtenso(reserva.date, reserva.time))}</strong><br>${reserva.time} as ${reserva.endTime} (horario de Brasilia)`],
      ['Nome', escapar(reserva.name)],
      ['E-mail', `<a href="mailto:${escapar(reserva.email)}" style="color:#D87C63;">${escapar(reserva.email)}</a>`],
      ['Telefone', reserva.phone ? `<a href="https://wa.me/55${reserva.phone.replace(/\D/g, '')}" style="color:#D87C63;">${escapar(reserva.phone)}</a>` : ''],
      ['Assunto', escapar(reserva.subject)],
      ['Observacoes', escapar(reserva.notes).replace(/\n/g, '<br>')],
    ])}
    <p style="margin:24px 0 12px;font-size:14px;color:#555;">O horario ja esta reservado. Confirme para o cliente receber o link da reuniao:</p>
    <p style="margin:0 0 10px;">${botao(urlConf, 'Confirmar reuniao', '#D87C63')}</p>
    <p style="margin:0;"><a href="${escapar(urlRec)}" style="color:#8a8078;font-size:13px;">Recusar e liberar o horario</a>
    &nbsp;·&nbsp; <a href="${base}/kai-agenda-admin" style="color:#8a8078;font-size:13px;">Abrir painel</a></p>
  `);

  const texto = `Novo pedido de reuniao\n${dataPorExtenso(reserva.date, reserva.time)} — ${reserva.time} as ${reserva.endTime}\n` +
    `${reserva.name} · ${reserva.email}${reserva.phone ? ' · ' + reserva.phone : ''}\n` +
    `${reserva.subject ? 'Assunto: ' + reserva.subject + '\n' : ''}${reserva.notes ? reserva.notes + '\n' : ''}\n` +
    `Confirmar: ${urlConf}\nRecusar: ${urlRec}`;

  const email = await enviarEmail(env, {
    para: cfg.emailAviso, assunto: `Nova reuniao — ${dataParaBR(reserva.date)} as ${reserva.time} — ${reserva.name}`,
    html, texto,
  });
  // Se o Resend ainda nao estiver configurado, tenta o FormSubmit do site.
  const formsubmit = email.ok ? { ok: false, motivo: 'nao precisou' } : await avisoFormSubmit(env, reserva);

  const telegram = await avisoTelegram(env,
    `Nova reuniao solicitada\n${dataParaBR(reserva.date)} as ${reserva.time}\n${reserva.name} — ${reserva.email}` +
    `${reserva.subject ? '\n' + reserva.subject : ''}\n\nConfirmar:\n${urlConf}\n\nRecusar:\n${urlRec}`);

  const ntfy = await avisoNtfy(env, 'Nova reuniao solicitada',
    `${reserva.name} — ${dataParaBR(reserva.date)} as ${reserva.time}\nConfirmar: ${urlConf}`);

  // Guarda o resultado na propria reserva: se nenhum canal funcionou, o painel avisa.
  const canais = { email, formsubmit, telegram, ntfy };
  const algumFuncionou = Object.values(canais).some((c) => c.ok);
  if (!algumFuncionou) {
    console.error('nenhum aviso saiu para a reserva ' + reserva.id, JSON.stringify(canais));
  }

  const chave = `bk:${reserva.date}:${reserva.time}`;
  const atual = await env.AGENDA.get(chave, 'json');
  if (atual && atual.id === reserva.id) {
    atual.avisado = algumFuncionou;
    atual.avisoDetalhe = Object.entries(canais)
      .filter(([, c]) => !c.ok && c.motivo !== 'nao precisou')
      .map(([nome, c]) => `${nome}: ${c.motivo}`)
      .join(' | ')
      .slice(0, 400);
    await env.AGENDA.put(chave, JSON.stringify(atual));
  }
}

async function buscarReserva(env, id) {
  const chave = await env.AGENDA.get('bkid:' + id);
  if (!chave) return null;
  const reserva = await env.AGENDA.get(chave, 'json');
  return reserva ? { reserva, chave } : null;
}

async function confirmarReserva(env, id, linkManual) {
  const achado = await buscarReserva(env, id);
  if (!achado) return { erro: 'Reuniao nao encontrada (pode ter sido cancelada).' };
  const { reserva, chave } = achado;
  const cfg = await lerConfig(env);

  const link = (linkManual || reserva.meetingLink || cfg.linkReuniao || '').trim();
  reserva.status = 'confirmada';
  reserva.confirmedAt = new Date().toISOString();
  reserva.meetingLink = link;
  await env.AGENDA.put(chave, JSON.stringify(reserva));

  const ics = montarICS(reserva, cfg, cfg.emailAviso);
  const html = moldura('Sua reuniao esta confirmada', `
    <p style="font-size:15px;line-height:1.7;margin:0 0 20px;">Ola, ${escapar(reserva.name.split(' ')[0])}! Sua reuniao com a KAI Arquitetura foi confirmada.</p>
    ${linhas([
      ['Quando', `<strong>${escapar(dataPorExtenso(reserva.date, reserva.time))}</strong><br>${reserva.time} as ${reserva.endTime} (horario de Brasilia)`],
      ['Duracao', `${cfg.duracaoMin} minutos`],
      ['Onde', escapar(cfg.plataforma)],
    ])}
    ${link ? `<p style="margin:24px 0 8px;">${botao(link, 'Entrar na reuniao', '#D87C63')}</p>
      <p style="margin:0;font-size:12px;color:#8a8078;word-break:break-all;">${escapar(link)}</p>` :
      `<p style="margin:24px 0 0;font-size:14px;color:#555;">O link da reuniao sera enviado em instantes.</p>`}
    <p style="margin:24px 0 0;font-size:13px;color:#8a8078;">O convite em anexo adiciona a reuniao na sua agenda. Precisa remarcar? Responda este e-mail.</p>
  `);

  const envio = await enviarEmail(env, {
    para: reserva.email,
    assunto: `Reuniao confirmada — ${dataParaBR(reserva.date)} as ${reserva.time} — KAI Arquitetura`,
    html,
    texto: `Sua reuniao com a KAI Arquitetura esta confirmada.\n${dataPorExtenso(reserva.date, reserva.time)}\n` +
      `${reserva.time} as ${reserva.endTime} (horario de Brasilia)\n${link ? '\nLink: ' + link : ''}`,
    anexos: [{ filename: 'reuniao-kai.ics', content: base64(ics) }],
  });

  return { reserva, emailEnviado: envio.ok, motivoFalha: envio.motivo };
}

async function cancelarReserva(env, id, motivo) {
  const achado = await buscarReserva(env, id);
  if (!achado) return { erro: 'Reuniao nao encontrada.' };
  const { reserva, chave } = achado;
  const cfg = await lerConfig(env);

  reserva.status = 'cancelada';
  reserva.canceledAt = new Date().toISOString();
  reserva.cancelReason = String(motivo || '').slice(0, 300);

  // libera o horario e guarda o historico
  await env.AGENDA.delete(chave);
  await env.AGENDA.delete('bkid:' + id);
  await env.AGENDA.put('arch:' + id, JSON.stringify(reserva), { expirationTtl: 60 * 60 * 24 * 365 });

  const html = moldura('Sobre a sua reuniao', `
    <p style="font-size:15px;line-height:1.7;margin:0 0 18px;">Ola, ${escapar(reserva.name.split(' ')[0])}. Infelizmente nao vamos conseguir manter o horario de
    <strong>${escapar(dataPorExtenso(reserva.date, reserva.time))}, ${reserva.time}</strong>.</p>
    ${reserva.cancelReason ? `<p style="font-size:14px;color:#555;margin:0 0 18px;">${escapar(reserva.cancelReason)}</p>` : ''}
    <p style="margin:0 0 20px;font-size:14px;color:#555;">Voce pode escolher outro horario a qualquer momento:</p>
    ${botao((env.SITE_URL || 'https://kaiarquitetura.com.br') + '/agendar-reuniao', 'Escolher outro horario', '#D87C63')}
  `);

  const envio = await enviarEmail(env, {
    para: reserva.email,
    assunto: `Sobre a sua reuniao de ${dataParaBR(reserva.date)} — KAI Arquitetura`,
    html,
    texto: `Nao vamos conseguir manter o horario de ${dataPorExtenso(reserva.date, reserva.time)} as ${reserva.time}.` +
      `${reserva.cancelReason ? '\n' + reserva.cancelReason : ''}\n\nEscolha outro horario: ${(env.SITE_URL || 'https://kaiarquitetura.com.br')}/agendar-reuniao`,
  });

  return { reserva, emailEnviado: envio.ok, motivoFalha: envio.motivo };
}

// Link de 1 clique vindo do e-mail/Telegram.
async function rotaAcao(req, env) {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const acao = url.searchParams.get('a') || '';
  const token = url.searchParams.get('t') || '';

  const pagina = (titulo, texto, cor = '#D87C63') => new Response(
    `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8">
     <meta name="viewport" content="width=device-width,initial-scale=1">
     <meta name="robots" content="noindex,nofollow"><title>${escapar(titulo)} — KAI</title>
     <link rel="icon" type="image/png" href="/img/simbolo.png">
     <link rel="stylesheet" href="/css/fonts.css">
     <style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F7F3EF;
     font-family:'ClashDisplay',Helvetica,sans-serif;color:#1C1C1C;padding:24px}
     .cx{background:#fff;border-radius:20px;padding:40px;max-width:440px;text-align:center;box-shadow:0 12px 40px rgba(28,28,28,.08)}
     h1{font-size:22px;margin:0 0 12px;color:${cor}}p{font-size:15px;line-height:1.7;color:#555;margin:0 0 22px}
     a{display:inline-block;padding:12px 26px;border-radius:999px;background:#1C1C1C;color:#fff;font-size:14px;text-decoration:none}</style>
     </head><body><div class="cx"><h1>${escapar(titulo)}</h1><p>${texto}</p>
     <a href="/kai-agenda-admin">Abrir painel da agenda</a></div></body></html>`,
    { status: 200, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' } }
  );

  if (!['confirmar', 'recusar'].includes(acao)) return pagina('Link invalido', 'Essa acao nao existe.');

  const esperado = await tokenAcao(env, id, acao);
  if (!esperado || !iguais(token, esperado)) {
    return pagina('Link invalido', 'Esse link expirou ou foi alterado. Use o painel da agenda.');
  }

  if (acao === 'confirmar') {
    const r = await confirmarReserva(env, id);
    if (r.erro) return pagina('Nao foi possivel confirmar', escapar(r.erro));
    return pagina('Reuniao confirmada',
      `${escapar(r.reserva.name)} — ${escapar(dataPorExtenso(r.reserva.date, r.reserva.time))}, ${r.reserva.time}.<br><br>` +
      (r.emailEnviado ? 'O cliente ja recebeu o e-mail com o link e o convite de calendario.'
        : '<strong>Atencao:</strong> o e-mail para o cliente nao pode ser enviado. Avise pelo painel ou WhatsApp.'));
  }

  const r = await cancelarReserva(env, id, '');
  if (r.erro) return pagina('Nao foi possivel recusar', escapar(r.erro));
  return pagina('Horario liberado', 'O horario voltou a ficar disponivel e o cliente foi avisado.', '#8a8078');
}

/* ---------- rotas do painel ---------- */

async function rotaLogin(req, env) {
  let dados;
  try { dados = await req.json(); } catch { return json({ erro: 'Pedido invalido.' }, 400); }

  if (!env.ADMIN_PASSWORD || !env.SESSION_SECRET) {
    return json({ erro: 'Painel ainda nao configurado (faltam os segredos ADMIN_PASSWORD e SESSION_SECRET).' }, 500);
  }
  // pequeno atraso para desestimular tentativa de forca bruta
  await new Promise((r) => setTimeout(r, 400));
  if (!iguais(String(dados.senha || ''), env.ADMIN_PASSWORD)) return json({ erro: 'Senha incorreta.' }, 401);

  const token = await criarSessao(env);
  return json({ ok: true }, 200, {
    'set-cookie': `kai_admin=${token}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${DURACAO_SESSAO / 1000}`,
  });
}

// Le todas as reservas ativas (chaves bk:*), ordenadas por data/hora.
async function todasReservas(env) {
  const lista = [];
  let cursor;
  do {
    const pagina = await env.AGENDA.list({ prefix: 'bk:', cursor, limit: 1000 });
    for (const chave of pagina.keys) {
      const r = await env.AGENDA.get(chave.name, 'json');
      if (r) lista.push(r);
    }
    cursor = pagina.list_complete ? null : pagina.cursor;
  } while (cursor);

  lista.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  return lista;
}

async function rotaReservas(env) {
  return json({ hoje: hojeNoFuso(), reservas: await todasReservas(env) });
}

/* ============================ tarefas agendadas (cron) ============================ */

// Roda a cada 5 min (Cron Trigger). Cuida do resumo diario e dos lembretes.
async function tarefaAgendada(env) {
  const cfg = await lerConfig(env);
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return; // sem Telegram, nada a fazer

  const hoje = hojeNoFuso(cfg.timezone);
  const agoraMin = minutos(horaNoFuso(cfg.timezone));
  const agoraMs = Date.now();
  const reservas = await todasReservas(env);

  // Manha: usa o horario do resumo (padrao 07h). Vale para o resumo e para
  // a cobranca das reunioes do dia que ainda nao foram confirmadas.
  const manhaAlvo = cfg.avisoDiario && RE_HORA.test(cfg.avisoDiario) ? cfg.avisoDiario : '07:00';
  const naJanelaManha = (alvoStr) => {
    const a = minutos(alvoStr);
    return agoraMin >= a && agoraMin < a + 5; // janela de 5 min = 1 disparo por dia
  };

  // marca uma flag na reserva sem sobrescrever mudancas concorrentes
  const marcar = async (r, campo) => {
    const chave = `bk:${r.date}:${r.time}`;
    const atual = await env.AGENDA.get(chave, 'json');
    if (atual && atual.id === r.id) {
      atual[campo] = true;
      await env.AGENDA.put(chave, JSON.stringify(atual));
    }
  };

  // ---- 1) resumo da agenda do dia ----
  if (cfg.avisoDiario && RE_HORA.test(cfg.avisoDiario) && naJanelaManha(cfg.avisoDiario)) {
    if (!(await env.AGENDA.get('digest:' + hoje))) {
      await env.AGENDA.put('digest:' + hoje, '1', { expirationTtl: 60 * 60 * 36 });
      await avisoTelegram(env, textoResumo(reservas.filter((r) => r.date === hoje), hoje));
    }
  }

  // ---- 2) lembretes por reserva ----
  for (const r of reservas) {
    if (r.date < hoje) continue;
    const faltamMin = (instante(r.date, r.time, cfg.timezone).getTime() - agoraMs) / 60000;
    if (faltamMin <= 0) continue;

    if (r.status === 'confirmada') {
      // 30 min antes — so para reuniao ja confirmada
      if (cfg.lembrete30Min && !r.lembrete30 && faltamMin <= 30) {
        const link = r.meetingLink || cfg.linkReuniao || '';
        await avisoTelegram(env, `Lembrete: reuniao em 30 min\n${r.time} — ${r.name}` +
          (r.subject ? `\n${r.subject}` : '') + (link ? `\n${link}` : ''));
        await marcar(r, 'lembrete30');
      }
      continue;
    }

    // reuniao NAO confirmada: cobra ~26h antes e de novo na manha do dia
    if (!r.nudge26 && faltamMin <= 26 * 60 && faltamMin > 26 * 60 - 15) {
      await cobrarConfirmacao(env, r, 'Reuniao daqui a ~26h ainda nao confirmada');
      await marcar(r, 'nudge26');
    }
    if (!r.nudge7h && r.date === hoje && naJanelaManha(manhaAlvo)) {
      await cobrarConfirmacao(env, r, 'Reuniao HOJE ainda nao confirmada');
      await marcar(r, 'nudge7h');
    }
  }
}

// Cobra a confirmacao de uma reserva pelo Telegram, com links de 1 clique.
async function cobrarConfirmacao(env, r, titulo) {
  const base = env.SITE_URL || 'https://kaiarquitetura.com.br';
  const tConf = await tokenAcao(env, r.id, 'confirmar');
  const tRec = await tokenAcao(env, r.id, 'recusar');
  let msg = `${titulo}\n${dataParaBR(r.date)} as ${r.time} — ${r.name}`;
  if (r.subject) msg += `\n${r.subject}`;
  if (r.phone) msg += `\n${r.phone}`;
  msg += tConf
    ? `\n\nConfirmar:\n${base}/api/acao?id=${r.id}&a=confirmar&t=${tConf}\n\nRecusar:\n${base}/api/acao?id=${r.id}&a=recusar&t=${tRec}`
    : `\n\nAbra o painel: ${base}/kai-agenda-admin`;
  await avisoTelegram(env, msg);
}

function textoResumo(reservas, hoje) {
  const cab = 'Bom dia! Agenda de ' + dataParaBR(hoje);
  if (!reservas.length) return cab + '\n\nNenhuma reuniao marcada para hoje.';

  const linhas = reservas.map((r) => {
    const marca = r.status === 'confirmada' ? '[ok]' : '[a confirmar]';
    return `${r.time}-${r.endTime}  ${r.name} ${marca}` + (r.subject ? `\n   ${r.subject}` : '');
  });
  const pendentes = reservas.filter((r) => r.status !== 'confirmada').length;
  const rodape = pendentes ? `\n\n${pendentes} reuniao(oes) ainda esperando sua confirmacao.` : '';
  return `${cab}\n\n${linhas.join('\n')}${rodape}`;
}

/* ============================ entrada ============================ */

export default {
  // Cron Trigger da Cloudflare (ver wrangler.toml). Roda sem ninguem acessar o site.
  async scheduled(event, env, ctx) {
    ctx.waitUntil(tarefaAgendada(env).catch((e) => console.error('tarefa agendada:', e && e.stack ? e.stack : e)));
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const rota = url.pathname.replace(/\/+$/, '') || '/';

    if (!rota.startsWith('/api/')) {
      const resposta = await env.ASSETS.fetch(req);
      // a pagina de agendamento e o painel nunca vao para o Google
      if (rota === '/agendar-reuniao' || rota === '/kai-agenda-admin') {
        const nova = new Response(resposta.body, resposta);
        nova.headers.set('x-robots-tag', 'noindex, nofollow, noarchive');
        return nova;
      }
      return resposta;
    }

    const metodo = req.method;

    try {
      if (rota === '/api/horarios' && metodo === 'GET') return await rotaHorarios(req, env);
      if (rota === '/api/agendar' && metodo === 'POST') return await rotaAgendar(req, env, ctx);
      if (rota === '/api/acao' && metodo === 'GET') return await rotaAcao(req, env);
      if (rota === '/api/admin/login' && metodo === 'POST') return await rotaLogin(req, env);

      if (rota === '/api/admin/sair' && metodo === 'POST') {
        return json({ ok: true }, 200, { 'set-cookie': 'kai_admin=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0' });
      }

      if (rota.startsWith('/api/admin/')) {
        if (!(await exigirAdmin(req, env))) return json({ erro: 'Sessao expirada. Entre novamente.' }, 401);

        if (rota === '/api/admin/config' && metodo === 'GET') {
          const cfg = await lerConfig(env);
          return json({
            config: cfg,
            integracoes: {
              email: Boolean(env.RESEND_API_KEY),
              formsubmit: Boolean(env.FORMSUBMIT_HASH),
              telegram: Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID),
              ntfy: Boolean(env.NTFY_TOPIC),
            },
          });
        }

        if (rota === '/api/admin/config' && metodo === 'PUT') {
          const atual = await lerConfig(env);
          const nova = sanearConfig(await req.json(), atual);
          await env.AGENDA.put('config', JSON.stringify(nova));
          return json({ ok: true, config: nova });
        }

        if (rota === '/api/admin/reservas' && metodo === 'GET') return await rotaReservas(env);

        if (rota === '/api/admin/confirmar' && metodo === 'POST') {
          const { id, link } = await req.json();
          const r = await confirmarReserva(env, id, link);
          return r.erro ? json({ erro: r.erro }, 404) : json({ ok: true, emailEnviado: r.emailEnviado, motivoFalha: r.motivoFalha });
        }

        if (rota === '/api/admin/cancelar' && metodo === 'POST') {
          const { id, motivo } = await req.json();
          const r = await cancelarReserva(env, id, motivo);
          return r.erro ? json({ erro: r.erro }, 404) : json({ ok: true, emailEnviado: r.emailEnviado, motivoFalha: r.motivoFalha });
        }
      }

      return json({ erro: 'Rota nao encontrada.' }, 404);
    } catch (e) {
      console.error('erro na agenda:', e && e.stack ? e.stack : e);
      return json({ erro: 'Erro interno. Tente novamente em instantes.' }, 500);
    }
  },
};
