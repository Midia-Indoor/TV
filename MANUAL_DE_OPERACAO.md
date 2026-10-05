# Manual de Operação - Sistema de Gestão de Mídia Indoor

## 📋 Índice

1. [Introdução](#introdução)
2. [Configuração Inicial](#configuração-inicial)
3. [Acesso ao Sistema](#acesso-ao-sistema)
4. [Dashboard](#dashboard)
5. [Gestão de Assinantes](#gestão-de-assinantes)
6. [Geração de Contratos](#geração-de-contratos)
7. [Cobranças](#cobranças)
8. [Régua de Cobrança](#régua-de-cobrança)
9. [Backup e Segurança](#backup-e-segurança)
10. [Solução de Problemas](#solução-de-problemas)

---

## 1. Introdução

O Sistema de Gestão de Mídia Indoor é uma ferramenta completa para gerenciar assinantes, contratos e cobranças do seu negócio de mídia indoor. O sistema é integrado ao Google Sheets, permitindo acesso fácil aos dados de qualquer lugar.

### Funcionalidades Principais

- ✅ Cadastro e gestão de assinantes
- ✅ Geração de contratos formatados para impressão A4
- ✅ Sistema de cobranças com envio via WhatsApp
- ✅ Dashboard com métricas e indicadores
- ✅ Filtros e busca avançada
- ✅ Exportação de dados

---

## 2. Configuração Inicial

### Passo 1: Criar a Planilha

1. Acesse [Google Sheets](https://sheets.google.com)
2. Crie uma nova planilha
3. Nomeie como "Mídia Indoor - Gestão"

### Passo 2: Instalar o Google Apps Script

1. Na planilha, clique em **Extensões** → **Apps Script**
2. Apague o código padrão
3. Cole o código do arquivo `google-apps-script/Code.gs`
4. Salve o projeto (Ctrl+S)

### Passo 3: Executar o Setup

1. No editor do Apps Script, selecione a função `setup`
2. Clique em **Executar**
3. Autorize o acesso à planilha
4. Aguarde a criação das abas:
   - ✅ Assinantes
   - ✅ Contratos
   - ✅ Cobranças
   - ✅ Logs
   - ✅ Configurações

### Passo 4: Publicar o Web App

1. Clique em **Implantar** → **Nova implantação**
2. Selecione o tipo: **Aplicativo da Web**
3. Configure:
   - **Descrição:** "Mídia Indoor - API"
   - **Executar como:** "Eu"
   - **Quem tem acesso:** "Qualquer pessoa"
4. Clique em **Implantar**
5. Copie a URL gerada (será algo como `https://script.google.com/macros/s/.../exec`)

### Passo 5: Configurar o Frontend

1. Abra o arquivo `js/app.js`
2. Localize a linha:
   ```javascript
   const WEB_APP_URL = 'https://script.google.com/macros/s/SUBISTA_AQUI/exec';
   ```
3. Substitua pela URL copiada no passo anterior
4. Salve o arquivo

---

## 3. Acesso ao Sistema

### Credenciais Padrão

- **Senha:** `midia123`

### Como Acessar

1. Abra o arquivo `index.html` no navegador
2. Digite a senha: `midia123`
3. Clique em **Entrar**

### Alterar a Senha

1. Abra a planilha no Google Sheets
2. Vá até a aba **Configurações**
3. Altere o valor na linha "Senha Sistema"
4. Atualize a senha no arquivo `js/app.js`

---

## 4. Dashboard

O Dashboard apresenta uma visão geral do seu negócio com os seguintes indicadores:

### Cards de Métricas

| Métrica | Descrição |
|---------|-----------|
| **Total Assinantes** | Quantidade total de assinantes cadastrados |
| **Inadimplentes** | Assinantes com status "Inadimplente" ou "Atrasado" |
| **Receita Mensal** | Soma dos valores dos assinantes ativos |
| **Cobranças Pendentes** | Quantidade e valor das cobranças não pagas |

### Ações Rápidas

- **Novo Assinante:** Cadastra um novo assinante
- **Gerar Contrato:** Cria um novo contrato
- **Cobrar Inadimplentes:** Envia mensagens via WhatsApp para todos os inadimplentes
- **Exportar Dados:** Faz backup dos dados em formato JSON

---

## 5. Gestão de Assinantes

### Cadastrar Novo Assinante

1. Clique em **+ Novo** ou **Novo Assinante**
2. Preencha os campos obrigatórios (*):
   - Nome Completo
   - CPF/CNPJ
   - Telefone
   - Plano
   - Valor Mensal
   - Dia Vencimento
   - Data Início
3. Clique em **Salvar**

### Buscar Assinantes

- Use o campo **Buscar...** para filtrar por nome, CPF/CNPJ, email ou telefone
- Use o filtro **Status** para ver apenas assinantes com determinado status

### Editar Assinante

1. Clique no ícone de edição (lápis) na linha do assinante
2. Altere os campos desejados
3. Clique em **Salvar**

### Excluir Assinante

1. Clique no ícone de lixeira na linha do assinante
2. Confirme a exclusão

### Status Disponíveis

| Status | Descrição |
|--------|-----------|
| **Ativo** | Assinante em dia com os pagamentos |
| **Inadimplente** | Assinante com pagamento atrasado |
| **Atrasado** | Assinante com pagamento próximo do vencimento |
| **Cancelado** | Assinante que cancelou o serviço |

---

## 6. Geração de Contratos

### Criar Novo Contrato

1. Clique em **+ Gerar Contrato**
2. Selecione o assinante na lista
3. O plano e valor serão preenchidos automaticamente
4. Defina as datas de início e fim
5. Clique em **Gerar Contrato**

### Cláusulas do Contrato

O contrato inclui automaticamente as seguintes cláusulas:

#### Cláusula de Incolumidade
> A CONTRATADA não se responsabiliza por quaisquer danos diretos ou indiretos decorrentes de caso fortuito, força maior, falhas técnicas de terceiros, interrupções de energia, problemas de conexão com a internet ou qualquer outro fator alheio ao seu controle.

#### Cláusula de Manutenção Técnica
> A CONTRATADA se compromete a realizar a manutenção técnica preventiva e corretiva dos equipamentos, garantindo o pleno funcionamento do sistema. Em caso de necessidade de manutenção, a CONTRATADA terá o prazo de até 48 horas para atendimento.

#### Cláusula de Quebra de Fidelidade
> O presente contrato possui fidelidade de 12 (doze) meses. Em caso de rescisão antecipada pelo CONTRATANTE, será devida multa correspondente a 3 (três) parcelas do valor mensal.

### Imprimir Contrato

1. Clique no ícone de visualização (olho) na linha do contrato
2. Clique en **🖨️ Imprimir**
3. O contrato será formatado para impressão A4

---

## 7. Cobranças

### Enviar Cobrança Individual

1. Na aba **Cobranças**, localize o assinante
2. Clique em **📱 Cobrar**
3. A mensagem será pré-preenchida
4. Clique en **📱 Enviar WhatsApp**
5. O WhatsApp será aberto com a mensagem pronta

### Cobrar Todos os Inadimplentes

1. Clique em **📱 Cobrar via WhatsApp**
2. Confirme a ação
3. Mensagens serão enviadas para todos os inadimplentes

### Marcar como Pago

1. Clique no ícone de confirmação (✓) na linha da cobrança
2. O status será atualizado para "Pago"

### Modelo de Mensagem

```
Olá [NOME]! 👋

Esperamos que esteja bem. Gostaríamos de lembrar que sua mensalidade no valor de [VALOR] está pendente.

Por favor, efetue o pagamento o mais breve possível para evitar a interrupção do serviço.

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Mídia Indoor
```

---

## 8. Régua de Cobrança

A régua de cobrança define os prazos e ações para cada situação de inadimplência.

### Timeline de Cobrança

| Dias de Atraso | Ação | Canal | Mensagem |
|----------------|------|-------|----------|
| **Dia do vencimento** | Lembrete amigável | WhatsApp | "Olá! Lembramos que hoje é o vencimento da sua mensalidade. 😊" |
| **+3 dias** | Primeira cobrança | WhatsApp | "Notamos que sua mensalidade ainda não foi paga. Por favor, regularize." |
| **+7 dias** | Segunda cobrança | WhatsApp + Ligação | "Sua mensalidade está há 7 dias em atraso. Evite a interrupção do serviço." |
| **+15 dias** | Cobrança formal | WhatsApp + Email | "Último aviso antes da interrupção do serviço. Regularize imediatamente." |
| **+30 dias** | Interrupção | - | Serviço suspenso até regularização |
| **+60 dias** | Negativação | - | Enviar para negativação (se aplicável) |

### Scripts de Cobrança

#### Lembrete (Dia do Vencimento)
```
Olá [NOME]! 😊

Lembramos que hoje é o vencimento da sua mensalidade no valor de [VALOR].

Para evitar a interrupção do serviço, por favor, efetue o pagamento.

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Mídia Indoor
```

#### Primeira Cobrança (+3 dias)
```
Olá [NOME]!

Notamos que sua mensalidade no valor de [VALOR] ainda não foi paga.

Por favor, regularize sua situação o mais breve possível para evitar a interrupção do serviço.

Formas de pagamento:
• Boleto bancário
• PIX
• Cartão de crédito

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Mídia Indoor
```

#### Segunda Cobrança (+7 dias)
```
Olá [NOME],

Sua mensalidade no valor de [VALOR] está há 7 dias em atraso.

Para evitar a interrupção do serviço, por favor, efetue o pagamento imediatamente.

Caso já tenha efetuado o pagamento, por favor, desconsidere esta mensagem.

Atenciosamente,
Mídia Indoor
```

#### Cobrança Formal (+15 dias)
```
Prezado(a) [NOME],

Último aviso antes da interrupção do serviço.

Sua mensalidade no valor de [VALOR] está há 15 dias em atraso.

Regularize sua situação imediatamente para evitar:
• Interrupção do serviço
• Cobrança de multa por atraso
• Negativação do seu CPF/CNPJ

Atenciosamente,
Mídia Indoor
```

### Automatização

Para automatizar a régua de cobrança:

1. Crie uma função no Google Apps Script que verifique diariamente os vencimentos
2. Configure um gatilho (trigger) para executar a função todos os dias
3. A função deve:
   - Verificar assinantes com vencimento hoje
   - Enviar mensagem de lembrete
   - Atualizar status para "Atrasado" após 3 dias
   - Atualizar status para "Inadimplente" após 7 dias

---

## 9. Backup e Segurança

### Exportar Dados

1. No Dashboard, clique em **Exportar Dados**
2. Um arquivo JSON será baixado com todos os dados
3. Guarde este arquivo em local seguro

### Frequência Recomendada

| Tipo | Frequência |
|------|------------|
| Backup completo | Semanal |
| Backup incremental | Diário |
| Backup antes de alterações | Sempre |

### Segurança

- ✅ Mantenha a senha do sistema em local seguro
- ✅ Não compartilhe a URL do Web App publicamente
- ✅ Faça backup regular dos dados
- ✅ Use senhas fortes para a conta Google

---

## 10. Solução de Problemas

### Problema: Erro de CORS

**Solução:** O código já inclui tratamento CORS. Se persistir, verifique se o Web App está configurado para acesso "Qualquer pessoa".

### Problema: Dados não carregam

**Solução:**
1. Verifique sua conexão com a internet
2. Verifique se a URL do Web App está correta
3. Verifique se o Web App está publicado
4. Limpe o cache do navegador

### Problema: Erro ao salvar

**Solução:**
1. Verifique se todos os campos obrigatórios estão preenchidos
2. Verifique se o CPF/CNPJ está correto
3. Verifique se o telefone está no formato correto
4. Tente novamente após alguns minutos

### Problema: Contrato não imprime corretamente

**Solução:**
1. Use o navegador Chrome ou Edge
2. Verifique as configurações de impressão
3. Selecione o tamanho de papel A4
4. Desative cabeçalhos e rodapés do navegador

### Problema: WhatsApp não abre

**Solução:**
1. Verifique se o telefone está no formato correto (código do país + DDD + número)
2. Verifique se o WhatsApp está instalado
3. Tente abrir o link manualmente

---

## Suporte

Para suporte técnico ou dúvidas:

- 📧 Email: contato@midiaindoor.com.br
- 📞 Telefone: (11) 99999-9999
- 💬 WhatsApp: (11) 99999-9999

---

**Versão do Sistema:** 1.0.0  
**Última Atualização:** Outubro 2026
