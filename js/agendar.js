/* KAI Arquitetura — pagina de agendamento de reunioes */
(function () {
  'use strict';

  var DOW = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  var estado = {
    dias: {},          // { '2026-08-05': ['09:00','10:00'] }
    hoje: null,
    ultimaData: null,
    duracao: 45,
    mesVisivel: null,  // Date no dia 1 do mes exibido
    diaEscolhido: null,
    horaEscolhida: null,
    carregados: {},    // meses ja buscados: { '2026-08': true }
    enviando: false,
  };

  var $ = function (id) { return document.getElementById(id); };

  /* ---------- datas ---------- */
  function iso(d) {
    return d.getUTCFullYear() + '-' +
      String(d.getUTCMonth() + 1).padStart(2, '0') + '-' +
      String(d.getUTCDate()).padStart(2, '0');
  }
  function deIso(s) {
    var p = s.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }
  function chaveMes(d) {
    return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0');
  }
  function nomeMes(d) {
    var t = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(d);
    return t.charAt(0).toUpperCase() + t.slice(1); // "julho de 2026" -> "Julho de 2026"
  }
  function porExtenso(s) {
    var t = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long', day: '2-digit', month: 'long', timeZone: 'UTC',
    }).format(deIso(s));
    return t.charAt(0).toUpperCase() + t.slice(1);
  }

  /* ---------- avisos ---------- */
  function mostrarErro(alvo, texto, classe) {
    var box = $(alvo);
    if (!box) return;
    box.innerHTML = texto ? '<div class="' + (classe || 'ag-erro') + '">' + texto + '</div>' : '';
  }

  /* ---------- carregar horarios ---------- */
  function carregar(mes, forcar) {
    var chave = chaveMes(mes);
    if (estado.carregados[chave] && !forcar) return Promise.resolve();

    var primeiro = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1));
    var ultimo = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0));

    return fetch('/api/horarios?de=' + iso(primeiro) + '&ate=' + iso(ultimo), { headers: { accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('resposta ' + r.status);
        return r.json();
      })
      .then(function (d) {
        estado.hoje = d.hoje;
        estado.ultimaData = d.ultimaData;
        estado.duracao = d.duracaoMin;

        // troca os dias desse mes pelos recem-vindos (evita horario "fantasma")
        Object.keys(estado.dias).forEach(function (k) {
          if (k.slice(0, 7) === chave) delete estado.dias[k];
        });
        Object.keys(d.dias).forEach(function (k) { estado.dias[k] = d.dias[k]; });

        estado.carregados[chave] = true;

        $('metaDuracao').textContent = d.duracaoMin + ' minutos';
        if (d.plataforma) $('metaPlataforma').textContent = d.plataforma;
        if (d.mensagemTopo) $('msgTopo').textContent = d.mensagemTopo;
        $('metaAviso').textContent = 'Confirmação por e‑mail';
        mostrarErro('erroGeral', '');
      });
  }

  /* ---------- calendario ---------- */
  function desenharCalendario() {
    var mes = estado.mesVisivel;
    $('calMes').textContent = nomeMes(mes);

    var grade = $('calGrade');
    grade.innerHTML = '';

    DOW.forEach(function (d) {
      var c = document.createElement('div');
      c.className = 'cal-dow';
      c.textContent = d;
      grade.appendChild(c);
    });

    var primeiro = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), 1));
    var totalDias = new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth() + 1, 0)).getUTCDate();

    for (var v = 0; v < primeiro.getUTCDay(); v++) {
      var vazio = document.createElement('div');
      vazio.className = 'cal-day is-empty';
      grade.appendChild(vazio);
    }

    for (var dia = 1; dia <= totalDias; dia++) {
      var data = iso(new Date(Date.UTC(mes.getUTCFullYear(), mes.getUTCMonth(), dia)));
      var livre = estado.dias[data] && estado.dias[data].length;

      var cel = document.createElement(livre ? 'button' : 'div');
      cel.className = 'cal-day' + (livre ? ' is-free' : '') +
        (data === estado.hoje ? ' is-today' : '') +
        (data === estado.diaEscolhido ? ' is-selected' : '');
      cel.textContent = dia;

      if (livre) {
        cel.type = 'button';
        cel.setAttribute('aria-label', porExtenso(data) + ' — ' + estado.dias[data].length + ' horários');
        cel.dataset.data = data;
        cel.addEventListener('click', function () { escolherDia(this.dataset.data); });
      }
      grade.appendChild(cel);
    }

    // limites de navegacao
    var mesHoje = estado.hoje ? estado.hoje.slice(0, 7) : chaveMes(mes);
    var mesLimite = estado.ultimaData ? estado.ultimaData.slice(0, 7) : chaveMes(mes);
    $('calAnterior').disabled = chaveMes(mes) <= mesHoje;
    $('calProximo').disabled = chaveMes(mes) >= mesLimite;
  }

  function mudarMes(passo) {
    var m = estado.mesVisivel;
    estado.mesVisivel = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + passo, 1));
    desenharCalendario();
    carregar(estado.mesVisivel).then(desenharCalendario).catch(function () {
      mostrarErro('erroGeral', 'Não conseguimos carregar a agenda. Tente novamente em instantes.');
    });
  }

  /* ---------- horarios ---------- */
  function escolherDia(data) {
    estado.diaEscolhido = data;
    estado.horaEscolhida = null;
    desenharCalendario();
    desenharHorarios();
    $('passoFormulario').hidden = true;
    $('passoHorarios').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function desenharHorarios() {
    var secao = $('passoHorarios');
    var horas = estado.dias[estado.diaEscolhido] || [];

    if (!estado.diaEscolhido) { secao.hidden = true; return; }
    secao.hidden = false;
    $('horariosDia').textContent = porExtenso(estado.diaEscolhido);

    var grade = $('horariosGrade');
    grade.innerHTML = '';

    if (!horas.length) {
      grade.innerHTML = '<p class="ag-vazio" style="grid-column:1/-1">Esse dia não tem mais horários livres. Escolha outro, por favor.</p>';
      return;
    }

    horas.forEach(function (h) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'time-btn' + (h === estado.horaEscolhida ? ' is-selected' : '');
      b.textContent = h;
      b.addEventListener('click', function () { escolherHora(h); });
      grade.appendChild(b);
    });
  }

  function escolherHora(hora) {
    estado.horaEscolhida = hora;
    desenharHorarios();

    var fim = somarMinutos(hora, estado.duracao);
    $('resumoEscolha').innerHTML = '<strong>' + porExtenso(estado.diaEscolhido) + '</strong> · ' + hora + ' às ' + fim;
    $('passoFormulario').hidden = false;
    mostrarErro('erroForm', '');
    $('passoFormulario').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    setTimeout(function () { $('campoNome').focus(); }, 320);
  }

  function somarMinutos(hhmm, min) {
    var p = hhmm.split(':');
    var t = (+p[0]) * 60 + (+p[1]) + min;
    return String(Math.floor(t / 60)).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0');
  }

  /* ---------- envio ---------- */
  function enviar(evento) {
    evento.preventDefault();
    if (estado.enviando) return;

    var nome = $('campoNome').value.trim();
    var email = $('campoEmail').value.trim();

    if (nome.length < 2) return mostrarErro('erroForm', 'Por favor, informe seu nome.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return mostrarErro('erroForm', 'Por favor, informe um e‑mail válido.');
    if (!estado.diaEscolhido || !estado.horaEscolhida) return mostrarErro('erroForm', 'Escolha um dia e um horário.');

    estado.enviando = true;
    var botao = $('botaoEnviar');
    botao.disabled = true;
    botao.textContent = 'Enviando…';
    mostrarErro('erroForm', '');

    fetch('/api/agendar', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        nome: nome,
        email: email,
        telefone: $('campoTelefone').value.trim(),
        assunto: $('campoAssunto').value,
        observacoes: $('campoObs').value.trim(),
        data: estado.diaEscolhido,
        hora: estado.horaEscolhida,
        website: document.querySelector('input[name="website"]').value,
      }),
    })
      .then(function (r) { return r.json().then(function (d) { return { ok: r.ok, dados: d }; }); })
      .then(function (res) {
        if (!res.ok || res.dados.erro) {
          mostrarErro('erroForm', res.dados.erro || 'Não foi possível concluir. Tente novamente.');
          if (res.dados.recarregar) {
            // alguem pegou o horario antes: recarrega o mes e volta para a escolha
            estado.horaEscolhida = null;
            carregar(estado.mesVisivel, true).then(function () {
              desenharCalendario();
              desenharHorarios();
              $('passoFormulario').hidden = true;
            });
          }
          return;
        }
        mostrarSucesso(res.dados);
      })
      .catch(function () {
        mostrarErro('erroForm', 'Falha de conexão. Verifique sua internet e tente de novo.');
      })
      .finally(function () {
        estado.enviando = false;
        botao.disabled = false;
        botao.textContent = 'Solicitar reunião';
      });
  }

  function mostrarSucesso(dados) {
    $('passoCalendario').hidden = true;
    $('passoHorarios').hidden = true;
    $('passoFormulario').hidden = true;
    $('passoSucesso').hidden = false;

    $('sucessoResumo').innerHTML =
      '<strong>' + porExtenso(dados.resumo.data) + '</strong><br>' +
      dados.resumo.hora + ' às ' + dados.resumo.fim + ' (horário de Brasília)';

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- atualizacao em tempo real ---------- */
  function revalidar() {
    if (document.hidden || !$('passoSucesso').hidden) return;
    carregar(estado.mesVisivel, true).then(function () {
      desenharCalendario();
      // se o horario escolhido sumiu enquanto o cliente preenchia o formulario
      var horas = estado.dias[estado.diaEscolhido] || [];
      if (estado.horaEscolhida && horas.indexOf(estado.horaEscolhida) === -1) {
        estado.horaEscolhida = null;
        $('passoFormulario').hidden = true;
        mostrarErro('erroGeral', 'Esse horário acabou de ser reservado por outra pessoa. Escolha outro, por favor.', 'ag-aviso');
      }
      desenharHorarios();
    }).catch(function () { /* silencioso: tenta de novo no proximo ciclo */ });
  }

  /* ---------- inicio ---------- */
  function iniciar() {
    $('calAnterior').addEventListener('click', function () { mudarMes(-1); });
    $('calProximo').addEventListener('click', function () { mudarMes(1); });
    $('trocarHorario').addEventListener('click', function () {
      $('passoFormulario').hidden = true;
      $('passoHorarios').scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    $('formAgenda').addEventListener('submit', enviar);

    var agora = new Date();
    estado.mesVisivel = new Date(Date.UTC(agora.getFullYear(), agora.getMonth(), 1));

    carregar(estado.mesVisivel)
      .then(function () {
        // se o mes atual nao tiver nada, ja pula para o proximo
        var temAlgo = Object.keys(estado.dias).some(function (k) {
          return k.slice(0, 7) === chaveMes(estado.mesVisivel) && estado.dias[k].length;
        });
        $('carregando').hidden = true;
        $('conteudo').hidden = false;
        if (!temAlgo && estado.ultimaData && chaveMes(estado.mesVisivel) < estado.ultimaData.slice(0, 7)) {
          mudarMes(1);
        } else {
          desenharCalendario();
        }
      })
      .catch(function () {
        $('carregando').hidden = true;
        $('conteudo').hidden = false;
        mostrarErro('erroGeral', 'Não conseguimos carregar a agenda agora. Atualize a página ou <a href="https://wa.me/5511925049959" style="color:inherit;text-decoration:underline">fale conosco no WhatsApp</a>.');
      });

    setInterval(revalidar, 45000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) revalidar(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
