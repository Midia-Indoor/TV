/* =============================================================
   acompanhar.js — página Acompanhar pedido.

   O cliente manda o número do pedido (na URL ou digitado) e a
   página fica perguntando o status na planilha. Enquanto o status
   não for final, pergunta de novo a cada 15s. Sem dependências e
   sem fetch em no-cors: aqui a resposta PRECISA ser lida, e o
   Apps Script devolve CORS liberado.
   ============================================================= */
(function () {
  'use strict';

  var INTERVALO = 15000;          /* 15s: rápido o bastante sem abusar */
  var CHAVE_PEDIDO = 'cardapio:pedido:atual';

  var el = {};
  var pedido = '';
  var temporizador = null;
  var ativo = true;
  var jaMostrou = false;   /* já exibiu um status de verdade? */

  /* ---------- utilidades ---------- */
  function semAcento(texto) {
    var s = String(texto == null ? '' : texto);
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    return s.replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  }

  function agora() {
    var d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');
  }

  function $(sel) { return document.querySelector(sel); }

  /* O texto do status vem da planilha, que o dono edita à mão. Vai
     para dentro da página, então precisa escapar como qualquer
     entrada externa. */
  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function iconeDoStatus(chave, cancelado) {
    if (cancelado) return '❌';
    if (chave === 'preparo') return '👨‍🍳';
    if (chave === 'caminho') return '🛵';
    if (chave === 'pronto') return '🛍️';
    if (chave === 'concluido') return '✅';
    return '⏳';
  }

  /* ---------- passos ---------- */
  /* Cada status conhecido vira um passo 0..3. O que não estiver na
     lista (o dono digitou algo próprio) aparece como texto mesmo,
     sem barra de progresso — melhor mostrar o que ele escreveu do
     que inventar um passo. */
  var PASSOS = [
    { titulo: 'Recebido', texto: 'Seu pedido chegou na lanchonete.' },
    { titulo: 'Em preparo', texto: 'Estamos preparando tudo agora.' },
    { titulo: 'A caminho', texto: 'Seu pedido saiu para entrega.' },
    { titulo: 'Concluído', texto: 'Pedido finalizado. Bom apetite!' }
  ];

  function chaveDoStatus(status) {
    var s = semAcento(status);
    if (!s || s === 'novo' || s === 'recebido' || s === 'aguardando') return 'novo';
    /* "Preparado" (pronto para retirada) precisa vir ANTES do teste
       generico de "prepar": senao caia em "preparo" e o cliente nunca
       via o passo "Pronto para retirada". */
    if (s.indexOf('preparad') >= 0) return 'pronto';
    if (s.indexOf('prepar') >= 0 || s === 'em andamento') return 'preparo';
    if (s.indexOf('caminho') >= 0 || s.indexOf('entrega') >= 0 || s.indexOf('saiu') >= 0) return 'caminho';
    if (s.indexOf('pronto') >= 0 || s.indexOf('retirada') >= 0) return 'pronto';
    if (s.indexOf('conclu') >= 0 || s.indexOf('entreg') >= 0 || s.indexOf('finaliz') >= 0) return 'concluido';
    return '';
  }

  function ehCancelado(status) {
    return semAcento(status).indexOf('cancel') >= 0;
  }

  function ehFinal(status) {
    var s = semAcento(status);
    return s.indexOf('conclu') >= 0 || s.indexOf('entreg') >= 0 ||
      s.indexOf('finaliz') >= 0 || s.indexOf('cancel') >= 0;
  }

  /* ---------- render ---------- */
  function pintarStatus(classe, icone, texto) {
    el.status.className = 'ac-status' + (classe ? ' ' + classe : '');
    el.status.innerHTML = '<span class="ac-status-icone" aria-hidden="true">' + icone + '</span>' +
      '<span class="ac-status-texto">' + esc(texto) + '</span>';
  }

  function mostrarCarregando() {
    pintarStatus('', '⏳', 'Consultando…');
    el.passos.innerHTML = '';
    el.dica.textContent = '';
  }

  function mostrarErro(mensagem) {
    pintarStatus('ac-status-erro', '⚠️', mensagem);
    el.passos.innerHTML = '';
    el.dica.textContent = '';
  }

  function mostrarNaoEncontrado() {
    pintarStatus('ac-status-erro', '🔎', 'Pedido não encontrado');
    el.passos.innerHTML = '';
    el.dica.textContent = 'Confira o número ou fale com a lanchonete pelo WhatsApp. ' +
      'Pode levar um minutinho até o pedido aparecer aqui.';
  }

  function tipoEhRetirada(tipo) {
    var t = semAcento(tipo);
    return t.indexOf('retirada') >= 0 || t === 'retirar' || t === 'balcao';
  }

  function renderStatus(status, tipo) {
    var chave = chaveDoStatus(status);
    var cancelado = ehCancelado(status);
    jaMostrou = true;

    if (cancelado) {
      pintarStatus('ac-status-cancelado', '❌', 'Pedido cancelado');
      el.passos.innerHTML = '';
      el.dica.textContent = 'Fale com a lanchonete pelo WhatsApp se precisar de ajuda.';
      return;
    }

    pintarStatus('ac-status-' + (chave || 'novo'), iconeDoStatus(chave, false), status || 'Novo');

    var indice = ['novo', 'preparo', 'caminho', 'concluido'].indexOf(chave);
    /* "Pronto para retirada" ocupa o lugar do "A caminho". */
    if (chave === 'pronto') indice = 2;
    if (indice < 0) indice = 0;

    var passos = PASSOS.map(function (p) { return { titulo: p.titulo, texto: p.texto }; });
    if (tipoEhRetirada(tipo)) {
      passos[2].titulo = 'Pronto para retirada';
      passos[2].texto = 'Já pode buscar na lanchonete.';
      if (chave === 'caminho' || chave === 'pronto') passos[2].titulo = 'Pronto para retirada';
    }

    el.passos.innerHTML = passos.map(function (p, i) {
      var estado = i < indice ? 'feito' : (i === indice ? 'atual' : '');
      return '<li class="ac-passo ac-passo-' + (estado || 'futuro') + '">' +
        '<span class="ac-bolinha" aria-hidden="true">' + (i < indice ? '✓' : (i + 1)) + '</span>' +
        '<span class="ac-passo-texto"><strong>' + p.titulo + '</strong><small>' + p.texto + '</small></span>' +
        '</li>';
    }).join('');

    if (indice === 0) {
      el.dica.textContent = 'Assim que a cozinha começar, o status muda aqui sozinho.';
    } else if (chave === 'concluido') {
      el.dica.textContent = 'Obrigado pela preferência! 🧡';
    } else {
      el.dica.textContent = '';
    }
  }

  /* ---------- consulta ---------- */
  function agendar() {
    clearTimeout(temporizador);
    if (!ativo) return;
    temporizador = setTimeout(consultar, INTERVALO);
  }

  function consultar() {
    var P = window.CardapioPlanilha;

    if (!P || !P.configurada()) {
      mostrarErro('Acompanhamento indisponível');
      el.dica.textContent = 'A lanchonete ainda não conectou a planilha ao site.';
      return;
    }

    el.atualizado.textContent = 'Consultando a lanchonete…';

    P.statusDoPedido(pedido).then(function (r) {
      if (!r || r.ok !== true) {
        el.atualizado.textContent = (r && r.erro) ? r.erro : 'Não consegui consultar agora.';
        /* Só troca a tela por um erro se nunca chegamos a mostrar
           um status; senão a última informação boa fica de pé. */
        if (!jaMostrou) mostrarErro('Sem conexão com a lanchonete');
        agendar();
        return;
      }

      if (!r.encontrado) {
        el.atualizado.textContent = 'Atualizado às ' + agora();
        el.dica.textContent = '';
        mostrarNaoEncontrado();
        agendar();
        return;
      }

      renderStatus(r.status, r.tipo);
      el.atualizado.textContent = 'Atualizado às ' + agora();

      if (ehFinal(r.status)) {
        agendar();
        return;
      }
      agendar();
    });
  }

  /* ---------- entrada ---------- */
  function acharPedidoNaUrl() {
    var m = /[?&]pedido=([^&#]+)/i.exec(location.search);
    return m ? decodeURIComponent(m[1]).trim() : '';
  }

  function lerPedidoLocal() {
    try {
      var bruto = localStorage.getItem(CHAVE_PEDIDO);
      if (!bruto) return '';
      var d = JSON.parse(bruto);
      return (d && d.pedido) ? String(d.pedido) : '';
    } catch (e) {
      return '';
    }
  }

  function lerNomeDaLoja() {
    try {
      var bruto = localStorage.getItem('cardapio:data:v1');
      if (!bruto) return '';
      var d = JSON.parse(bruto);
      return (d && d.config && d.config.nome) ? String(d.config.nome) : '';
    } catch (e) {
      return '';
    }
  }

  function definirPedido(novo) {
    pedido = String(novo || '').trim();
    var form = el.form;
    if (!pedido) {
      el.numero.textContent = 'Digite o número do seu pedido';
      form.hidden = false;
      mostrarCarregando();
      return;
    }
    form.hidden = true;
    el.numero.textContent = 'Pedido #' + pedido;
    /* Mantém o local atualizado para a faixa do cardápio. */
    try { localStorage.setItem(CHAVE_PEDIDO, JSON.stringify({ pedido: pedido, quando: Date.now() })); } catch (e) {}
    jaMostrou = false;
    mostrarCarregando();
    consultar();
  }

  function iniciar() {
    el = {
      numero: $('#acNumero'),
      status: $('#acStatus'),
      passos: $('#acPassos'),
      dica: $('#acDica'),
      atualizado: $('#acAtualizado'),
      form: $('#acForm'),
      busca: $('#acBusca'),
      nome: $('#acNome'),
      logo: $('#acLogo'),
      rodape: $('#acRodape')
    };

    var nomeLoja = lerNomeDaLoja();
    if (nomeLoja) {
      document.title = 'Acompanhar pedido — ' + nomeLoja;
      el.nome.textContent = 'Acompanhar pedido';
      el.rodape.textContent = nomeLoja;
      el.logo.textContent = '🍔';
    }

    el.form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      definirPedido(el.busca.value);
    });

    /* Não fica perguntando com a aba escondida. */
    document.addEventListener('visibilitychange', function () {
      ativo = document.visibilityState !== 'hidden';
      if (ativo) {
        clearTimeout(temporizador);
        consultar();
      } else {
        clearTimeout(temporizador);
      }
    });

    definirPedido(acharPedidoNaUrl() || lerPedidoLocal());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
