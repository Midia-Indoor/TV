# 🚀 Instruções Rápidas - Sistema de Mídia Indoor

## 📦 Arquivos do Projeto

```
p3/
├── index.html              # Frontend (HTML)
├── css/
│   └── styles.css          # Estilos (CSS)
├── js/
│   └── app.js              # Lógica (JavaScript)
├── google-apps-script/
│   └── Code.gs             # Backend (Google Apps Script)
├── MANUAL_DE_OPERACAO.md   # Manual completo
├── REGUA_DE_COBRANCA.md    # Régua de cobrança
└── INSTRUCOES.md           # Este arquivo
```

---

## ⚡ Instalação em 5 Passos

### Passo 1: Criar a Planilha

1. Acesse https://sheets.google.com
2. Crie uma nova planilha
3. Nomeie como "Mídia Indoor"

### Passo 2: Instalar o Backend

1. Na planilha, clique em **Extensões** → **Apps Script**
2. Apague todo o código padrão
3. Cole o conteúdo do arquivo `google-apps-script/Code.gs`
4. Salve (Ctrl+S)

### Passo 3: Executar o Setup

1. Selecione a função `setup` no dropdown
2. Clique em **Executar**
3. Autorize o acesso
4. Aguarde criar as abas (Assinantes, Contratos, Cobranças, Logs, Configurações)

### Passo 4: Publicar o Web App

1. Clique em **Implantar** → **Nova implantação**
2. Tipo: **Aplicativo da Web**
3. Configurações:
   - Executar como: **Eu**
   - Acesso: **Qualquer pessoa**
4. Clique em **Implantar**
5. **Copie a URL gerada**

### Passo 5: Configurar o Frontend

1. Abra o arquivo `js/app.js` em um editor de texto
2. Localize esta linha:
   ```javascript
   const WEB_APP_URL = 'https://script.google.com/macros/s/SUBISTA_AQUI/exec';
   ```
3. Substitua pela URL copiada no Passo 4
4. Salve o arquivo

---

## 🎯 Pronto! Como Usar

1. Abra o arquivo `index.html` no navegador
2. Digite a senha: `midia123`
3. Clique em **Entrar**

---

## 📋 Funcionalidades

### ✅ Dashboard
- Visão geral com métricas
- Total de assinantes, inadimplentes, receita mensal
- Ações rápidas

### ✅ Assinantes
- Cadastro completo
- Filtro por status (Ativo, Inadimplente, Atrasado, Cancelado)
- Busca por nome, CPF/CNPJ, email, telefone
- Edição e exclusão

### ✅ Contratos
- Geração automática de contratos
- Formatação para impressão A4
- Cláusulas incluídas:
  - Incolumidade
  - Manutenção técnica
  - Quebra de fidelidade

### ✅ Cobranças
- Envio via WhatsApp com mensagem automática
- Cobrança em lote para inadimplentes
- Marcar como pago

---

## 🔐 Credenciais

| Campo | Valor |
|-------|-------|
| **Senha** | `midia123` |

Para alterar: Abra a planilha → Aba "Configurações" → Altere "Senha Sistema"

---

## 📱 Exemplo de Uso

### Cadastrar Assinante
1. Clique em **+ Novo Assinante**
2. Preencha os dados
3. Clique em **Salvar**

### Gerar Contrato
1. Clique em **+ Gerar Contrato**
2. Selecione o assinante
3. Defina as datas
4. Clique em **Gerar Contrato**
5. Clique em **🖨️ Imprimir**

### Cobrar Inadimplente
1. Vá até a aba **Cobranças**
2. Clique em **📱 Cobrar**
3. Revise a mensagem
4. Clique em **📱 Enviar WhatsApp**

---

## 🆘 Problemas Comuns

| Problema | Solução |
|----------|---------|
| Erro de CORS | Verifique se o Web App está como "Qualquer pessoa" |
| Dados não carregam | Verifique a URL do Web App no app.js |
| Erro ao salvar | Verifique se todos os campos obrigatórios estão preenchidos |
| Contrato não imprime | Use Chrome/Edge e selecione papel A4 |

---

## 📚 Documentação Completa

- **Manual de Operação:** `MANUAL_DE_OPERACAO.md`
- **Régua de Cobrança:** `REGUA_DE_COBRANCA.md`

---

## 🔧 Personalização

### Alterar Nome da Empresa
No arquivo `google-apps-script/Code.gs`, modifique:
```javascript
const CONFIG = {
  NOME_EMPRESA: 'Sua Empresa LTDA',
  CNPJ_EMPRESA: '00.000.000/0001-00',
  // ...
};
```

### Alterar Cláusulas do Contrato
No arquivo `js/app.js`, localize a função `generateContractHTML` e modifique o texto das cláusulas.

### Alterar Mensagem de Cobrança
No arquivo `js/app.js`, localize a função `enviarWhatsApp` e modifique o template da mensagem.

---

**Sistema de Gestão de Mídia Indoor v1.0.0**
