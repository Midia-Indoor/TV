/**
 * ============================================================
 * SISTEMA DE GESTÃO DE MÍDIA INDOOR - JAVASCRIPT
 * ============================================================
 * 
 * Este arquivo contém toda a lógica do frontend do sistema.
 * O sistema se comunica com o Google Sheets via Google Apps Script.
 * 
 * ============================================================
 */

// ============================================================
// CONFIGURAÇÃO - COLE A URL DO SEU WEB APP AQUI
// ============================================================

const WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbzI4kkv0zIP7Pce6aAhXQ2V8oWDXh4DYDtvjWSbqV-5egiEAPBFrpSbCWQfCYgUJCbA/exec';

// ============================================================
// ESTADO GLOBAL
// ============================================================

let isAuthenticated = false;
let assinantes = [];
let contratos = [];
let cobrancas = [];
let currentContract = null;

// ============================================================
// AUTENTICAÇÃO
// ============================================================

document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const senha = document.getElementById('login-password').value;
  
  try {
    const result = await apiCall('GET', { action: 'verificar-senha', senha });
    
    if (result.autenticado) {
      isAuthenticated = true;
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('app').classList.remove('hidden');
      loadAllData();
    } else {
      document.getElementById('login-error').classList.remove('hidden');
    }
  } catch (error) {
    console.error('Erro no login:', error);
    alert('Erro ao conectar com o servidor. Verifique sua conexão.');
  }
});

function logout() {
  isAuthenticated = false;
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-password').value = '';
  document.getElementById('login-error').classList.add('hidden');
}

// ============================================================
// API CALLS - JSONP (para contornar CORS)
// ============================================================

async function apiCall(method, params, body = null) {
  return new Promise((resolve, reject) => {
    const callbackName = 'jsonp_callback_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    
    // Criar função global de callback
    window[callbackName] = function(data) {
      delete window[callbackName];
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      resolve(data);
    };
    
    // Criar script tag
    const script = document.createElement('script');
    script.onerror = function() {
      delete window[callbackName];
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      reject(new Error('Erro ao conectar com o servidor'));
    };
    
    // Montar URL com callback
    const url = new URL(WEB_APP_URL);
    params.callback = callbackName;
    
    if (method === 'GET') {
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      script.src = url.toString();
    } else {
      // POST via JSONP não é suportado, usar GET com parâmetros
      Object.keys(params).forEach(key => url.searchParams.append(key, params[key]));
      if (body) {
        Object.keys(body).forEach(key => url.searchParams.append(key, body[key]));
      }
      script.src = url.toString();
    }
    
    document.body.appendChild(script);
  });
}

// ============================================================
// CARREGAR DADOS
// ============================================================

async function loadAllData() {
  await Promise.all([
    loadDashboard(),
    loadAssinantes(),
    loadContratos(),
    loadCobrancas()
  ]);
}

async function refreshData() {
  await loadAllData();
  alert('Dados atualizados com sucesso!');
}

