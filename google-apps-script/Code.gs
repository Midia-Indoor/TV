/**
 * ============================================================
 * SISTEMA DE GESTÃO DE MÍDIA INDOOR - GOOGLE APPS SCRIPT
 * ============================================================
 * 
 * Este script cria uma API REST para integração com Google Sheets
 * Funciona como backend do sistema de gestão de mídia indoor
 * 
 * INSTRUÇÕES DE INSTALAÇÃO:
 * 1. Abra o Google Sheets e crie uma nova planilha
 * 2. Vá em Extensões > Apps Script
 * 3. Cole este código no editor
 * 4. Execute a função "setup" uma vez para criar as abas
 * 5. Implantar > Nova implantação > Aplicativo da Web
 * 6. Configure: "Qualquer pessoa" pode acessar
 * 7. Copie a URL do Web App e use no frontend
 * 
 * ============================================================
 */

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const CONFIG = {
  SHEET_ASSINANTES: 'Assinantes',
  SHEET_CONTRATOS: 'Contratos',
  SHEET_COBRANCAS: 'Cobranças',
  SHEET_LOGS: 'Logs',
  SENHA_SISTEMA: 'midia123',
  NOME_EMPRESA: 'Mídia Indoor LTDA',
  CNPJ_EMPRESA: '00.000.000/0001-00',
  ENDERECO_EMPRESA: 'Rua Exemplo, 123 - Centro - Cidade/UF',
  TELEFONE_EMPRESA: '(11) 99999-9999',
  EMAIL_EMPRESA: 'contato@midiaindoor.com.br'
};

// ============================================================
// FUNÇÕES PRINCIPAIS (GET E POST)
// ============================================================

/**
 * Função principal para requisições GET
 * Retorna dados da planilha em formato JSON
 */
function doGet(e) {
  try {
    const action = e.parameter.action;
    const callback = e.parameter.callback; // Para JSONP (CORS)
    
    let result;
    
    switch (action) {
      case 'login':
        result = handleLogin(e.parameter.senha);
        break;
      case 'assinantes':
        result = getAssinantes(e.parameter);
        break;
      case 'assinantes-inadimplentes':
        result = getAssinantesInadimplentes();
        break;
      case 'contratos':
        result = getContratos(e.parameter);
        break;
      case 'cobrancas':
        result = getCobrancas(e.parameter);
        break;
      case 'dashboard':
        result = getDashboardData();
        break;
      case 'logs':
        result = getLogs(e.parameter);
        break;
      case 'verificar-senha':
        result = verificarSenha(e.parameter.senha);
        break;
      default:
        result = { error: 'Ação não encontrada', available_actions: [
          'login', 'assinantes', 'assinantes-inadimplentes', 'contratos',
          'cobrancas', 'dashboard', 'logs', 'verificar-senha'
        ]};
    }
    
    return jsonResponse(result, callback);
    
  } catch (error) {
    return jsonResponse({ error: error.toString(), stack: error.stack }, e.parameter.callback);
  }
}

/**
 * Função principal para requisições POST
 * Cria/atualiza dados na planilha
 */
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    
    let result;
    
    switch (action) {
      case 'criar-assinante':
        result = criarAssinante(data);
        break;
      case 'atualizar-assinante':
        result = atualizarAssinante(data);
        break;
      case 'deletar-assinante':
        result = deletarAssinante(data);
        break;
      case 'criar-contrato':
        result = criarContrato(data);
        break;
      case 'registrar-cobranca':
        result = registrarCobranca(data);
        break;
      case 'atualizar-status-cobranca':
        result = atualizarStatusCobranca(data);
        break;
      case 'registrar-log':
        result = registrarLog(data);
        break;
      case 'enviar-whatsapp':
        result = registrarEnvioWhatsApp(data);
        break;
      default:
        result = { error: 'Ação não encontrada' };
    }
    
    return jsonResponse(result);
    
  } catch (error) {
    return jsonResponse({ error: error.toString(), stack: error.stack });
  }
}

