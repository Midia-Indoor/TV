/* =========================================================
   Cardapio digital - integracao com Google Sheets
   =========================================================
   Fala com um Apps Script (Web App) que appenda linhas na
   planilha. Sem chave de API, sem custo, sem SDK do Google.

   Por que fetch e nao <form>?
   ---------------------
   Um POST comum de navegador para script.google.com dispara
   preflight (OPTIONS) por causa do Content-Type, e a resposta
   do Apps Script vem sem cabecalhos CORS. O resultado seria
   "CORS policy: No 'Access-Control-Allow-Origin' header".

   A saida e POST com mode: 'no-cors': o navegador NAO faz
   preflight e NAO bloqueia a resposta, mas tambem nao deixa
   ler o que o servidor devolveu. Por isso o codigo nao pode
   depender do retorno para dizer se deu certo - ele so
   detecta falha de rede. Quem confirma a gravacao e a propria
   planilha (e a aba "Registro", que o script preenche).
   ========================================================= */
(function () {
  'use strict';

  var CHAVE_LOCAL = 'cardapio:planilha:ultimo';

  var CABECALHO_PEDIDOS = [
    'Data', 'Hora', 'Pedido', 'Cliente', 'Tipo', 'Endereco', 'Pagamento',
    'Qtd itens', 'Subtotal', 'Taxa entrega', 'TOTAL', 'Observacoes',
    'Itens do pedido', 'Obs por item',
    /* Colunas acrescentadas depois da primeira versao. Vao no FIM de
       proposito: assim uma planilha ja existente nao desalinha as
       colunas antigas. O script estende o cabecalho sozinho. */
    'Bairro',
    /* Status do pedido, editado pelo dono na planilha (Novo, Em
       preparo, Saiu para entrega, Concluido, Cancelado). O cliente
       acompanha pela pagina Acompanhar. */
    'Status'
  ];

  var CABECALHO_ITENS = [
    'Data', 'Hora', 'Pedido', 'Cliente', 'Item', 'Quantidade',
    'Preco unitario', 'Total do item', 'Observacao'
  ];

  var CABECALHO_CARDAPIO = [
    'Categoria', 'Icone', 'Item', 'Preco', 'Destaque', 'Disponivel',
    'Descricao', 'Link da imagem', 'Atualizado'
  ];

  var CABECALHO_CONFIG = ['Chave', 'Valor'];

  /* Taxas de entrega por bairro. Uma linha por bairro; a ordem das
     linhas e a ordem em que o cliente ve a lista no checkout. */
  var CABECALHO_BAIRROS = ['Bairro', 'Taxa', 'Tempo', 'Ativo'];

  /* Opcoes de item: uma linha por opcao. O grupo e identificado pelo
     nome do item + nome do grupo; "Tipo" diz se o cliente escolhe uma
     (unico) ou varias (multiplo), e "Obrigatorio" exige a escolha. */
  var CABECALHO_OPCOES = ['Item', 'Grupo', 'Tipo', 'Opcao', 'Preco', 'Obrigatorio'];

  /* Mesma lista do planilha.gs. planilhaUrl e planilhaToken ficam de
     fora: a URL e o que diz onde ler, entao pedir isso a planilha
     seria circular. */
  var CAMPOS_CONFIG = [
    'nome', 'descricao', 'whatsapp', 'mensagemAbertura', 'corPrimaria',
    'simboloMoeda', 'taxaEntrega', 'pedidoMinimo', 'aberto',
    'mensagemFechado', 'pedirNome', 'pedirEntrega',
    'formasPagamento', 'tempoEntrega', 'tempoRetirada', 'enderecoLoja', 'instagram',
    'chavePix', 'pixCidade'
  ];

  /* ---------------------------------------------------------
     1. Utilidades
     --------------------------------------------------------- */
  /* O URL da planilha nao cabe na planilha — seria circular: preciso
     dele para ler a planilha. E nao cabe no localStorage, que e por
     navegador: o cliente chega no site pela primeira vez e nunca
     preencheu nada.

     Entao o endereco viaja no proprio site, em planilha-site.js.

     Quem manda no cartapio do cliente e esse arquivo. O que estiver
     guardado no navegador NAO vale, e a razao e pratica: o painel roda
     no mesmo site, no mesmo navegador e no mesmo localStorage. Como
     o dono preenche a URL uma vez no painel, ela fica gravada ali
     para sempre — e quando ele cria uma implantacao nova e atualiza
     o planilha-site.js, o proprio navegador dele continua lendo a
     implantacao velha. Foi assim que um token novo passou por
     funcionando: o dono testava contra a implantacao sem token, e
     todo visitante novo recebia "Token invalido".

     O painel e a excecao de proposito: ele precisa testar contra uma
     URL diferente (uma planilha de ensaio, um servidor local) sem
     mexer no arquivo que vai junto com o site. Ele pede isso com
     usarUrlDoPainel(), e ai o localStorage manda. */
  var usarUrlDoPainel = false;

  function cfg() {
    var base = (window.CardapioStore && window.CardapioStore.dados().config) || {};
    var doSite = (window.CardapioSite && typeof window.CardapioSite === 'object') ? window.CardapioSite : {};

    if (usarUrlDoPainel) {
      return {
        planilhaUrl: base.planilhaUrl || doSite.planilhaUrl || '',
        planilhaToken: base.planilhaToken || doSite.planilhaToken || ''
      };
    }

    /* O token do navegador nao vai para a leitura publica. Ele nao
       esta no planilha-site.js de proposito — quem abrir o codigo da
       pagina leria junto — e a leitura nao exige token mesmo. */
    return {
      planilhaUrl: doSite.planilhaUrl || base.planilhaUrl || '',
      planilhaToken: doSite.planilhaToken || ''
    };
  }

  function configurada() {
    return !!cfg().planilhaUrl;
  }

  /* O cliente vai conseguir ler a planilha? O painel usa isto para
     avisar que o arquivo planilha-site.js precisa ser preenchido e
     publicado — sem isso o cardapio do cliente fica no exemplo. */
  function siteConfigurado() {
    var s = (window.CardapioSite && typeof window.CardapioSite === 'object') ? window.CardapioSite : {};
    return !!(String(s.planilhaUrl || '').trim());
  }

  /* A URL que a gente publica no painel é a do POST:
     https://script.google.com/macros/s/ID/exec

     Mas dá para copiar direto da aba "Registro" a linha que o
     GET do cardápio deixou no histórico, que já vem com
     "?callback=cardapioLer1&token=...". Colar isso no campo dá
     na mesma coisa — desde que a gente tire esses dois
     parâmetros e monte a URL de novo, senão sobra "??" e o token
     vai duas vezes. Por isso a limpeza acontece aqui, e não no
     campo, para o dono continuar vendo o que ele colou. */
  function base() {
    return String(cfg().planilhaUrl || '')
      .replace(/[?&]callback=[^&#]*/gi, '')
      .replace(/[?&]token=[^&#]*/gi, '')
      .replace(/[?&]+$/, '');
  }

  /* Junta parâmetros na URL sem duplicar o "?" ou o "&". */
  function comParams(extra) {
    var b = base();
    return extra ? b + (b.indexOf('?') < 0 ? '?' : '&') + extra : b;
  }

  /* O token vem do campo próprio, mas se o dono colou a URL com
     ?token=... e deixou o campo vazio, aproveitamos o que veio
     colado em vez de mandar token vazio e tomar "Token inválido". */
  function token() {
    var proprio = cfg().planilhaToken;
    if (proprio) return String(proprio);

    var colado = /[?&]token=([^&#]*)/i.exec(String(cfg().planilhaUrl || ''));
    return colado ? decodeURIComponent(colado[1]) : '';
  }

  function origem() {
    var host = 'local';
    try { host = location.hostname || 'local'; } catch (e) { /* sem location */ }
    return host;
  }

  /* Tira acento e o que o Sheets leria como separador de coluna.
     A faixa de combining marks e \u0300-\u036f: escrever os
     caracteres literais aqui deixa o arquivo depender da
     codificacao com que foi salvo. */
  function semAcento(t) {
    var s = String(t === null || t === undefined ? '' : t);
    /* normalize() nao existe em navegadores muito antigos nem em
       algumas WebViews; nesse caso o texto segue com acento,
       que ainda e melhor do que perder o texto inteiro. */
    if (typeof s.normalize === 'function') s = s.normalize('NFD');
    return s
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^\w\s\-.,:;()\/@+*#]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* Texto que vai para uma celula e volta para a tela do cliente.
     NAO passa por semAcento: "Porcoes" numa placa de cardapio e
     "Batata Cheddar Bacon" sao texto corrompido. Tiramos so o que
     o Sheets interpretaria errado — quebra de linha viraria outra
     linha da tabela, aspa abriria texto, "=" no começo e formula
     e "'" no começo e marcador de texto.

     O trim vem ANTES da limpeza do primeiro caractere: com um
     espaço na frente, o "^=" não achava a fórmula e o texto
     voltaria da planilha como erro do Sheets.

     E o "-" inicial NÃO é removido de propósito. Ele não abre
     fórmula no Sheets, e comer um caractere do nome do produto é
     exatamente o tipo de texto corrompido que este resto do
     arquivo existe para evitar. */
  function textoCelula(valor) {
    var s = String(valor === null || valor === undefined ? '' : valor).trim();
    return s
      .replace(/\r\n|\r|\n/g, ' ')
      .replace(/\t/g, ' ')
      .replace(/"/g, '')
      .replace(/^[=']/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /* URL de imagem.

     Mesma regra do linkDe() do planilha.gs, invertida: aqui só
     passa o que a leitura vai aceitar. As duas pontas precisam
     concordar, senão o dono vê a URL na planilha e a imagem não
     aparece no cardápio — que era o que acontecia com um link
     relativo ou um javascript: aceito aqui e recusado lá. */
  function linkDeImagem(valor) {
    var s = String(valor === null || valor === undefined ? '' : valor).trim();
    if (!s) return '';
    if (s.indexOf('data:') === 0 || s.indexOf('javascript:') === 0 || s.indexOf('=') === 0) return '';
    if (s.indexOf('#') === 0 || s.indexOf('..') === 0) return '';

    /* URL colada a mao: espaco no meio = link quebrado. */
    if (/^https?:\/\//i.test(s)) return /^[^\s"'\\<>]+$/.test(s) ? s : '';
    if (/^\/\//.test(s)) return /^[^\s"'\\<>]+$/.test(s.slice(2)) ? 'https:' + s : '';

    /* Caminho para a pasta img/ do site: espaco e acento no nome do
       arquivo valem, porque o navegador codifica sozinho. */
    if (/["<>\\\n\r]/.test(s)) return '';
    /* remove ./ se tiver e devolve como esta */
    s = s.replace(/^\.\//, '');
    return s;
  }

  /* Endereços para tentar, em ordem, até um carregar.

     Devolve uma LISTA porque as duas causas mais comuns de "a
     imagem não aparece" não se resolvem trocando a URL, e sim
     experimenando a outra forma dela:

     1. http:// numa pagina https:// — o navegador bloqueia como
        "mixed content" e a imagem fica permanentemente quebrada,
        sem recarregar. Quase toda hospedagem aceita https, então
        tentamos o https primeiro e guardamos o http de reserva
        para o host que so tem http.
     2. Link do Google Drive — devolve uma pagina HTML de
        visualizacao, nao o arquivo. So a forma /uc?export=view
        entrega os bytes da imagem.

     O que o chamador faz com a lista que sobrar (voltar ao emoji)
     fica com ele; aqui e so a ordem de tentativa. */
  function enderecosDeImagem(valor) {
    var s = linkDeImagem(valor);
    if (!s) return [];

    var saida = [];

    function Push(u) {
      if (u && saida.indexOf(u) < 0) saida.push(u);
    }

    /* Caminho relativo (pasta img/ do site).

       Alem do caminho como o dono digitou, tentamos variantes do
       NOME do arquivo. GitHub Pages roda em Linux, onde o sistema de
       arquivos diferencia maiuscula de minuscula e acento de nao
       acento — o Windows, onde a gente develope, nao. Sem isso,
       "img/X-Burguer.jpg" funciona na maquina e da 404 no ar, e o
       dono fica sem ideia do motivo. */
    if (!/^https?:\/\//i.test(s) && !/^\/\//.test(s)) {
      var pasta = s.slice(0, s.lastIndexOf('/') + 1);
      var arquivo = s.slice(pasta.length);

      var semAcento = arquivo.normalize
        ? arquivo.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        : arquivo;

      Push(s);
      Push('./' + s);
      Push(pasta + semAcento);
      Push(pasta + arquivo.toLowerCase());
      Push(pasta + semAcento.toLowerCase());

      return saida;
    }

    /* Link de visualizacao do Drive -> bytes da imagem. */
    var drive = /(?:^|\/\/)(?:drive|docs)\.google\.com\//i.exec(s);
    if (drive) {
      var id = /[?&]id=([A-Za-z0-9_-]{10,})/.exec(s) ||
               /\/d\/([A-Za-z0-9_-]{10,})/.exec(s);
      if (id) {
        Push('https://drive.google.com/uc?export=view&id=' + id[1]);
        return saida;
      }
    }

    Push(s.replace(/^http:\/\//i, 'https://'));
    Push(s);
    return saida;
  }

  /* Preco vai como numero, nao como "18,90": o Sheets precisa
     reconhecer a coluna como dinheiro para somar e filtrar. */
  function dinheiro(valor) {
    var n = Number(valor);
    return isFinite(n) ? Math.round(n * 100) / 100 : 0;
  }

  function lista(itens, campo) {
    return itens.map(function (i) { return semAcento(i[campo] || ''); }).join(' | ');
  }

  function dataHora() {
    var agora = new Date();
    return {
      data: agora.toLocaleDateString('pt-BR'),
      hora: agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    };
  }

  /* ---------------------------------------------------------
     2. Montagem das linhas
     --------------------------------------------------------- */
  function linhaDoPedido(p, itens) {
    return [
      p.data,
      p.hora,
      p.pedido || '',
      semAcento(p.cliente),
      p.tipo === 'retirada' ? 'Retirada' : 'Entrega',
      /* O Sheets le "/" como divisão e "," como separador de coluna
         dentro do campo, então a vírgula do CEP sai junto. */
      semAcento(p.endereco).replace(/,/g, ''),
      semAcento(p.pagamento),
      itens.length,
      dinheiro(p.subtotal),
      dinheiro(p.taxa),
      dinheiro(p.total),
      semAcento(p.observacoes),
      itens.map(function (i) {
        return i.quantidade + 'x ' + semAcento(i.nome) + ' (' + dinheiro(i.precoUnitario) + ')';
      }).join(' | '),
      itens.map(function (i) { return semAcento(i.observacao); }).filter(Boolean).join(' | '),
      semAcento(p.bairro),
      /* Status inicial. O dono troca na planilha depois. */
      'Novo'
    ];
  }

  /* Formato longo: uma linha por item. E o que permite somar
     quanto saiu de cada produto na aba. */
  function linhasDoPedido(itens, p) {
    return itens.map(function (i) {
      return [
        p.data,
        p.hora,
        p.pedido || '',
        semAcento(p.cliente),
        semAcento(i.nome),
        i.quantidade,
        dinheiro(i.precoUnitario),
        dinheiro(i.quantidade * i.precoUnitario),
        semAcento(i.observacao)
      ];
    });
  }

  function catalogo() {
    var d = window.CardapioStore.dados();
    var marca = dataHora();

    var linhas = [];

    d.categorias.forEach(function (cat) {
      (cat.itens || []).forEach(function (item) {
        linhas.push([
          textoCelula(cat.nome),
          /* O icone se repete em todas as linhas da categoria. E
             repeticao proposital: uma celula mesclada seria
             quebrada pelo getValues() do lado da leitura. */
          textoCelula(cat.icone),
          textoCelula(item.nome),
          dinheiro(item.preco),
          item.destaque ? 'Sim' : 'Nao',
          item.disponivel !== false ? 'Sim' : 'Nao',
          textoCelula(item.descricao),
          /* A URL fica crua, sem passar por textoCelula: ela e
             composta de "/" e "?" e "%", que a limpeza de texto
             apagaria e transformaria o link num caminho quebrado.
             So sai o que o Sheets interpretaria. */
          linkDeImagem(item.imagem),
          marca.data + ' ' + marca.hora
        ]);
      });
    });

    return { cabecalho: CABECALHO_CARDAPIO, linhas: linhas };
  }

  /* Aba Bairros: uma linha por bairro. A taxa vai como número, para
     o Sheets somar; uma lista vazia e perfeitamente normal e
     significa "uso a taxa única da aba Config". */
  function catalogoBairros() {
    var d = window.CardapioStore.dados();
    var lista = Array.isArray(d.bairros) ? d.bairros : [];

    return {
      cabecalho: CABECALHO_BAIRROS,
      linhas: lista.map(function (b) {
        return [
          textoCelula(b.nome),
          dinheiro(b.taxa),
          textoCelula(b.tempo),
          b.ativo === false ? 'Nao' : 'Sim'
        ];
      })
    };
  }

  /* Aba Opcoes: uma linha por opcao de item, achatando os grupos que
     estao dentro de cada item. O nome do item e a chave de casamento
     com a aba Cardapio. */
  function catalogoOpcoes() {
    var d = window.CardapioStore.dados();
    var linhas = [];

    (d.categorias || []).forEach(function (cat) {
      (cat.itens || []).forEach(function (item) {
        var grupos = Array.isArray(item.opcoes) ? item.opcoes : [];

        grupos.forEach(function (g) {
          (g.itens || []).forEach(function (o) {
            linhas.push([
              textoCelula(item.nome),
              textoCelula(g.grupo),
              g.tipo === 'multiplo' ? 'multiplo' : 'unico',
              textoCelula(o.nome),
              dinheiro(o.preco),
              g.obrigatorio ? 'Sim' : 'Nao'
            ]);
          });
        });
      });
    });

    return { cabecalho: CABECALHO_OPCOES, linhas: linhas };
  }

  /* Campos que vão para a aba Config gravados como número, e os
     que vão como Sim/Nao. A mesma lista é usada na ida e na volta
     para as duas pontas concordarem sobre o tipo. */
  var CONFIG_NUMERO = ['taxaEntrega', 'pedidoMinimo'];
  var CONFIG_BOOLEANO = ['aberto', 'pedirNome', 'pedirEntrega'];

  /* O que o Sheets devolve numa célula editada à mão: quem digita
     "Nao" em vez de clicar na caixa de seleção, ou "8,50" em vez
     de 8.5, grava texto. */
  var NEGADOS = ['nao', 'n', 'f', 'false', '0', 'off'];

  function booleanoDe(valor, padrao) {
    if (valor === true) return true;
    if (valor === false) return false;

    var s = semAcento(valor === null || valor === undefined ? '' : valor).toLowerCase();
    if (!s) return padrao;

    return NEGADOS.indexOf(s) < 0;
  }

  function numeroDe(valor) {
    if (typeof valor === 'number') return isFinite(valor) && valor >= 0 ? valor : 0;

    /* Aceita o que o dono digita: "8,50", "R$ 8,50", "1.234,56". */
    var s = String(valor === null || valor === undefined ? '' : valor).replace(/[^\d.,-]/g, '');
    if (!s) return 0;

    var virgula = s.lastIndexOf(',');
    var ponto = s.lastIndexOf('.');

    if (virgula >= 0 && ponto >= 0) {
      s = virgula > ponto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (virgula >= 0) {
      s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    }

    var n = parseFloat(s);
    return isFinite(n) && n >= 0 ? n : 0;
  }

  /* Aba Config: chave/valor, uma linha por campo da loja.
     Numeros e booleanos sao gravados com tipo de verdade, para o
     dono poder recalcular a aba sem brigar com texto. */
  function tabelaConfig() {
    /* A config inteira do store — nao a cfg() de planilha, que so
       devolve URL e token. Aqui vao os dados da loja. */
    var c = (window.CardapioStore && window.CardapioStore.dados().config) || {};
    var marca = dataHora();

    var linhas = CAMPOS_CONFIG.map(function (chave) {
      var v = c[chave];

      if (CONFIG_NUMERO.indexOf(chave) >= 0) return [chave, dinheiro(v)];
      if (CONFIG_BOOLEANO.indexOf(chave) >= 0) return [chave, v === false ? 'Nao' : 'Sim'];

      return [chave, textoCelula(v)];
    });

    /* Registro de onde este cardapio foi publicado e com que token.
       Fica gravado na propria planilha para o dono conferir, mas
       NUNCA e lido de volta (nao esta em CAMPOS_CONFIG, que e a lista
       usada pelo GET). Assim o token continua secreto: a planilha e
       privada, e o GET publico nao devolve estas duas linhas. */
    var conexao = cfg();
    linhas.push(['url-do-web-app', textoCelula(conexao.planilhaUrl || '')]);
    linhas.push(['token-do-script', textoCelula(conexao.planilhaToken || '')]);

    /* Uma linha de comentario no fim, com a data da publicacao.
       E o que o dono ve para saber se o cardapio do cliente esta
       atualizado sem precisar abrir a aba Registro. */
    linhas.push(['publicado_em', marca.data + ' ' + marca.hora]);

    return { cabecalho: CABECALHO_CONFIG, linhas: linhas };
  }

  /* ---------------------------------------------------------
     3. Envio
     --------------------------------------------------------- */
  function remember(texto) {
    try { localStorage.setItem(CHAVE_LOCAL, texto); } catch (e) { /* modo restrito */ }
  }

  function ultimoEnvio() {
    try { return localStorage.getItem(CHAVE_LOCAL) || ''; } catch (e) { return ''; }
  }

  /* Nao usamos async/await: o cardapio tambem roda em WebViews de
     Android antigas que engasgam com sintaxe moderna. */
  function postar(acao, abas) {
    var corpo = JSON.stringify({
      acao: acao,
      token: token(),
      origem: origem(),
      abas: abas
    });

    return fetch(base(), {
      method: 'POST',
      mode: 'no-cors',
      /* text/plain e um dos poucos tipos que nao exigem preflight.
         Com application/json o navegador perguntaria antes e a
         resposta seria barrada por falta de CORS. */
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: corpo,
      /* O POST precisa sobreviver a aba fechando logo depois:
         o cliente manda o pedido e vai pro WhatsApp na mesma hora. */
      keepalive: true,
      redirect: 'follow'
    }).then(function () {
      /* Em no-cors o status sempre vem "opaque" e response.ok leria
         false. Checar aqui seria mentira: o dono acharia que falhou
         mesmo tendo gravado. So um erro de rede é sinal de problema. */
      remember(acao + ' · ' + new Date().toLocaleString('pt-BR'));
      return { ok: true };
    }, function (erro) {
      throw new Error(
        'Não foi possível alcançar o Apps Script. Confira a URL, se o Web App está publicado ' +
        'como "Anyone" e se o token é o mesmo dos dois lados. (' +
        (erro && erro.message ? erro.message : 'erro de rede') + ')'
      );
    });
  }

  function montarItens(brutos) {
    return brutos.map(function (i) {
      return {
        nome: semAcento(i.nome),
        quantidade: i.quantidade,
        precoUnitario: i.precoUnitario,
        observacao: i.observacao || ''
      };
    });
  }

  function enviarPedido(pedido) {
    if (!configurada()) return Promise.resolve({ ignorado: true, motivo: 'sem-url' });

    var itens = montarItens(pedido.itens || []);
    if (!itens.length) return Promise.resolve({ ignorado: true, motivo: 'sem-itens' });

    var dh = dataHora();

    var p = {
      data: pedido.data || dh.data,
      hora: pedido.hora || dh.hora,
      pedido: pedido.pedido,
      cliente: pedido.cliente,
      tipo: pedido.tipo,
      endereco: pedido.endereco,
      bairro: pedido.bairro,
      pagamento: pedido.pagamento,
      observacoes: pedido.observacoes,
      subtotal: pedido.subtotal,
      taxa: pedido.taxa,
      total: pedido.total
    };

    return postar('pedido', [
      { nome: 'Pedidos', modo: 'append', cabecalho: CABECALHO_PEDIDOS, linhas: [linhaDoPedido(p, itens)] },
      { nome: 'Itens', modo: 'append', cabecalho: CABECALHO_ITENS, linhas: linhasDoPedido(itens, p) }
    ]);
  }

  /* ---------------------------------------------------------
     3b. Leitura do cardapio publicado
     ---------------------------------------------------------
     O caminho normal e um fetch comum: o Apps Script responde com
     `Access-Control-Allow-Origin: *`, entao o navegador le a
     resposta de outra origem sem barrar nada.

     O JSONP fica so como reserva, para navegador muito antigo sem
     fetch. Ele nao e mais o principal porque o Chrome passou a
     BLOQUEAR JSONP do Apps Script: o script responde
     `application/json` (e nao `text/javascript`), e o ORB
     (Opaque Response Blocking) recusa a resposta como se fosse
     codigo. O cardapio ficava mostrando o exemplo embutido sem
     nenhum aviso, e o navegador so contava no console
     `net::ERR_BLOCKED_BY_ORB`.

     Cuidado: o texto devolvido pelo JSONP roda como codigo na
     nossa pagina. Por isso o nome da funcao nasce com prefixo
     fixo e um contador, nunca com nada vindo de fora.
     --------------------------------------------------------- */
  var contadorCallback = 0;

  function lerCardapio() {
    if (!configurada()) return Promise.resolve({ ignorado: true, motivo: 'sem-url' });
    /* So vale tentar o JSONP quando o fetch nao chegou a uma resposta
       nenhuma (sem rede, CORS barrado, tempo esgotado). Se o Google
       respondeu — mesmo dizendo "erro" — a resposta dele e a melhor
       pista que temos, e trocar pelo JSONP esconderia a causa. */
    return lerPorFetch().then(function (r) {
      return (r.ok || r.ignorado || r.definido) ? r : lerPorJsonp();
    });
  }

  /* fetch comum, com timeout. Nao ha AbortController em WebView
     antiga, entao a corrida e feita com uma bandera. */
  function lerPorFetch() {
    var chave = token();
    /* `v` fura o cache HTTP do Apps Script. Sem isso o navegador pode
       devolver a resposta antiga (foi o que escondeu os bairros). */
    var extra = 'v=' + Date.now() + (chave ? '&token=' + encodeURIComponent(chave) : '');
    var url = comParams(extra);

    return new Promise(function (resolve) {
      var pronto = false;

      function responder(r) {
        if (pronto) return;
        pronto = true;
        resolve(r);
      }

      setTimeout(function () {
        responder({ ok: false, erro: 'Tempo esgotado ao buscar o cardápio na planilha.' });
      }, 8000);

      fetch(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store' })
        .then(function (resp) {
          if (!resp.ok) {
            responder({ ok: false, definido: true, erro: 'A planilha respondeu ' + resp.status + '.' });
            return null;
          }
          return resp.json();
        })
        .then(function (json) {
          if (json === null) return;
          if (!json || json.ok !== true) {
            responder({
              ok: false, definido: true,
              erro: (json && json.erro) || 'Resposta inesperada do script.'
            });
            return;
          }

          /* O script antigo (antes da aba Config) respondia a um GET
             sem callback so com um "conectado", sem cardapio. Sem
             esta distincao o dono acharia que a planilha estava
             vazia, quando na verdade o script esta desatualizado. */
          if (!json.menu) {
            responder({
              ok: false, definido: true,
              erro: 'O script publicado no Google está desatualizado: ele respondeu, mas sem cardápio. ' +
                    'Cole o planilha.gs novo no Apps Script e crie uma implantação nova ' +
                    '(Implantar → Nova implantação).'
            });
            return;
          }

          responder({ ok: true, menu: json.menu, config: json.config, bairros: json.bairros });
        })
        .catch(function (e) {
          responder({ ok: false, erro: 'Falha de rede ao ler a planilha: ' + (e && e.message ? e.message : e) });
        });
    });
  }

  function lerPorJsonp() {
    /* O nome precisa usar SO [A-Za-z0-9_$]: o script recorta
       qualquer outro caractere do callback antes de montar a
       resposta, e um nome com "__" nos cantos chegaria la com um
       underscore a menos e a funcao nunca seria chamada. */
    var nome = 'cardapioLer' + (++contadorCallback);
    var chave = token();
    var url = comParams(
      'callback=' + nome + '&v=' + Date.now() + (chave ? '&token=' + encodeURIComponent(chave) : '')
    );

    return new Promise(function (resolve) {
      var script = document.createElement('script');
      /* A carga da pagina nao pode ficar esperando o Google.
         Sem este timeout, um Web App publicado errado prenderia
         o cardapio preso em "carregando" para sempre. */
      var relogio = setTimeout(function () {
        limpar();
        resolve({ ok: false, erro: 'Tempo esgotado ao buscar o cardápio na planilha.' });
      }, 8000);

      function limpar() {
        clearTimeout(relogio);
        if (script.parentNode) script.parentNode.removeChild(script);
        try { delete window[nome]; } catch (e) { window[nome] = undefined; }
      }

      window[nome] = function (resposta) {
        limpar();
        if (!resposta || resposta.ok !== true) {
          resolve({ ok: false, erro: (resposta && resposta.erro) || 'Resposta inesperada do script.' });
          return;
        }
        resolve({ ok: true, menu: resposta.menu, config: resposta.config, bairros: resposta.bairros });
      };

      script.onerror = function () {
        limpar();
        resolve({ ok: false, erro: 'Não foi possível carregar o script da planilha.' });
      };

      script.src = url;
      script.async = true;
      (document.head || document.body).appendChild(script);
    });
  }

  /* ---------------------------------------------------------
     3d. Status de um pedido (página Acompanhar)
     ---------------------------------------------------------
     Diferente do cardápio, aqui a resposta é pequena e o cliente
     fica perguntando de novo a cada poucos segundos. Um fetch
     simples com timeout resolve: sem timeout, uma rede caída
     deixaria a tela em "consultando..." para sempre.
     --------------------------------------------------------- */
  function statusDoPedido(id) {
    if (!configurada()) return Promise.resolve({ ignorado: true, motivo: 'sem-url' });

    var alvo = String(id === null || id === undefined ? '' : id).trim();
    if (!alvo) return Promise.resolve({ ok: false, erro: 'Informe o número do pedido.' });

    var chave = token();
    var extra = 'pedido=' + encodeURIComponent(alvo) + '&v=' + Date.now() +
      (chave ? '&token=' + encodeURIComponent(chave) : '');
    var url = comParams(extra);

    return new Promise(function (resolve) {
      var pronto = false;

      function responder(r) {
        if (pronto) return;
        pronto = true;
        resolve(r);
      }

      setTimeout(function () {
        responder({ ok: false, erro: 'Tempo esgotado ao consultar o pedido.' });
      }, 8000);

      fetch(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store' })
        .then(function (resp) {
          if (!resp.ok) {
            responder({ ok: false, definido: true, erro: 'A planilha respondeu ' + resp.status + '.' });
            return null;
          }
          return resp.json();
        })
        .then(function (json) {
          if (json === null) return;
          if (!json || json.ok !== true) {
            responder({
              ok: false, definido: true,
              erro: (json && json.erro) || 'Resposta inesperada do script.'
            });
            return;
          }
          responder({
            ok: true,
            pedido: json.pedido || alvo,
            status: json.status || 'Novo',
            encontrado: json.encontrado !== false
          });
        })
        .catch(function (e) {
          responder({ ok: false, erro: 'Falha de rede ao consultar o pedido: ' + (e && e.message ? e.message : e) });
        });
    });
  }

  /* ---------------------------------------------------------
     3c. Aplicar o que veio da planilha
     --------------------------------------------------------- */

  /* A aba Config volta como texto quando o dono edita a celula a mao
     ("Nao", "8,50"). O Store espera booleano e numero de verdade:
     sem converter aqui, "Nao" viraria true, e o dono veria a loja
     pedindo entrega mesmo tendo desmarcado a caixa na planilha. */
  function aplicarConfig(destino, bruto) {
    CAMPOS_CONFIG.forEach(function (chave) {
      if (!Object.prototype.hasOwnProperty.call(bruto, chave)) return;

      var v = bruto[chave];

      if (CONFIG_BOOLEANO.indexOf(chave) >= 0) { destino[chave] = booleanoDe(v, true); return; }
      if (CONFIG_NUMERO.indexOf(chave) >= 0) { destino[chave] = numeroDe(v); return; }
      if (chave === 'whatsapp') { destino[chave] = String(v || '').replace(/\D/g, ''); return; }

      destino[chave] = String(v === null || v === undefined ? '' : v);
    });
  }

  function montarCategorias(menu) {
    return menu.map(function (cat) {
      return {
        nome: String(cat.nome || '').trim(),
        icone: String(cat.icone || '').trim(),
        itens: (cat.itens || []).map(function (item) {
          return {
            nome: String(item.nome || '').trim(),
            preco: item.preco,
            descricao: String(item.descricao || ''),
            imagem: String(item.imagem || ''),
            destaque: item.destaque === true,
            disponivel: item.disponivel !== false,
            /* As opcoes vem anexadas ao item pelo script (aba Opcoes).
               Passam cruas daqui; a normalizacao do Store cuida do
               formato. Sem opcoes, a lista vazia nao vira chave. */
            opcoes: Array.isArray(item.opcoes) ? item.opcoes : []
          };
        })
      };
    }).filter(function (cat) {
      return cat.nome && cat.itens.length;
    });
  }

  function montarBairros(lista) {
    return lista.map(function (b) {
      return {
        nome: String(b.nome !== undefined ? b.nome : (b.bairro || '')).trim(),
        taxa: b.taxa,
        tempo: String(b.tempo || ''),
        ativo: b.ativo !== false
      };
    }).filter(function (b) { return b.nome; });
  }

  /* Traduz a resposta do script em "patches". Separate de
     proposito: quem decide se pode sobrescrever o que esta na
     tela precisa olhar o patch antes de aplicá-lo.

     Bairros ausente na resposta (aba inexistente) vira null: nao
     apaga o que ja esta na tela. Lista vazia e valida e significa
     "sem bairros cadastrados". */
  function montarPatches(resposta) {
    var menu = resposta && Array.isArray(resposta.menu) ? resposta.menu : null;
    var config = resposta && resposta.config && typeof resposta.config === 'object'
      ? resposta.config
      : null;
    var bairros = resposta && Array.isArray(resposta.bairros) ? montarBairros(resposta.bairros) : null;

    return {
      config: config,
      categorias: menu && menu.length ? montarCategorias(menu) : null,
      bairros: bairros
    };
  }

  function temConteudo(patches) {
    return !!(patches.config || patches.categorias || patches.bairros);
  }

  function aplicarPatches(d, patches) {
    if (patches.config) aplicarConfig(d.config, patches.config);
    if (patches.categorias) d.categorias = patches.categorias;
    if (patches.bairros) d.bairros = patches.bairros;
  }

  function contaItens(categorias) {
    var total = 0;
    categorias.forEach(function (c) { total += (c.itens || []).length; });
    return total;
  }

  /**
   * O que a planilha trocaria, sem gravar nada.
   * O painel usa isto para não sobrescrever edição feita à mão:
   * primeiro pergunta, depois aplica.
   */
  function comparar(resposta) {
    var Store = window.CardapioStore;
    if (!Store) return { muda: false, categorias: 0, itens: 0 };

    var patches = montarPatches(resposta);
    if (!temConteudo(patches)) return { muda: false, categorias: 0, itens: 0 };

    /* Uma cópia profunda: aplicar no dicionário vivo mudaria o
       Store antes da hora, e Store.validar só normaliza. */
    var rascunho = Store.clone(Store.dados());

    aplicarPatches(rascunho, patches);

    /* Passa pela mesma normalização que o Store faria ao gravar.
       Sem isso a comparação acusaria diferença em campo que a
       normalização preenche depois (id gerado, preço zerado,
       item sem imagem virando ''), e o aviso de "não publicado"
       nunca se apagaria. */
    var depois = Store.validar(rascunho).data;

    return {
      muda: impressaoDe(depois) !== impressaoDe(Store.dados()),
      categorias: depois.categorias.length,
      itens: contaItens(depois.categorias)
    };
  }

  /**
   * Troca o cardápio em memória pelo que está publicado na planilha.
   * Devolve quantas categorias e itens entraram, para a página
   * avisar se vale conferir a aba.
   *
   * A planilha é a fonte da verdade, mas menu vazio ou config
   * ausente não apagam o que já está aqui: planilha recém-criada
   * sem publicação é o estado normal logo depois de configurar a
   * URL, e um cardápio vazio na tela seria pior que o anterior.
   */
  function aplicarCardapio(resposta) {
    var Store = window.CardapioStore;
    if (!Store || !resposta) return { alterados: 0, categorias: 0, itens: 0 };

    var patches = montarPatches(resposta);
    if (!temConteudo(patches)) return { alterados: 0, categorias: 0, itens: 0 };

    var antes = Store.serializar();

    Store.alterar(function (d) {
      aplicarPatches(d, patches);
    });

    var d = Store.dados();

    return {
      alterados: Store.serializar() !== antes ? 1 : 0,
      categorias: d.categorias.length,
      itens: contaItens(d.categorias)
    };
  }

  /* ---------------------------------------------------------
     3d. O que esta publicado x o que esta na tela
     ---------------------------------------------------------
     Com a planilha como fonte da verdade, editar no painel sem
     publicar deixa o cliente vendo a versao antiga — e sem nenhum
     aviso, porque o painel tem cara de salvo. A comparacao ignora
     planilhaUrl e planilhaToken de proposito: eles nunca vao para
     a planilha, e incluir-los faria o aviso nunca se resolver. */
  var CHAVE_PUBLICADO = 'cardapio:publicado:v1';

  function impressaoDe(d) {
    var config = {};

    CAMPOS_CONFIG.forEach(function (chave) {
      config[chave] = d && d.config ? d.config[chave] : undefined;
    });

    /* Os bairros entram na comparacao sem o "id" (que e gerado):
       assim comparar o que esta na tela com o que veio da planilha
       nao acusa diferenca so porque o id foi recalculado. */
    var bairros = (d && Array.isArray(d.bairros) ? d.bairros : []).map(function (b) {
      return {
        nome: b.nome,
        taxa: b.taxa,
        tempo: b.tempo,
        ativo: b.ativo !== false
      };
    });

    return JSON.stringify({ config: config, categorias: d ? d.categorias : [], bairros: bairros });
  }

  function impressao() {
    var Store = window.CardapioStore;
    if (!Store) return '';
    return impressaoDe(Store.dados());
  }

  function marcarPublicado() {
    var texto = impressao();
    try { localStorage.setItem(CHAVE_PUBLICADO, texto); } catch (e) { /* modo restrito */ }
    return texto;
  }

  function alteracoesPendentes() {
    var guardado = null;
    try { guardado = localStorage.getItem(CHAVE_PUBLICADO); } catch (e) { return false; }

    /* Sem registro do que foi publicado, nao da para afirmar que
       existe mudanca. O painel esta mostrando o que a planilha
       devolveu, entao o certo e dizer que esta em dia. */
    if (!guardado) return false;

    return guardado !== impressao();
  }

  function enviarCardapio() {
    if (!configurada()) return Promise.resolve({ ignorado: true, motivo: 'sem-url' });

    var cat = catalogo();
    if (!cat.linhas.length) {
      return Promise.reject(new Error('O cardápio está vazio: nada a enviar.'));
    }

    var conf = tabelaConfig();
    var bai = catalogoBairros();
    var opc = catalogoOpcoes();

    /* Um POST so com as abas: se a rede falhar no meio, o script
       processa na ordem e o cardapio fica consistente com a
       configuracao. Bairros e Opcoes vao sempre, mesmo vazias, para
       limpar o que o dono apagou. */
    return postar('cardapio', [
      { nome: 'Cardápio', modo: 'replace', cabecalho: cat.cabecalho, linhas: cat.linhas },
      { nome: 'Config', modo: 'replace', cabecalho: conf.cabecalho, linhas: conf.linhas },
      { nome: 'Bairros', modo: 'replace', cabecalho: bai.cabecalho, linhas: bai.linhas },
      { nome: 'Opcoes', modo: 'replace', cabecalho: opc.cabecalho, linhas: opc.linhas }
    ]).then(function (r) {
      r.itens = cat.linhas.length;
      marcarPublicado();
      return r;
    });
  }

  /* ---------------------------------------------------------
     3e. Pedidos (página Gerenciar Pedidos)
     --------------------------------------------------------- */
  function lerPedidos() {
    if (!configurada()) return Promise.reject(new Error('Planilha não configurada.'));

    var chave = token();
    /* `pedidos=1` é o que faz o script devolver a lista em vez do
       cardápio. Sem esse parâmetro a página recebia o menu e a lista
       saía sempre vazia. O `v` fura o cache e o token abre a
       listagem (que traz nome e endereço do cliente). */
    var extra = 'pedidos=1&v=' + Date.now() + (chave ? '&token=' + encodeURIComponent(chave) : '');
    var url = comParams(extra);

    return new Promise(function (resolve) {
      var pronto = false;

      function responder(r) {
        if (pronto) return;
        pronto = true;
        resolve(r);
      }

      setTimeout(function () {
        responder({ ok: false, erro: 'Tempo esgotado ao buscar pedidos.' });
      }, 8000);

      fetch(url, { credentials: 'omit', redirect: 'follow', cache: 'no-store' })
        .then(function (resp) {
          if (!resp.ok) {
            responder({ ok: false, definido: true, erro: 'A planilha respondeu ' + resp.status + '.' });
            return null;
          }
          return resp.json();
        })
        .then(function (json) {
          if (json === null) return;
          if (!json || json.ok !== true) {
            responder({ ok: false, definido: true, erro: (json && json.erro) || 'Resposta inesperada do script.' });
            return;
          }
          responder({ ok: true, pedidos: json.pedidos || [] });
        })
        .catch(function (e) {
          responder({ ok: false, erro: 'Falha de rede ao buscar pedidos: ' + (e && e.message ? e.message : e) });
        });
    });
  }

  function alterarStatusPedido(pedido, novoStatus) {
    if (!configurada()) return Promise.reject(new Error('Planilha não configurada.'));

    return postar('alterarStatus', [
      { nome: 'Pedidos', modo: 'updateStatus', pedido: pedido, status: novoStatus }
    ]);
  }

  window.CardapioPlanilha = {
    configurada: configurada,
    enviarPedido: enviarPedido,
    enviarCardapio: enviarCardapio,
    lerCardapio: lerCardapio,
    statusDoPedido: statusDoPedido,
    lerPedidos: lerPedidos,
    alterarStatusPedido: alterarStatusPedido,
    aplicarCardapio: aplicarCardapio,
    comparar: comparar,
    pendentes: alteracoesPendentes,
    marcarPublicado: marcarPublicado,
    catalogo: catalogo,
    catalogoBairros: catalogoBairros,
    catalogoOpcoes: catalogoOpcoes,
    tabelaConfig: tabelaConfig,
    ultimoEnvio: ultimoEnvio,
    enderecosDeImagem: enderecosDeImagem,
    siteConfigurado: siteConfigurado,
    usarUrlDoPainel: function (ligar) { usarUrlDoPainel = !!ligar; },
    cabecalhos: {
      pedidos: CABECALHO_PEDIDOS,
      itens: CABECALHO_ITENS,
      cardapio: CABECALHO_CARDAPIO,
      config: CABECALHO_CONFIG,
      bairros: CABECALHO_BAIRROS,
      opcoes: CABECALHO_OPCOES
    },
    camposConfig: CAMPOS_CONFIG
  };
})();