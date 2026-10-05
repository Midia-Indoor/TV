# Régua de Cobrança - Mídia Indoor

## Visão Geral

A régua de cobrança é um conjunto de ações sistemáticas para recuperar pagamentos em atraso, mantendo o relacionamento com o cliente e garantindo a saúde financeira do negócio.

---

## Timeline de Cobrança

### 📅 Dia do Vencimento (D+0)

**Ação:** Lembrete amigável

**Canal:** WhatsApp

**Mensagem:**
```
Olá [NOME]! 😊

Lembramos que hoje é o vencimento da sua mensalidade no valor de [VALOR].

Para evitar a interrupção do serviço, por favor, efetue o pagamento.

Qualquer dúvida, estamos à disposição!

Atenciosamente,
Mídia Indoor
```

**Status:** Manter como "Ativo"

---

### 📅 +3 Dias (D+3)

**Ação:** Primeira cobrança

**Canal:** WhatsApp

**Mensagem:**
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

**Status:** Atualizar para "Atrasado"

---

### 📅 +7 Dias (D+7)

**Ação:** Segunda cobrança

**Canal:** WhatsApp + Ligação

**Mensagem:**
```
Olá [NOME],

Sua mensalidade no valor de [VALOR] está há 7 dias em atraso.

Para evitar a interrupção do serviço, por favor, efetue o pagamento imediatamente.

Caso já tenha efetuado o pagamento, por favor, desconsidere esta mensagem.

Atenciosamente,
Mídia Indoor
```

**Status:** Atualizar para "Inadimplente"

---

### 📅 +15 Dias (D+15)

**Ação:** Cobrança formal

**Canal:** WhatsApp + Email

**Mensagem:**
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

**Status:** Manter como "Inadimplente"

---

### 📅 +30 Dias (D+30)

**Ação:** Interrupção do serviço

**Canal:** Notificação formal

**Ação:**
- Suspender o serviço de mídia indoor
- Enviar notificação formal de suspensão
- Registrar no sistema

**Mensagem:**
```
Prezado(a) [NOME],

Informamos que o serviço de mídia indoor foi suspenso devido ao não pagamento da mensalidade no valor de [VALOR], há 30 dias em atraso.

Para reativar o serviço, por favor, entre em contato conosco.

Atenciosamente,
Mídia Indoor
```

**Status:** Atualizar para "Suspenso"

---

### 📅 +60 Dias (D+60)

**Ação:** Negativação

**Canal:** Correspondência

**Ação:**
- Enviar para negativação (se aplicável)
- Iniciar processo de cobrança judicial (se necessário)
- Registrar no sistema

**Status:** Atualizar para "Inadimplente Crônico"

---

## Resumo Visual

```
D+0  → Lembrete amigável (WhatsApp)
D+3  → Primeira cobrança (WhatsApp)
D+7  → Segunda cobrança (WhatsApp + Ligação)
D+15 → Cobrança formal (WhatsApp + Email)
D+30 → Interrupção do serviço
D+60 → Negativação
```

---

## Métricas de Acompanhamento

| Métrica | Meta |
|---------|------|
| Taxa de recuperação em 7 dias | > 80% |
| Taxa de recuperação em 15 dias | > 90% |
| Taxa de inadimplência | < 5% |
| Tempo médio de recuperação | < 10 dias |

---

## Dicas de Cobrança

### ✅ Faça

- Seja educado e profissional
- Ofereça facilidades de pagamento
- Documente todas as tentativas de contato
- Mantenha o tom amigável nas primeiras cobranças
- Ofereça canais de pagamento variados

### ❌ Não Faça

- Não use linguagem agressiva
- Não faça cobranças em horários inadequados (antes das 8h ou depois das 20h)
- Não exponha o cliente publicamente
- Não faça ameaças
- Não desista após a primeira tentativa

---

## Automatização

Para automatizar a régua de cobrança, configure um gatilho diário no Google Apps Script:

```javascript
function verificarVencimentos() {
  const hoje = new Date();
  const assinantes = getAssinantes();
  
  assinantes.forEach(assinante => {
    const vencimento = new Date(assinante.data_vencimento);
    const diasAtraso = Math.floor((hoje - vencimento) / (1000 * 60 * 60 * 24));
    
    if (diasAtraso === 0) {
      enviarLembrete(assinante);
    } else if (diasAtraso === 3) {
      enviarPrimeiraCobranca(assinante);
    } else if (diasAtraso === 7) {
      enviarSegundaCobranca(assinante);
    } else if (diasAtraso === 15) {
      enviarCobrancaFormal(assinante);
    } else if (diasAtraso === 30) {
      suspenderServico(assinante);
    }
  });
}
```

---

**Versão:** 1.0.0  
**Última Atualização:** Outubro 2026