// ============================================================
// AUTENTICAÇÃO
// ============================================================

function verificarSenha(senha) {
  return {
    autenticado: senha === CONFIG.SENHA_SISTEMA,
    senha_correta: senha === CONFIG.SENHA_SISTEMA
  };
}

function handleLogin(senha) {
  if (senha === CONFIG.SENHA_SISTEMA) {
    registrarLog('LOGIN', 'Login realizado com sucesso', 'Sistema');
    return {
      success: true,
      message: 'Login realizado com sucesso',
      data: {
        senha: CONFIG.SENHA_SISTEMA,
        timestamp: new Date().toISOString()
      }
    };
  } else {
    registrarLog('LOGIN_FALHA', 'Tentativa de login com senha incorreta', 'Sistema');
    return {
      success: false,
      message: 'Senha incorreta'
    };
  }
}

// ============================================================
// ASSINANTES
// ============================================================

function getAssinantes(params) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { assinantes: [], total: 0 };
  }
  
  let assinantes = data.slice(1).map((row, index) => ({
    id: index + 1,
    nome: row[0] || '',
    cpf_cnpj: row[1] || '',
    email: row[2] || '',
    telefone: row[3] || '',
    endereco: row[4] || '',
    bairro: row[5] || '',
    cidade: row[6] || '',
    uf: row[7] || '',
    cep: row[8] || '',
    plano: row[9] || '',
    valor_mensal: row[10] || 0,
    dia_vencimento: row[11] || 1,
    data_inicio: row[12] || '',
    status: row[13] || 'Ativo',
    observacoes: row[14] || '',
    data_cadastro: row[15] || ''
  }));
  
  // Filtro por status
  if (params.status) {
    assinantes = assinantes.filter(a => a.status.toLowerCase() === params.status.toLowerCase());
  }
  
  // Busca
  if (params.busca) {
    const busca = params.busca.toLowerCase();
    assinantes = assinantes.filter(a => 
      a.nome.toLowerCase().includes(busca) ||
      a.cpf_cnpj.includes(busca) ||
      a.email.toLowerCase().includes(busca) ||
      a.telefone.includes(busca)
    );
  }
  
  return {
    assinantes: assinantes,
    total: assinantes.length,
    filtros: {
      status: params.status || null,
      busca: params.busca || null
    }
  };
}

function getAssinantesInadimplentes() {
  const sheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { inadimplentes: [], total: 0 };
  }
  
  const inadimplentes = data.slice(1)
    .map((row, index) => ({
      id: index + 1,
      nome: row[0] || '',
      cpf_cnpj: row[1] || '',
      email: row[2] || '',
      telefone: row[3] || '',
      endereco: row[4] || '',
      bairro: row[5] || '',
      cidade: row[6] || '',
      uf: row[7] || '',
      cep: row[8] || '',
      plano: row[9] || '',
      valor_mensal: row[10] || 0,
      dia_vencimento: row[11] || 1,
      data_inicio: row[12] || '',
      status: row[13] || 'Ativo',
      observacoes: row[14] || '',
      data_cadastro: row[15] || ''
    }))
    .filter(a => a.status === 'Inadimplente' || a.status === 'Atrasado');
  
  return {
    inadimplentes: inadimplentes,
    total: inadimplentes.length,
    valor_total: inadimplentes.reduce((sum, a) => sum + (parseFloat(a.valor_mensal) || 0), 0)
  };
}

function criarAssinante(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  
  const novoAssinante = [
    data.nome,
    data.cpf_cnpj,
    data.email,
    data.telefone,
    data.endereco,
    data.bairro,
    data.cidade,
    data.uf,
    data.cep,
    data.plano,
    data.valor_mensal,
    data.dia_vencimento,
    data.data_inicio,
    data.status || 'Ativo',
    data.observacoes || '',
    new Date().toLocaleString('pt-BR')
  ];
  
  sheet.appendRow(novoAssinante);
  
  registrarLog('CREATE', `Assinante criado: ${data.nome}`, 'Assinantes');
  
  return {
    success: true,
    message: 'Assinante criado com sucesso',
    data: novoAssinante
  };
}