async function loadDashboard() {
  try {
    const data = await apiCall('GET', { action: 'dashboard' });
    
    document.getElementById('stat-total-assinantes').textContent = data.assinantes.total;
    document.getElementById('stat-ativos').textContent = data.assinantes.ativos;
    document.getElementById('stat-inadimplentes').textContent = data.assinantes.inadimplentes;
    document.getElementById('stat-receita').textContent = formatCurrency(data.financeiro.receita_mensal);
    document.getElementById('stat-contratos').textContent = data.contratos.total;
    document.getElementById('stat-pendentes').textContent = data.cobrancas.pendentes;
    document.getElementById('stat-valor-pendente').textContent = formatCurrency(data.cobrancas.valor_pendente);
    
    // Últimos assinantes
    const recentAssinantes = await apiCall('GET', { action: 'assinantes' });
    const tbody = document.getElementById('recent-assinantes');
    const lista = recentAssinantes.assinantes.slice(0, 5);
    tbody.innerHTML = lista.map(a => `
      <tr>
        <td>
          <div style="font-weight: 500;">${a.nome}</div>
          <div style="font-size: 12px; color: #6c757d;">${a.email || '-'}</div>
        </td>
        <td>${a.plano}</td>
        <td>${formatCurrency(a.valor_mensal)}</td>
        <td><span class="status-badge status-${a.status.toLowerCase()}">${a.status}</span></td>
        <td>${a.dia_vencimento}</td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar dashboard:', error);
  }
}

async function loadAssinantes(filters = {}) {
  try {
    const params = { action: 'assinantes', ...filters };
    const data = await apiCall('GET', params);
    assinantes = data.assinantes;
    
    const tbody = document.getElementById('assinantes-table');
    tbody.innerHTML = assinantes.map(a => `
      <tr>
        <td>
          <div style="font-weight: 500;">${a.nome}</div>
          <div style="font-size: 12px; color: #6c757d;">${a.email || '-'}</div>
        </td>
        <td>${a.cpf_cnpj}</td>
        <td>${a.telefone}</td>
        <td>${a.plano}</td>
        <td>${formatCurrency(a.valor_mensal)}</td>
        <td><span class="status-badge status-${a.status.toLowerCase()}">${a.status}</span></td>
        <td>
          <div style="display: flex; gap: 8px;">
            <button onclick="editAssinante(${a.id})" class="text-link" title="Editar">✏️</button>
            <button onclick="deleteAssinante(${a.id})" class="text-link" title="Excluir" style="color: #dc3545;">🗑️</button>
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar assinantes:', error);
  }
}

async function loadContratos() {
  try {
    const data = await apiCall('GET', { action: 'contratos' });
    contratos = data.contratos;
    
    const tbody = document.getElementById('contratos-table');
    tbody.innerHTML = contratos.map(c => `
      <tr>
        <td style="font-weight: 500;">${c.numero_contrato}</td>
        <td>${c.assinante_nome}</td>
        <td>${c.plano}</td>
        <td>${formatCurrency(c.valor_mensal)}</td>
        <td>${formatDate(c.data_inicio)} - ${formatDate(c.data_fim)}</td>
        <td><span class="status-badge status-${c.status.toLowerCase()}">${c.status}</span></td>
        <td>
          <button onclick="viewContract(${c.id})" class="text-link" title="Visualizar">👁️</button>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar contratos:', error);
  }
}

async function loadCobrancas() {
  try {
    const data = await apiCall('GET', { action: 'cobrancas' });
    cobrancas = data.cobrancas;
    
    const tbody = document.getElementById('cobrancas-table');
    tbody.innerHTML = cobrancas.map(c => `
      <tr>
        <td style="font-weight: 500;">${c.assinante_nome}</td>
        <td>${c.assinante_telefone}</td>
        <td>${formatCurrency(c.valor)}</td>
        <td>${formatDate(c.vencimento)}</td>
        <td><span class="status-badge status-${c.status.toLowerCase()}">${c.status}</span></td>
        <td>
          <div style="display: flex; gap: 8px;">
            ${c.status === 'Pendente' ? `
              <button onclick="openWhatsAppModal('${c.assinante_nome}', '${c.assinante_telefone}', ${c.valor})" 
                      class="btn btn-whatsapp" style="padding: 4px 12px; font-size: 12px;">
                📱 Cobrar
              </button>
              <button onclick="markAsPaid(${c.id})" class="text-link" title="Marcar como pago">✓</button>
            ` : `
              <span class="text-success">✓ Pago</span>
            `}
          </div>
        </td>
      </tr>
    `).join('');
  } catch (error) {
    console.error('Erro ao carregar cobranças:', error);
  }
}

// ============================================================
// NAVEGAÇÃO
// ============================================================

function switchTab(tabName) {
  // Esconder todos os conteúdos
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
  
  // Mostrar conteúdo selecionado
  document.getElementById(`content-${tabName}`).classList.add('active');
  document.getElementById(`tab-${tabName}`).classList.add('active');
}

// ============================================================
// MODAIS
// ============================================================

function showNewAssinanteModal() {
  document.getElementById('form-assinante').reset();
  document.getElementById('modal-assinante').classList.remove('hidden');
}

function showNewContractModal() {
  // Carregar assinantes no select
  const select = document.getElementById('select-assinante');
  select.innerHTML = '<option value="">Selecione um assinante...</option>' +
    assinantes.map(a => `<option value="${a.id}" data-nome="${a.nome}" data-cpf="${a.cpf_cnpj}" data-endereco="${a.endereco}, ${a.bairro} - ${a.cidade}/${a.uf}" data-plano="${a.plano}" data-valor="${a.valor_mensal}">${a.nome} - ${a.plano}</option>`).join('');
  
  document.getElementById('form-contrato').reset();
  document.getElementById('modal-contrato').classList.remove('hidden');
}

function closeModal(modalId) {
  document.getElementById(modalId).classList.add('hidden');
}

// ============================================================
// FORMULÁRIOS
// ============================================================

document.getElementById('form-assinante').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData);
  data.action = 'criar-assinante';
  
  try {
    const result = await apiCall('POST', {}, data);
    if (result.success) {
      closeModal('modal-assinante');
      alert('Assinante criado com sucesso!');
      loadAllData();
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (error) {
    console.error('Erro ao criar assinante:', error);
    alert('Erro ao criar assinante. Tente novamente.');
  }
});

document.getElementById('form-contrato').addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(e.target);
  const assinanteSelect = document.getElementById('select-assinante');
  const selectedOption = assinanteSelect.options[assinanteSelect.selectedIndex];
  
  const data = {
    action: 'criar-contrato',
    assinante_nome: selectedOption.dataset.nome,
    assinante_cpf: selectedOption.dataset.cpf,
    assinante_endereco: selectedOption.dataset.endereco,
    plano: formData.get('plano'),
    valor_mensal: formData.get('valor_mensal'),
    data_inicio: formData.get('data_inicio'),
    data_fim: formData.get('data_fim')
  };
  
  try {
    const result = await apiCall('POST', {}, data);
    if (result.success) {
      closeModal('modal-contrato');
      alert('Contrato gerado com sucesso!\nNúmero: ' + result.numero_contrato);
      loadAllData();
    } else {
      alert('Erro: ' + result.error);
    }
  } catch (error) {
    console.error('Erro ao criar contrato:', error);
    alert('Erro ao criar contrato. Tente novamente.');
  }
});

// Atualizar plano e valor ao selecionar assinante
document.getElementById('select-assinante').addEventListener('change', (e) => {
  const selectedOption = e.target.options[e.target.selectedIndex];
  if (selectedOption.dataset.plano) {
    document.getElementById('contrato-plano').value = selectedOption.dataset.plano;
    document.getElementById('contrato-valor').value = selectedOption.dataset.valor;
  }
});

// ============================================================
// CONTRATOS
// ============================================================

async function viewContract(id) {
  const contrato = contratos.find(c => c.id === id);
  if (!contrato) return;
  
  currentContract = contrato;
  
  const content = document.getElementById('contract-content');
  content.innerHTML = generateContractHTML(contrato);
  
  document.getElementById('modal-view-contract').classList.remove('hidden');
}

function generateContractHTML(contrato) {
  const hoje = new Date().toLocaleDateString('pt-BR');
  
  return `
    <div class="contract-page">
      <div class="contract-header">
        <h1>CONTRATO DE PRESTAÇÃO DE SERVIÇOS</h1>
        <h2>MÍDIA INDOOR</h2>
        <p class="contract-number">Contrato Nº ${contrato.numero_contrato}</p>
      </div>
      
      <div style="margin-bottom: 16pt;">
        <p>
          <strong>CONTRATANTE:</strong> ${contrato.assinante_nome}, inscrito no CPF/CNPJ sob o nº ${contrato.assinante_cpf}, 
          residente e domiciliado à ${contrato.assinante_endereco}.
        </p>
        <p>
          <strong>CONTRATADA:</strong> MÍDIA INDOOR LTDA, inscrita no CNPJ sob o nº 00.000.000/0001-00, 
          com sede à Rua Exemplo, 123 - Centro - Cidade/UF.
        </p>
      </div>
      
      <h3>CLÁUSULA 1ª - DO OBJETO</h3>
      <p>
        O presente contrato tem por objeto a prestação de serviços de mídia indoor, 
        consistindo na exibição de conteúdo publicitário e informativo em telas instaladas 
        em estabelecimentos comerciais, conforme plano escolhido: <strong>${contrato.plano}</strong>.
      </p>
      
      <h3>CLÁUSULA 2ª - DO VALOR E FORMA DE PAGAMENTO</h3>
      <p>
        O valor mensal dos serviços é de <strong>${formatCurrency(contrato.valor_mensal)}</strong>, 
        a serem pagos até o dia ${contrato.dia_vencimento || 5} de cada mês, mediante boleto bancário 
        ou outra forma de pagamento acordada entre as partes.
      </p>
      
      <h3>CLÁUSULA 3ª - DA INCOLUMIDADE</h3>
      <p>
        A CONTRATADA não se responsabiliza por quaisquer danos diretos ou indiretos decorrentes 
        de caso fortuito, força maior, falhas técnicas de terceiros, interrupções de energia, 
        problemas de conexão com a internet ou qualquer outro fator alheio ao seu controle, 
        que impeçam a normal exibição do conteúdo.
      </p>
      
      <h3>CLÁUSULA 4ª - DA MANUTENÇÃO TÉCNICA</h3>
      <p>
        A CONTRATADA se compromete a realizar a manutenção técnica preventiva e corretiva 
        dos equipamentos, garantindo o pleno funcionamento do sistema. Em caso de necessidade 
        de manutenção, a CONTRATADA terá o prazo de até 48 horas para atendimento, 
        contado a partir da comunicação pelo CONTRATANTE.
      </p>
      
      <h3>CLÁUSULA 5ª - DA QUEBRA DE FIDELIDADE</h3>
      <p>
        O presente contrato possui fidelidade de 12 (doze) meses. Em caso de rescisão antecipada 
        pelo CONTRATANTE, será devida multa correspondente a 3 (três) parcelas do valor mensal, 
        a título de cláusula penal compensatória.
      </p>
      
      <h3>CLÁUSULA 6ª - DO PRAZO</h3>
      <p>
        O presente contrato vigorará por prazo indeterminado, a partir de ${formatDate(contrato.data_inicio)}, 
        podendo ser rescindido por qualquer das partes mediante comunicação prévia de 30 (trinta) dias.
      </p>
      
      <div style="margin-top: 48pt;">
        <p style="text-align: center; margin-bottom: 32pt;">
          Por estarem justos e acordados, assinam o presente contrato em 02 (duas) vias de igual teor.
        </p>
        
        <div class="signature-section">
          <div class="signature-line">
            <div class="line"></div>
            <div class="name">CONTRATANTE</div>
            <div style="font-size: 10pt; color: #666;">${contrato.assinante_nome}</div>
          </div>
          <div class="signature-line">
            <div class="line"></div>
            <div class="name">CONTRATADA</div>
            <div style="font-size: 10pt; color: #666;">MÍDIA INDOOR LTDA</div>
          </div>
        </div>
        
        <p style="font-size: 10pt; color: #999; text-align: center; margin-top: 24pt;">
          Documento gerado em ${hoje}
        </p>
      </div>
    </div>
  `;
}

function printContract() {
  const content = document.getElementById('contract-content').innerHTML;
  const printWindow = window.open('', '_blank');
  printWindow.document.write(`
    <html>
    <head>
      <title>Contrato - ${currentContract?.numero_contrato}</title>
      <style>
        body { margin: 0; padding: 0; font-family: 'Times New Roman', serif; }
        .contract-page { width: 210mm; min-height: 297mm; padding: 20mm; margin: 0 auto; }
        .contract-page h1 { text-align: center; font-size: 18pt; margin-bottom: 8pt; }
        .contract-page h2 { text-align: center; font-size: 14pt; margin-bottom: 4pt; }
        .contract-page h3 { font-size: 12pt; margin-top: 16pt; margin-bottom: 8pt; }
        .contract-page p { text-align: justify; margin-bottom: 8pt; font-size: 12pt; line-height: 1.5; }
        .contract-header { text-align: center; margin-bottom: 24pt; }
        .contract-number { font-size: 10pt; color: #666; }
        .signature-section { margin-top: 48pt; display: flex; justify-content: space-between; }
        .signature-line { width: 200pt; text-align: center; }
        .signature-line .line { border-top: 1px solid #333; margin-bottom: 4pt; }
        .signature-line .name { font-size: 10pt; }
      </style>
    </head>
    <body>${content}</body>
    </html>
  `);
  printWindow.document.close();
  printWindow.print();
}

// ============================================================
// COBRANÇAS
// ============================================================

function openWhatsAppModal(nome, telefone, valor) {
  document.getElementById('cobranca-nome').value = nome;
  document.getElementById('cobranca-telefone').value = telefone;
  document.getElementById('cobranca-valor').value = formatCurrency(valor);
  
  const mensagem = `Olá ${nome}! 👋\n\nEsperamos que esteja bem. Gostaríamos de lembrar que sua mensalidade no valor de ${formatCurrency(valor)} está pendente.\n\nPor favor, efetue o pagamento o mais breve possível para evitar a interrupção do serviço.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\nMídia Indoor`;
  
  document.getElementById('cobranca-mensagem').value = mensagem;
  
  document.getElementById('modal-cobranca').classList.remove('hidden');
}

async function enviarWhatsApp() {
  const nome = document.getElementById('cobranca-nome').value;
  const telefone = document.getElementById('cobranca-telefone').value;
  const valor = document.getElementById('cobranca-valor').value;
  const mensagem = document.getElementById('cobranca-mensagem').value;
  
  // Formatar telefone
  const telefoneLimpo = telefone.replace(/\D/g, '');
  const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;
  
  // Abrir WhatsApp
  const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
  window.open(url, '_blank');
  
  // Registrar envio
  try {
    await apiCall('POST', {}, {
      action: 'enviar-whatsapp',
      telefone: telefone
    });
  } catch (error) {
    console.error('Erro ao registrar envio:', error);
  }
  
  closeModal('modal-cobranca');
}

async function cobrarInadimplentes() {
  try {
    const data = await apiCall('GET', { action: 'assinantes-inadimplentes' });
    
    if (data.inadimplentes.length === 0) {
      alert('Não há inadimplentes no momento!');
      return;
    }
    
    const confirmacao = confirm(`Deseja enviar cobrança para ${data.inadimplentes.length} inadimplente(s)?`);
    
    if (confirmacao) {
      for (const inadimplente of data.inadimplentes) {
        const mensagem = `Olá ${inadimplente.nome}! 👋\n\nNotamos que sua mensalidade está pendente. O valor de ${formatCurrency(inadimplente.valor_mensal)} está com vencimento no dia ${inadimplente.dia_vencimento}.\n\nPor favor, regularize sua situação para evitar a interrupção do serviço.\n\nQualquer dúvida, estamos à disposição!\n\nAtenciosamente,\nMídia Indoor`;
        
        const telefoneLimpo = inadimplente.telefone.replace(/\D/g, '');
        const telefoneFormatado = telefoneLimpo.startsWith('55') ? telefoneLimpo : '55' + telefoneLimpo;
        
        const url = `https://wa.me/${telefoneFormatado}?text=${encodeURIComponent(mensagem)}`;
        window.open(url, '_blank');
        
        // Pequeno delay entre envios
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      alert('Cobranças enviadas com sucesso!');
    }
  } catch (error) {
    console.error('Erro ao cobrar inadimplentes:', error);
    alert('Erro ao processar cobranças.');
  }
}

async function markAsPaid(id) {
  try {
    await apiCall('POST', {}, {
      action: 'atualizar-status-cobranca',
      id: id,
      status: 'Pago'
    });
    
    alert('Cobrança marcada como paga!');
    loadAllData();
  } catch (error) {
    console.error('Erro ao marcar como pago:', error);
    alert('Erro ao atualizar status.');
  }
}

// ============================================================
// UTILITÁRIOS
// ============================================================

function formatCurrency(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
}

function formatDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  return date.toLocaleDateString('pt-BR');
}

function editAssinante(id) {
  const assinante = assinantes.find(a => a.id === id);
  if (!assinante) return;
  
  const form = document.getElementById('form-assinante');
  form.nome.value = assinante.nome;
  form.cpf_cnpj.value = assinante.cpf_cnpj;
  form.email.value = assinante.email;
  form.telefone.value = assinante.telefone;
  form.endereco.value = assinante.endereco;
  form.bairro.value = assinante.bairro;
  form.cidade.value = assinante.cidade;
  form.uf.value = assinante.uf;
  form.cep.value = assinante.cep;
  form.plano.value = assinante.plano;
  form.valor_mensal.value = assinante.valor_mensal;
  form.dia_vencimento.value = assinante.dia_vencimento;
  form.data_inicio.value = assinante.data_inicio;
  form.status.value = assinante.status;
  form.observacoes.value = assinante.observacoes;
  
  showNewAssinanteModal();
}

async function deleteAssinante(id) {
  const confirmacao = confirm('Tem certeza que deseja excluir este assinante?');
  
  if (confirmacao) {
    try {
      await apiCall('POST', {}, {
        action: 'deletar-assinante',
        id: id
      });
      
      alert('Assinante excluído com sucesso!');
      loadAllData();
    } catch (error) {
      console.error('Erro ao excluir assinante:', error);
      alert('Erro ao excluir assinante.');
    }
  }
}

function exportData() {
  const data = {
    assinantes: assinantes,
    contratos: contratos,
    cobrancas: cobrancas,
    exportadoEm: new Date().toISOString()
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `midia-indoor-backup-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

// Filtros
document.getElementById('search-assinantes').addEventListener('input', (e) => {
  loadAssinantes({ busca: e.target.value });
});

document.getElementById('filter-status').addEventListener('change', (e) => {
  loadAssinantes({ status: e.target.value });
});
