/* =============================================================
   admin.js  —  painel do dono: categorias, itens, configuracoes
   e manuseio do arquivo cardapio.json
   ============================================================= */
(function () {
  'use strict';

  var Store = window.CardapioStore;
  var Admin = Store.admin;

  var el = {};
  var abaAtual = 'itens';

  /* =========================================================
     Utilitarios
     ========================================================= */
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $(s) { return document.querySelector(s); }
  function $$now(s) { return Array.prototype.slice.call(document.querySelectorAll(s)); }

  function moeda(v) {
    return (Store.dados().config.simboloMoeda || 'R$') + ' ' +
      (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  var MAX_TOASTS = 3;

  function avisar(msg, tipo) {
    /* Com varias abas abertas, cada gravacao gera um aviso em cada
       aba. Sem agrupar, a tela enche de toasts repetidos. */
    var anteriores = el.toasts.querySelectorAll('.toast');
    for (var i = 0; i < anteriores.length; i++) {
      if (anteriores[i].textContent === msg) return; /* ja avisou */
    }
    while (el.toasts.children.length >= MAX_TOASTS) {
      el.toasts.firstElementChild.remove();
    }

    var t = document.createElement('div');
    t.className = 'toast' + (tipo ? ' toast-' + tipo : '');
    t.textContent = msg;
    el.toasts.appendChild(t);
    setTimeout(function () {
      t.style.transition = 'opacity .25s';
      t.style.opacity = '0';
      setTimeout(function () { t.remove(); }, 260);
    }, 2600);
  }

  /* =========================================================
     Login
     ========================================================= */
  function montarLogin() {
    /* A tela de login vem oculta no HTML para nao piscar antes do JS
       decidir. Aqui ela precisa aparecer de fato. */
    el.telaLogin.classList.remove('oculto');
    el.loginDica.textContent = 'Senha padrão: "' + Admin.senhaPadrao + '". Troque em Configurações.';

    function tentar() {
      var senha = el.loginSenha.value;
      if (!senha) { mostrarErro('Informe a senha.'); return; }

      Admin.conferirSenha(senha).then(function (ok) {
        if (ok) {
          el.telaLogin.classList.add('oculto');
          el.telaAdmin.classList.remove('oculto');
          renderTudo();
          Admin.senhaEhPadrao().then(function (padrao) {
            if (padrao) avisar('Troque a senha padrão em Configurações.', 'erro');
          });
        } else {
          mostrarErro('Senha incorreta.');
          el.loginSenha.select();
        }
      });
    }

    function mostrarErro(msg) {
      el.loginErro.textContent = msg;
      el.loginErro.classList.remove('oculto');
    }

    el.loginEntrar.addEventListener('click', tentar);
    el.loginSenha.addEventListener('keydown', function (e) { if (e.key === 'Enter') tentar(); });
    el.loginSenha.addEventListener('input', function () { el.loginErro.classList.add('oculto'); });
    el.loginSenha.focus();
  }

  /* =========================================================
     Abas
     ========================================================= */
  function trocarAba(nome) {
    abaAtual = nome;
    /* Padrao de tablist: so a aba ativa entra na ordem do Tab,
       as demais sao alcancadas com as setas do teclado. */
    $$now('.aba-admin').forEach(function (b) {
      var ativa = b.getAttribute('data-tab') === nome;
      b.setAttribute('aria-selected', ativa ? 'true' : 'false');
      b.tabIndex = ativa ? 0 : -1;
    });
    el.tabItens.classList.toggle('oculto', nome !== 'itens');
    el.tabConfig.classList.toggle('oculto', nome !== 'config');
    el.tabBairros.classList.toggle('oculto', nome !== 'bairros');
    el.tabJson.classList.toggle('oculto', nome !== 'json');
    if (nome === 'config') preencherConfig();
    if (nome === 'bairros') renderBairros();
    if (nome === 'json') el.textareaJson.value = Store.serializar();
  }

  /* =========================================================
     Aba: itens e categorias
     ========================================================= */
  function renderEstatisticas() {
    var cats = Store.dados().categorias;
    var itens = cats.reduce(function (n, c) { return n + (c.itens || []).length; }, 0);
    var indisponiveis = 0;
    cats.forEach(function (c) {
      (c.itens || []).forEach(function (i) { if (i.disponivel === false) indisponiveis++; });
    });

    el.estatisticas.innerHTML =
      '<div class="estat"><b>' + cats.length + '</b><span>categorias</span></div>' +
      '<div class="estat"><b>' + itens + '</b><span>itens</span></div>' +
      '<div class="estat"><b>' + indisponiveis + '</b><span>indisponíveis</span></div>' +
      '<div class="estat"><b>' + new Date().toLocaleDateString('pt-BR') + '</b><span>última edição</span></div>';
  }

  function renderCategorias() {
    var cats = Store.dados().categorias;

    if (!cats.length) {
      el.listaCategorias.innerHTML =
        '<div class="vazio"><span class="vazio-icone">📂</span>' +
        '<p>Nenhuma categoria ainda.</p>' +
        '<button type="button" class="btn btn-primario btn-sm" data-nova-categoria>+ Criar primeira categoria</button></div>';
      return;
    }

    el.listaCategorias.innerHTML = cats.map(function (cat, indice) {
      var lista = cat.itens || [];
      var itens = lista.map(function (item, pos) { return linhaItem(item, pos, lista.length); }).join('');

      return '' +
      '<div class="categoria-bloco" data-cat="' + esc(cat.id) + '">' +
        '<div class="categoria-topo">' +
          '<input type="text" class="categoria-icone" value="' + esc(cat.icone) + '" maxlength="4" ' +
            'data-edit-campo="icone" data-cat="' + esc(cat.id) + '" aria-label="Ícone da categoria">' +
          '<div style="min-width:0">' +
            '<input type="text" class="categoria-nome" value="' + esc(cat.nome) + '" ' +
              'data-edit-campo="nome" data-cat="' + esc(cat.id) + '" aria-label="Nome da categoria" ' +
              'style="border:0;background:transparent;padding:2px 0;font-weight:700;width:100%">' +
            '<div class="categoria-meta">' + (cat.itens || []).length + ' item(ns)</div>' +
          '</div>' +
          '<div class="acoes">' +
            '<button type="button" class="btn btn-icone btn-contorno" data-add-item="' + esc(cat.id) + '" title="Adicionar item">+</button>' +
            '<button type="button" class="btn btn-icone btn-contorno" data-mover-cat="' + esc(cat.id) + '" data-dir="-1" title="Subir" ' + (indice === 0 ? 'disabled' : '') + '>↑</button>' +
            '<button type="button" class="btn btn-icone btn-contorno" data-mover-cat="' + esc(cat.id) + '" data-dir="1" title="Descer" ' + (indice === cats.length - 1 ? 'disabled' : '') + '>↓</button>' +
            '<button type="button" class="btn btn-icone btn-perigo" data-excluir-cat="' + esc(cat.id) + '" title="Excluir categoria">🗑</button>' +
          '</div>' +
        '</div>' +
        '<div class="categoria-corpo">' + (itens || '<p class="dica" style="margin:4px;color:var(--texto-tenue)">Nenhum item. Use o botão + para adicionar.</p>') + '</div>' +
      '</div>';
    }).join('');
  }

  function linhaItem(item, posicao, total) {
    return '' +
    '<div class="item-admin' + (item.disponivel === false ? ' indisponivel' : '') + '" data-item="' + esc(item.id) + '">' +
      '<button type="button" class="btn btn-icone btn-contorno" data-toggle-item="' + esc(item.id) + '" ' +
        'title="' + (item.disponivel === false ? 'Marcar como disponível' : 'Marcar como indisponível') + '">' +
        (item.disponivel === false ? '🚫' : '✅') + '</button>' +
      '<button type="button" class="btn btn-icone btn-contorno" data-destaque="' + esc(item.id) + '" ' +
        'title="' + (item.destaque ? 'Remover destaque' : 'Marcar como destaque') + '">' + (item.destaque ? '⭐' : '☆') + '</button>' +
      '<span class="item-admin-nome">' + esc(item.nome) +
        (item.descricao ? '<small>' + esc(item.descricao) + '</small>' : '') +
        (item.opcoes && item.opcoes.length
          ? '<small class="item-admin-opcoes">' + item.opcoes.length + ' grupo(s) de opções</small>'
          : '') + '</span>' +
      '<span class="item-admin-preco">' + moeda(item.preco) + '</span>' +
      '<div class="acoes">' +
        '<button type="button" class="btn btn-icone btn-contorno" data-opcoes-item="' + esc(item.id) + '" title="Opções de escolha do item">⚙</button>' +
        '<button type="button" class="btn btn-icone btn-contorno" data-mover-item="' + esc(item.id) + '" data-dir="-1" title="Subir"' + (posicao === 0 ? ' disabled' : '') + '>↑</button>' +
        '<button type="button" class="btn btn-icone btn-contorno" data-mover-item="' + esc(item.id) + '" data-dir="1" title="Descer"' + (posicao === total - 1 ? ' disabled' : '') + '>↓</button>' +
        '<button type="button" class="btn btn-icone btn-contorno" data-editar-item="' + esc(item.id) + '" title="Editar">✎</button>' +
        '<button type="button" class="btn btn-icone btn-perigo" data-excluir-item="' + esc(item.id) + '" title="Excluir">🗑</button>' +
      '</div>' +
    '</div>';
  }

  /* ---------- acoes de item ---------- */
  function acharItem(id) {
    var achado = null;
    Store.dados().categorias.forEach(function (c) {
      (c.itens || []).forEach(function (i) { if (i.id === id) achado = { item: i, cat: c }; });
    });
    return achado;
  }

  function editarItem(id) {
    var achado = acharItem(id);
    if (!achado) return;
    var item = achado.item;

    abrirModal('Editar item', '' +
      '<div class="empilha">' +
        '<div class="campo"><label for="mNome">Nome *</label>' +
        '<input type="text" id="mNome" value="' + esc(item.nome) + '" maxlength="80"></div>' +
        '<div class="campo"><label for="mDescricao">Descrição</label>' +
        '<textarea id="mDescricao" maxlength="240" placeholder="Ingredientes, porção, acompanhamentos…">' + esc(item.descricao) + '</textarea></div>' +
        '<div class="campo"><label for="mPreco">Preço (R$) *</label>' +
        '<input type="text" id="mPreco" inputmode="decimal" value="' + precoParaCampo(item.preco) + '"></div>' +
        '<div class="campo"><label for="mImagem">URL da foto (opcional)</label>' +
        '<input type="url" id="mImagem" value="' + esc(item.imagem) + '" placeholder="https://…/foto.jpg"></div>' +
        '<label class="chave"><span>Marcar como destaque</span><input type="checkbox" id="mDestaque"' + (item.destaque ? ' checked' : '') + '></label>' +
        '<label class="chave"><span>Disponível para pedido</span><input type="checkbox" id="mDisponivel"' + (item.disponivel === false ? '' : ' checked') + '></label>' +
      '</div>', '' +
      '<button type="button" class="btn btn-primario btn-bloco" data-salvar-item="' + esc(item.id) + '">Salvar alterações</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');
  }

  /* Aceita "12,50", "12.50" ou "12,5" e devolve numero. */
  function lerPreco(valor) {
    var n = parseFloat(String(valor || '').replace(',', '.').trim());
    return isFinite(n) && n >= 0 ? n : NaN;
  }

  /* Mostra o preco no formato brasileiro dentro dos formularios. */
  function precoParaCampo(valor) {
    return (Number(valor) || 0).toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  function salvarItem(id) {
    var nome = el.modalCorpo.querySelector('#mNome').value.trim();
    var preco = lerPreco(el.modalCorpo.querySelector('#mPreco').value);

    if (!nome) { avisar('O nome do item é obrigatório.', 'erro'); return; }
    if (!isFinite(preco)) { avisar('Informe um preço válido (ex.: 12,50).', 'erro'); return; }

    Store.alterar(function (d) {
      d.categorias.forEach(function (c) {
        (c.itens || []).forEach(function (i) {
          if (i.id !== id) return;
          i.nome = nome;
          i.descricao = el.modalCorpo.querySelector('#mDescricao').value.trim();
          i.preco = Math.round(preco * 100) / 100;
          i.imagem = el.modalCorpo.querySelector('#mImagem').value.trim();
          i.destaque = el.modalCorpo.querySelector('#mDestaque').checked;
          i.disponivel = el.modalCorpo.querySelector('#mDisponivel').checked;
        });
      });
    });

    fecharModal();
    avisar('Item atualizado ✅', 'ok');
  }

  function novoItem(catId) {
    abrirModal('Novo item', '' +
      '<div class="empilha">' +
        '<div class="campo"><label for="mNome">Nome *</label>' +
        '<input type="text" id="mNome" placeholder="Ex.: X-Salada" maxlength="80"></div>' +
        '<div class="campo"><label for="mDescricao">Descrição</label>' +
        '<textarea id="mDescricao" maxlength="240" placeholder="Ingredientes, porção, acompanhamentos…"></textarea></div>' +
        '<div class="campo"><label for="mPreco">Preço (R$) *</label>' +
        '<input type="text" id="mPreco" inputmode="decimal" placeholder="0,00"></div>' +
        '<div class="campo"><label for="mImagem">URL da foto (opcional)</label>' +
        '<input type="url" id="mImagem" placeholder="https://…/foto.jpg"></div>' +
        '<label class="chave"><span>Marcar como destaque</span><input type="checkbox" id="mDestaque"></label>' +
        '<label class="chave"><span>Disponível para pedido</span><input type="checkbox" id="mDisponivel" checked></label>' +
      '</div>', '' +
      '<button type="button" class="btn btn-primario btn-bloco" data-criar-item="' + esc(catId) + '">Adicionar item</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');

    setTimeout(function () { el.modalCorpo.querySelector('#mNome').focus(); }, 80);
  }

  function criarItem(catId) {
    var nome = el.modalCorpo.querySelector('#mNome').value.trim();
    var preco = lerPreco(el.modalCorpo.querySelector('#mPreco').value);

    if (!nome) { avisar('O nome do item é obrigatório.', 'erro'); return; }
    if (!isFinite(preco)) { avisar('Informe um preço válido (ex.: 12,50).', 'erro'); return; }

    var novo = {
      id: Store.slug(nome),
      nome: nome,
      descricao: el.modalCorpo.querySelector('#mDescricao').value.trim(),
      preco: Math.round(preco * 100) / 100,
      imagem: el.modalCorpo.querySelector('#mImagem').value.trim(),
      destaque: el.modalCorpo.querySelector('#mDestaque').checked,
      disponivel: el.modalCorpo.querySelector('#mDisponivel').checked
    };

    Store.alterar(function (d) {
      var cat = d.categorias.filter(function (c) { return c.id === catId; })[0];
      if (!cat) { avisar('Categoria não encontrada.', 'erro'); return; }
      cat.itens.push(novo);
    });

    fecharModal();
    avisar('Item adicionado ✅', 'ok');
  }

  function excluirItem(id) {
    var achado = acharItem(id);
    if (!achado) return;
    if (!confirm('Excluir "' + achado.item.nome + '"? Essa ação não pode ser desfeita.')) return;

    Store.alterar(function (d) {
      d.categorias.forEach(function (c) {
        c.itens = (c.itens || []).filter(function (i) { return i.id !== id; });
      });
    });
    avisar('Item excluído');
  }

  function moverItem(id, dir) {
    Store.alterar(function (d) {
      d.categorias.forEach(function (c) {
        var itens = c.itens || [];
        var i = itens.findIndex(function (x) { return x.id === id; });
        var j = i + Number(dir);
        if (i < 0 || j < 0 || j >= itens.length) return;
        var tmp = itens[i];
        itens[i] = itens[j];
        itens[j] = tmp;
      });
    });
  }

  /* ---------- opcoes de item ----------
     Cada item pode ter grupos de escolha (Tamanho, Adicionais,
     Sabores). O dono edita num modal proprio, aberto pelo botao ⚙.
     O estado fica em opcoesEditando enquanto o modal esta aberto. */
  var opcoesEditando = null; /* { id, nome, grupos } */

  function editarOpcoesItem(id) {
    var achado = acharItem(id);
    if (!achado) return;

    opcoesEditando = {
      id: id,
      nome: achado.item.nome,
      grupos: JSON.parse(JSON.stringify(achado.item.opcoes || []))
    };
    renderOpcoesAdmin();
  }

  /* Le o formulario inteiro para o estado. Chamado antes de qualquer
     mudanca estrutural (add/remover), senao o que foi digitado se
     perderia ao redesenhar. */
  function coletarOpcoesForm() {
    if (!opcoesEditando) return;

    var grupos = [];
    var caixas = el.modalCorpo.querySelectorAll('[data-grupo-box]');
    Array.prototype.forEach.call(caixas, function (caixa) {
      var g = {
        grupo: caixa.querySelector('[data-g-nome]').value.trim(),
        tipo: caixa.querySelector('[data-g-tipo]').value,
        obrigatorio: caixa.querySelector('[data-g-obrig]').checked,
        itens: []
      };

      var linhas = caixa.querySelectorAll('[data-o-linha]');
      Array.prototype.forEach.call(linhas, function (linha) {
        var nome = linha.querySelector('[data-o-nome]').value.trim();
        var preco = lerPreco(linha.querySelector('[data-o-preco]').value);
        if (nome) g.itens.push({ nome: nome, preco: isFinite(preco) ? preco : 0 });
      });

      grupos.push(g);
    });

    opcoesEditando.grupos = grupos;
  }

  function renderOpcoesAdmin() {
    var grupos = opcoesEditando.grupos || [];
    var corpo = '<div class="empilha">';

    if (!grupos.length) {
      corpo += '<p class="dica">Sem opções. Adicione um grupo (ex.: Tamanho, Adicionais, Sabores).</p>';
    }

    grupos.forEach(function (g, i) {
      corpo += '<fieldset class="grupo-admin" data-grupo-box>' +
        '<legend>Grupo ' + (i + 1) + '</legend>' +
        '<div class="campo"><label>Nome do grupo</label>' +
        '<input type="text" data-g-nome value="' + esc(g.grupo) + '" maxlength="40" placeholder="Ex.: Tamanho"></div>' +
        '<div class="campo"><label>Tipo de escolha</label>' +
        '<select data-g-tipo>' +
          '<option value="unico"' + (g.tipo !== 'multiplo' ? ' selected' : '') + '>Só uma opção (escolha única)</option>' +
          '<option value="multiplo"' + (g.tipo === 'multiplo' ? ' selected' : '') + '>Várias opções (adicionais)</option>' +
        '</select></div>' +
        '<label class="chave"><span>Escolha obrigatória</span>' +
        '<input type="checkbox" data-g-obrig' + (g.obrigatorio ? ' checked' : '') + '></label>' +
        '<div class="opcoes-admin-lista">';

      (g.itens || []).forEach(function (o, j) {
        corpo += '<div class="opcao-admin" data-o-linha>' +
          '<input type="text" data-o-nome value="' + esc(o.nome) + '" maxlength="40" placeholder="Opção (ex.: Grande)">' +
          '<input type="text" data-o-preco inputmode="decimal" value="' + precoParaCampo(o.preco) + '" placeholder="0,00">' +
          '<button type="button" class="btn btn-icone btn-perigo" data-remover-opcao="' + i + ',' + j + '" title="Remover opção">🗑</button>' +
        '</div>';
      });

      corpo += '</div>' +
        '<div class="acoes-grupo">' +
          '<button type="button" class="btn btn-sm btn-contorno" data-add-opcao="' + i + '">+ Opção</button>' +
          '<button type="button" class="btn btn-sm btn-perigo" data-remover-grupo="' + i + '">Remover grupo</button>' +
        '</div>' +
      '</fieldset>';
    });

    corpo += '</div>';

    abrirModal('Opções · ' + opcoesEditando.nome, corpo,
      '<button type="button" class="btn btn-contorno btn-bloco" data-add-grupo>+ Grupo</button>' +
      '<button type="button" class="btn btn-primario btn-bloco" data-salvar-opcoes>Salvar opções</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');
  }

  function salvarOpcoes() {
    coletarOpcoesForm();

    var limpos = (opcoesEditando.grupos || []).map(function (g) {
      return {
        grupo: g.grupo,
        tipo: g.tipo === 'multiplo' ? 'multiplo' : 'unico',
        obrigatorio: !!g.obrigatorio,
        itens: (g.itens || []).filter(function (o) { return o.nome; })
      };
    }).filter(function (g) { return g.grupo && g.itens.length; });

    var idAlvo = opcoesEditando.id;
    Store.alterar(function (d) {
      d.categorias.forEach(function (c) {
        (c.itens || []).forEach(function (i) {
          if (i.id !== idAlvo) return;
          if (limpos.length) i.opcoes = limpos;
          else delete i.opcoes;
        });
      });
    });

    opcoesEditando = null;
    fecharModal();
    avisar('Opções atualizadas ✅', 'ok');
  }

  /* ---------- acoes de categoria ---------- */
  function novaCategoria() {
    abrirModal('Nova categoria', '' +
      '<div class="empilha">' +
        '<div class="campo"><label for="mNome">Nome *</label>' +
        '<input type="text" id="mNome" placeholder="Ex.: Porções" maxlength="60"></div>' +
        '<div class="campo"><label for="mIcone">Ícone (emoji)</label>' +
        '<input type="text" id="mIcone" maxlength="4" placeholder="🍟"></div>' +
      '</div>', '' +
      '<button type="button" class="btn btn-primario btn-bloco" data-criar-cat>Adicionar categoria</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');

    setTimeout(function () { el.modalCorpo.querySelector('#mNome').focus(); }, 80);
  }

  function criarCategoria() {
    var nome = el.modalCorpo.querySelector('#mNome').value.trim();
    var icone = el.modalCorpo.querySelector('#mIcone').value.trim() || '🍽️';
    if (!nome) { avisar('O nome da categoria é obrigatório.', 'erro'); return; }

    Store.alterar(function (d) {
      d.categorias.push({ id: Store.slug(nome), nome: nome, icone: icone, itens: [] });
    });
    fecharModal();
    avisar('Categoria criada ✅', 'ok');
  }

  function excluirCategoria(catId) {
    var cat = Store.dados().categorias.filter(function (c) { return c.id === catId; })[0];
    if (!cat) return;

    var total = (cat.itens || []).length;
    var msg = total
      ? 'Excluir "' + cat.nome + '" e seus ' + total + ' item(ns)?'
      : 'Excluir a categoria "' + cat.nome + '"?';
    if (!confirm(msg)) return;

    Store.alterar(function (d) {
      d.categorias = d.categorias.filter(function (c) { return c.id !== catId; });
    });
    avisar('Categoria excluída');
  }

  function moverCategoria(catId, dir) {
    Store.alterar(function (d) {
      var i = d.categorias.findIndex(function (c) { return c.id === catId; });
      var j = i + Number(dir);
      if (i < 0 || j < 0 || j >= d.categorias.length) return;
      var tmp = d.categorias[i];
      d.categorias[i] = d.categorias[j];
      d.categorias[j] = tmp;
    });
  }

  /* ---------- edicao inline (nome/icone da categoria) ---------- */
  function editarInline(campo, catId, valor) {
    Store.alterar(function (d) {
      d.categorias.forEach(function (c) {
        if (c.id !== catId) return;
        if (campo === 'nome') {
          if (!valor.trim()) return;
          c.nome = valor.trim();
        } else {
          c.icone = valor.trim() || '🍽️';
        }
      });
    });
  }

  /* =========================================================
     Aba: bairros e taxas
     ========================================================= */
  function renderBairros() {
    var lista = Store.dados().bairros || [];

    if (!lista.length) {
      el.listaBairros.innerHTML =
        '<div class="vazio"><span class="vazio-icone">🛵</span>' +
        '<p>Nenhum bairro cadastrado.</p>' +
        '<p class="dica">Sem bairros, o checkout usa a taxa única de entrega das Configurações.</p>' +
        '<button type="button" class="btn btn-primario btn-sm" data-novo-bairro>+ Adicionar primeiro bairro</button></div>';
      return;
    }

    el.listaBairros.innerHTML = lista.map(function (b, i) {
      return '' +
      '<div class="bairro-linha' + (b.ativo === false ? ' inativo' : '') + '">' +
        '<div class="bairro-info">' +
          '<b>' + esc(b.nome || '(sem nome)') + '</b>' +
          '<span>' + moeda(b.taxa) + (b.tempo ? ' · ' + esc(b.tempo) : '') +
            (b.ativo === false ? ' · inativo' : '') + '</span>' +
        '</div>' +
        '<div class="acoes">' +
          '<button type="button" class="btn btn-icone btn-contorno" data-mover-bairro="' + esc(b.id) + '" data-dir="-1" title="Subir" ' + (i === 0 ? 'disabled' : '') + '>↑</button>' +
          '<button type="button" class="btn btn-icone btn-contorno" data-mover-bairro="' + esc(b.id) + '" data-dir="1" title="Descer" ' + (i === lista.length - 1 ? 'disabled' : '') + '>↓</button>' +
          '<button type="button" class="btn btn-sm btn-contorno" data-editar-bairro="' + esc(b.id) + '">Editar</button>' +
          '<button type="button" class="btn btn-icone btn-perigo" data-excluir-bairro="' + esc(b.id) + '" title="Excluir bairro">🗑</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  /* Formulario compartilhado entre novo e editar bairro. */
  function formularioBairro(b, idBotao, rotuloBotao, atributo) {
    return abrirModal(b ? 'Editar bairro' : 'Novo bairro', '' +
      '<div class="empilha">' +
        '<div class="campo"><label for="mBairro">Bairro *</label>' +
        '<input type="text" id="mBairro" value="' + esc(b ? b.nome : '') + '" placeholder="Ex.: Centro" maxlength="60"></div>' +
        '<div class="campo"><label for="mTaxa">Taxa de entrega (' + (Store.dados().config.simboloMoeda || 'R$') + ')</label>' +
        '<input type="text" id="mTaxa" inputmode="decimal" value="' + (b ? precoParaCampo(b.taxa) : '') + '" placeholder="0,00"></div>' +
        '<div class="campo"><label for="mTempo">Tempo de entrega</label>' +
        '<input type="text" id="mTempo" value="' + esc(b ? (b.tempo || '') : '') + '" placeholder="30–40 min" maxlength="30"></div>' +
        '<label class="chave"><span>Ativo</span><input type="checkbox" id="mAtivo"' + (b && b.ativo === false ? '' : ' checked') + '></label>' +
      '</div>', '' +
      '<button type="button" class="btn btn-primario btn-bloco" ' + atributo + '="' + esc(idBotao) + '">' + rotuloBotao + '</button>' +
      '<button type="button" class="btn btn-contorno btn-bloco" data-fechar>Cancelar</button>');
  }

  function novoBairro() {
    formularioBairro(null, '', 'Adicionar bairro', 'data-criar-bairro');
    setTimeout(function () { el.modalCorpo.querySelector('#mBairro').focus(); }, 80);
  }

  function editarBairro(id) {
    var b = (Store.dados().bairros || []).filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    formularioBairro(b, b.id, 'Salvar alterações', 'data-salvar-bairro');
  }

  /* Le nome/taxa/tempo/ativo do formulario. Devolve null se o nome
     estiver vazio (e avisa). */
  function lerBairroDoModal() {
    var nome = el.modalCorpo.querySelector('#mBairro').value.trim();
    if (!nome) { avisar('O nome do bairro é obrigatório.', 'erro'); return null; }
    var taxa = lerPreco(el.modalCorpo.querySelector('#mTaxa').value);
    if (!isFinite(taxa)) taxa = 0;
    return {
      nome: nome,
      taxa: Math.round(taxa * 100) / 100,
      tempo: el.modalCorpo.querySelector('#mTempo').value.trim(),
      ativo: el.modalCorpo.querySelector('#mAtivo').checked
    };
  }

  function criarBairro() {
    var novo = lerBairroDoModal();
    if (!novo) return;

    Store.alterar(function (d) {
      d.bairros = d.bairros || [];
      novo.id = Store.slug(novo.nome);
      d.bairros.push(novo);
    });

    fecharModal();
    avisar('Bairro adicionado ✅', 'ok');
  }

  function salvarBairro(id) {
    var dados = lerBairroDoModal();
    if (!dados) return;

    Store.alterar(function (d) {
      (d.bairros || []).forEach(function (b) {
        if (b.id !== id) return;
        b.nome = dados.nome;
        b.taxa = dados.taxa;
        b.tempo = dados.tempo;
        b.ativo = dados.ativo;
      });
    });

    fecharModal();
    avisar('Bairro atualizado ✅', 'ok');
  }

  function excluirBairro(id) {
    var b = (Store.dados().bairros || []).filter(function (x) { return x.id === id; })[0];
    if (!b) return;
    if (!confirm('Excluir o bairro "' + b.nome + '"? Essa ação não pode ser desfeita.')) return;

    Store.alterar(function (d) {
      d.bairros = (d.bairros || []).filter(function (x) { return x.id !== id; });
    });
    avisar('Bairro excluído');
  }

  function moverBairro(id, dir) {
    Store.alterar(function (d) {
      var lista = d.bairros || [];
      var i = lista.findIndex(function (x) { return x.id === id; });
      var j = i + Number(dir);
      if (i < 0 || j < 0 || j >= lista.length) return;
      var tmp = lista[i];
      lista[i] = lista[j];
      lista[j] = tmp;
    });
  }

  /* =========================================================
     Aba: configuracoes
     ========================================================= */
  function preencherConfig() {
    var c = Store.dados().config;
    var P = window.CardapioPlanilha;

    /* Reavalia o aviso do planilha-site.js: ele só faz sentido quando o
       painel tem uma planilha e o site ainda não. Se o dono acabou de
       colar a URL no arquivo, o aviso some sozinho. */
    if (P && el.avisoSite) {
      var siteOk = P.configurada() && P.siteConfigurado();
      el.avisoSite.classList.toggle('oculto', !!siteOk);

      var bUrl = el.avisoSite.querySelector('[data-site-url]');
      if (bUrl) bUrl.textContent = c.planilhaUrl || '(vazio)';
    }

    el.cfgNome.value = c.nome;
    el.cfgWhatsapp.value = c.whatsapp;
    el.cfgDescricao.value = c.descricao;
    el.cfgCor.value = c.corPrimaria;
    el.cfgTaxa.value = precoParaCampo(c.taxaEntrega);
    el.cfgMinimo.value = precoParaCampo(c.pedidoMinimo);
    el.cfgSimbolo.value = c.simboloMoeda;
    el.cfgAbertura.value = c.mensagemAbertura;
    el.cfgFechado.value = c.mensagemFechado;
    el.cfgAberto.checked = c.aberto;
    el.cfgPedirNome.checked = c.pedirNome !== false;
    el.cfgPedirEntrega.checked = c.pedirEntrega !== false;
    el.cfgEndereco.value = c.enderecoLoja || '';
    el.cfgInstagram.value = c.instagram || '';
    el.cfgChavePix.value = c.chavePix || '';
    el.cfgPixCidade.value = c.pixCidade || '';
    el.cfgPagamento.value = c.formasPagamento || '';
    el.cfgTempoEntrega.value = c.tempoEntrega || '';
    el.cfgTempoRetirada.value = c.tempoRetirada || '';
    el.cfgPlanilhaUrl.value = c.planilhaUrl || '';
    el.cfgPlanilhaToken.value = c.planilhaToken || '';
  }

  function salvarConfig(campo, valor) {
    Store.alterar(function (d) { d.config[campo] = valor; });
  }

  function ligarConfig() {
    var mapa = {
      cfgNome: ['nome', 'texto'],
      cfgWhatsapp: ['whatsapp', 'digitos'],
      cfgDescricao: ['descricao', 'texto'],
      cfgCor: ['corPrimaria', 'texto'],
      cfgTaxa: ['taxaEntrega', 'numero'],
      cfgMinimo: ['pedidoMinimo', 'numero'],
      cfgSimbolo: ['simboloMoeda', 'texto'],
      cfgAbertura: ['mensagemAbertura', 'texto'],
      cfgFechado: ['mensagemFechado', 'texto'],
      cfgAberto: ['aberto', 'bool'],
      cfgPedirNome: ['pedirNome', 'bool'],
      cfgPedirEntrega: ['pedirEntrega', 'bool'],
      cfgEndereco: ['enderecoLoja', 'texto'],
      cfgInstagram: ['instagram', 'texto'],
      cfgChavePix: ['chavePix', 'texto'],
      cfgPixCidade: ['pixCidade', 'texto'],
      cfgPagamento: ['formasPagamento', 'texto'],
      cfgTempoEntrega: ['tempoEntrega', 'texto'],
      cfgTempoRetirada: ['tempoRetirada', 'texto'],
      cfgPlanilhaUrl: ['planilhaUrl', 'planilha'],
      cfgPlanilhaToken: ['planilhaToken', 'texto']
    };

    Object.keys(mapa).forEach(function (id) {
      var campo = mapa[id][0];
      var tipo = mapa[id][1];
      var node = el[id];

      var evento = (node.type === 'color' || node.type === 'checkbox' || node.tagName === 'SELECT') ? 'change' : 'input';

      node.addEventListener(evento, function () {
        var v;
        if (tipo === 'bool') v = node.checked;
        else if (tipo === 'numero') v = Math.max(0, lerPreco(node.value) || 0);
        else if (tipo === 'digitos') v = node.value.replace(/\D/g, '');
        else if (tipo === 'planilha') {
          v = node.value.trim();
          /* A URL so e salva se o endereco fizer sentido. Aceitar
             qualquer texto deixaria o dono achando que estava
             gravando quando o navegador so recusaria em silencio. */
          if (v && !/^https:\/\/script\.google(usercontent)?\.com\//i.test(v)) {
            avisar('A URL precisa começar com https://script.google.com/', 'erro');
            return;
          }
        }
        else v = node.value;
        salvarConfig(campo, v);
      });
    });

    el.btnTrocarSenha.addEventListener('click', function () {
      var nova = el.cfgSenha.value;
      Admin.definirSenha(nova).then(
        function () {
          el.cfgSenha.value = '';
          avisar('Senha alterada ✅', 'ok');
        },
        function (erro) { avisar(erro.message, 'erro'); }
      );
    });

    ligarPlanilha();
  }

  /* =========================================================
     Aba: Google Sheets
     ========================================================= */

  /* ---------- buscar da planilha ----------
     A planilha e a fonte da verdade, entao o painel abre mostrando
     o que esta publicado la — e nao o que sobrou neste navegador.

     So nao sobrescreve sozinho quando o dono tem edicao sem
     publicar: perder preco corrigido na pressa, sem nenhum aviso,
     seria o pior defeito possivel num painel que "salva sozinho".
     Nesse caso o painel diz o que achou e espera o clique, que
     ainda pede confirmacao. */
  function buscarPlanilha(forcar) {
    var P = window.CardapioPlanilha;

    if (!P || !P.configurada()) {
      if (forcar) avisar('Cole a URL do Web App primeiro.', 'erro');
      return;
    }

    var botao = el.btnLerPlanilha;
    botao.disabled = true;
    el.resultadoPlanilha.textContent = 'Buscando o que está publicado…';

    P.lerCardapio().then(function (r) {
      botao.disabled = false;

      if (!r || r.ok !== true) {
        var msg = (r && r.erro) || 'Resposta inesperada do script.';
        el.resultadoPlanilha.textContent = 'Não foi possível ler: ' + msg;
        if (window.console && console.warn) console.warn('[cardapio] planilha:', msg);
        return;
      }

      var previa = P.comparar(r);
      var temEdicaoLocal = P.pendentes();

      /* A aba ainda nao foi publicada: nao ha o que buscar, e o
         que esta na tela e o unico cardapio que existe. */
      if (!previa.categorias && !previa.muda) {
        el.resultadoPlanilha.textContent = temEdicaoLocal
          ? 'A planilha ainda não tem cardápio publicado. O que está na tela nunca foi enviado.'
          : 'A planilha ainda não tem cardápio publicado. Clique em "Enviar cardápio agora" para gravar o que está na tela.';
        return;
      }

      /* Planilha igual a tela: o que estava marcado como publicado
         pode estar velho (outro navegador publicou, ou o painel foi
         aberto em outra maquina). Aqui a marcacao se corrige. */
      if (!previa.muda) {
        P.marcarPublicado();
        renderTudo();
        el.resultadoPlanilha.textContent = 'A planilha está igual ao que já estava na tela.';
        return;
      }

      if (temEdicaoLocal && !forcar) {
        el.resultadoPlanilha.textContent =
          'A planilha tem um cardápio diferente do que está na tela, e você tem alterações que não publicou. ' +
          'Nada foi trocado: clique em "Buscar da planilha" para decidir.';
        return;
      }

      /* Trocar agora descarta o que foi digitado aqui, e o painel
         nao tem como desfazer: so volta o que estiver na planilha
         ou num JSON baixado antes. */
      if (temEdicaoLocal && !confirm(
        'Você tem alterações que não publicou. Buscar da planilha vai substituir o que está na tela por ' +
        previa.categorias + ' categoria(s) e ' + previa.itens + ' item(ns) da planilha. Continuar?'
      )) {
        el.resultadoPlanilha.textContent = 'Nada foi alterado.';
        return;
      }

      var m = P.aplicarCardapio(r);
      P.marcarPublicado();
      renderTudo();

      el.resultadoPlanilha.textContent = 'Planilha lida: ' + m.categorias + ' categoria(s), ' +
        m.itens + ' item(ns). O painel agora mostra o que está publicado.';
    }, function (erro) {
      botao.disabled = false;
      el.resultadoPlanilha.textContent = erro.message;
    });
  }

  function ligarPlanilha() {
    var P = window.CardapioPlanilha;

    if (!P) {
      el.btnEnviarCardapio.disabled = true;
      el.btnTestarPlanilha.disabled = true;
      el.btnLerPlanilha.disabled = true;
      return;
    }

    /* O painel e a unica pagina que pode escolher a URL por conta
       propria: ele precisa testar contra uma planilha de ensaio ou
       um servidor local sem mexer no planilha-site.js, que vai junto
       com o site. O cardapio do cliente, ao contrario, segue sempre
       o planilha-site.js — senao, como o painel roda na mesma
       origem, a URL guardada aqui continuaria valendo depois de
       uma implantacao nova e o dono testaria contra a versao velha
       enquanto o visitante receberia o cardapio desatualizado. */
    P.usarUrlDoPainel(true);

    function semUrl() {
      avisar('Cole a URL do Web App primeiro.', 'erro');
      el.cfgPlanilhaUrl.focus();
    }

    el.btnLerPlanilha.addEventListener('click', function () { buscarPlanilha(true); });

    /* O painel funciona com a URL so no localStorage dele, mas o
       cliente nao tem como saber a URL: a dele nunca passou por este
       painel. Ela precisa estar no arquivo planilha-site.js, que vai
       junto com o site. Sem esse aviso, o dono configura tudo, publica,
       e o cliente segue vendo o exemplo — sem nenhuma pista do porque. */
    function avisarSite() {
      var P2 = window.CardapioPlanilha;
      if (!P2 || !P2.configurada() || P2.siteConfigurado()) return;

      var alvo = el.avisoSite;
      if (!alvo) return;

      alvo.classList.remove('oculto');
      alvo.querySelector('[data-site-url]').textContent = cfgOuVazio();
    }

    function cfgOuVazio() {
      var c = Store.dados().config;
      return c.planilhaUrl || '(vazio)';
    }

    if (P.configurada() && !P.siteConfigurado()) avisarSite();

    el.btnEnviarCardapio.addEventListener('click', function () {
      if (!P.configurada()) return semUrl();

      var botao = el.btnEnviarCardapio;
      botao.disabled = true;
      el.resultadoPlanilha.textContent = 'Enviando…';

      P.enviarCardapio().then(function (r) {
        botao.disabled = false;
        el.resultadoPlanilha.textContent = r.itens + ' item(ns) enviados para a aba "Cardápio" e ' +
          P.camposConfig.length + ' configurações para a aba "Config". Confira o "Registro" em alguns segundos.';
        avisar(r.itens + ' itens enviados para a planilha ✅', 'ok');
        renderTudo();
      }, function (erro) {
        botao.disabled = false;
        el.resultadoPlanilha.textContent = erro.message;
        avisar('Falha ao enviar o cardápio.', 'erro');
      });
    });

    /* O POST vai em no-cors, entao o navegador nunca mostra o que
       o script respondeu. Este teste so prova que a chamada saiu;
       a confirmacao de verdade e ver a aba "Registro" do script.
       E por isso que o script guarda o historico la. */
    el.btnTestarPlanilha.addEventListener('click', function () {
      if (!P.configurada()) return semUrl();

      var botao = el.btnTestarPlanilha;
      botao.disabled = true;
      el.resultadoPlanilha.textContent = 'Testando…';

      P.enviarPedido({
        data: new Date().toLocaleDateString('pt-BR'),
        hora: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        pedido: 'TESTE',
        cliente: 'Teste de conexao',
        tipo: 'retirada',
        endereco: '',
        pagamento: '',
        observacoes: 'Linha criada pelo botao "Testar conexao". Pode apagar.',
        itens: [{ nome: 'Item de teste', quantidade: 1, precoUnitario: 0, observacao: '' }],
        subtotal: 0, taxa: 0, total: 0
      }).then(function () {
        botao.disabled = false;
        el.resultadoPlanilha.textContent =
          'Chamada enviada. Se nada apareceu na aba "Pedidos" em ~30s, confira se o Web App foi publicado como "Anyone" e se o token bate.';
      }, function (erro) {
        botao.disabled = false;
        el.resultadoPlanilha.textContent = erro.message;
      });
    });
  }

  /* =========================================================
     Aba: JSON
     ========================================================= */
  function ligarJson() {
    el.btnExportar.addEventListener('click', function () {
      Store.baixar('cardapio.json', Store.serializar());
      avisar('cardapio.json baixado 📄', 'ok');
    });

    el.btnCopiar.addEventListener('click', function () {
      var texto = el.textareaJson.value || Store.serializar();
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(texto).then(
          function () { avisar('JSON copiado 📋', 'ok'); },
          function () { avisar('Não foi possível copiar. Selecione o texto manualmente.', 'erro'); }
        );
      } else {
        el.textareaJson.select();
        avisar('Selecione e copie com Ctrl+C.', 'erro');
      }
    });

    el.btnImportar.addEventListener('click', function () { el.inputArquivo.click(); });

    el.inputArquivo.addEventListener('change', function () {
      var arquivo = this.files && this.files[0];
      if (!arquivo) return;

      if (!confirm('Importar "' + arquivo.name + '" vai substituir o cardápio atual. Continuar?')) {
        this.value = '';
        return;
      }

      var leitor = new FileReader();
      leitor.onload = function () {
        try {
          var resultado = Store.importarTexto(String(leitor.result));
          mostrarResultado('Cardápio importado ✅', resultado.avisos, resultado.erros);
          renderTudo();
        } catch (e) {
          mostrarResultado('Falha na importação', [e.message], []);
        }
        this.value = '';
      }.bind(this);
      leitor.readAsText(arquivo, 'utf-8');
    });

    el.btnSalvarTexto.addEventListener('click', function () {
      try {
        var resultado = Store.importarTexto(el.textareaJson.value);
        mostrarResultado('Alterações salvas ✅', resultado.avisos, resultado.erros);
        renderTudo();
      } catch (e) {
        mostrarResultado('Não foi possível salvar', [e.message], []);
      }
    });

    el.btnAtualizarJson.addEventListener('click', function () {
      el.textareaJson.value = Store.serializar();
      avisar('Visualização atualizada');
    });

    el.btnResetar.addEventListener('click', function () {
      if (!confirm('Restaurar o cardápio de exemplo? Tudo o que você editou será perdido.')) return;
      Store.resetar();
      el.textareaJson.value = Store.serializar();
      renderTudo();
      avisar('Cardápio de exemplo restaurado');
    });
  }

  function mostrarResultado(titulo, avisos, erros) {
    var html = '<p style="margin:0 0 8px;font-weight:700">' + esc(titulo) + '</p>';

    if (erros && erros.length) {
      html += '<ul class="lista-avisos erros">' +
        erros.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    }
    if (avisos && avisos.length) {
      html += '<ul class="lista-avisos" style="margin-top:8px">' +
        avisos.map(function (m) { return '<li>' + esc(m) + '</li>'; }).join('') + '</ul>';
    }
    if ((!erros || !erros.length) && (!avisos || !avisos.length)) {
      html += '<p class="dica" style="color:var(--sucesso);font-weight:600">Tudo certo, sem avisos.</p>';
    }

    el.resultadoJson.innerHTML = html;
  }

  /* =========================================================
     Modal generico
     ========================================================= */
  function abrirModal(titulo, corpo, rodape) {
    el.modalTitulo.textContent = titulo;
    el.modalCorpo.innerHTML = corpo;
    el.modalRodape.innerHTML = rodape;
    el.overlay.classList.remove('oculto');
    document.body.classList.add('travado');
  }

  function fecharModal() {
    el.overlay.classList.add('oculto');
    document.body.classList.remove('travado');
    opcoesEditando = null;
  }

  /* =========================================================
     Eventos globais
     ========================================================= */
  function ligarEventos() {
    $$now('.aba-admin').forEach(function (b) {
      b.addEventListener('click', function () { trocarAba(b.getAttribute('data-tab')); });
    });

    /* Navegacao de abas pelo teclado: <- e -> mudam de aba. */
    var listaAbas = $$now('.aba-admin');
    listaAbas.forEach(function (b, i) {
      b.addEventListener('keydown', function (ev) {
        var alvo = null;
        if (ev.key === 'ArrowRight') alvo = listaAbas[(i + 1) % listaAbas.length];
        if (ev.key === 'ArrowLeft') alvo = listaAbas[(i - 1 + listaAbas.length) % listaAbas.length];
        if (ev.key === 'Home') alvo = listaAbas[0];
        if (ev.key === 'End') alvo = listaAbas[listaAbas.length - 1];
        if (!alvo) return;
        ev.preventDefault();
        trocarAba(alvo.getAttribute('data-tab'));
        alvo.focus();
      });
    });

    el.btnNovaCategoria.addEventListener('click', novaCategoria);

    el.btnNovoBairro.addEventListener('click', novoBairro);

    el.listaBairros.addEventListener('click', function (ev) {
      var t = ev.target;

      if (t.closest('[data-novo-bairro]')) { novoBairro(); return; }

      var mover = t.closest('[data-mover-bairro]');
      if (mover) { moverBairro(mover.getAttribute('data-mover-bairro'), mover.getAttribute('data-dir')); return; }

      var ed = t.closest('[data-editar-bairro]');
      if (ed) { editarBairro(ed.getAttribute('data-editar-bairro')); return; }

      var exc = t.closest('[data-excluir-bairro]');
      if (exc) { excluirBairro(exc.getAttribute('data-excluir-bairro')); return; }
    });

    el.listaCategorias.addEventListener('click', function (ev) {
      var t = ev.target;

      var addItem = t.closest('[data-add-item]');
      if (addItem) { novoItem(addItem.getAttribute('data-add-item')); return; }

      var moverCat = t.closest('[data-mover-cat]');
      if (moverCat) { moverCategoria(moverCat.getAttribute('data-mover-cat'), moverCat.getAttribute('data-dir')); return; }

      var excCat = t.closest('[data-excluir-cat]');
      if (excCat) { excluirCategoria(excCat.getAttribute('data-excluir-cat')); return; }

      var toggle = t.closest('[data-toggle-item]');
      if (toggle) {
        var idT = toggle.getAttribute('data-toggle-item');
        Store.alterar(function (d) {
          d.categorias.forEach(function (c) {
            (c.itens || []).forEach(function (i) {
              if (i.id === idT) i.disponivel = i.disponivel === false;
            });
          });
        });
        return;
      }

      var destaque = t.closest('[data-destaque]');
      if (destaque) {
        var idD = destaque.getAttribute('data-destaque');
        Store.alterar(function (d) {
          d.categorias.forEach(function (c) {
            (c.itens || []).forEach(function (i) {
              if (i.id === idD) i.destaque = !i.destaque;
            });
          });
        });
        return;
      }

      var mover = t.closest('[data-mover-item]');
      if (mover) { moverItem(mover.getAttribute('data-mover-item'), mover.getAttribute('data-dir')); return; }

      var edOp = t.closest('[data-opcoes-item]');
      if (edOp) { editarOpcoesItem(edOp.getAttribute('data-opcoes-item')); return; }

      var ed = t.closest('[data-editar-item]');
      if (ed) { editarItem(ed.getAttribute('data-editar-item')); return; }

      var exc = t.closest('[data-excluir-item]');
      if (exc) { excluirItem(exc.getAttribute('data-excluir-item')); return; }

      if (t.closest('[data-nova-categoria]')) { novaCategoria(); return; }
    });

    /* edicao inline de nome/icone */
    el.listaCategorias.addEventListener('change', function (ev) {
      var campo = ev.target.getAttribute('data-edit-campo');
      if (!campo) return;
      editarInline(campo, ev.target.getAttribute('data-cat'), ev.target.value);
    });

    /* acoes do modal */
    el.modalRodape.addEventListener('click', function (ev) {
      var t = ev.target;

      if (t.closest('[data-fechar]')) { fecharModal(); return; }

      var salvar = t.closest('[data-salvar-item]');
      if (salvar) { salvarItem(salvar.getAttribute('data-salvar-item')); return; }

      var criar = t.closest('[data-criar-item]');
      if (criar) { criarItem(criar.getAttribute('data-criar-item')); return; }

      if (t.closest('[data-criar-cat]')) { criarCategoria(); return; }

      if (t.closest('[data-criar-bairro]')) { criarBairro(); return; }

      var salvarB = t.closest('[data-salvar-bairro]');
      if (salvarB) { salvarBairro(salvarB.getAttribute('data-salvar-bairro')); return; }

      if (t.closest('[data-add-grupo]')) {
        coletarOpcoesForm();
        opcoesEditando.grupos.push({ grupo: '', tipo: 'unico', obrigatorio: false, itens: [{ nome: '', preco: 0 }] });
        renderOpcoesAdmin();
        return;
      }

      if (t.closest('[data-salvar-opcoes]')) { salvarOpcoes(); return; }
    });

    /* acoes estruturais do editor de opcoes (corpo do modal) */
    el.modalCorpo.addEventListener('click', function (ev) {
      if (!opcoesEditando) return;
      var t = ev.target;

      var addO = t.closest('[data-add-opcao]');
      if (addO) {
        var gi = Number(addO.getAttribute('data-add-opcao'));
        coletarOpcoesForm();
        opcoesEditando.grupos[gi].itens.push({ nome: '', preco: 0 });
        renderOpcoesAdmin();
        return;
      }

      var remO = t.closest('[data-remover-opcao]');
      if (remO) {
        var par = remO.getAttribute('data-remover-opcao').split(',');
        coletarOpcoesForm();
        opcoesEditando.grupos[Number(par[0])].itens.splice(Number(par[1]), 1);
        renderOpcoesAdmin();
        return;
      }

      var remG = t.closest('[data-remover-grupo]');
      if (remG) {
        coletarOpcoesForm();
        opcoesEditando.grupos.splice(Number(remG.getAttribute('data-remover-grupo')), 1);
        renderOpcoesAdmin();
        return;
      }
    });

    /* enter no nome do item cria/salva */
    el.modalCorpo.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Enter') return;
      if (ev.target.id !== 'mNome' && ev.target.id !== 'mPreco' && ev.target.id !== 'mBairro') return;
      var acao = el.modalRodape.querySelector('[data-salvar-item], [data-criar-item], [data-criar-cat], [data-criar-bairro], [data-salvar-bairro]');
      if (acao) acao.click();
    });

    el.modalFechar.addEventListener('click', fecharModal);
    el.overlay.addEventListener('mousedown', function (ev) { if (ev.target === el.overlay) fecharModal(); });

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && !el.overlay.classList.contains('oculto')) fecharModal();
    });

    el.adminSair.addEventListener('click', function () {
      Admin.sair();
      location.reload();
    });

    /* outra aba alterou o cardapio: recarrega a lista.
       Nao recarrega por cima do que o dono esta digitando agora:
       a chave PIX so existe neste navegador ate o primeiro envio,
       entao uma aba do cardapio (que ainda nao tem o valor) salva
       o estado sem ela, o evento chega aqui e a recarga apagaria
       o campo no meio da digitacao. */
    window.addEventListener('storage', function (ev) {
      if (ev.key !== 'cardapio:data:v1' || !ev.newValue) return;

      var foco = document.activeElement;
      if (foco && foco.closest && foco.closest('#tabConfig')) return;

      Store.carregar();
      renderTudo();
      avisar('Cardápio atualizado de outra aba');
    });
  }

  /* =========================================================
     Render
     ========================================================= */
  /* Apenas as listas: seguro para rodar a cada gravacao,
     porque nao mexe nos campos que o usuario esta digitando. */
  function renderListas() {
    renderEstatisticas();
    renderCategorias();
    var cfg = Store.dados().config;
    el.adminNome.textContent = cfg.nome;
    /* mesma conta de cor do cardapio: o painel acompanha a marca
       escolhida, inclusive o tom escuro que garante contraste */
    Store.aplicarCor(cfg.corPrimaria);
  }

  /* Render completo: recarrega tambem os formularios das abas. */
  function renderTudo() {
    renderListas();
    if (abaAtual === 'config') preencherConfig();
    if (abaAtual === 'bairros') renderBairros();
    if (abaAtual === 'json') el.textareaJson.value = Store.serializar();
    renderAvisoPublicar();
  }

  /* O aviso fica entre as abas, e nao dentro da aba de
     configuracoes: quem mexe em item e preco esta na aba "Itens" e
     precisa ver o lembrete ali. Nao aparece antes do primeiro
     envio/busca, porque "sem registro do que foi publicado" nao
     significa "existe mudanca". */
  function renderAvisoPublicar() {
    var P = window.CardapioPlanilha;
    var aviso = el.avisoPublicar;

    if (!aviso || el.telaAdmin.classList.contains('oculto')) return;

    if (!P || !P.configurada()) {
      aviso.classList.add('oculto');
      aviso.textContent = '';
      return;
    }

    if (!P.pendentes()) {
      aviso.classList.add('oculto');
      aviso.textContent = '';
      return;
    }

    aviso.classList.remove('oculto');
    aviso.textContent = '';

    var texto = document.createTextNode('O cliente ainda não está vendo estas alterações — ');
    var forte = document.createElement('b');
    forte.textContent = 'publique na planilha';

    aviso.appendChild(texto);
    aviso.appendChild(forte);

    var botao = document.createElement('button');
    botao.type = 'button';
    botao.className = 'btn btn-primario btn-sm';
    botao.textContent = '⬆ Enviar cardápio agora';
    botao.addEventListener('click', function () {
      /* O aviso pode estar na aba "Itens" ou "JSON", onde o botao
         de verdade nao esta visivel. Trocar de aba e mover o foco
         para ele evita um clique que nao parece fazer nada — e o
         leitor de tela anuncia a mudanca de contexto. */
      trocarAba('config');
      if (el.btnEnviarCardapio) el.btnEnviarCardapio.focus();
    });

    aviso.appendChild(botao);
  }

  /* =========================================================
     Boot
     ========================================================= */
  function iniciar() {
    el = {
      telaLogin: $('#telaLogin'),
      telaAdmin: $('#telaAdmin'),
      loginSenha: $('#loginSenha'),
      loginEntrar: $('#loginEntrar'),
      loginErro: $('#loginErro'),
      loginDica: $('#loginDica'),
      estatisticas: $('#estatisticas'),
      listaCategorias: $('#listaCategorias'),
      btnNovaCategoria: $('#btnNovaCategoria'),
      adminSair: $('#adminSair'),
      adminNome: $('#adminNome'),
      toasts: $('#toasts'),
      overlay: $('#overlay'),
      modalTitulo: $('#modalTitulo'),
      modalCorpo: $('#modalCorpo'),
      modalRodape: $('#modalRodape'),
      modalFechar: $('#modalFechar'),
      tabItens: $('#tabItens'),
      tabConfig: $('#tabConfig'),
      tabBairros: $('#tabBairros'),
      tabJson: $('#tabJson'),
      textareaJson: $('#textareaJson'),
      resultadoJson: $('#resultadoJson'),
      inputArquivo: $('#inputArquivo'),
      btnExportar: $('#btnExportar'),
      btnImportar: $('#btnImportar'),
      btnCopiar: $('#btnCopiar'),
      btnSalvarTexto: $('#btnSalvarTexto'),
      btnAtualizarJson: $('#btnAtualizarJson'),
      btnResetar: $('#btnResetar'),
      btnTrocarSenha: $('#btnTrocarSenha'),
      cfgNome: $('#cfgNome'),
      cfgWhatsapp: $('#cfgWhatsapp'),
      cfgDescricao: $('#cfgDescricao'),
      cfgCor: $('#cfgCor'),
      cfgTaxa: $('#cfgTaxa'),
      cfgMinimo: $('#cfgMinimo'),
      cfgSimbolo: $('#cfgSimbolo'),
      cfgAbertura: $('#cfgAbertura'),
      cfgFechado: $('#cfgFechado'),
      cfgAberto: $('#cfgAberto'),
      cfgPedirNome: $('#cfgPedirNome'),
      cfgPedirEntrega: $('#cfgPedirEntrega'),
      cfgEndereco: $('#cfgEndereco'),
      cfgInstagram: $('#cfgInstagram'),
      cfgChavePix: $('#cfgChavePix'),
      cfgPixCidade: $('#cfgPixCidade'),
      cfgPagamento: $('#cfgPagamento'),
      cfgTempoEntrega: $('#cfgTempoEntrega'),
      cfgTempoRetirada: $('#cfgTempoRetirada'),
      cfgSenha: $('#cfgSenha'),
      listaBairros: $('#listaBairros'),
      btnNovoBairro: $('#btnNovoBairro'),
      cfgPlanilhaUrl: $('#cfgPlanilhaUrl'),
      cfgPlanilhaToken: $('#cfgPlanilhaToken'),
      btnEnviarCardapio: $('#btnEnviarCardapio'),
      btnLerPlanilha: $('#btnLerPlanilha'),
      btnTestarPlanilha: $('#btnTestarPlanilha'),
      resultadoPlanilha: $('#resultadoPlanilha'),
      avisoPublicar: $('#avisoPublicar'),
      avisoSite: $('#avisoSite')
    };

    if (Admin.temSessao()) {
      el.telaLogin.classList.add('oculto');
      el.telaAdmin.classList.remove('oculto');
    } else {
      montarLogin();
    }

    Store.iniciar();
    ligarEventos();
    ligarConfig();
    ligarJson();
    Store.assinar(function () {
      if (!el.telaAdmin.classList.contains('oculto')) renderTudo();
    });
    renderTudo();

    /* A planilha e a fonte da verdade, entao o painel abre mostrando
       o que esta publicado la. A leitura espera o painel existir
       (e so substitui o que ja esta na tela quando nao ha edicao
       local sem publicar) — ver buscar(), em ligarPlanilha.

       So nao acontece antes do login: quem esta na tela de senha
       nao tem por que ver o cardapio do dono nem disparar uma
       chamada ao Google. */
    if (Admin.temSessao()) {
      var P = window.CardapioPlanilha;
      if (P && P.configurada()) buscarPlanilha(false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