function atualizarAssinante(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  const dataValues = sheet.getDataRange().getValues();
  
  // Buscar pelo id (índice + 1)
  const id = parseInt(data.id);
  if (!id || id < 1 || id >= dataValues.length) {
    return { error: 'Assinante não encontrado' };
  }
  
  const row = id + 1; // +1 por causa do cabeçalho
  
  const valores = [
    data.nome,
    data.cpf_cnpj,
    data.email,
    data.telefone,
    data.endereco,
    data.bairro,
    data.cidade,
    data.uf,
    data.cep,
    data.plano,
    data.valor_mensal,
    data.dia_vencimento,
    data.data_inicio,
    data.status,
    data.observacoes || '',
    new Date().toLocaleString('pt-BR')
  ];
  
  const range = sheet.getRange(row, 1, 1, valores.length);
  range.setValues([valores]);
  
  registrarLog('UPDATE', `Assinante atualizado: ${data.nome}`, 'Assinantes');
  
  return {
    success: true,
    message: 'Assinante atualizado com sucesso'
  };
}

function deletarAssinante(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  const dataValues = sheet.getDataRange().getValues();
  
  // Buscar pelo id (índice + 1)
  const id = parseInt(data.id);
  if (!id || id < 1 || id >= dataValues.length) {
    return { error: 'Assinante não encontrado' };
  }
  
  const row = id + 1; // +1 por causa do cabeçalho
  const nome = sheet.getRange(row, 1).getValue();
  sheet.deleteRow(row);
  
  registrarLog('DELETE', `Assinante removido: ${nome}`, 'Assinantes');
  
  return {
    success: true,
    message: 'Assinante removido com sucesso'
  };
}

// ============================================================
// CONTRATOS
// ============================================================

function getContratos(params) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_CONTRATOS);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { contratos: [], total: 0 };
  }
  
  const contratos = data.slice(1).map((row, index) => ({
    id: index + 1,
    numero_contrato: row[0] || '',
    assinante_nome: row[1] || '',
    assinante_cpf: row[2] || '',
    assinante_endereco: row[3] || '',
    plano: row[4] || '',
    valor_mensal: row[5] || 0,
    data_inicio: row[6] || '',
    data_fim: row[7] || '',
    status: row[8] || 'Ativo',
    data_geracao: row[9] || ''
  }));
  
  if (params.status) {
    return {
      contratos: contratos.filter(c => c.status === params.status),
      total: contratos.filter(c => c.status === params.status).length
    };
  }
  
  return {
    contratos: contratos,
    total: contratos.length
  };
}

function criarContrato(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_CONTRATOS);
  const numeroContrato = generateContractNumber();
  
  const novoContrato = [
    numeroContrato,
    data.assinante_nome,
    data.assinante_cpf,
    data.assinante_endereco,
    data.plano,
    data.valor_mensal,
    data.data_inicio,
    data.data_fim,
    'Ativo',
    new Date().toLocaleString('pt-BR')
  ];
  
  sheet.appendRow(novoContrato);
  
  registrarLog('CREATE', `Contrato gerado: ${numeroContrato} - ${data.assinante_nome}`, 'Contratos');
  
  return {
    success: true,
    message: 'Contrato gerado com sucesso',
    numero_contrato: numeroContrato,
    data: novoContrato
  };
}

// ============================================================
// COBRANÇAS
// ============================================================

function getCobrancas(params) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_COBRANCAS);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { cobrancas: [], total: 0 };
  }
  
  const cobrancas = data.slice(1).map((row, index) => ({
    id: index + 1,
    assinante_nome: row[0] || '',
    assinante_telefone: row[1] || '',
    valor: row[2] || 0,
    vencimento: row[3] || '',
    status: row[4] || 'Pendente',
    data_envio_whatsapp: row[5] || '',
    data_pagamento: row[6] || '',
    observacoes: row[7] || ''
  }));
  
  if (params.status) {
    return {
      cobrancas: cobrancas.filter(c => c.status === params.status),
      total: cobrancas.filter(c => c.status === params.status).length
    };
  }
  
  return {
    cobrancas: cobrancas,
    total: cobrancas.length
  };
}

