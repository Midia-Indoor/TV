/* =============================================================
   app.js  —  cardapio do cliente: lista, busca, carrinho,
   finalizacao e envio do pedido pelo WhatsApp.
   ============================================================= */
(function () {
  'use strict';

  var Store = window.CardapioStore;

  var CHAVE_CARRINHO = 'cardapio:carrinho:v1';
  var CHAVE_CLIENTE = 'cardapio:cliente:v1';
  /* Ultimo pedido enviado, para a faixa "Acompanhar pedido" nao
     desaparecer quando o cliente fecha a aba. */
  var CHAVE_PEDIDO = 'cardapio:pedido:atual';

  var el = {};
  var carrinho = [];   /* [{ id, qtd, obs, opcoes }] */
  var cliente = {};    /* dados do cliente para o pedido */
  var busca = '';
  var modoCheckout = false;
  /* Rascunho da escolha de opcoes aberta no modal (null quando
     fechado): { id, qtd, escolhas, indiceEdicao }. */
  var opcoesRascunho = null;
  /* O numero do pedido e sorteado UMA vez, no envio, e reaproveitado
     na mensagem e na planilha. Sem isso, a mensagem do WhatsApp e a
     linha gravada no Google sairiam com numeros diferentes. */
  var pedidoAtual = '';

  /* =========================================================
     Utilitarios
     ========================================================= */
  function moeda(valor) {
    return (Store.dados().config.simboloMoeda || 'R$') + ' ' + numero(valor);
  }

  function numero(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function esc(texto) {
    return String(texto == null ? '' : texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /* Compara texto ignorando caixa e acento (bairro digitado no
     endereco, forma de pagamento, busca, texto do PIX). Usa o
     String.normalize quando existe e cai numa tabela manual de
     acentos quando nao existe: WebView antiga de Android nao tem
     normalize, e chamar esse metodo la derrubava a geracao do PIX. */
  function semAcento(txt) {
    var s = String(txt == null ? '' : txt);
    if (typeof s.normalize === 'function') {
      s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    } else {
      s = s
        .replace(/[áàâãäÁÀÂÃÄ]/g, 'a')
        .replace(/[éèêëÉÈÊË]/g, 'e')
        .replace(/[íìîïÍÌÎÏ]/g, 'i')
        .replace(/[óòôõöÓÒÔÕÖ]/g, 'o')
        .replace(/[úùûüÚÙÛÜ]/g, 'u')
        .replace(/[çÇ]/g, 'c');
    }
    return s.toLowerCase();
  }

  function $(sel) { return document.querySelector(sel); }

  function todosItens() {
    var itens = [];
    Store.dados().categorias.forEach(function (cat) {
      (cat.itens || []).forEach(function (item) {
        itens.push({ item: item, categoria: cat });
      });
    });
    return itens;
  }

  function acharItem(id) {
    var achado = null;
    Store.dados().categorias.forEach(function (cat) {
      (cat.itens || []).forEach(function (item) {
        if (item.id === id) achado = { item: item, categoria: cat };
      });
    });
    return achado;
  }

  /* Uma imagem que falha nao pode ficar quebrada na tela: o
     .cartao-foto tem altura fixa, e o resultado e um retangulo
     vazio do tamanho da foto — que e indistinguivel de um bug do
     cardapio. Entao cada <img> leva a lista de enderecos a
     tentar, e um unico listener (o evento error nao sobe, por isso
     a captura) vai descascando a lista ate sobrar o emoji.

     O no-referrer nao e frescura: boa parte das hospedagens que
     bloqueiam "roubo de imagem" justamente olhando o Referer. */
  function emojiDoItem(item, categoria) {
    var emoji = esc((categoria && categoria.icone) || '🍽️');

    var enderecos = (window.CardapioPlanilha && window.CardapioPlanilha.enderecosDeImagem)
      ? window.CardapioPlanilha.enderecosDeImagem(item.imagem)
      : [];

    if (!enderecos.length) return '<span class="foto-emoji" aria-hidden="true">' + emoji + '</span>';

    return '<img src="' + esc(enderecos[0]) + '" alt="" loading="lazy" decoding="async"' +
           ' referrerpolicy="no-referrer"' +
           ' data-restam="' + esc(enderecos.slice(1).join('\n')) + '"' +
           ' data-emoji="' + emoji + '"' +
           ' data-item="' + esc(item.nome || '') + '">';
  }

  /* Um listener so para todas as imagens da pagina, inclusive as do
     carrinho.(error nao faz bolha, mas pega na fase de captura.) */
  function ligarImagens() {
    document.addEventListener('error', function (ev) {
      var img = ev.target;
      if (!img || img.tagName !== 'IMG' || !img.dataset) return;

      /* Ainda tem endereco para tentar: vai pro proximo. */
      var restam = img.getAttribute('data-restam') || '';
      var proximo = restam.split('\n').filter(Boolean)[0];

      if (proximo) {
        img.setAttribute('data-restam', restam.split('\n').filter(Boolean).slice(1).join('\n'));
        img.src = proximo;
        return;
      }

      /* Acabaram os enderecos. Troca pelo emoji e diz qual item foi,
         para o F12 mostrar o motivo em vez de o usuario adivinhar. */
      var quem = img.getAttribute('data-item') || 'item';
      var url = img.getAttribute('src') || '';
      if (window.console && console.warn) {
        console.warn('[cardapio] imagem nao carregou, usando o emoji: ' + quem + ' <- ' + url);
      }

      var marca = document.createElement('span');
      marca.className = 'foto-emoji';
      /* Decorativo: o nome do item ja vem no <h3> logo abaixo, e
         repetir o nome aqui faria o leitor de tela falar duas
         vezes. */
      marca.setAttribute('aria-hidden', 'true');
      marca.textContent = img.getAttribute('data-emoji') || '🍽️';
      if (img.parentNode) img.parentNode.replaceChild(marca, img);

    }, true);
  }

  /* ---------- toasts ---------- */
  var MAX_TOASTS = 3;

  function avisar(mensagem, tipo) {
    /* Agrupa repetidos e limita a pilha: clicar "+" varias vezes
       seguidas nao deve empilhar dezenas de avisos. */
    var anteriores = el.toasts.querySelectorAll('.toast');
    for (var i = 0; i < anteriores.length; i++) {
      if (anteriores[i].textContent === mensagem) return;
    }
    while (el.toasts.children.length >= MAX_TOASTS) {
      el.toasts.firstElementChild.remove();
    }

    var t = document.createElement('div');
    t.className = 'toast' + (tipo ? ' toast-' + tipo : '');
    t.textContent = mensagem;
    el.toasts.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s, transform .25s';
      t.style.opacity = '0';
      t.style.transform = 'translateY(8px)';
      setTimeout(function () { t.remove(); }, 260);
    }, 2400);
  }

  /* =========================================================
     Persistencia local do carrinho
     ========================================================= */
  function salvarCarrinho() {
    try { localStorage.setItem(CHAVE_CARRINHO, JSON.stringify({ itens: carrinho, cliente: cliente })); } catch (e) { /* ignora */ }
  }

  function carregarCarrinho() {
    try {
      var bruto = localStorage.getItem(CHAVE_CARRINHO);
      if (!bruto) return;
      var dados = JSON.parse(bruto);
      if (Array.isArray(dados.itens)) {
        carrinho = dados.itens.filter(function (l) { return l && l.id; }).map(function (l) {
          return { id: String(l.id), qtd: Math.max(1, parseInt(l.qtd, 10) || 1), obs: l.obs || '' };
        });
      }
      if (dados.cliente && typeof dados.cliente === 'object') cliente = dados.cliente;
    } catch (e) { /* ignora */ }
  }

  /* Remove do carrinho o que nao existe mais no cardapio
     (item deletado no painel, ou que virou indisponivel). */
  function podarCarrinho() {
    var antes = carrinho.length;
    carrinho = carrinho.filter(function (l) {
      var achado = acharItem(l.id);
      return achado && achado.item.disponivel !== false;
    });
    if (carrinho.length !== antes) salvarCarrinho();
    return antes - carrinho.length;
  }

  /* =========================================================
     Cabecalho
     ========================================================= */
  function aplicarCor() {
    var cfg = Store.dados().config;
    /* Store calcula os tom derivado da cor escolhida pelo dono,
       para o texto branco sobre a cor continuar legivel. */
    Store.aplicarCor(cfg.corPrimaria);
    document.title = cfg.nome + ' — Cardápio Digital';
  }

  function renderCabecalho() {
    var cfg = Store.dados().config;

    el.nome.textContent = cfg.nome;
    el.sub.textContent = cfg.descricao || '';
    el.logo.textContent = '';
    el.logo.innerHTML = '<span style="font-size:1.4rem">🍔</span>';
    el.rodapeNome.textContent = cfg.nome;

    el.status.hidden = false;
    el.status.className = 'selo ' + (cfg.aberto ? 'selo-aberto' : 'selo-fechado');
    el.status.textContent = cfg.aberto ? 'Aberto' : 'Fechado';

    el.avisoFechado.hidden = cfg.aberto;
    el.avisoFechadoTexto.textContent = cfg.mensagemFechado || '';
  }

  /* =========================================================
     Abas de categorias
     ========================================================= */
  function renderAbas() {
    var cats = Store.dados().categorias;
    var lista = busca
      ? categoriasComResultado()
      : cats;

    el.abas.innerHTML = '';

    if (busca) {
      var chipTodos = document.createElement('button');
      chipTodos.type = 'button';
      chipTodos.className = 'aba';
      chipTodos.setAttribute('aria-current', 'true');
      chipTodos.textContent = '🔎 Resultados (' + lista.reduce(function (n, c) { return n + c.itens.length; }, 0) + ')';
      el.abas.appendChild(chipTodos);
      return;
    }

    lista.forEach(function (cat, i) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'aba';
      b.textContent = (cat.icone ? cat.icone + ' ' : '') + cat.nome;
      if (i === 0) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', function () {
        var alvo = document.getElementById('cat-' + cat.id);
        if (alvo) {
          var y = alvo.getBoundingClientRect().top + window.pageYOffset - 150;
          window.scrollTo({ top: y, behavior: 'smooth' });
        }
      });
      el.abas.appendChild(b);
    });
  }

  function categoriasComResultado() {
    var termo = semAcento(busca);
    if (!termo) return [];

    return Store.dados().categorias
      .map(function (cat) {
        /* o nome da categoria tambem conta como resultado */
        var achouCategoria = semAcento(cat.nome).indexOf(termo) >= 0;

        return {
          id: cat.id,
          nome: cat.nome,
          icone: cat.icone,
          itens: (cat.itens || []).filter(function (item) {
            return item.disponivel !== false && (achouCategoria ||
              semAcento(item.nome).indexOf(termo) >= 0 ||
              semAcento(item.descricao).indexOf(termo) >= 0);
          })
        };
      })
      .filter(function (cat) { return cat.itens.length > 0; });
  }

  /* =========================================================
     Lista de itens
     ========================================================= */
  function renderLista() {
    var cfg = Store.dados().config;
    var html = '';

    if (busca) {
      var resultados = categoriasComResultado();
      var total = resultados.reduce(function (n, c) { return n + c.itens.length; }, 0);

      if (!total) {
        el.lista.innerHTML =
          '<div class="vazio"><span class="vazio-icone">🔍</span>' +
          '<p>Nada encontrado para "<strong>' + esc(busca) + '</strong>".</p>' +
          '<button type="button" class="btn btn-contorno btn-sm" data-limpar-busca>Limpar busca</button></div>';
        return;
      }

      resultados.forEach(function (cat) {
        html += '<section class="secao"><div class="secao-topo">' +
          '<h2 class="secao-titulo">' + esc(cat.icone || '🍽️') + ' ' + esc(cat.nome) + '</h2>' +
          '<span class="secao-contagem">' + cat.itens.length + ' encontrado(s)</span>' +
          '</div><div class="grade">' + cartoes(cat.itens, cat, cfg) + '</div></section>';
      });

      el.lista.innerHTML = html;
      return;
    }

    var categorias = Store.dados().categorias;

    if (!categorias.length) {
      el.lista.innerHTML =
        '<div class="vazio"><span class="vazio-icone">📋</span>' +
        '<p>O cardápio ainda não tem itens.</p>' +
        '<a class="btn btn-primario btn-sm" href="admin.html">Cadastrar itens</a></div>';
      return;
    }

    /* Destaques primeiro */
    var destaques = [];
    categorias.forEach(function (cat) {
      (cat.itens || []).forEach(function (item) {
        if (item.destaque && item.disponivel !== false) destaques.push({ item: item, cat: cat });
      });
    });

    if (destaques.length) {
      html += '<section class="secao"><div class="secao-topo">' +
        '<h2 class="secao-titulo">⭐ Destaques</h2>' +
        '<span class="secao-contagem">os mais pedidos</span>' +
        '</div><div class="grade">' +
        destaques.map(function (d) { return cartao(d.item, d.cat, cfg); }).join('') +
        '</div></section>';
    }

    categorias.forEach(function (cat) {
      var itens = (cat.itens || []).filter(function (i) { return i.disponivel !== false; });
      if (!itens.length) return;

      html += '<section class="secao" id="cat-' + esc(cat.id) + '">' +
        '<div class="secao-topo">' +
        '<h2 class="secao-titulo">' + esc(cat.icone || '🍽️') + ' ' + esc(cat.nome) + '</h2>' +
        '<span class="secao-contagem">' + itens.length + ' item(ns)</span>' +
        '</div><div class="grade">' + cartoes(itens, cat, cfg) + '</div></section>';
    });

    el.lista.innerHTML = html || '<div class="vazio"><span class="vazio-icone">📋</span><p>Nenhum item disponível no momento.</p></div>';
  }

  function cartoes(itens, cat, cfg) {
    return itens.map(function (item) { return cartao(item, cat, cfg); }).join('');
  }

  function cartao(item, cat, cfg) {
    /* Item com opcoes nunca usa o contador rapido do cartao: as
       escolhas podem gerar varias linhas, entao ele sempre passa pelo
       botao. */
    var opcional = temOpcoes(item);
    var noCarrinho = opcional ? 0 : quantidade(item.id);

    return '' +
    '<article class="cartao' + (noCarrinho ? '' : '') + '">' +
      '<div class="cartao-foto">' + emojiDoItem(item, cat) +
        (item.destaque ? '<span class="selo-destaque">Destaque</span>' : '') +
        (item.disponivel === false ? '<span class="selo-esgotado">Indisponível</span>' : '') +
      '</div>' +
      '<div class="cartao-corpo">' +
        '<h3 class="cartao-nome">' + esc(item.nome) + '</h3>' +
        (item.descricao ? '<p class="cartao-desc">' + esc(item.descricao) + '</p>' : '') +
        '<div class="cartao-rodape">' +
          '<span class="preco">' + moeda(item.preco) + '</span>' +
          (noCarrinho > 0 ? contador(item.id, noCarrinho) : botaoAdicionar(item)) +
        '</div>' +
      '</div>' +
    '</article>';
  }

  function botaoAdicionar(item) {
    if (item.disponivel === false || !Store.dados().config.aberto) {
      return '<button type="button" class="btn btn-sm btn-contorno" disabled>Indisponível</button>';
    }
    var rotulo = temOpcoes(item) ? 'Escolher' : '+ Adicionar';
    return '<button type="button" class="btn btn-sm btn-primario" data-add="' + esc(item.id) + '">' + rotulo + '</button>';
  }

  function contador(id, qtd, indiceLinha) {
    var marca = (indiceLinha === undefined || indiceLinha === null)
      ? ''
      : ' data-linha="' + indiceLinha + '"';

    return '' +
    '<span class="quantidade">' +
      '<button type="button" data-dec="' + esc(id) + '"' + marca + ' aria-label="Diminuir quantidade">−</button>' +
      '<output aria-label="Quantidade">' + qtd + '</output>' +
      '<button type="button" data-inc="' + esc(id) + '"' + marca + ' aria-label="Aumentar quantidade">+</button>' +
    '</span>';
  }

  /* =========================================================
     Carrinho
     ========================================================= */
  function quantidade(id) {
    var linha = carrinho.filter(function (l) { return l.id === id; })[0];
    return linha ? linha.qtd : 0;
  }

  function alterarQtd(id, delta) {
    var nova = quantidade(id) + delta;
    if (nova <= 0) {
      carrinho = carrinho.filter(function (l) { return l.id !== id; });
    } else {
      var achada = carrinho.filter(function (l) { return l.id === id; })[0];
      if (achada) achada.qtd = Math.min(99, nova);
      else carrinho.push({ id: id, qtd: 1, obs: '', opcoes: [] });
    }
    salvarCarrinho();
    render();
    atualizarModal();
  }

  /* Muda a quantidade de UMA linha do carrinho (pelo indice), porque
     o mesmo item pode aparecer em varias linhas com opcoes diferentes. */
  function alterarLinha(indice, delta) {
    var linha = carrinho[indice];
    if (!linha) return;

    var nova = linha.qtd + delta;
    if (nova <= 0) carrinho.splice(indice, 1);
    else linha.qtd = Math.min(99, nova);

    salvarCarrinho();
    render();
    atualizarModal();
  }

  function addItem(id) {
    var achado = acharItem(id);
    if (!achado || achado.item.disponivel === false) return;

    /* Item com opcoes: passa pela escolha antes de entrar. */
    if (temOpcoes(achado.item)) { abrirOpcoes(id); return; }

    alterarQtd(id, 1);
    avisar(achado.item.nome + ' adicionado 🛒', 'ok');
  }

  function subtotal() {
    return carrinho.reduce(function (soma, linha) {
      return soma + precoUnitarioLinha(linha) * linha.qtd;
    }, 0);
  }

  /* ---------- opcoes de item ----------
     Um item com opcoes nao entra direto no carrinho: abre a escolha.
     Cada linha guarda as opcoes escolhidas em `opcoes`
     ([{grupo, opcao, preco}]) e o preco da linha e o base do item
     mais a soma dessas opcoes. Duas linhas do mesmo item com
     escolhas diferentes convivem no carrinho. */
  function temOpcoes(item) {
    return !!(item && Array.isArray(item.opcoes) && item.opcoes.length);
  }

  function assinaturaOpcoes(id, ops) {
    var marcas = (ops || []).map(function (o) {
      return (o.grupo || '') + '=' + (o.opcao || '');
    });
    marcas.sort();
    return id + '|' + marcas.join(';');
  }

  function precoUnitarioLinha(linha) {
    var achado = acharItem(linha.id);
    var base = achado ? achado.item.preco : 0;
    var extras = (linha.opcoes || []).reduce(function (soma, o) {
      return soma + (Number(o.preco) || 0);
    }, 0);
    return base + extras;
  }

  function rotuloOpcoes(linha) {
    if (!linha.opcoes || !linha.opcoes.length) return '';
    return linha.opcoes.map(function (o) {
      return o.grupo + ': ' + o.opcao;
    }).join(' · ');
  }

  function totalItens() {
    return carrinho.reduce(function (n, l) { return n + l.qtd; }, 0);
  }

  /* Retirada no local nao paga taxa de entrega. */
  function ehRetirada() {
    return cliente.tipo === 'retirada';
  }

  /* [lista de bairros com taxa, so os ativos] */
  function bairrosAtivos() {
    return (Store.dados().bairros || []).filter(function (b) {
      return b.ativo !== false;
    });
  }

  /* [bairro escolhido no checkout, ou null] */
  function bairroEscolhido() {
    if (ehRetirada() || !cliente.bairro) return null;
    var achados = bairrosAtivos().filter(function (b) { return b.nome === cliente.bairro; });
    return achados[0] || null;
  }

  /* A taxa do bairro vence a taxa unica da Config. Sem bairros
     cadastrados (ou sem escolha) cai na taxa de entrega de sempre. */
  function taxaAplicada() {
    if (ehRetirada()) return 0;
    var b = bairroEscolhido();
    if (b) return b.taxa;
    return Store.dados().config.taxaEntrega || 0;
  }

  /* Rotulo da taxa, com o bairro entre parenteses quando houver. */
  function rotuloTaxa() {
    var b = bairroEscolhido();
    return b ? 'Taxa de entrega (' + b.nome + ')' : 'Taxa de entrega';
  }

  function totalGeral() {
    return subtotal() + taxaAplicada();
  }

  function renderBotaoCarrinho() {
    var qtd = totalItens();
    el.btnCarrinho.classList.toggle('oculto', qtd === 0);
    el.btnCarrinho.setAttribute('aria-label', 'Abrir pedido com ' + qtd + ' item(ns), total ' + moeda(totalGeral()));
    el.cfTotal.textContent = moeda(totalGeral());
    el.cfQtd.textContent = qtd;
    var partes = qtd + ' item(ns)';
    if (taxaAplicada() > 0) partes += ' + ' + moeda(taxaAplicada()) + ' entrega';
    el.cfSub.textContent = partes;
  }

  /* =========================================================
     Modal: carrinho e checkout
     ========================================================= */
  function abrirModal(titulo, corpo, rodape, semFoco) {
    el.modalTitulo.textContent = titulo;
    el.modalCorpo.innerHTML = corpo;
    el.modalRodape.innerHTML = rodape;
    el.overlay.classList.remove('oculto');
    document.body.classList.add('travado');
    if (semFoco) return;
    var foco = el.modalCorpo.querySelector('input, textarea, button');
    if (foco) setTimeout(function () { foco.focus(); }, 60);
  }

  function fecharModal() {
    el.overlay.classList.add('oculto');
    document.body.classList.remove('travado');
    modoCheckout = false;
    opcoesRascunho = null;
  }

  function renderModal(semFoco) {
    if (modoCheckout) return renderCheckout();
    renderCarrinho(semFoco);
  }

  /* Redesenha o modal aberto (carrinho ou checkout) sem roubar o foco,
     para os botoes +/- refletirem a nova quantidade na hora. */
  function atualizarModal() {
    if (!el.overlay || el.overlay.classList.contains('oculto')) return;
    renderModal(true);
  }

  /* Depois do redesenho, devolve o foco ao botao +/- equivalente
     (mesma linha/acao) para o teclado clicar varias vezes seguidas. */
  function focarMaisMenos(acao, linha) {
    if (!el.modalCorpo) return;
    var botoes = el.modalCorpo.querySelectorAll('[data-' + acao + ']');
    for (var i = 0; i < botoes.length; i++) {
      if (botoes[i].getAttribute('data-linha') === linha) { botoes[i].focus(); return; }
    }
  }

  /* =========================================================
     Modal de opcoes do item
     ========================================================= */
  function escolhaFeita(grupo, opcao) {
    var g = opcoesRascunho && opcoesRascunho.escolhas[grupo];
    return !!(g && g[opcao]);
  }

  /* Uma opcao esta marcada se foi escolhida; o grupo obrigatorio
     precisa de pelo menos uma. */
  function opcoesValidas() {
    if (!opcoesRascunho) return false;
    var achado = acharItem(opcoesRascunho.id);
    if (!achado) return false;

    return (achado.item.opcoes || []).every(function (g) {
      if (!g.obrigatorio) return true;
      var escolhidas = opcoesRascunho.escolhas[g.grupo] || {};
      return Object.keys(escolhidas).some(function (k) { return escolhidas[k]; });
    });
  }

  /* Preco base + opcoes, ja multiplicado pela quantidade. */
  function resumoPrecos() {
    var achado = opcoesRascunho ? acharItem(opcoesRascunho.id) : null;
    var base = achado ? achado.item.preco : 0;
    var extras = 0;

    if (achado) {
      (achado.item.opcoes || []).forEach(function (g) {
        (g.itens || []).forEach(function (o) {
          if (escolhaFeita(g.grupo, o.nome)) extras += Number(o.preco) || 0;
        });
      });
    }

    var unit = base + extras;
    return { base: base, extras: extras, unit: unit, total: unit * (opcoesRascunho ? opcoesRascunho.qtd : 1) };
  }

  function abrirOpcoes(id, indiceEdicao) {
    var achado = acharItem(id);
    if (!achado || !temOpcoes(achado.item)) return;

    var editando = (indiceEdicao !== undefined && indiceEdicao !== null);
    var linha = editando ? carrinho[indiceEdicao] : null;
    var escolhas = {};

    if (linha) {
      (linha.opcoes || []).forEach(function (o) {
        escolhas[o.grupo] = escolhas[o.grupo] || {};
        escolhas[o.grupo][o.opcao] = true;
      });
    }

    opcoesRascunho = {
      id: id,
      qtd: linha ? linha.qtd : 1,
      escolhas: escolhas,
      indiceEdicao: linha ? indiceEdicao : null
    };

    renderOpcoes();
  }

  function renderOpcoes() {
    var achado = acharItem(opcoesRascunho.id);
    var item = achado.item;
    var corpo = '<div class="empilha">' +
      '<p class="opcoes-item-nome">' + esc(item.nome) + '</p>';

    (item.opcoes || []).forEach(function (g) {
      var tipo = g.tipo === 'multiplo' ? 'multiplo' : 'unico';

      corpo += '<fieldset class="grupo-opcoes"><legend>' + esc(g.grupo) +
        ' <span class="' + (g.obrigatorio ? 'op-obrig' : 'op-opcional') + '">' +
        (g.obrigatorio ? 'obrigatório' : 'opcional') + '</span></legend>';

      (g.itens || []).forEach(function (o) {
        corpo += '<label class="opcao-escolha">' +
          '<input type="' + (tipo === 'multiplo' ? 'checkbox' : 'radio') + '"' +
            ' name="og-' + esc(g.grupo) + '"' +
            ' data-op-escolha data-op-grupo="' + esc(g.grupo) + '"' +
            ' data-op-opcao="' + esc(o.nome) + '" data-op-tipo="' + tipo + '"' +
            (escolhaFeita(g.grupo, o.nome) ? ' checked' : '') + '>' +
          '<span class="opcao-nome">' + esc(o.nome) + '</span>' +
          (Number(o.preco) > 0 ? '<span class="opcao-preco">+ ' + moeda(o.preco) + '</span>' : '') +
        '</label>';
      });

      corpo += '</fieldset>';
    });

    corpo += '<div class="campo campo-qtd"><span>Quantidade</span>' +
      '<span class="quantidade">' +
        '<button type="button" data-op-dec aria-label="Diminuir quantidade">−</button>' +
        '<output aria-label="Quantidade">' + opcoesRascunho.qtd + '</output>' +
        '<button type="button" data-op-inc aria-label="Aumentar quantidade">+</button>' +
      '</span></div>' +
      '<div class="totais" id="opResumo"></div>' +
      '</div>';

    abrirModal('Escolher opções', corpo,
      '<button type="button" class="btn btn-primario btn-bloco" data-op-confirmar>Adicionar</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');

    atualizarResumoOpcoes();
  }

  function atualizarResumoOpcoes() {
    if (!opcoesRascunho) return;
    var r = resumoPrecos();

    var resumo = el.modalCorpo.querySelector('#opResumo');
    if (resumo) {
      resumo.innerHTML =
        '<div><span>Unitário</span><span>' + moeda(r.unit) + '</span></div>' +
        (r.extras > 0 ? '<div><span>Opções</span><span>+ ' + moeda(r.extras) + '</span></div>' : '') +
        '<div class="total-final"><span>' + opcoesRascunho.qtd + 'x Total</span><span>' + moeda(r.total) + '</span></div>';
    }

    var btn = el.modalRodape.querySelector('[data-op-confirmar]');
    if (btn) {
      btn.disabled = !opcoesValidas();
      btn.textContent = 'Adicionar · ' + moeda(r.total);
    }
  }

  function aplicarEscolhaOpcao(input) {
    if (!opcoesRascunho) return;

    var grupo = input.getAttribute('data-op-grupo');
    var opcao = input.getAttribute('data-op-opcao');
    var tipo = input.getAttribute('data-op-tipo');

    if (tipo === 'multiplo') {
      opcoesRascunho.escolhas[grupo] = opcoesRascunho.escolhas[grupo] || {};
      if (input.checked) opcoesRascunho.escolhas[grupo][opcao] = true;
      else delete opcoesRascunho.escolhas[grupo][opcao];
    } else {
      opcoesRascunho.escolhas[grupo] = {};
      if (input.checked) opcoesRascunho.escolhas[grupo][opcao] = true;
    }

    atualizarResumoOpcoes();
  }

  function mudarQtdOpcoes(delta) {
    if (!opcoesRascunho) return;
    opcoesRascunho.qtd = Math.max(1, Math.min(99, opcoesRascunho.qtd + delta));

    var saida = el.modalCorpo.querySelector('.campo-qtd output');
    if (saida) saida.textContent = opcoesRascunho.qtd;

    atualizarResumoOpcoes();
  }

  function editarOpcoesLinha(indice) {
    var linha = carrinho[indice];
    if (linha) abrirOpcoes(linha.id, indice);
  }

  /* Fecha a escolha e lanca no carrinho. Edicao troca a linha no
     lugar; adicao se junta a uma linha igual, se existir. */
  function confirmarOpcoes() {
    if (!opcoesRascunho) return;
    if (!opcoesValidas()) { avisar('Escolha as opções obrigatórias.', 'erro'); return; }

    var achado = acharItem(opcoesRascunho.id);
    if (!achado) return;

    var escolhidas = [];
    (achado.item.opcoes || []).forEach(function (g) {
      (g.itens || []).forEach(function (o) {
        if (escolhaFeita(g.grupo, o.nome)) {
          escolhidas.push({ grupo: g.grupo, opcao: o.nome, preco: Number(o.preco) || 0 });
        }
      });
    });

    var qtd = opcoesRascunho.qtd;
    var indice = opcoesRascunho.indiceEdicao;

    if (indice !== null && indice !== undefined && carrinho[indice]) {
      carrinho[indice].opcoes = escolhidas;
      carrinho[indice].qtd = qtd;
    } else {
      var chave = assinaturaOpcoes(achado.item.id, escolhidas);
      var existente = null;
      carrinho.forEach(function (l) {
        if (assinaturaOpcoes(l.id, l.opcoes || []) === chave) existente = l;
      });

      if (existente) existente.qtd = Math.min(99, existente.qtd + qtd);
      else carrinho.push({ id: achado.item.id, qtd: qtd, obs: '', opcoes: escolhidas });
    }

    opcoesRascunho = null;
    salvarCarrinho();
    renderCarrinho();
    avisar(achado.item.nome + ' adicionado 🛒', 'ok');
  }

  function renderCarrinho(semFoco) {
    modoCheckout = false;

    if (!carrinho.length) {
      abrirModal('Seu pedido',
        '<div class="vazio"><span class="vazio-icone">🛒</span><p>Seu pedido está vazio.</p>' +
        '<p class="dica">Toque em “+ Adicionar” nos itens que quiser.</p></div>',
        '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Continuar comprando</button>',
        semFoco);
      return;
    }

    var cfg = Store.dados().config;
    var corpo = '';

    carrinho.forEach(function (linha, i) {
      var achado = acharItem(linha.id);
      if (!achado) return;
      var item = achado.item;
      var precoUnit = precoUnitarioLinha(linha);
      var rotulo = rotuloOpcoes(linha);

      corpo += '' +
      '<div class="linha">' +
        '<div class="linha-emoji">' + emojiDoItem(item, achado.categoria) + '</div>' +
        '<div class="linha-info">' +
          '<p class="linha-nome">' + esc(item.nome) + '</p>' +
          '<p class="linha-preco-unit">' + moeda(precoUnit) + ' cada</p>' +
          (rotulo ? '<p class="linha-opcoes">' + esc(rotulo) + '</p>' : '') +
          '<div class="linha-acoes">' + contador(item.id, linha.qtd, i) +
            (temOpcoes(item) ?
              '<button type="button" class="btn-link" data-editar-opcoes="' + i + '">Editar opções</button>' : '') +
            '<span class="linha-total">' + moeda(precoUnit * linha.qtd) + '</span>' +
          '</div>' +
          '<input type="text" class="obs-item" placeholder="Observação (ex.: sem cebola)" ' +
            'value="' + esc(linha.obs) + '" data-obs-linha="' + i + '" maxlength="140">' +
        '</div>' +
      '</div>';
    });

    corpo += '<div class="totais" style="margin-top:16px">' +
      '<div><span>Subtotal (' + totalItens() + ' itens)</span><span>' + moeda(subtotal()) + '</span></div>' +
      (taxaAplicada() > 0 ? '<div><span>' + rotuloTaxa() + '</span><span>' + moeda(taxaAplicada()) + '</span></div>' : '') +
      '<div class="total-final"><span>Total</span><span>' + moeda(totalGeral()) + '</span></div>' +
      '</div>';

    var faltaMinimo = faltaPedidoMinimo();

    if (faltaMinimo > 0) {
      corpo += '<div class="minimo-alerta" style="margin-top:14px">' +
        'Pedido mínimo de ' + moeda(Store.dados().config.pedidoMinimo) + '. ' +
        'Falta ' + moeda(faltaMinimo) + ' para finalizar.</div>';
    }

    abrirModal('Seu pedido', corpo,
      '<button type="button" class="btn btn-primario btn-bloco" data-checkout' +
        (faltaMinimo > 0 ? ' disabled' : '') + '>Finalizar pedido no WhatsApp</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Continuar comprando</button>',
      semFoco);
  }

  /* Quanto falta para bater o pedido minimo (0 se nao houver). */
  function faltaPedidoMinimo() {
    var minimo = Store.dados().config.pedidoMinimo || 0;
    if (minimo <= 0) return 0;
    return Math.max(0, minimo - subtotal());
  }

  /* Seletor de bairro: so aparece se ha bairros ativos cadastrados.
     O valor guardado e o NOME (legivel na mensagem e na planilha). */
  function campoBairro() {
    var lista = bairrosAtivos();
    if (!lista.length) return '';

    var atual = cliente.bairro || '';
    var opcoes = lista.map(function (b) {
      var rotulo = b.nome;
      if (b.taxa > 0) rotulo += ' — ' + moeda(b.taxa);
      if (b.tempo) rotulo += ' · ' + b.tempo;
      return '<option value="' + esc(b.nome) + '"' + (b.nome === atual ? ' selected' : '') + '>' +
        esc(rotulo) + '</option>';
    }).join('');

    return '<div class="campo"><label for="coBairro">Bairro de entrega</label>' +
      '<select id="coBairro">' +
        '<option value="">Selecione o bairro…</option>' + opcoes +
      '</select></div>';
  }

  /* Forma de pagamento: vira lista quando a Config traz
     "formasPagamento" (separadas por virgula, ponto e virgula ou
     barra); senao continua texto livre. */
  function campoPagamento() {
    var cfg = Store.dados().config;
    var lista = String(cfg.formasPagamento || '')
      .split(/[|,;]/)
      .map(function (s) { return s.trim(); })
      .filter(Boolean);

    if (!lista.length) {
      return '<div class="campo"><label for="coPagamento">Forma de pagamento</label>' +
        '<input type="text" id="coPagamento" placeholder="Ex.: Pix, dinheiro, cartão" value="' +
        esc(cliente.pagamento || '') + '"></div>';
    }

    var atual = cliente.pagamento || '';
    var opcoes = lista.map(function (o) {
      return '<option value="' + esc(o) + '"' + (o === atual ? ' selected' : '') + '>' + esc(o) + '</option>';
    }).join('');

    return '<div class="campo"><label for="coPagamento">Forma de pagamento</label>' +
      '<select id="coPagamento">' +
        '<option value="">Selecione…</option>' + opcoes +
      '</select></div>';
  }

  /* ---------- bairro pelo endereco ----------
     O bairro cadastrado que aparece no endereco digitado, se houver.
     Nomes maiores vencem: se "Centro" e "Centro Historico" existem,
     "Centro Historico" casa primeiro. */
  function bairroNoEndereco(txt) {
    var alvo = semAcento(txt).trim();
    if (!alvo) return '';

    var achados = bairrosAtivos().filter(function (b) {
      var nome = semAcento(b.nome).trim();
      return nome && alvo.indexOf(nome) >= 0;
    });

    achados.sort(function (a, b) {
      return semAcento(b.nome).length - semAcento(a.nome).length;
    });

    return achados.length ? achados[0].nome : '';
  }

  /* O seletor de bairro acompanha o endereco: digitar "... - Jardim
     America" seleciona Jardim America e a taxa certa entra no total.
     Nao mexe quando o endereco nao cita bairro nenhum, para nao
     apagar a escolha manual. */
  function sugerirBairroDoEndereco(txt) {
    var sel = el.modalCorpo.querySelector('#coBairro');
    if (!sel) return;

    var detectado = bairroNoEndereco(txt);
    if (!detectado || detectado === sel.value) return;

    sel.value = detectado;
    coletarCliente();
    atualizarPrevia();
    renderBotaoCarrinho(); /* a taxa do bairro muda o total */
  }

  /* ---------- PIX ----------
     O QR segue o "BR Code" do Banco Central: a chave que o dono
     cadastrou, o nome e a cidade da loja e o valor do pedido. Tudo
     em ASCII — acento em alguns apps de banco atrapalha a leitura. */
  function campoEmv(id, valor) {
    var v = String(valor == null ? '' : valor);
    var n = String(v.length);
    if (n.length < 2) n = '0' + n;
    return id + n + v;
  }

  /* CRC-16/CCITT-FALSE, o mesmo do BR Code (polinomio 0x1021,
     inicial 0xFFFF). */
  function crc16Pix(str) {
    var crc = 0xffff;
    for (var i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (var j = 0; j < 8; j++) {
        crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
        crc &= 0xffff;
      }
    }
    var hex = crc.toString(16).toUpperCase();
    while (hex.length < 4) hex = '0' + hex;
    return hex;
  }

  /* Texto do BR Code: ASCII, maiusculo, sem simbolos e com o limite
     de caracteres do campo (25 para o nome, 15 para a cidade). */
  function textoPix(txt, limite) {
    return semAcento(txt).toUpperCase()
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, limite);
  }

  /* Monta o "PIX copia e cola" com o valor do pedido. Devolve '' se a
     chave ainda nao foi cadastrada. */
  function montarPixPayload(valor) {
    var cfg = Store.dados().config;
    var chave = String(cfg.chavePix || '').trim();
    if (!chave) return '';

    var nome = textoPix(cfg.nome, 25) || 'LOJA';
    var cidade = textoPix(cfg.pixCidade, 15) || 'BRASIL';
    var conta = campoEmv('00', 'br.gov.bcb.pix') + campoEmv('01', chave);

    var p = '000201' +
      campoEmv('26', conta) +
      '52040000' +
      '5303986';

    var n = Number(valor) || 0;
    if (n > 0) p += campoEmv('54', n.toFixed(2));

    p += campoEmv('58', 'BR') +
      campoEmv('59', nome) +
      campoEmv('60', cidade) +
      '62070503***' +
      '6304';

    return p + crc16Pix(p);
  }

  function qrPixHtml(payload) {
    if (!window.qrcode) {
      if (window.console && console.warn) {
        console.warn('[cardapio] QR PIX: biblioteca de QR nao carregada (qrcode.min.js). ' +
          'O codigo "copia e cola" continua valendo.');
      }
      return '';
    }
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(payload);
      qr.make();

      /* O QR sai como IMAGEM (raster), nao como SVG inline. Motivo: o
         "modo escuro automatico" (force dark) de alguns navegadores /
         WebView recolore o SVG e escurece o branco, deixando os modulos
         pretos sobre fundo escuro (ilegivel). Imagens ficam de fora
         dessa inversao. Tambem desenhamos no tamanho proximo ao exibido
         para nao ampliar demais. */
      if (qr.createDataURL) {
        var n = qr.getModuleCount();
        var cell = Math.max(3, Math.floor(280 / (n + 8)));
        var margin = cell * 4;
        var url = qr.createDataURL(cell, margin);
        return '<img class="pix-qr-img" src="' + url + '" alt="">';
      }

      /* Reserva para uma lib sem createDataURL: usa o SVG. */
      var svg = qr.createSvgTag({ cellSize: 6, margin: 2 });
      /* O rotulo acessivel fica no <div> que envolve o QR. */
      return svg.replace('<svg ', '<svg aria-hidden="true" focusable="false" ');
    } catch (e) {
      if (window.console && console.warn) console.warn('[cardapio] QR PIX:', e && e.message);
      return '';
    }
  }

  function blocoPix(qrHtml, payload, valor) {
    /* O QR e so um atalho: sem a biblioteca (ou se a geracao falhar)
       o "copia e cola" abaixo continua sendo um PIX valido. Por isso
       o bloco nunca fica so com o aviso de erro. */
    var bloco = qrHtml
      ? '<div class="pix-qr" role="img" aria-label="QR Code PIX para pagar ' + esc(moeda(valor)) + '">' +
          qrHtml +
        '</div>'
      : '<p class="pix-aviso">Não foi possível desenhar o QR Code agora, mas o código abaixo funciona igual: ' +
        'abra o aplicativo do banco em PIX e use o “copia e cola”.</p>';

    return '' +
      bloco +
      '<p class="pix-valor">Valor: <strong>' + esc(moeda(valor)) + '</strong></p>' +
      '<p class="pix-dica">Abra o aplicativo do seu banco, entre em PIX e aponte a câmera para o código. ' +
        'Se preferir, use o “copia e cola”.</p>' +
      '<label class="pix-rotulo" for="pixCopiaECola">PIX copia e cola</label>' +
      '<textarea id="pixCopiaECola" class="pix-codigo" readonly rows="3">' + esc(payload) + '</textarea>' +
      '<button type="button" class="btn btn-contorno btn-bloco pix-copiar" data-pix-copiar>Copiar código PIX</button>';
  }

  function copiarPix(doc, botao) {
    var campo = doc.querySelector('#pixCopiaECola');
    if (!campo) return;
    try {
      campo.focus();
      campo.select();
      var ok = doc.execCommand && doc.execCommand('copy');
      if (botao) botao.textContent = ok ? 'Copiado! ✅' : 'Selecione o texto e copie (Ctrl+C)';
    } catch (e) {
      if (botao) botao.textContent = 'Selecione o texto e copie (Ctrl+C)';
    }
  }

  function ligarBotoesPix(doc) {
    var copiar = doc.querySelector('[data-pix-copiar]');
    if (copiar) copiar.addEventListener('click', function () { copiarPix(doc, copiar); });
  }

  /* Fallback para quando o navegador bloqueia a janela nova (ou uma
     WebView antiga nao abre popup): o QR aparece no proprio
     checkout, para o cliente nao ficar sem pagar. */
  function mostrarPixInline(corpo) {
    var box = el.modalCorpo.querySelector('#coPix');
    if (!box) return;
    box.innerHTML = corpo;
    ligarBotoesPix(document);
    if (box.scrollIntoView) box.scrollIntoView();
  }

  function abrirQrPix() {
    var valor = totalGeral();
    var payload = montarPixPayload(valor);
    if (!payload) {
      avisar('O dono ainda não cadastrou a chave PIX.', 'erro');
      return;
    }

    var qrHtml = qrPixHtml(payload);

    var corpo = blocoPix(qrHtml, payload, valor);
    var titulo = Store.dados().config.nome || 'Pagamento PIX';

    /* Abre a pagina pix.html: uma pagina de verdade, que ja nasce
       declarada como "somente clara". Assim o navegador NAO aplica o
       "modo escuro automatico" na janela do QR -- era isso que
       escurecia o codigo no celular. */
    var urlPix = 'pix.html?p=' + encodeURIComponent(payload) +
      '&v=' + encodeURIComponent(moeda(valor)) +
      '&n=' + encodeURIComponent(titulo);

    var janela = null;
    try { janela = window.open(urlPix, '_blank'); } catch (e) { janela = null; }

    if (janela) {
      try { janela.focus(); } catch (e) { /* alguns navegadores nao deixam */ }
      return;
    }

    mostrarPixInline(corpo);
  }

  /* Mostra o atalho do QR quando a forma de pagamento e PIX. */
  function atualizarPix(autoAbrir) {
    var box = el.modalCorpo.querySelector('#coPix');
    if (!box) return;

    var sel = el.modalCorpo.querySelector('#coPagamento');
    var valor = sel ? sel.value : '';
    if (semAcento(valor).indexOf('pix') < 0) { box.innerHTML = ''; return; }

    var cfg = Store.dados().config;
    if (!String(cfg.chavePix || '').trim()) {
      box.innerHTML = '<p class="dica">PIX selecionado. O dono ainda não cadastrou a chave PIX.</p>';
      return;
    }

    box.innerHTML = '<button type="button" class="btn btn-contorno btn-bloco" data-ver-pix>' +
      '📱 Ver QR Code PIX</button>' +
      '<p class="dica">Abre em uma nova janela para você escanear.</p>';

    if (autoAbrir) abrirQrPix();
  }

  function renderCheckout() {
    modoCheckout = true;
    var cfg = Store.dados().config;

    var corpo = '' +
      '<div class="empilha">' +
        (cfg.pedirNome !== false ?
        '<div class="campo"><label for="coNome">Seu nome</label>' +
        '<input type="text" id="coNome" placeholder="Como podemos te chamar?" value="' + esc(cliente.nome || '') + '"></div>' : '') +

        '<div class="campo"><span>Entrega ou retirada?</span>' +
        '<div class="opcoes">' +
          '<label class="opcao"><input type="radio" name="coTipo" value="entrega"' + (cliente.tipo === 'retirada' ? '' : ' checked') + '><span>🛵 Entrega</span></label>' +
          '<label class="opcao"><input type="radio" name="coTipo" value="retirada"' + (cliente.tipo === 'retirada' ? ' checked' : '') + '><span>🏠 Retirada</span></label>' +
        '</div></div>' +

        '<div id="coEnderecoBox">' +
          '<div class="campo"><label for="coEndereco">Endereço de entrega</label>' +
          '<input type="text" id="coEndereco" placeholder="Rua, número e complemento" value="' + esc(cliente.endereco || '') + '"></div>' +
          campoBairro() +
        '</div>' +

        campoPagamento() +
        '<div id="coPix" class="pix-caixa"></div>' +

        '<div class="campo"><label for="coObs">Observações gerais</label>' +
        '<textarea id="coObs" placeholder="Ex.: tocar o interfone, sem cebola no lanche…" maxlength="300">' + esc(cliente.obs || '') + '</textarea></div>' +

        '<div class="totais" id="coTotais" style="padding:14px;background:var(--superficie-2);border-radius:var(--raio-sm);border:1px solid var(--borda)"></div>' +

        '<details><summary style="cursor:pointer;font-weight:700;font-size:.85rem;color:var(--texto-suave)">Ver prévia da mensagem</summary>' +
        '<div class="previa" id="coPrevia" style="margin-top:10px"></div></details>' +
      '</div>';

    abrirModal('Finalizar pedido', corpo,
      '<button type="button" class="btn btn-Whatsapp btn-bloco" data-enviar>Enviar pedido no WhatsApp</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-voltar-carrinho>← Voltar ao pedido</button>');

    atualizarPrevia();
    atualizarPix(false);
  }

  function coletarCliente() {
    var cfg = Store.dados().config;
    var tipoEl = el.modalCorpo.querySelector('input[name="coTipo"]:checked');
    var tipo = tipoEl ? tipoEl.value : 'entrega';

    if (cfg.pedirNome !== false) cliente.nome = (el.modalCorpo.querySelector('#coNome') || {}).value || '';
    cliente.tipo = tipo;
    cliente.endereco = cfg.pedirEntrega !== false ? ((el.modalCorpo.querySelector('#coEndereco') || {}).value || '') : '';
    cliente.pagamento = (el.modalCorpo.querySelector('#coPagamento') || {}).value || '';
    cliente.obs = (el.modalCorpo.querySelector('#coObs') || {}).value || '';

    /* Bairro: só faz sentido na entrega, e só existe seletor quando
       há bairros cadastrados. Em retirada, limpa. */
    var selBairro = el.modalCorpo.querySelector('#coBairro');
    if (ehRetirada()) cliente.bairro = '';
    else if (selBairro) cliente.bairro = selBairro.value || '';

    salvarCarrinho();
  }

  /* ---------- acompanhamento do pedido ----------
     A pagina Acompanhar consulta o status na planilha. A faixa aqui
     so aponta para ela; quem some e ela mesma. */
  function lerPedidoSalvo() {
    try {
      var bruto = localStorage.getItem(CHAVE_PEDIDO);
      if (!bruto) return null;
      var dado = JSON.parse(bruto);
      if (!dado || !dado.pedido) return null;
      /* Um pedido de ontem nao interessa mais: some sozinho. */
      if (dado.quando && Date.now() - dado.quando > 24 * 60 * 60 * 1000) return null;
      return dado;
    } catch (e) {
      return null;
    }
  }

  function guardarPedido(id) {
    if (!id) return;
    try {
      localStorage.setItem(CHAVE_PEDIDO, JSON.stringify({ pedido: id, quando: Date.now() }));
    } catch (e) { /* sem storage: a faixa apenas nao aparece */
    }
    renderFaixaPedido();
  }

  function esconderFaixa() {
    try { localStorage.removeItem(CHAVE_PEDIDO); } catch (e) { /* ignora */ }
    if (el.faixaPedido) el.faixaPedido.classList.add('oculto');
  }

  function renderFaixaPedido() {
    if (!el.faixaPedido) return;
    var dado = lerPedidoSalvo();
    if (!dado) { el.faixaPedido.classList.add('oculto'); return; }

    el.faixaPedidoNum.textContent = '#' + dado.pedido;
    el.faixaPedidoLink.setAttribute('href', 'acompanhar.html?pedido=' + encodeURIComponent(dado.pedido));
    el.faixaPedido.classList.remove('oculto');
  }

  /* ---------- mensagem do WhatsApp ---------- */
  function numeroPedido() {
    var agora = new Date();
    var dia = String(agora.getDate()).padStart(2, '0') + String(agora.getMonth() + 1).padStart(2, '0');
    var sufixo = String(Math.floor(Math.random() * 900) + 100);
    return dia + '-' + sufixo;
  }

  function montarMensagem() {
    var cfg = Store.dados().config;
    var linhas = [];

    linhas.push('*' + cfg.nome + ' — PEDIDO*');
    linhas.push('Pedido #' + (pedidoAtual || numeroPedido()));

    if (cliente.nome) linhas.push('*Cliente:* ' + cliente.nome);
    linhas.push('');

    linhas.push('*Itens*');
    carrinho.forEach(function (linha, i) {
      var achado = acharItem(linha.id);
      if (!achado) return;
      linhas.push('');
      linhas.push((i + 1) + '. ' + linha.qtd + 'x ' + achado.item.nome + ' — ' + moeda(precoUnitarioLinha(linha) * linha.qtd));

      (linha.opcoes || []).forEach(function (o) {
        linhas.push('   • ' + o.grupo + ': ' + o.opcao + (Number(o.preco) > 0 ? ' (+' + moeda(o.preco) + ')' : ''));
      });

      if (linha.obs) linhas.push('   _obs: ' + linha.obs + '_');
    });

    linhas.push('');
    linhas.push('*Resumo*');
    linhas.push('Subtotal: ' + moeda(subtotal()));
    if (taxaAplicada() > 0) linhas.push(rotuloTaxa() + ': ' + moeda(taxaAplicada()));
    linhas.push('*TOTAL: ' + moeda(totalGeral()) + '*');

    if (cliente.tipo) {
      linhas.push('\n*Entrega:* ' + (ehRetirada() ? 'Retirada no local' : 'Entrega em ' + (cliente.endereco || 'a combinar')));
      if (!ehRetirada() && cliente.bairro) linhas.push('*Bairro:* ' + cliente.bairro);
      var previsao = ehRetirada() ? cfg.tempoRetirada : cfg.tempoEntrega;
      if (previsao) linhas.push('*Previsão:* ' + previsao);
    }
    if (cliente.pagamento) linhas.push('*Pagamento:* ' + cliente.pagamento);
    if (cliente.obs) linhas.push('\n*Observações:* ' + cliente.obs);

    linhas.push('\n' + (cfg.mensagemAbertura || 'Pedido feito pelo cardápio digital.'));

    return linhas.join('\n');
  }

  function atualizarPrevia() {
    var previa = el.modalCorpo.querySelector('#coPrevia');
    if (previa) previa.textContent = montarMensagem();

    /* resumo do total, que muda se o cliente trocar para retirada */
    var totais = el.modalCorpo.querySelector('#coTotais');
    if (totais) {
      totais.innerHTML =
        '<div><span>Subtotal (' + totalItens() + ' itens)</span><span>' + moeda(subtotal()) + '</span></div>' +
        (taxaAplicada() > 0 ? '<div><span>' + rotuloTaxa() + '</span><span>' + moeda(taxaAplicada()) + '</span></div>' : '') +
        '<div class="total-final"><span>Total</span><span>' + moeda(totalGeral()) + '</span></div>';
    }
  }

  function enviarWhatsApp() {
    coletarCliente();

    var cfg = Store.dados().config;

    if (faltaPedidoMinimo() > 0) {
      avisar('O pedido ainda não atingiu o mínimo.', 'erro');
      return;
    }
    if (!cfg.aberto) {
      avisar('A lanchonete está fechada no momento.', 'erro');
      return;
    }
    if (!cfg.whatsapp) {
      avisar('O dono ainda não cadastrou o WhatsApp.', 'erro');
      return;
    }

    /* Sorteia o numero do pedido uma unica vez. A mensagem do
       WhatsApp e a linha da planilha usam este mesmo valor. */
    pedidoAtual = numeroPedido();

    var texto = encodeURIComponent(montarMensagem());
    var link = 'https://wa.me/' + cfg.whatsapp + '?text=' + texto;

    window.open(link, '_blank', 'noopener');

    avisar('Abrindo o WhatsApp… ✅', 'ok');
    registrarPlanilha();

    /* So guarda o pedido quando da mesmo para acompanhar: sem
       planilha configurada, a pagina Acompanhar nao teria o que
       consultar. */
    if (window.CardapioPlanilha && window.CardapioPlanilha.configurada()) {
      guardarPedido(pedidoAtual);
    }

    setTimeout(function () {
      carrinho = [];
      cliente = {};
      pedidoAtual = '';
      salvarCarrinho();
      fecharModal();
      render();
    }, 700);
  }

  /* ---------- planilha (Google Sheets) ----------
     Dispara depois de abrir o WhatsApp e sem esperar a resposta:
     o cliente não pode ficar olhando a tela por causa da planilha,
     e o POST em no-cors não devolve nada legível mesmo. */
  function registrarPlanilha() {
    var P = window.CardapioPlanilha;
    if (!P || !P.configurada()) return;

    var agora = new Date();
    var cfg = Store.dados().config;

    var itens = carrinho.map(function (linha) {
      var achado = acharItem(linha.id);
      if (!achado) return null;

      /* As opcoes entram junto da observacao do item, para a cozinha
         ver tudo numa celula so. */
      var rotulo = rotuloOpcoes(linha);
      var observacao = [rotulo, linha.obs || ''].filter(Boolean).join(' | ');

      return {
        nome: achado.item.nome,
        quantidade: linha.qtd,
        precoUnitario: precoUnitarioLinha(linha),
        observacao: observacao
      };
    }).filter(Boolean);

    if (!itens.length) return;

    P.enviarPedido({
      data: agora.toLocaleDateString('pt-BR'),
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      pedido: pedidoAtual || numeroPedido(),
      cliente: cliente.nome || '',
      tipo: cliente.tipo || 'entrega',
      endereco: cliente.endereco || '',
      bairro: cliente.bairro || '',
      pagamento: cliente.pagamento || '',
      observacoes: cliente.obs || '',
      itens: itens,
      subtotal: subtotal(),
      taxa: taxaAplicada(),
      total: totalGeral(),
      loja: cfg.nome
    }).then(function (r) {
      if (r && r.ignorado) return;
      avisar('Pedido salvo na planilha ✅', 'ok');
    }, function (erro) {
      /* O WhatsApp ja foi aberto com o pedido inteiro, entao falhar
         aqui e so avisar -- nao pode travar o cliente esperando. */
      avisar('Não consegui salvar na planilha, mas seu pedido foi enviado.', 'erro');
      if (window.console && console.warn) console.warn('[cardapio] planilha:', erro && erro.message);
    });
  }

  /* =========================================================
     Render geral
     ========================================================= */
  function render() {
    aplicarCor();
    renderCabecalho();
    renderAbas();
    renderLista();
    renderBotaoCarrinho();
  }

  /* =========================================================
     Eventos
     ========================================================= */
  function ligarEventos() {
    /* busca */
    el.busca.addEventListener('input', function () {
      busca = this.value.trim();
      el.limpar.hidden = !busca;
      renderAbas();
      renderLista();
    });

    el.limpar.addEventListener('click', function () {
      el.busca.value = '';
      busca = '';
      this.hidden = true;
      renderAbas();
      renderLista();
      el.busca.focus();
    });

    /* clique delegado na lista (adicionar / limpar busca) */
    el.lista.addEventListener('click', function (ev) {
      var alvo = ev.target.closest('[data-add], [data-limpar-busca]');
      if (!alvo) return;

      if (alvo.hasAttribute('data-limpar-busca')) {
        el.busca.value = ''; busca = ''; el.limpar.hidden = true;
        renderAbas(); renderLista();
        return;
      }
      if (alvo.hasAttribute('data-add')) addItem(alvo.getAttribute('data-add'));
    });

    /* clique delegado no carrinho flutuante e no modal */
    document.addEventListener('click', function (ev) {
      if (ev.target.closest('#botaoCarrinho')) { renderCarrinho(); return; }
      if (ev.target.closest('[data-fechar]') || ev.target.closest('#modalFechar')) { fecharModal(); return; }
      if (ev.target.closest('[data-checkout]')) { renderCheckout(); return; }
      if (ev.target.closest('[data-voltar-carrinho]')) { renderCarrinho(); return; }
      if (ev.target.closest('[data-enviar]')) { enviarWhatsApp(); return; }
      if (ev.target.closest('[data-ver-pix]')) { abrirQrPix(); return; }

      /* modal de opcoes do item */
      var editar = ev.target.closest('[data-editar-opcoes]');
      if (editar) { editarOpcoesLinha(Number(editar.getAttribute('data-editar-opcoes'))); return; }
      if (ev.target.closest('[data-op-confirmar]')) { confirmarOpcoes(); return; }
      if (ev.target.closest('[data-op-inc]')) { mudarQtdOpcoes(1); return; }
      if (ev.target.closest('[data-op-dec]')) { mudarQtdOpcoes(-1); return; }

      var inc = ev.target.closest('[data-inc]');
      if (inc) {
        var linhaInc = inc.hasAttribute('data-linha') ? inc.getAttribute('data-linha') : null;
        if (linhaInc !== null) alterarLinha(Number(linhaInc), 1);
        else alterarQtd(inc.getAttribute('data-inc'), 1);
        focarMaisMenos('inc', linhaInc);
        return;
      }
      var dec = ev.target.closest('[data-dec]');
      if (dec) {
        var linhaDec = dec.hasAttribute('data-linha') ? dec.getAttribute('data-linha') : null;
        if (linhaDec !== null) alterarLinha(Number(linhaDec), -1);
        else alterarQtd(dec.getAttribute('data-dec'), -1);
        focarMaisMenos('dec', linhaDec);
        return;
      }
    });

    /* observações por linha do carrinho */
    el.modalCorpo.addEventListener('input', function (ev) {
      var indice = ev.target.getAttribute && ev.target.getAttribute('data-obs-linha');
      if (indice === null || indice === undefined || indice === '') return;

      var linha = carrinho[Number(indice)];
      if (!linha) return;
      linha.obs = ev.target.value;
      salvarCarrinho();
    });

    /* escolha de opcao (radio/checkbox) */
    el.modalCorpo.addEventListener('change', function (ev) {
      var alvo = ev.target;
      if (!alvo.hasAttribute || !alvo.hasAttribute('data-op-escolha')) return;
      aplicarEscolhaOpcao(alvo);
    });

    /* preview no checkout */
    el.modalCorpo.addEventListener('input', function (ev) {
      if (ev.target.id === 'coNome' || ev.target.id === 'coEndereco' ||
          ev.target.id === 'coBairro' || ev.target.id === 'coPagamento' ||
          ev.target.id === 'coObs' || ev.target.name === 'coTipo') {
        coletarCliente();
        atualizarPrevia();
        if (ev.target.id === 'coEndereco') sugerirBairroDoEndereco(ev.target.value);
        if (ev.target.id === 'coPagamento') atualizarPix(false);
      }
    });

    /* mostra/esconde endereço conforme entrega ou retirada; a troca de
       bairro muda a taxa e por isso atualiza também o botão do carrinho */
    el.modalCorpo.addEventListener('change', function (ev) {
      if (ev.target.name === 'coTipo') {
        var box = el.modalCorpo.querySelector('#coEnderecoBox');
        if (box) box.classList.toggle('oculto', ev.target.value === 'retirada');
        coletarCliente();
        atualizarPrevia();
        renderBotaoCarrinho(); /* retirada tira a taxa de entrega */
      } else if (ev.target.id === 'coBairro') {
        coletarCliente();
        atualizarPrevia();
        renderBotaoCarrinho(); /* a taxa do bairro muda o total */
      } else if (ev.target.id === 'coPagamento') {
        coletarCliente();
        atualizarPrevia();
        atualizarPix(true); /* escolher PIX abre o QR na hora */
      }
    });

    /* fecha modal clicando fora */
    el.overlay.addEventListener('mousedown', function (ev) {
      if (ev.target === el.overlay) fecharModal();
    });

    /* teclado */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !el.overlay.classList.contains('oculto')) fecharModal();
    });

    /* baixa o JSON direto do cardápio */
    $('#linkBaixarJson').addEventListener('click', function (ev) {
      ev.preventDefault();
      Store.baixar('cardapio.json', Store.serializar());
      avisar('cardapio.json baixado 📄', 'ok');
    });

    /* faixa "Acompanhar pedido" */
    if (el.faixaPedidoFechar) {
      el.faixaPedidoFechar.addEventListener('click', esconderFaixa);
    }

    /* "/" foca a busca */
    document.addEventListener('keydown', function (ev) {
      if (ev.key === '/' && document.activeElement !== el.busca) {
        ev.preventDefault();
        el.busca.focus();
      }
    });

    /* Se o dono mexer no painel em outra aba, o cardapio
       desta aba se atualiza sozinho. */
    window.addEventListener('storage', function (ev) {
      if (ev.key !== 'cardapio:data:v1' || !ev.newValue) return;
      try {
        Store.importarTexto(ev.newValue);
        avisar('Cardápio atualizado ✅', 'ok');
      } catch (e) { /* ignora gravacao invalida */ }
    });
  }

  /* =========================================================
     Boot
     ========================================================= */
  function iniciar() {
    el = {
      nome: $('#marcaNome'),
      sub: $('#marcaSub'),
      logo: $('#marcaLogo'),
      status: $('#marcaStatus'),
      avisoFechado: $('#avisoFechado'),
      avisoFechadoTexto: $('#avisoFechadoTexto'),
      abas: $('#abasCategorias'),
      lista: $('#listaCategorias'),
      busca: $('#campoBusca'),
      limpar: $('#buscaLimpar'),
      btnCarrinho: $('#botaoCarrinho'),
      cfTotal: $('#cfTotal'),
      cfQtd: $('#cfQtd'),
      cfSub: $('#cfSub'),
      overlay: $('#overlay'),
      modalTitulo: $('#modalTitulo'),
      modalCorpo: $('#modalCorpo'),
      modalRodape: $('#modalRodape'),
      toasts: $('#toasts'),
      rodapeNome: $('#rodapeNome'),
      faixaPedido: $('#faixaPedido'),
      faixaPedidoLink: $('#faixaPedidoLink'),
      faixaPedidoNum: $('#faixaPedidoNum'),
      faixaPedidoFechar: $('#faixaPedidoFechar')
    };

    /* Store.iniciar() monta o cardapio em memoria na hora
       (pintura imediata), vinda do navegador ou do exemplo
       embutido. A planilha entra depois, em carregarPlanilha. */
    carregarCarrinho();
    Store.iniciar();
    ligarEventos();
    ligarImagens();
    Store.assinar(render);
    podarCarrinho();
    render();
    renderFaixaPedido();

    /* Depois da primeira pintura, para nao travar a abertura
       esperando o Google responder. */
    carregarPlanilha();
  }

  /* ---------- cardapio publicado na planilha ----------
     A planilha do Google e a fonte da verdade: categorias,
     itens, precos, destaques, imagens e os dados da loja. A
     leitura e um fetch comum (planilha.js).

     A tela ja aparece com o que o navegador tinha guardado, e a
     planilha troca tudo no lugar quando responde. Se ela falhar,
     o menu continua aparecendo — e so um aviso no console, porque
     um cardapio vazio seria pior do que um cardapio antigo. */
  function carregarPlanilha() {
    var P = window.CardapioPlanilha;
    if (!P || !P.configurada()) return;

    P.lerCardapio().then(function (r) {
      if (!r || r.ok !== true) {
        if (window.console && console.warn) {
          console.warn('[cardapio] leitura da planilha:', r && r.erro);
        }
        return;
      }

      var m = P.aplicarCardapio(r);
      if (!m.alterados) return;

      /* Renomear item na planilha muda o id dele, e o id gravado
         no carrinho de quem estava na pagina deixa de existir.
         Podar de novo e repintar limpa essa lista. */
      podarCarrinho();
      render();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
