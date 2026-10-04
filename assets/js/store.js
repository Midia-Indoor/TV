/* =============================================================
   store.js  —  estado, validacao e persistencia do cardapio
   Sem dependencias. Funciona em file:// e em http(s).
   ============================================================= */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'cardapio:data:v1';
  var ADMIN_KEY = 'cardapio:admin';
  var ADMIN_SESSAO_KEY = 'cardapio:admin:sessao';
  var ADMIN_SENHA_PADRAO = 'admin';

  /* ---------------------------------------------------------
     1. Persistencia (localStorage com fallback em memoria)
     --------------------------------------------------------- */
  var memoria = {};

  var storage = {
    get: function (key) {
      try {
        return global.localStorage.getItem(key);
      } catch (e) {
        return Object.prototype.hasOwnProperty.call(memoria, key) ? memoria[key] : null;
      }
    },
    set: function (key, value) {
      try {
        global.localStorage.setItem(key, value);
        return true;
      } catch (e) {
        memoria[key] = value;
        return false;
      }
    },
    remove: function (key) {
      try {
        global.localStorage.removeItem(key);
      } catch (e) {
        /* ignora */
      }
      delete memoria[key];
    }
  };

  /* ---------------------------------------------------------
     2. Utilitarios
     --------------------------------------------------------- */
  function uid(prefixo) {
    var base = (prefixo || 'id') + '-' + Date.now().toString(36);
    return base + '-' + Math.random().toString(36).slice(2, 7);
  }

  function slug(texto) {
    return String(texto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'item';
  }

  /* Leitor tolerante de preco/valor.
     Aceita: 12.5 (numero) | "12,50" | "12.50" | "R$ 52,90" | "R$ 1.234,56"
     Devolve o valorpadrao quando nao da para interpretar. */
  function numero(valor, padrao) {
    var base = (padrao === undefined) ? 0 : padrao;
    if (valor === '' || valor === null || valor === undefined) return base;
    if (typeof valor === 'number') return isFinite(valor) ? valor : base;

    var s = String(valor).trim();
    var negativo = /^-/.test(s);
    var limpo = s.replace(/[^\d.,]/g, ''); /* fora R$, letras e espacos */
    if (!limpo) return base;

    var partes = limpo.split(/[.,]/);
    var n;

    if (partes.length === 1) {
      n = parseInt(partes[0], 10);
    } else if (partes.length === 2 && partes[1].length === 3) {
      /* so um separador e tres digitos depois: "1.234" e 1.234
         (leitura de centavo, que e o caso comum em cardapio) */
      n = parseInt(partes[0], 10) + parseFloat('0.' + partes[1]);
    } else {
      /* com varios separadores, o ULTIMO e o das casas decimais
         e os anteriores sao agrupamento de milhar:
         "1.234,56" e "1,234.56" viram 1234.56 */
      var centavos = partes.pop();
      n = parseInt(partes.join('') || '0', 10) + parseFloat('0.' + centavos);
    }

    if (!isFinite(n)) return base;
    return negativo ? -n : n;
  }

  function texto(valor, padrao) {
    if (typeof valor === 'string') return valor.trim();
    if (valor === null || valor === undefined) return padrao || '';
    return String(valor).trim();
  }

  /* Leitor tolerante de booleano, para campos que o dono digita na
     planilha ("Sim"/"Nao") ou escreve no JSON (true/false). Vazio usa
     o padrao. */
  var NEGADOS = ['nao', 'n', 'f', 'false', '0', 'off'];
  function verdadeiro(valor, padrao) {
    if (valor === true) return true;
    if (valor === false) return false;
    var s = texto(valor, '').toLowerCase();
    if (!s) return padrao;
    return NEGADOS.indexOf(s) < 0;
  }

  function telefoneBruto(valor) {
    // Mantem apenas digitos; codigo do pais sem o "+".
    return String(valor || '').replace(/\D/g, '');
  }

  /* URL do Apps Script. Precisa ser https e de um dominio do Google,
     senao o navegador bloqueia a chamada de qualquer jeito. */
  function planilhaUrl(valor) {
    var url = texto(valor, '');
    if (!url) return '';
    if (url.charAt(0) === '/') url = 'https:' + url;
    if (!/^https:\/\/script\.google(usercontent)?\.com\//i.test(url)) return '';
    return url;
  }

  function slugUnico(base, usados) {
    var candidato = base;
    var i = 2;
    while (usados[candidato]) {
      candidato = base + '-' + i;
      i++;
    }
    usados[candidato] = true;
    return candidato;
  }

  function clone(valor) {
    return JSON.parse(JSON.stringify(valor));
  }

  /* ---------------------------------------------------------
     2b. Derivados da cor da marca
     ---------------------------------------------------------
     O dono escolhe uma cor, e o app calcula sozinho os tom
     derivados. O escuro existe porque branco sobre a cor pura
     nem sempre passa em 4.5:1 (WCAG AA) — um amarelo claro, por
     exemplo, deixaria o texto do botão ilegível. */
  function hexParaRgb(hex) {
    var h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }

  function luminancia(r, g, b) {
    function canal(v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  }

  function contrasteComBranco(r, g, b) {
    return 1.05 / (luminancia(r, g, b) + 0.05);
  }

  /* Versao translucida, para fundos suaves (selos, foco). */
  function corClara(hex) {
    var c = hexParaRgb(hex);
    return 'rgba(' + c.r + ', ' + c.g + ', ' + c.b + ', .12)';
  }

  /* Escurece em passos ate o branco sobre a cor passar em 4.5:1. */
  function corEscura(hex) {
    var c = hexParaRgb(hex);
    var fator = 0.78;
    for (var i = 0; i < 14; i++) {
      var r = Math.round(c.r * fator);
      var g = Math.round(c.g * fator);
      var b = Math.round(c.b * fator);
      if (contrasteComBranco(r, g, b) >= 4.5) return 'rgb(' + r + ', ' + g + ', ' + b + ')';
      fator -= 0.05;
      if (fator <= 0.1) break;
    }
    return 'rgb(' + Math.round(c.r * 0.35) + ', ' + Math.round(c.g * 0.35) + ', ' + Math.round(c.b * 0.35) + ')';
  }

  /* Aplica as tres variaveis de cor da marca na pagina. */
  function aplicarCor(hex) {
    var raiz = document.documentElement;
    raiz.style.setProperty('--primaria', hex);
    raiz.style.setProperty('--primaria-escura', corEscura(hex));
    raiz.style.setProperty('--primaria-clara', corClara(hex));
  }

  /* ---------------------------------------------------------
     3. Cardapio padrao (seed embutido)
     --------------------------------------------------------- */
  var SEED = {
    config: {
      nome: 'Lanchonete do Zé',
      descricao: 'Lanches, porções e bebidas geladas',
      whatsapp: '5511999999999',
      mensagemAbertura: 'Olá! Gostaria de fazer um pedido no cardápio digital:',
      corPrimaria: '#8B1A1A',
      simboloMoeda: 'R$',
      taxaEntrega: 0,
      pedidoMinimo: 0,
      aberto: true,
      mensagemFechado: 'Estamos fechados no momento. Volte em breve!',
      pedirNome: true,
      pedirEntrega: true,
      /* Campos de loja acrescentados depois. Vazio = o app nao mostra
         aquele pedaco (ex.: formasPagamento vazio vira campo de texto
         livre, em vez de lista). */
      formasPagamento: 'Dinheiro, Pix, Cartao',
      tempoEntrega: '',
      tempoRetirada: '',
      enderecoLoja: '',
      instagram: '',
      /* Chave PIX e cidade do recebedor, para o QR do checkout. */
      chavePix: '',
      pixCidade: '',
      planilhaUrl: '',
      planilhaToken: ''
    },
    /* Taxas de entrega por bairro. Lista vazia = o app usa a taxa
       unica de config.taxaEntrega. Quando ha bairros, o cliente
       escolhe no checkout e a taxa do bairro vence. */
    bairros: [
      { nome: 'Centro', taxa: 5, tempo: '30-40 min', ativo: true }
    ],
    categorias: [
      {
        id: 'lanches',
        nome: 'Lanches',
        icone: '\u{1F354}',
        itens: [
          { nome: 'X-Burguer', descricao: 'Pão brioche, hambúrguer 150g, queijo cheddar, salada e molho da casa', preco: 18.9, destaque: true,
            /* Exemplo de opcoes no SEED: o dono configura pela planilha,
               mas um cardapio novo ja nasce com um exemplo funcional. */
            opcoes: [
              { grupo: 'Tamanho', tipo: 'unico', obrigatorio: true, itens: [
                { nome: 'Normal', preco: 0 },
                { nome: 'Duplo', preco: 8 }
              ] },
              { grupo: 'Adicionais', tipo: 'multiplo', obrigatorio: false, itens: [
                { nome: 'Bacon', preco: 4 },
                { nome: 'Cheddar extra', preco: 3 },
                { nome: 'Ovo', preco: 2 }
              ] }
            ] },
          { nome: 'X-Burguer Duplo', descricao: 'Dois hambúrgueres, queijo, bacon, cebola caramelizada e molho especial', preco: 27.9, destaque: true },
          { nome: 'X-Salada', descricao: 'Hambúrguer, queijo, alface, tomate, pepino, cebola e maionese da casa', preco: 21.9 },
          { nome: 'X-Frango', descricao: 'Filé de frango empanado, queijo, salada e maionese verde', preco: 20.9 },
          { nome: 'Batata Frita Simples', descricao: 'Porção individual de batata frita crocante com sal', preco: 9.9 }
        ]
      },
      {
        id: 'porcoes',
        nome: 'Porções',
        icone: '\u{1F35F}',
        itens: [
          { nome: 'Batata Cheddar & Bacon', descricao: 'Batata frita coberta com cheddar cremoso e bacon em cubos', preco: 24.9, destaque: true },
          { nome: 'Calabresa Acebolada', descricao: 'Calabresa fatiada na chapa com cebola e vinagrete', preco: 26.9 },
          { nome: 'Frango a Passarinho', descricao: 'Frango frito com alho e óleo, serve de 2 a 3 pessoas', preco: 45.9, destaque: true },
          { nome: 'Isca de Peixe', descricao: 'Tiras de tilápia empanadas com molho tartaro e limão', preco: 39.9 }
        ]
      },
      {
        id: 'combos',
        nome: 'Combos',
        icone: '\u{1F37F}',
        itens: [
          { nome: 'Combo do Zão', descricao: 'X-Burguer, batata frita e refrigerante lata', preco: 27.9, destaque: true },
          { nome: 'Combo Duplo', descricao: 'X-Burguer Duplo, batata média e refrigerante lata', preco: 36.9 }
        ]
      },
      {
        id: 'bebidas',
        nome: 'Bebidas',
        icone: '\u{1F964}',
        itens: [
          { nome: 'Refrigerante Lata', descricao: 'Coca-Cola, Guaraná, Fanta ou Sprite. Gelada.', preco: 5.5,
            opcoes: [
              { grupo: 'Sabor', tipo: 'unico', obrigatorio: true, itens: [
                { nome: 'Coca-Cola', preco: 0 },
                { nome: 'Guaraná', preco: 0 },
                { nome: 'Fanta Laranja', preco: 0 },
                { nome: 'Sprite', preco: 0 }
              ] }
            ] },
          { nome: 'Suco Natural 400ml', descricao: 'Laranja, maracujá, limão ou maracujá com limão', preco: 8 },
          { nome: 'Água Mineral 500ml', descricao: 'Com ou sem gás', preco: 3 },
          { nome: 'Sorvete de Chocolate', descricao: 'Bola de sorvete cremoso com calda de chocolate', preco: 6, disponivel: false }
        ]
      }
    ]
  };

  /* ---------------------------------------------------------
     4. Normalizacao / validacao
     Garante que o objeto sempre tenha a forma esperada,
     mesmo que o JSON veio "bagunçado" de outra fonte.
     --------------------------------------------------------- */
  /* Opcoes de um item: grupos de escolha.
     Formato final:
       { grupo, tipo: 'unico'|'multiplo', obrigatorio, itens: [{nome, preco}] }
     Aceita o formato que veio da planilha e o do JSON. Grupo sem
     nome ou sem nenhuma opcao valida e descartado. */
  function normalizarOpcoes(bruto) {
    var grupos = [];

    (Array.isArray(bruto) ? bruto : []).forEach(function (g) {
      if (!g || typeof g !== 'object') return;

      var nomeGrupo = texto(g.grupo !== undefined ? g.grupo : g.nome, '');
      if (!nomeGrupo) return;

      var tipoBruto = texto(g.tipo, '').toLowerCase();
      var tipo = (tipoBruto === 'multiplo' || tipoBruto === 'múltiplo' ||
        tipoBruto === 'multiple' || tipoBruto === 'checkbox' ||
        tipoBruto === 'varios') ? 'multiplo' : 'unico';

      var opcoes = [];
      var lista = Array.isArray(g.itens) ? g.itens : (Array.isArray(g.opcoes) ? g.opcoes : []);

      lista.forEach(function (o) {
        if (!o || typeof o !== 'object') return;
        var nomeOpcao = texto(o.nome !== undefined ? o.nome : o.opcao, '');
        if (!nomeOpcao) return;
        opcoes.push({
          nome: nomeOpcao,
          preco: Math.max(0, numero(o.preco, 0))
        });
      });

      if (!opcoes.length) return;

      grupos.push({
        grupo: nomeGrupo,
        tipo: tipo,
        obrigatorio: verdadeiro(g.obrigatorio, false),
        itens: opcoes
      });
    });

    return grupos;
  }

  function normalizar(entrada) {
    var avisos = [];
    var erros = [];
    var origem = entrada && typeof entrada === 'object' ? entrada : {};

    if (!Array.isArray(origem.categorias)) {
      avisos.push('Nenhuma lista de categorias encontrada. O cardapio foi criado vazio.');
    }

    var cfgOrigem = origem.config && typeof origem.config === 'object' ? origem.config : {};
    var config = {
      nome: texto(cfgOrigem.nome, SEED.config.nome),
      descricao: texto(cfgOrigem.descricao, ''),
      whatsapp: telefoneBruto(cfgOrigem.whatsapp),
      mensagemAbertura: texto(cfgOrigem.mensagemAbertura, SEED.config.mensagemAbertura),
      corPrimaria: /^#[0-9a-fA-F]{6}$/.test(cfgOrigem.corPrimaria) ? cfgOrigem.corPrimaria : SEED.config.corPrimaria,
      simboloMoeda: texto(cfgOrigem.simboloMoeda, 'R$'),
      taxaEntrega: Math.max(0, numero(cfgOrigem.taxaEntrega, 0)),
      pedidoMinimo: Math.max(0, numero(cfgOrigem.pedidoMinimo, 0)),
      aberto: cfgOrigem.aberto !== false,
      mensagemFechado: texto(cfgOrigem.mensagemFechado, SEED.config.mensagemFechado),
      pedirNome: cfgOrigem.pedirNome !== false,
      pedirEntrega: cfgOrigem.pedirEntrega !== false,
      formasPagamento: texto(cfgOrigem.formasPagamento, ''),
      tempoEntrega: texto(cfgOrigem.tempoEntrega, ''),
      tempoRetirada: texto(cfgOrigem.tempoRetirada, ''),
      enderecoLoja: texto(cfgOrigem.enderecoLoja, ''),
      instagram: texto(cfgOrigem.instagram, ''),
      chavePix: texto(cfgOrigem.chavePix, ''),
      pixCidade: texto(cfgOrigem.pixCidade, ''),
      planilhaUrl: planilhaUrl(cfgOrigem.planilhaUrl),
      planilhaToken: texto(cfgOrigem.planilhaToken, '')
    };

    if (!config.whatsapp) {
      avisos.push('Numero de WhatsApp nao informado. Os pedidos nao poderao ser enviados.');
    }

    var categorias = [];
    var idsCategoria = {};
    /* os ids de item sao unicos no cardapio inteiro: o carrinho
       guarda apenas o id, entao nomes iguais em categorias
       diferentes precisam virar ids diferentes. */
    var idsItem = {};

    (Array.isArray(origem.categorias) ? origem.categorias : []).forEach(function (cat, i) {
      if (!cat || typeof cat !== 'object') return;

      var id = texto(cat.id, '') || slug(texto(cat.nome, 'categoria-' + (i + 1)));
      id = slugUnico(id, idsCategoria);
      idsCategoria[id] = true;

      var itens = [];

      (Array.isArray(cat.itens) ? cat.itens : []).forEach(function (item, j) {
        if (!item || typeof item !== 'object') return;

        var nome = texto(item.nome, '');
        if (!nome) {
          avisos.push('Item "' + (texto(cat.nome, 'categoria')) + '" #' + (j + 1) + ' sem nome foi ignorado.');
          return;
        }

        var itemId = texto(item.id, '') || slug(nome);
        itemId = slugUnico(itemId, idsItem);
        idsItem[itemId] = true;

        var preco = numero(item.preco, NaN);
        if (!isFinite(preco) || preco < 0) {
          erros.push('Item "' + nome + '" tem preco invalido. Use 0 enquanto o valor nao for definido.');
          preco = 0;
        }

        var itemFinal = {
          id: itemId,
          nome: nome,
          descricao: texto(item.descricao, ''),
          preco: Math.round(preco * 100) / 100,
          categoria: id,
          imagem: texto(item.imagem, ''),
          destaque: item.destaque === true,
          disponivel: item.disponivel !== false
        };

        /* So guarda a chave quando ha opcoes: mantem o JSON enxuto e
           evita mexer no formato dos itens sem opcoes. */
        var opcoes = normalizarOpcoes(item.opcoes);
        if (opcoes.length) itemFinal.opcoes = opcoes;

        itens.push(itemFinal);
      });

      categorias.push({
        id: id,
        nome: texto(cat.nome, id),
        icone: texto(cat.icone, '\u{1F37D}'),
        itens: itens
      });
    });

    /* Bairros de entrega: nome + taxa. Aceita tambem o campo
       "bairro" no lugar de "nome", para quem montar o JSON a mao. */
    var bairros = [];
    var idsBairro = {};
    (Array.isArray(origem.bairros) ? origem.bairros : []).forEach(function (b) {
      if (!b || typeof b !== 'object') return;

      var nomeBairro = texto(b.nome !== undefined ? b.nome : b.bairro, '');
      if (!nomeBairro) return;

      var idB = texto(b.id, '') || slug(nomeBairro);
      idB = slugUnico(idB, idsBairro);
      idsBairro[idB] = true;

      bairros.push({
        id: idB,
        nome: nomeBairro,
        taxa: Math.max(0, numero(b.taxa, 0)),
        tempo: texto(b.tempo, ''),
        ativo: b.ativo !== false
      });
    });

    /* Itens soltos no nivel raiz (formato aceito por alguns sistemas) */
    if (Array.isArray(origem.itens) && origem.itens.length) {
      var porId = {};
      categorias.forEach(function (c) { porId[c.id] = c; });

      origem.itens.forEach(function (item) {
        if (!item || typeof item !== 'object') return;

        var desejada = texto(item.categoria, '');
        var alvo = porId[desejada];
        if (!alvo) {
          if (!categorias.length) return;
          alvo = categorias[0];
          avisos.push('Item "' + texto(item.nome, '?') + '" nao indicava uma categoria valida; foi para "' + categorias[0].nome + '".');
        }

        var copia = clone(item);
        copia.categoria = alvo.id;
        alvo.itens.push(copia);
      });
    }

    /* Reexecuta para converter os itens recem-anexados no formato final. */
    if (Array.isArray(origem.itens) && origem.itens.length) {
      var segunda = normalizar({ config: config, categorias: categorias, bairros: bairros });
      avisos = avisos.concat(segunda.avisos);
      erros = erros.concat(segunda.erros);
      return { data: segunda.data, avisos: avisos, erros: erros };
    }

    return { data: { config: config, categorias: categorias, bairros: bairros }, avisos: avisos, erros: erros };
  }

  function validar(entrada) {
    return normalizar(entrada);
  }

  /* ---------------------------------------------------------
     5. Estado em memoria + assinantes
     --------------------------------------------------------- */
  var estado = null;
  var assinantes = [];

  function notificar() {
    assinantes.forEach(function (fn) {
      try {
        fn(estado);
      } catch (e) {
        console.error('[cardapio] assinante falhou', e);
      }
    });
  }

  function salvar() {
    var ok = storage.set(STORAGE_KEY, JSON.stringify(estado));
    if (!ok) {
      console.warn('[cardapio] localStorage indisponivel: alteracoes valem apenas nesta aba.');
    }
    notificar();
    return estado;
  }

  function seedNormalizado() {
    return normalizar(SEED).data;
  }

  function carregar() {
    var bruto = storage.get(STORAGE_KEY);

    if (bruto) {
      try {
        var parsed = JSON.parse(bruto);
        if (parsed && typeof parsed === 'object') {
          estado = normalizar(parsed).data;
          return estado;
        }
      } catch (e) {
        console.warn('[cardapio] JSON salvo estava corrompido, recarregando exemplo.', e);
      }
    }

    estado = seedNormalizado();
    storage.set(STORAGE_KEY, JSON.stringify(estado));
    return estado;
  }

  /* ---------------------------------------------------------
     5b. Inicializacao
     Ordem de prioridade do cardapio:
       1) o que a planilha do Google devolver (a fonte da verdade)
       2) o que foi salvo neste navegador, de uma visita anterior
       3) o exemplo embutido neste arquivo

     O passo 2/3 e sincrono, para a pagina aparecer sem
     esperar a rede. Quem traz a planilha e o planilha.js, depois
     que o app ja pintou — se ela responder, os assinantes sao
     avisados e a tela se atualiza sozinha.

     O cardapio.json NAO entra mais nesta lista. Ele continua
     existindo como backup para o dono baixar, mas a pagina nao
     o busca: cardapio publico sao dois lugares para o mesmo dado
     divergeirem, e o cliente nunca veria a edicao do painel.
     --------------------------------------------------------- */
  function iniciar() {
    carregar();
    return Promise.resolve(estado);
  }

  function dados() {
    if (!estado) carregar();
    return estado;
  }

  function alterar(mutador) {
    var atual = dados();
    var rascunho = clone(atual);
    var retorno = mutador(rascunho);
    var resultado = normalizar(retorno && retorno.config ? retorno : rascunho);
    estado = resultado.data;
    salvar();
    return resultado;
  }

  function assinar(fn) {
    assinantes.push(fn);
    return function () {
      var i = assinantes.indexOf(fn);
      if (i >= 0) assinantes.splice(i, 1);
    };
  }

  /* ---------------------------------------------------------
     6. Exportar / importar / resetar
     --------------------------------------------------------- */
  function serializar() {
    return JSON.stringify(dados(), null, 2);
  }

  function importarTexto(textoJson) {
    var parsed;
    try {
      parsed = JSON.parse(textoJson);
    } catch (e) {
      /* O erro nativo do JSON.parse ja diz onde parou ("at position 42"
         ou "line 3 column 5"). Repassar isso ajuda a achar o trecho
         quebrado sem precisar contar caractere na mao. */
      var detalhe = String(e && e.message || '');
      detalhe = detalhe.replace(/^JSON\.parse:\s*/i, '').replace(/\s*in JSON at position \d+.*$/i, '');
      throw new Error('Arquivo invalido: conteudo nao e um JSON valido' +
        (detalhe ? ' (' + detalhe + ')' : '.'));
    }
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.categorias)) {
      throw new Error('Arquivo invalido: faltou a lista de "categorias".');
    }
    var resultado = normalizar(parsed);
    estado = resultado.data;
    storage.set(STORAGE_KEY, JSON.stringify(estado));
    notificar();
    return resultado;
  }

  function resetar() {
    estado = seedNormalizado();
    storage.set(STORAGE_KEY, JSON.stringify(estado));
    notificar();
    return estado;
  }

  function baixar(nomeArquivo, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo || 'application/json;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo || 'cardapio.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  /* ---------------------------------------------------------
     7. Admin (login simples, do lado do cliente)
     --------------------------------------------------------- */
  function hashSimples(senha) {
    /* SHA-256 quando disponivel (https/localhost); senao, hash proprio. */
    if (global.crypto && global.crypto.subtle && global.TextEncoder) {
      try {
        return global.crypto.subtle
          .digest('SHA-256', new TextEncoder().encode(senha))
          .then(function (buf) {
            return Array.prototype.map
              .call(new Uint8Array(buf), function (b) { return b.toString(16).padStart(2, '0'); })
              .join('');
          });
      } catch (e) {
        /* cai no hash proprio */
      }
    }
    return Promise.resolve('bruto:' + senha);
  }

  function definirSenha(senha) {
    /* rejeita a Promise (em vez de lancar) para o tratamento de
       erro ficar igual ao das outras funcoes assincronas. */
    if (!senha || senha.length < 3) {
      return Promise.reject(new Error('A senha precisa ter pelo menos 3 caracteres.'));
    }
    return hashSimples(senha).then(function (h) {
      storage.set(ADMIN_KEY, h);
      return true;
    });
  }

  function senhaDefinida() {
    return !!storage.get(ADMIN_KEY);
  }

  function conferirSenha(senha) {
    var salvo = storage.get(ADMIN_KEY);

    /* Sem senha cadastrada, so a senha padrao entra.
       (Se qualquer senha fosse aceita no primeiro acesso,
       quem achasse o link do painel viraria o dono.) */
    if (!salvo) {
      return hashSimples(ADMIN_SENHA_PADRAO).then(function (padrao) {
        if (senha !== ADMIN_SENHA_PADRAO) return false;
        storage.set(ADMIN_KEY, padrao);
        storage.set(ADMIN_SESSAO_KEY, '1');
        return true;
      });
    }

    return hashSimples(senha).then(function (h) {
      if (h === salvo) {
        storage.set(ADMIN_SESSAO_KEY, '1');
        return true;
      }
      return false;
    });
  }

  /* A senha em uso ainda e a padrao? (aviso para trocar) */
  function senhaEhPadrao() {
    var salvo = storage.get(ADMIN_KEY);
    if (!salvo) return true;
    return hashSimples(ADMIN_SENHA_PADRAO).then(function (padrao) { return padrao === salvo; });
  }

  function temSessao() {
    return storage.get(ADMIN_SESSAO_KEY) === '1';
  }

  function sair() {
    storage.remove(ADMIN_SESSAO_KEY);
  }

  var ADMIN_PADRAO = ADMIN_SENHA_PADRAO;

  /* ---------------------------------------------------------
     8. API publica
     --------------------------------------------------------- */
  global.CardapioStore = {
    /* dados */
    iniciar: iniciar,
    carregar: carregar,
    dados: dados,
    alterar: alterar,
    assinar: assinar,
    salvar: salvar,
    /* json */
    serializar: serializar,
    importarTexto: importarTexto,
    baixar: baixar,
    resetar: resetar,
    /* validacao */
    normalizar: normalizar,
    validar: validar,
    /* utilitarios */
    uid: uid,
    slug: slug,
    clone: clone,
    corEscura: corEscura,
    corClara: corClara,
    contrasteComBranco: contrasteComBranco,
    aplicarCor: aplicarCor,
    /* admin */
    admin: {
      senhaPadrao: ADMIN_PADRAO,
      senhaDefinida: senhaDefinida,
      senhaEhPadrao: senhaEhPadrao,
      definirSenha: definirSenha,
      conferirSenha: conferirSenha,
      temSessao: temSessao,
      sair: sair
    }
  };
})(window);