function registrarCobranca(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_COBRANCAS);
  
  const novaCobranca = [
    data.assinante_nome,
    data.assinante_telefone,
    data.valor,
    data.vencimento,
    'Pendente',
    '',
    '',
    data.observacoes || ''
  ];
  
  sheet.appendRow(novaCobranca);
  
  registrarLog('CREATE', `Cobrança registrada: ${data.assinante_nome} - R$ ${data.valor}`, 'Cobranças');
  
  return {
    success: true,
    message: 'Cobrança registrada com sucesso'
  };
}

function atualizarStatusCobranca(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_COBRANCAS);
  const dataValues = sheet.getDataRange().getValues();
  
  // Buscar pelo id (índice + 1)
  const id = parseInt(data.id);
  if (!id || id < 1 || id >= dataValues.length) {
    return { error: 'Cobrança não encontrada' };
  }
  
  const row = id + 1; // +1 por causa do cabeçalho
  
  sheet.getRange(row, 5).setValue(data.status); // Status
  
  if (data.status === 'Pago') {
    sheet.getRange(row, 7).setValue(new Date().toLocaleDateString('pt-BR')); // Data pagamento
  }
  
  registrarLog('UPDATE', `Cobrança atualizada: ${data.assinante_nome || id} - Status: ${data.status}`, 'Cobranças');
  
  return {
    success: true,
    message: 'Status atualizado com sucesso'
  };
}

function registrarEnvioWhatsApp(data) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_COBRANCAS);
  const dataValues = sheet.getDataRange().getValues();
  
  // Buscar pelo id (índice + 1)
  const id = parseInt(data.id);
  if (!id || id < 1 || id >= dataValues.length) {
    return { error: 'Cobrança não encontrada' };
  }
  
  const row = id + 1; // +1 por causa do cabeçalho
  
  sheet.getRange(row, 6).setValue(new Date().toLocaleString('pt-BR')); // Data envio WhatsApp
  
  registrarLog('WHATSAPP', `Mensagem enviada para ${data.telefone}`, 'Cobranças');
  
  return {
    success: true,
    message: 'Envio registrado com sucesso'
  };
}

// ============================================================
// DASHBOARD
// ============================================================

function getDashboardData() {
  const assinantesSheet = getOrCreateSheet(CONFIG.SHEET_ASSINANTES);
  const contratosSheet = getOrCreateSheet(CONFIG.SHEET_CONTRATOS);
  const cobrancasSheet = getOrCreateSheet(CONFIG.SHEET_COBRANCAS);
  
  const assinantesData = assinantesSheet.getDataRange().getValues();
  const contratosData = contratosSheet.getDataRange().getValues();
  const cobrancasData = cobrancasSheet.getDataRange().getValues();
  
  // Contar assinantes por status
  let totalAssinantes = 0;
  let ativos = 0;
  let inadimplentes = 0;
  let cancelados = 0;
  
  if (assinantesData.length > 1) {
    totalAssinantes = assinantesData.length - 1;
    for (let i = 1; i < assinantesData.length; i++) {
      const status = assinantesData[i][13];
      if (status === 'Ativo') ativos++;
      else if (status === 'Inadimplente' || status === 'Atrasado') inadimplentes++;
      else if (status === 'Cancelado') cancelados++;
    }
  }
  
  // Calcular receita mensal
  let receitaMensal = 0;
  if (assinantesData.length > 1) {
    for (let i = 1; i < assinantesData.length; i++) {
      if (assinantesData[i][13] === 'Ativo') {
        receitaMensal += parseFloat(assinantesData[i][10]) || 0;
      }
    }
  }
  
  // Cobranças pendentes
  let cobrancasPendentes = 0;
  let valorPendente = 0;
  if (cobrancasData.length > 1) {
    for (let i = 1; i < cobrancasData.length; i++) {
      if (cobrancasData[i][4] === 'Pendente') {
        cobrancasPendentes++;
        valorPendente += parseFloat(cobrancasData[i][2]) || 0;
      }
    }
  }
  
  return {
    assinantes: {
      total: totalAssinantes,
      ativos: ativos,
      inadimplentes: inadimplentes,
      cancelados: cancelados
    },
    contratos: {
      total: contratosData.length > 1 ? contratosData.length - 1 : 0
    },
    cobrancas: {
      pendentes: cobrancasPendentes,
      valor_pendente: valorPendente
    },
    financeiro: {
      receita_mensal: receitaMensal
    },
    timestamp: new Date().toISOString()
  };
}

