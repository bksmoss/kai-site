/* KAI Arquitetura — painel administrativo da agenda */
(function () {
  'use strict';

  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var cfg = null;
  var hoje = null;
  var sujo = false;

  var $ = function (id) { return document.getElementById(id); };

  function aviso(alvo, texto, classe) {
    var box = $(alvo);
    box.innerHTML = texto ? '<div class="' + (classe || 'ag-erro') + '">' + texto + '</div>' : '';
  }

  function api(rota, opcoes) {
    return fetch('/api/admin/' + rota, Object.assign({ headers: { 'content-type': 'application/json' } }, opcoes || {}))
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (d) {
          if (r.status === 401 && rota !== 'login') { mostrarLogin(); throw new Error('sessao'); }
          if (!r.ok || d.erro) throw new Error(d.erro || 'Erro ' + r.status);
          return d;
        });
      });
  }

  function marcarSujo() {
    sujo = true;
    $('barraSalvar').hidden = false;
    $('statusSalvar').textContent = 'Alterações não salvas';
  }

  /* ---------- datas ---------- */
  function porExtenso(data) {
    var p = data.split('-');
    var t = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
    }).format(new Date(Date.UTC(+p[0], +p[1] - 1, +p[2])));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function somarDias(data, n) {
    var p = data.split('-');
    var d = new Date(Date.UTC(+p[0], +p[1] - 1, +p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function escapar(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ================= login ================= */
  function mostrarLogin() {
    $('telaPainel').hidden = true;
    $('telaLogin').hidden = false;
    setTimeout(function () { $('campoSenha').focus(); }, 100);
  }

  $('formLogin').addEventListener('submit', function (e) {
    e.preventDefault();
    var botao = $('botaoEntrar');
    botao.disabled = true;
    botao.textContent = 'Entrando…';
    aviso('erroLogin', '');

    api('login', { method: 'POST', body: JSON.stringify({ senha: $('campoSenha').value }) })
      .then(function () { $('campoSenha').value = ''; abrirPainel(); })
      .catch(function (err) { aviso('erroLogin', escapar(err.message)); })
      .finally(function () { botao.disabled = false; botao.textContent = 'Entrar'; });
  });

  $('botaoSair').addEventListener('click', function () {
    fetch('/api/admin/sair', { method: 'POST' }).finally(function () { location.reload(); });
  });

  /* ================= abas ================= */
  Array.prototype.forEach.call(document.querySelectorAll('.adm-tab'), function (aba) {
    aba.addEventListener('click', function () {
      document.querySelectorAll('.adm-tab').forEach(function (t) { t.classList.remove('is-active'); });
      document.querySelectorAll('.adm-panel').forEach(function (p) { p.classList.remove('is-active'); });
      aba.classList.add('is-active');
      document.querySelector('[data-painel="' + aba.dataset.aba + '"]').classList.add('is-active');
      if (aba.dataset.aba === 'convite') carregarConviteHorarios();
    });
  });

  /* ================= enviar convite ================= */
  // Deixa a data mínima em hoje quando a aba abre.
  function carregarConviteHorarios() {
    if (!$('convDia').min) $('convDia').min = hoje || new Date().toISOString().slice(0, 10);
    mostrarOcupadosDoDia();
  }

  // Mostra os horários já ocupados no dia escolhido, para evitar conflito.
  function mostrarOcupadosDoDia() {
    var d = $('convDia').value;
    var box = $('convOcupado');
    if (!d) { box.innerHTML = ''; return; }
    var ocup = (reservasCache || []).filter(function (r) { return r.date === d; })
      .sort(function (a, b) { return a.time.localeCompare(b.time); })
      .map(function (r) { return r.time + '–' + r.endTime; });
    box.innerHTML = ocup.length
      ? '<span class="ag-aviso" style="display:block;margin:0">⚠ Já ocupado nesse dia: <strong>' + ocup.join(', ') + '</strong>. Escolha um horário fora desses.</span>'
      : 'Nenhum horário ocupado nesse dia.';
  }

  $('convDia').addEventListener('change', mostrarOcupadosDoDia);

  $('formConvite').addEventListener('submit', function (e) {
    e.preventDefault();
    aviso('conviteErro', '');
    var corpo = {
      data: $('convDia').value, hora: $('convHora').value,
      nome: $('convNome').value.trim(), email: $('convEmail').value.trim(),
      telefone: $('convTelefone').value.trim(), assunto: $('convAssunto').value.trim(),
      link: $('convLink').value.trim(), mensagem: $('convMsg').value.trim(),
    };
    if (!corpo.data || !corpo.hora) return aviso('conviteErro', 'Escolha o dia e o horário.');
    if (corpo.nome.length < 2) return aviso('conviteErro', 'Informe o nome do cliente.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(corpo.email)) return aviso('conviteErro', 'Informe um e‑mail válido.');

    var botao = $('convEnviar');
    botao.disabled = true;
    botao.textContent = 'Enviando…';

    api('convidar', { method: 'POST', body: JSON.stringify(corpo) })
      .then(function (d) {
        $('formConvite').reset();
        $('convOcupado').innerHTML = '';
        aviso('avisoGeral', d.emailEnviado
          ? 'Convite enviado! O cliente vai receber um e‑mail para <strong>confirmar a presença</strong>. Enquanto isso, aparece como “aguardando o cliente”.'
          : 'Convite criado, mas o <strong>e‑mail não saiu</strong> (' + escapar(d.motivoFalha || 'sem detalhe') + '). Avise o cliente por WhatsApp.',
          d.emailEnviado ? 'ag-ok' : 'ag-aviso');
        document.querySelector('[data-aba="reunioes"]').click();
        return carregarReservas();
      })
      .catch(function (err) {
        if (err.message !== 'sessao') aviso('conviteErro', escapar(err.message));
      })
      .finally(function () { botao.disabled = false; botao.textContent = 'Enviar convite ao cliente'; });
  });

  /* ================= reuniões ================= */
  var reservasCache = [];

  function carregarReservas() {
    return api('reservas').then(function (d) {
      hoje = d.hoje;
      reservasCache = d.reservas || [];
      var proximas = [], passadas = [];
      d.reservas.forEach(function (r) { (r.date >= d.hoje ? proximas : passadas).push(r); });

      $('listaProximas').innerHTML = proximas.length
        ? proximas.map(function (r) { return cartao(r, false); }).join('')
        : '<p class="ag-vazio">Nenhuma reunião marcada por enquanto.</p>';

      $('listaPassadas').innerHTML = passadas.length
        ? passadas.reverse().slice(0, 30).map(function (r) { return cartao(r, true); }).join('')
        : '<p class="ag-vazio">Nada por aqui ainda.</p>';

      ligarBotoesReserva();
    });
  }

  function cartao(r, passada) {
    var confirmada = r.status === 'confirmada';
    var convite = r.status === 'convite';
    var tel = (r.phone || '').replace(/\D/g, '');

    var tagClasse = confirmada ? 'tag--conf' : 'tag--pend';
    var tagTexto = confirmada ? 'confirmada' : convite ? 'aguardando o cliente' : 'aguardando você';

    var inputLink = '<input class="ag-input" style="flex:1;min-width:210px;width:auto" data-campo="link" placeholder="Cole o link (meet.new)" value="' + escapar(r.meetingLink || '') + '">';

    var acoes = '';
    if (passada) {
      acoes = r.meetingLink ? '<p class="adm-item__obs" style="word-break:break-all">Link: ' + escapar(r.meetingLink) + '</p>' : '';
    } else if (convite) {
      acoes = '<p class="adm-item__obs">Convite enviado. Aguardando o cliente confirmar a presença.</p>' +
        '<div class="adm-item__acoes">' +
          '<button class="ag-btn ag-btn--sm" data-acao="confirmar">Confirmar no lugar do cliente</button>' +
          '<button class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="cancelar">Cancelar convite</button>' +
        '</div>';
    } else if (confirmada && r.linkEnviado) {
      acoes = whatsappBloco(r) +
        '<div class="adm-item__acoes">' +
          inputLink +
          '<button class="ag-btn ag-btn--sm" data-acao="lembrete">Enviar lembrete da reunião</button>' +
          '<button class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="cancelar">Cancelar reunião</button>' +
        '</div>';
    } else if (confirmada) {
      acoes = '<div class="adm-item__acoes">' +
          inputLink +
          '<button class="ag-btn ag-btn--sm" data-acao="enviarlink">Enviar link da reunião</button>' +
          '<button class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="cancelar">Cancelar reunião</button>' +
        '</div>';
    } else { // pendente
      acoes = '<div class="adm-item__acoes">' +
          '<input class="ag-input" style="flex:1;min-width:210px;width:auto" data-campo="link" placeholder="Cole o link (meet.new)" value="">' +
          '<button class="ag-btn ag-btn--sm" data-acao="confirmar">Confirmar e avisar cliente</button>' +
          '<button class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="cancelar">Recusar</button>' +
        '</div>';
    }

    return '<div class="adm-item' + (passada ? ' is-passada' : '') + '" data-id="' + escapar(r.id) + '">' +
      '<div class="adm-item__top">' +
        '<div>' +
          '<p class="adm-item__quando">' + escapar(porExtenso(r.date)) + ' · ' + escapar(r.time) + ' às ' + escapar(r.endTime) + '</p>' +
          '<p class="adm-item__quem"><strong>' + escapar(r.name) + '</strong> · ' +
            '<a href="mailto:' + escapar(r.email) + '" style="color:var(--coral)">' + escapar(r.email) + '</a>' +
            (tel ? ' · <a href="https://wa.me/55' + tel + '" target="_blank" rel="noopener" style="color:var(--coral)">' + escapar(r.phone) + '</a>' : '') +
          '</p>' +
          (r.subject ? '<p class="adm-item__quem">' + escapar(r.subject) + '</p>' : '') +
        '</div>' +
        '<span class="tag ' + tagClasse + '">' + tagTexto + '</span>' +
      '</div>' +
      (r.notes ? '<p class="adm-item__obs">' + escapar(r.notes) + '</p>' : '') +
      (r.avisado === false
        ? '<p class="ag-aviso" style="margin:0.7rem 0 0">⚠ O aviso deste pedido <strong>não chegou até você</strong> por nenhum canal — você só está vendo aqui no painel. ' +
          (r.avisoDetalhe ? '<br><span style="font-size:0.78rem;opacity:.8">' + escapar(r.avisoDetalhe) + '</span>' : '') + '</p>'
        : '') +
      (confirmada && !r.linkEnviado && !passada
        ? '<p class="ag-aviso" style="margin:0.7rem 0 0">Confirmada, mas ainda <strong>sem link</strong>. Cole o link abaixo e clique em “Enviar link da reunião”.</p>'
        : '') +
      acoes +
    '</div>';
  }

  // Texto de lembrete pronto para copiar/enviar no WhatsApp do cliente.
  function whatsappBloco(r) {
    var msg = 'Olá ' + (r.name || '').split(' ')[0] + '! Passando para lembrar da nossa reunião na KAI Arquitetura em ' +
      porExtenso(r.date).toLowerCase() + ', às ' + r.time + '.' + (r.meetingLink ? ' Link: ' + r.meetingLink : '');
    var tel = (r.phone || '').replace(/\D/g, '');
    return '<div style="margin-top:0.8rem">' +
      '<p class="adm-box__hint" style="margin:0 0 0.35rem">Lembrete para enviar no WhatsApp:</p>' +
      '<textarea class="ag-textarea" data-campo="wamsg" readonly style="min-height:60px;font-size:0.86rem">' + escapar(msg) + '</textarea>' +
      '<div style="display:flex;gap:0.5rem;margin-top:0.4rem;flex-wrap:wrap">' +
        '<button type="button" class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="copiarwa">Copiar texto</button>' +
        (tel ? '<a class="ag-btn ag-btn--ghost ag-btn--sm" href="https://wa.me/55' + tel + '?text=' + encodeURIComponent(msg) + '" target="_blank" rel="noopener">Abrir no WhatsApp</a>' : '') +
      '</div>' +
    '</div>';
  }

  var MENSAGENS = {
    confirmar: 'Pronto. O cliente foi avisado por e‑mail.',
    enviarlink: 'Link enviado! O cliente recebeu o e‑mail com o link da reunião.',
    lembrete: 'Lembrete enviado ao cliente por e‑mail.',
    cancelar: 'Reunião cancelada e horário liberado.',
  };

  function ligarBotoesReserva() {
    document.querySelectorAll('.adm-item [data-acao]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var item = botao.closest('.adm-item');
        var id = item.dataset.id;
        var acao = botao.dataset.acao;

        // copiar texto do WhatsApp (sem chamar a API)
        if (acao === 'copiarwa') {
          var ta = item.querySelector('[data-campo="wamsg"]');
          if (ta) {
            ta.select();
            try { document.execCommand('copy'); } catch (e) {}
            if (navigator.clipboard) navigator.clipboard.writeText(ta.value).catch(function () {});
            aviso('avisoGeral', 'Texto copiado! Cole no WhatsApp do cliente.', 'ag-ok');
          }
          return;
        }

        if (acao === 'cancelar' && !confirm('Cancelar esta reunião? O horário será liberado e o cliente receberá um e‑mail.')) return;

        var corpo = { id: id };
        if (acao === 'confirmar' || acao === 'enviarlink') {
          var campo = item.querySelector('[data-campo="link"]');
          corpo.link = campo ? campo.value.trim() : '';
          if (acao === 'enviarlink' && !corpo.link) {
            return aviso('avisoGeral', 'Cole o link da reunião antes de enviar.', 'ag-aviso');
          }
        } else if (acao === 'cancelar') {
          corpo.motivo = prompt('Quer explicar o motivo para o cliente? (opcional)') || '';
        }

        botao.disabled = true;
        botao.textContent = 'Aguarde…';

        api(acao, { method: 'POST', body: JSON.stringify(corpo) })
          .then(function (d) {
            aviso('avisoGeral', d.emailEnviado || acao === 'cancelar'
              ? (MENSAGENS[acao] || 'Feito.')
              : 'Ação registrada, mas o <strong>e‑mail para o cliente não saiu</strong> (' + escapar(d.motivoFalha || 'envio não configurado') + '). Avise por WhatsApp.',
              (d.emailEnviado || acao === 'cancelar') ? 'ag-ok' : 'ag-aviso');
            return carregarReservas();
          })
          .catch(function (err) {
            if (err.message !== 'sessao') aviso('avisoGeral', escapar(err.message));
          });
      });
    });
  }

  /* ================= horários semanais ================= */
  function desenharSemana() {
    var html = '';
    for (var d = 0; d <= 6; d++) {
      var faixas = cfg.semana[d] || [];
      html += '<div class="adm-dia" data-dia="' + d + '">' +
        '<div class="adm-dia__nome">' + DIAS[d] + '</div>' +
        '<div class="adm-faixas">' +
          faixas.map(function (f, i) {
            return '<div class="adm-faixa" data-i="' + i + '">' +
              '<input type="time" data-campo="inicio" value="' + escapar(f.inicio) + '">' +
              '<span style="color:var(--muted);font-size:0.85rem">até</span>' +
              '<input type="time" data-campo="fim" value="' + escapar(f.fim) + '">' +
              '<button type="button" class="adm-remover" data-remover aria-label="Remover faixa">×</button>' +
            '</div>';
          }).join('') +
          (faixas.length ? '' : '<span class="adm-folga">Folga — nenhum horário disponível</span>') +
          '<button type="button" class="adm-add" data-add>+ adicionar faixa</button>' +
        '</div>' +
      '</div>';
    }
    $('gradeSemana').innerHTML = html;

    $('gradeSemana').querySelectorAll('[data-add]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.closest('.adm-dia').dataset.dia;
        cfg.semana[d] = (cfg.semana[d] || []).concat([{ inicio: '09:00', fim: '12:00' }]);
        marcarSujo();
        desenharSemana();
      });
    });

    $('gradeSemana').querySelectorAll('[data-remover]').forEach(function (b) {
      b.addEventListener('click', function () {
        var d = b.closest('.adm-dia').dataset.dia;
        var i = +b.closest('.adm-faixa').dataset.i;
        cfg.semana[d].splice(i, 1);
        marcarSujo();
        desenharSemana();
      });
    });

    $('gradeSemana').querySelectorAll('.adm-faixa input').forEach(function (input) {
      input.addEventListener('change', function () {
        var d = input.closest('.adm-dia').dataset.dia;
        var i = +input.closest('.adm-faixa').dataset.i;
        cfg.semana[d][i][input.dataset.campo] = input.value;
        marcarSujo();
      });
    });
  }

  /* ================= bloqueios ================= */
  function desenharBloqueios() {
    var lista = cfg.bloqueios || [];
    $('listaBloqueios').innerHTML = lista.length
      ? lista.map(function (b, i) {
          return '<div class="adm-bloqueio" data-i="' + i + '">' +
            '<input type="date" data-campo="inicio" value="' + escapar(b.inicio) + '">' +
            '<span style="color:var(--muted);font-size:0.85rem">até</span>' +
            '<input type="date" data-campo="fim" value="' + escapar(b.fim) + '">' +
            '<input type="text" data-campo="motivo" placeholder="Motivo (só para você)" value="' + escapar(b.motivo || '') + '">' +
            '<button type="button" class="adm-remover" data-remover aria-label="Remover">×</button>' +
          '</div>';
        }).join('')
      : '<p class="ag-vazio" style="padding:1.4rem">Nenhum período bloqueado. Sua agenda está aberta.</p>';

    $('listaBloqueios').querySelectorAll('input').forEach(function (input) {
      input.addEventListener('change', function () {
        var i = +input.closest('.adm-bloqueio').dataset.i;
        cfg.bloqueios[i][input.dataset.campo] = input.value;
        if (input.dataset.campo === 'inicio' && cfg.bloqueios[i].fim < input.value) {
          cfg.bloqueios[i].fim = input.value;
          desenharBloqueios();
        }
        marcarSujo();
      });
    });

    $('listaBloqueios').querySelectorAll('[data-remover]').forEach(function (b) {
      b.addEventListener('click', function () {
        cfg.bloqueios.splice(+b.closest('.adm-bloqueio').dataset.i, 1);
        marcarSujo();
        desenharBloqueios();
      });
    });
  }

  $('addBloqueio').addEventListener('click', function () {
    cfg.bloqueios = (cfg.bloqueios || []).concat([{ inicio: hoje, fim: hoje, motivo: '' }]);
    marcarSujo();
    desenharBloqueios();
  });

  $('travarSemana').addEventListener('click', function () {
    cfg.bloqueios = (cfg.bloqueios || []).concat([{ inicio: hoje, fim: somarDias(hoje, 6), motivo: 'Semana travada' }]);
    marcarSujo();
    desenharBloqueios();
  });

  // Feriados nacionais 2026-2027 (datas móveis já calculadas). Carnaval e
  // Corpus Christi são pontos facultativos, mas escritórios costumam fechar.
  var FERIADOS = [
    { inicio: '2026-09-07', fim: '2026-09-07', motivo: 'Independência' },
    { inicio: '2026-10-12', fim: '2026-10-12', motivo: 'N. Sra. Aparecida' },
    { inicio: '2026-11-02', fim: '2026-11-02', motivo: 'Finados' },
    { inicio: '2026-11-15', fim: '2026-11-15', motivo: 'Proclamação da República' },
    { inicio: '2026-11-20', fim: '2026-11-20', motivo: 'Consciência Negra' },
    { inicio: '2026-12-25', fim: '2026-12-25', motivo: 'Natal' },
    { inicio: '2027-01-01', fim: '2027-01-01', motivo: 'Confraternização Universal' },
    { inicio: '2027-02-08', fim: '2027-02-09', motivo: 'Carnaval' },
    { inicio: '2027-03-26', fim: '2027-03-26', motivo: 'Sexta-feira Santa' },
    { inicio: '2027-04-21', fim: '2027-04-21', motivo: 'Tiradentes' },
    { inicio: '2027-05-01', fim: '2027-05-01', motivo: 'Dia do Trabalho' },
    { inicio: '2027-05-27', fim: '2027-05-27', motivo: 'Corpus Christi' },
    { inicio: '2027-09-07', fim: '2027-09-07', motivo: 'Independência' },
    { inicio: '2027-10-12', fim: '2027-10-12', motivo: 'N. Sra. Aparecida' },
    { inicio: '2027-11-02', fim: '2027-11-02', motivo: 'Finados' },
    { inicio: '2027-11-15', fim: '2027-11-15', motivo: 'Proclamação da República' },
    { inicio: '2027-11-20', fim: '2027-11-20', motivo: 'Consciência Negra' },
    { inicio: '2027-12-25', fim: '2027-12-25', motivo: 'Natal' },
  ];

  $('addFeriados').addEventListener('click', function () {
    cfg.bloqueios = cfg.bloqueios || [];
    var existe = function (f) {
      return cfg.bloqueios.some(function (b) { return b.inicio === f.inicio && b.fim === f.fim; });
    };
    var novos = FERIADOS.filter(function (f) { return f.fim >= hoje && !existe(f); });
    if (!novos.length) {
      aviso('avisoGeral', 'Os feriados que ainda estão por vir já estão na lista.', 'ag-ok');
      return;
    }
    cfg.bloqueios = cfg.bloqueios.concat(novos);
    marcarSujo();
    desenharBloqueios();
    aviso('avisoGeral', novos.length + ' feriado(s) adicionado(s). Confira e clique em <strong>Salvar alterações</strong>.', 'ag-ok');
  });

  /* ================= config ================= */
  var CAMPOS = {
    cfgDuracao: 'duracaoMin', cfgIntervalo: 'intervaloMin',
    cfgAntecedencia: 'antecedenciaHoras', cfgDias: 'diasAFrente',
    cfgPlataforma: 'plataforma',
    cfgEmail: 'emailAviso', cfgMensagem: 'mensagemTopo',
    cfgAvisoDiario: 'avisoDiario',
  };

  function preencherCampos() {
    Object.keys(CAMPOS).forEach(function (id) {
      var el = $(id);
      if (!el) return; // campo pode nao existir numa versao futura: nao quebra o painel
      el.value = cfg[CAMPOS[id]] != null ? cfg[CAMPOS[id]] : '';
      el.addEventListener('input', function () {
        cfg[CAMPOS[id]] = el.type === 'number' ? Number(el.value) : el.value;
        marcarSujo();
      });
    });

    // checkboxes tem estado proprio (checked), fora do fluxo de CAMPOS acima
    ligarCheckbox('cfgLembrete30', 'lembrete30Min');
    ligarCheckbox('cfgLembreteCliente', 'lembreteClienteDia');
  }

  function ligarCheckbox(id, chave) {
    var el = $(id);
    if (!el) return;
    el.checked = cfg[chave] !== false;
    el.addEventListener('change', function () {
      cfg[chave] = el.checked;
      marcarSujo();
    });
  }

  function desenharIntegracoes(status) {
    var rotulos = {
      email: 'E‑mail (Resend)', formsubmit: 'E‑mail reserva (FormSubmit)',
      telegram: 'Telegram', ntfy: 'Notificação no celular (ntfy)',
    };
    $('statusIntegracoes').innerHTML = Object.keys(rotulos).map(function (k) {
      return '<span class="' + (status[k] ? 'on' : '') + '">' + rotulos[k] + ' · ' + (status[k] ? 'ativo' : 'desligado') + '</span>';
    }).join('');
  }

  $('botaoSalvar').addEventListener('click', function () {
    var botao = $('botaoSalvar');
    botao.disabled = true;
    $('statusSalvar').textContent = 'Salvando…';

    api('config', { method: 'PUT', body: JSON.stringify(cfg) })
      .then(function (d) {
        cfg = d.config;
        sujo = false;
        $('statusSalvar').textContent = 'Salvo!';
        setTimeout(function () { $('barraSalvar').hidden = true; }, 1400);
        desenharSemana();
        desenharBloqueios();
      })
      .catch(function (err) {
        if (err.message !== 'sessao') {
          $('statusSalvar').textContent = '';
          aviso('avisoGeral', escapar(err.message));
        }
      })
      .finally(function () { botao.disabled = false; });
  });

  window.addEventListener('beforeunload', function (e) {
    if (sujo) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ================= início ================= */
  function abrirPainel(dados) {
    $('telaLogin').hidden = true;
    $('telaPainel').hidden = false;

    (dados ? Promise.resolve(dados) : api('config'))
      .then(function (d) {
        cfg = d.config;
        cfg.bloqueios = cfg.bloqueios || [];
        hoje = hoje || new Date().toISOString().slice(0, 10);
        desenharIntegracoes(d.integracoes);
        preencherCampos();
        return carregarReservas();
      })
      .then(function () {
        desenharSemana();
        desenharBloqueios();
      })
      .catch(function (err) {
        if (err.message !== 'sessao') aviso('avisoGeral', escapar(err.message));
      });
  }

  // sessão ainda válida? entra direto; senão, pede a senha.
  api('config')
    .then(function (d) { abrirPainel(d); })
    .catch(function () { mostrarLogin(); });
})();
