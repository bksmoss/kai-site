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
    });
  });

  /* ================= reuniões ================= */
  function carregarReservas() {
    return api('reservas').then(function (d) {
      hoje = d.hoje;
      var proximas = [], passadas = [];
      d.reservas.forEach(function (r) { (r.date >= d.hoje ? proximas : passadas).push(r); });

      $('listaProximas').innerHTML = proximas.length
        ? proximas.map(cartao).join('')
        : '<p class="ag-vazio">Nenhuma reunião marcada por enquanto.</p>';

      $('listaPassadas').innerHTML = passadas.length
        ? passadas.reverse().slice(0, 30).map(function (r) { return cartao(r, true); }).join('')
        : '<p class="ag-vazio">Nada por aqui ainda.</p>';

      ligarBotoesReserva();
    });
  }

  function cartao(r, passada) {
    var confirmada = r.status === 'confirmada';
    var tel = (r.phone || '').replace(/\D/g, '');
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
        '<span class="tag ' + (confirmada ? 'tag--conf' : 'tag--pend') + '">' + (confirmada ? 'confirmada' : 'aguardando você') + '</span>' +
      '</div>' +
      (r.notes ? '<p class="adm-item__obs">' + escapar(r.notes) + '</p>' : '') +
      (r.avisado === false
        ? '<p class="ag-aviso" style="margin:0.7rem 0 0">⚠ O aviso deste pedido <strong>não chegou até você</strong> por nenhum canal — você só está vendo aqui no painel. ' +
          (r.avisoDetalhe ? '<br><span style="font-size:0.78rem;opacity:.8">' + escapar(r.avisoDetalhe) + '</span>' : '') + '</p>'
        : '') +
      (confirmada && r.meetingLink
        ? '<p class="adm-item__obs" style="word-break:break-all">Link enviado: <a href="' + escapar(r.meetingLink) + '" target="_blank" rel="noopener" style="color:var(--coral)">' + escapar(r.meetingLink) + '</a></p>'
        : '') +
      (passada ? '' :
        '<div class="adm-item__acoes">' +
          (confirmada ? '' :
            '<input class="ag-input" style="flex:1;min-width:210px;width:auto" data-campo="link" placeholder="Link da reunião (opcional)" value="' + escapar(cfg && cfg.linkReuniao || '') + '">' +
            '<button class="ag-btn ag-btn--sm" data-acao="confirmar">Confirmar e avisar cliente</button>') +
          '<button class="ag-btn ag-btn--ghost ag-btn--sm" data-acao="cancelar">' + (confirmada ? 'Cancelar reunião' : 'Recusar') + '</button>' +
        '</div>') +
    '</div>';
  }

  function ligarBotoesReserva() {
    document.querySelectorAll('.adm-item [data-acao]').forEach(function (botao) {
      botao.addEventListener('click', function () {
        var item = botao.closest('.adm-item');
        var id = item.dataset.id;
        var acao = botao.dataset.acao;

        if (acao === 'cancelar' && !confirm('Cancelar esta reunião? O horário será liberado e o cliente receberá um e‑mail.')) return;

        var corpo = { id: id };
        if (acao === 'confirmar') {
          var campo = item.querySelector('[data-campo="link"]');
          corpo.link = campo ? campo.value.trim() : '';
        } else {
          corpo.motivo = prompt('Quer explicar o motivo para o cliente? (opcional)') || '';
        }

        botao.disabled = true;
        botao.textContent = 'Aguarde…';

        api(acao, { method: 'POST', body: JSON.stringify(corpo) })
          .then(function (d) {
            aviso('avisoGeral', d.emailEnviado
              ? 'Pronto. O cliente foi avisado por e‑mail.'
              : 'Ação registrada, mas o <strong>e‑mail para o cliente não saiu</strong> (' + escapar(d.motivoFalha || 'envio não configurado') + '). Avise por WhatsApp.',
              d.emailEnviado ? 'ag-ok' : 'ag-aviso');
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

  /* ================= config ================= */
  var CAMPOS = {
    cfgDuracao: 'duracaoMin', cfgIntervalo: 'intervaloMin',
    cfgAntecedencia: 'antecedenciaHoras', cfgDias: 'diasAFrente',
    cfgLink: 'linkReuniao', cfgPlataforma: 'plataforma',
    cfgEmail: 'emailAviso', cfgMensagem: 'mensagemTopo',
  };

  function preencherCampos() {
    Object.keys(CAMPOS).forEach(function (id) {
      $(id).value = cfg[CAMPOS[id]] != null ? cfg[CAMPOS[id]] : '';
      $(id).addEventListener('input', function () {
        var v = $(id).value;
        cfg[CAMPOS[id]] = $(id).type === 'number' ? Number(v) : v;
        marcarSujo();
      });
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
        if (!cfg.linkReuniao) {
          aviso('avisoGeral', 'Você ainda não cadastrou um <strong>link de reunião</strong>. Sem ele, o cliente recebe a confirmação sem o link de acesso. Configure em <em>Ajustes</em>.', 'ag-aviso');
        }
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