// ============================================================
// LOGS
// ============================================================

function getLogs(params) {
  const sheet = getOrCreateSheet(CONFIG.SHEET_LOGS);
  const data = sheet.getDataRange().getValues();
  
  if (data.length <= 1) {
    return { logs: [], total: 0 };
  }
  
  let logs = data.slice(1).map((row, index) => ({
    id: index + 1,
    data: row[0] || '',
    acao: row[1] || '',
    descricao: row[2] || '',
    modulo: row[3] || ''
  }));
  
  // Ordenar por data (mais recente primeiro)
  logs.reverse();
  
  // Limitar a 100 registros
  if (logs.length > 100) {
    logs = logs.slice(0, 100);
  }
  
  return {
    logs: logs,
    total: logs.length
  };
}

function registrarLog(acao, descricao, modulo) {
  try {
    const sheet = getOrCreateSheet(CONFIG.SHEET_LOGS);
    sheet.appendRow([
      new Date().toLocaleString('pt-BR'),
      acao,
      descricao,
      modulo
    ]);
  } catch (e) {
    console.error('Erro ao registrar log:', e);
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function getOrCreateSheet(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  
  if (!sheet) {
    sheet = ss.insertSheet(name);
  }
  
  return sheet;
}

function generateContractNumber() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = getOrCreateSheet(CONFIG.SHEET_CONTRATOS);
  const data = sheet.getDataRange().getValues();
  const numero = data.length; // Número baseado na quantidade de contratos
  return `CTR-${new Date().getFullYear()}-${String(numero).padStart(4, '0')}`;
}

function jsonResponse(data, callback) {
  const json = JSON.stringify(data);
  
  // Se tiver callback, retorna JSONP (para contornar CORS)
  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  
  // Caso contrário, retorna JSON com headers CORS
  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// SETUP - Execute uma vez para criar a estrutura inicial
// ============================================================

function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Criar aba de Assinantes
  let assinantesSheet = ss.getSheetByName(CONFIG.SHEET_ASSINANTES);
  if (!assinantesSheet) {
    assinantesSheet = ss.insertSheet(CONFIG.SHEET_ASSINANTES);
    assinantesSheet.appendRow([
      'Nome', 'CPF/CNPJ', 'Email', 'Telefone', 'Endereço',
      'Bairro', 'Cidade', 'UF', 'CEP', 'Plano',
      'Valor Mensal', 'Dia Vencimento', 'Data Início', 'Status',
      'Observações', 'Data Cadastro'
    ]);
    // Formatar cabeçalho
    const headerRange = assinantesSheet.getRange(1, 1, 1, 16);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#4285f4');
    headerRange.setFontColor('#ffffff');
  }
  
  // Criar aba de Contratos
  let contratosSheet = ss.getSheetByName(CONFIG.SHEET_CONTRATOS);
  if (!contratosSheet) {
    contratosSheet = ss.insertSheet(CONFIG.SHEET_CONTRATOS);
    contratosSheet.appendRow([
      'Número Contrato', 'Assinante', 'CPF/CNPJ', 'Endereço',
      'Plano', 'Valor Mensal', 'Data Início', 'Data Fim',
      'Status', 'Data Geração'
    ]);
    const headerRange = contratosSheet.getRange(1, 1, 1, 10);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#34a853');
    headerRange.setFontColor('#ffffff');
  }
  
  // Criar aba de Cobranças
  let cobrancasSheet = ss.getSheetByName(CONFIG.SHEET_COBRANCAS);
  if (!cobrancasSheet) {
    cobrancasSheet = ss.insertSheet(CONFIG.SHEET_COBRANCAS);
    cobrancasSheet.appendRow([
      'Assinante', 'Telefone', 'Valor', 'Vencimento',
      'Status', 'Data Envio WhatsApp', 'Data Pagamento', 'Observações'
    ]);
    const headerRange = cobrancasSheet.getRange(1, 1, 1, 8);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#fbbc04');
    headerRange.setFontColor('#ffffff');
  }
  
  // Criar aba de Logs
  let logsSheet = ss.getSheetByName(CONFIG.SHEET_LOGS);
  if (!logsSheet) {
    logsSheet = ss.insertSheet(CONFIG.SHEET_LOGS);
    logsSheet.appendRow(['Data', 'Ação', 'Descrição', 'Módulo']);
    const headerRange = logsSheet.getRange(1, 1, 1, 4);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#ea4335');
    headerRange.setFontColor('#ffffff');
  }
  
  // Criar aba de Configurações
  let configSheet = ss.getSheetByName('Configurações');
  if (!configSheet) {
    configSheet = ss.insertSheet('Configurações');
    configSheet.appendRow(['Configuração', 'Valor']);
    configSheet.appendRow(['Nome Empresa', CONFIG.NOME_EMPRESA]);
    configSheet.appendRow(['CNPJ', CONFIG.CNPJ_EMPRESA]);
    configSheet.appendRow(['Endereço', CONFIG.ENDERECO_EMPRESA]);
    configSheet.appendRow(['Telefone', CONFIG.TELEFONE_EMPRESA]);
    configSheet.appendRow(['Email', CONFIG.EMAIL_EMPRESA]);
    configSheet.appendRow(['Senha Sistema', CONFIG.SENHA_SISTEMA]);
    const headerRange = configSheet.getRange(1, 1, 1, 2);
    headerRange.setFontWeight('bold');
    headerRange.setBackground('#5f6368');
    headerRange.setFontColor('#ffffff');
  }
  
  // Registrar log de setup
  registrarLog('SETUP', 'Sistema inicializado com sucesso', 'Sistema');
  
  Logger.log('✅ Sistema configurado com sucesso!');
  Logger.log('📋 Abas criadas: Assinantes, Contratos, Cobranças, Logs, Configurações');
}

// ============================================================
// MENU PERSONALIZADO
// ============================================================

function onOpen() {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('🏢 Mídia Indoor')
    .addItem('📊 Ver Dashboard', 'showDashboard')
    .addItem('📝 Novo Assinante', 'showNewAssinanteDialog')
    .addItem('📄 Gerar Contrato', 'showNewContractDialog')
    .addSeparator()
    .addItem('⚙️ Configurações', 'showConfigDialog')
    .addItem('📋 Ver Logs', 'showLogs')
    .addToUi();
}

function showDashboard() {
  const html = HtmlService.createHtmlOutputFromFile('Dashboard')
    .setWidth(800)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📊 Dashboard');
}

function showNewAssinanteDialog() {
  const html = HtmlService.createHtmlOutputFromFile('NovoAssinante')
    .setWidth(500)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📝 Novo Assinante');
}

function showNewContractDialog() {
  const html = HtmlService.createHtmlOutputFromFile('NovoContrato')
    .setWidth(500)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📄 Novo Contrato');
}

function showConfigDialog() {
  const html = HtmlService.createHtmlOutputFromFile('Configuracoes')
    .setWidth(400)
    .setHeight(400);
  SpreadsheetApp.getUi().showModalDialog(html, '⚙️ Configurações');
}

function showLogs() {
  const html = HtmlService.createHtmlOutputFromFile('Logs')
    .setWidth(800)
    .setHeight(600);
  SpreadsheetApp.getUi().showModalDialog(html, '📋 Logs do Sistema');
}
