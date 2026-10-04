/* =========================================================================
   Onde o CLIENTE encontra a planilha.
   -------------------------------------------------------------------------
   Preencha estes dois campos e suba o site de novo. Sem isso, o cardápio
   do cliente mostra o exemplo embutido e nunca lê a planilha.

   Endereço: cole aqui a URL /exec do Web App.
   Token:    o mesmo valor que você pôs em `var TOKEN` no planilha.gs.

   ATENÇÃO — este arquivo vai junto com o site, então o valor do token
   fica visível para qualquer pessoa que abrir o código da página.
   Isso é aceitável para a LEITURA: o cardápio é público de qualquer
   jeito, e o script só devolve o cardápio e os dados da loja por essa
   URL (os pedidos de outros clientes nunca saem por ela).
   Quem digita no painel continua precisando do token, e esse fica
   guardado só no navegador de quem administra.

   Se você não usa a planilha, deixe os dois campos vazios: o cardápio
   passa a usar o exemplo embutido e a cópia que o navegador já tinha.
   ========================================================================= */

window.CardapioSite = {
  planilhaUrl: 'https://script.google.com/macros/s/AKfycbyr3Mi4XAT3xqkMvNAOcYmSLY4FjRSCtooC_P8z4OpSuVP8TrhHYD62uUzCETwezrGRqQ/exec',
  planilhaToken: 'GUIGA9805_LINDO'
};
