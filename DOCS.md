# 📖 Documentação do Cardápio Digital

## Visão Geral

Cardápio digital para lanchonete com envio de pedidos via WhatsApp. O cliente navega pelos itens, monta o pedido e envia tudo pelo WhatsApp, já com o texto formatado. O dono edita tudo por uma tela de painel e publica numa planilha do Google — que é de onde o cardápio do cliente é lido.

**Stack**: HTML + CSS + JavaScript puro, sem framework, sem build, sem servidor.

---

## Estrutura de Arquivos

```
cardapio/
├── index.html              # Cardápio do cliente
├── admin.html              # Painel do dono (protegido por senha)
├── acompanhar.html         # Acompanhamento de pedido
├── cardapio.json           # Backup do cardápio (não é fonte da verdade)
├── planilha.gs             # Script do Google Sheets (cole no Google)
├── DOCS.md                 # Este arquivo
├── README.md               # Documentação original
├── .gitignore              # Mantém tools/ e novas_img/ fora da publicação
│
├── img/                    # Fotos dos itens (suba junto ao publicar)
│   ├── x-burguer-tradicional.jpg
│   ├── x-burguer-duplo.jpg
│   ├── x-salada.jpg
│   ├── x-frango.jpg
│   ├── batata-frita-simples.jpg
│   ├── batata-cheddar-e-bacon.jpg
│   ├── calabresa-acebolada.jpg
│   ├── frangoa-passarinho.jfif
│   ├── isca-de-peixe.jpg
│   ├── bugger-refri-batata.jpg
│   ├── burguer-combo-tim-batata-refrigerante-lata.jpg
│   ├── refrigerante-lata.jpg
│   ├── suco-natural-400ml.jpg
│   ├── agua-mineral-500ml.jpg
│   ├── sorvete-de-chocolate.jpg
│   ├── acai-300ml-com-granola.jpg
│   ├── acai-banana-granola.jpg
│   └── acai-com-banana.jpg
│
├── novas_img/              # Jogue aqui as fotos novas antes de rodar o script
│
├── tools/
│   └── redimensionar-fotos.ps1  # Redimensiona fotos novas para 840px
│
└── assets/
    ├── css/
    │   └── style.css       # Todo o estilo, com variáveis de cor
    └── js/
        ├── planilha-site.js  # URL da planilha que o CLIENTE lê
        ├── store.js          # Dados, validação, salvar/carregar, senha
        ├── planilha.js       # Envio de pedidos e cardápio para o Google Sheets
        ├── qrcode.min.js     # Gerador de QR Code (MIT, Kazuhiko Arase) para o PIX
        ├── app.js            # Cardápio, busca, carrinho, mensagem do WhatsApp
        ├── acompanhar.js     # Status do pedido, consulta de 15 em 15 segundos
        └── admin.js          # Painel: itens, categorias, config, planilha, JSON
```

---

## Configurações Atuais

### Google Sheets

| Campo | Valor |
|-------|-------|
| **URL do Web App** | `https://script.google.com/macros/s/AKfycbwLEZbqNOSMqEOc2ReYrD-DvOBSuRR7Sg5b6BNrwG8vAUpeMrRIM1Tfr7G7mOrMjIUeZA/exec` |
| **Token** | `GUIGA9805_LINDO` |
| **Status** | ✅ Conectado e funcionando |

### Loja

| Campo | Valor |
|-------|-------|
| **Nome** | Pastelaria do CAÊ |
| **Descrição** | Lanches, porções e bebidas geladas |
| **WhatsApp** | 5598988815481 |
| **Taxa de entrega** | R$ 7,00 |
| **Pedido mínimo** | R$ 10,00 |
| **Cor principal** | #8B1A1A |
| **Status** | Aberto |

### Painel Admin

| Campo | Valor |
|-------|-------|
| **URL** | http://localhost:8000/admin.html |
| **Senha** | 9805 |

---

## Como Usar

### Para o Dono (Painel Admin)

1. **Acessar o painel**
   - Abra `admin.html` no navegador
   - Digite a senha: `9805`

2. **Editar itens e categorias**
   - Aba **Itens e categorias**
   - Use **+ Nova categoria** para criar categorias
   - Use **+ Adicionar item** em cada categoria
   - Cada item tem: nome, descrição, preço, foto, destaque e disponibilidade
   - Use as setas ↑ ↓ para mudar a ordem
   - Use a lixeira 🗑 para apagar

3. **Configurar a loja**
   - Aba **Configurações**
   - Nome, WhatsApp, descrição, cor, taxa de entrega, pedido mínimo
   - Formas de pagamento, tempo de entrega/retirada
   - Endereço e Instagram
   - **Chave PIX** e **Cidade do recebedor (PIX)**: geram o QR Code do PIX
     no checkout. Deixe a chave vazia para não mostrar o botão do QR.

4. **Configurar bairros**
   - Aba **Bairros**
   - Adicione bairros com taxa e tempo de entrega
   - O cliente escolhe o bairro no checkout e a taxa do bairro vence a taxa única
   - No checkout, o **bairro também é selecionado sozinho** quando o cliente
     digita o nome dele no endereço (ex.: "Rua X, 10 — Centro")

5. **Publicar na planilha**
   - Clique em **⬆ Enviar cardápio agora**
   - Isso grava tudo no Google Sheets
   - O cliente vê as mudanças imediatamente

6. **Backup JSON**
   - Aba **Arquivo JSON**
   - **Baixar** salva um `cardapio.json` na sua máquina
   - **Copiar** leva o conteúdo para a área de transferência
   - **Colar e salvar** aplica um JSON colado

### Para o Cliente (Cardápio)

1. **Navegar pelo cardápio**
   - Abra `index.html` no navegador
   - Use a busca para encontrar itens
   - Clique nas categorias para rolar até elas

2. **Montar o pedido**
   - Clique em **+ Adicionar** nos itens
   - Para itens com opções (tamanho, sabor), clique em **Escolher**
   - Ajuste as quantidades no carrinho

3. **Finalizar o pedido**
   - Clique no botão do carrinho 🛒
   - Preencha nome, endereço, bairro, pagamento
   - Ao digitar o endereço, o **bairro é marcado automaticamente** se o nome dele aparecer no texto
   - Se escolher **PIX**, aparece o botão **📱 Ver QR Code PIX**: ele abre uma
     janela com o QR Code (com o valor do pedido) e o "PIX copia e cola".
     Se o navegador bloquear a janela, o QR aparece no próprio checkout.
   - Clique em **Enviar pedido no WhatsApp**
   - O WhatsApp abre com a mensagem pronta

4. **Acompanhar o pedido**
   - Depois de enviar, a faixa 🛵 aparece no alto
   - Clique nela para ver o status do pedido
   - O status atualiza sozinho a cada 15 segundos

---

## Como Publicar no Ar

### Passo 1: Escolher hospedagem

Qualquer hospedagem de site estático serve:
- **Netlify** (gratuito, arrastar e soltar)
- **Vercel** (gratuito, integrado com Git)
- **GitHub Pages** (gratuito, requer repositório Git)
- **Hostinger** (pago, cPanel)
- **cPanel** (palo, gerenciador de arquivos)

### Passo 2: Subir os arquivos

1. Compacte a pasta `cardapio` (sem as pastas `tools/` e `novas_img/`)
2. Suba para a hospedagem
3. Extraia os arquivos
4. **Certifique-se de que a pasta `img/` foi subida junto**

### Passo 3: Configurar o Google Sheets

1. Acesse https://sheets.google.com
2. Crie uma nova planilha
3. Vá em **Extensões → Apps Script**
4. Apague o conteúdo de `Code.gs`
5. Cole o conteúdo inteiro de `planilha.gs`
6. Salve com Ctrl+S
7. Clique em **Executar** na primeira vez e autorize o acesso
8. Vá em **Implantar → Nova implantação**
   - Tipo: **Web app**
   - Execute como: **eu mesmo**
   - Quem pode acessar: **QUALQUER PESSOA**
9. Copie a URL que termina em `/exec`
10. Cole a URL em `assets/js/planilha-site.js` no campo `planilhaUrl`
11. Suba o arquivo atualizado para a hospedagem

### Passo 4: Testar

1. Abra o site em uma **janela anônima**
2. Verifique se o cardápio carrega
3. Faça um pedido de teste
4. Verifique se o pedido aparece na planilha
5. Teste o acompanhamento do pedido

---

## Troubleshooting

### O cardápio não carrega

- Verifique se o servidor está rodando
- Abra o console do navegador (F12) e veja se há erros
- Verifique se a pasta `img/` existe e tem as fotos

### A planilha não conecta

- Verifique se a URL está correta em `planilha-site.js`
- Verifique se o Web App está publicado como "Anyone"
- Verifique se o token está correto
- Teste a URL diretamente no navegador: `https://script.google.com/macros/s/SEU_ID/exec?ping=1`

### As imagens não aparecem

- Verifique se os nomes dos arquivos estão corretos (minúsculas, sem acento, hífen)
- Verifique se a pasta `img/` está no mesmo nível que `index.html`
- Abra o console do navegador (F12) e veja se há erros de carregamento

### O WhatsApp não abre

- Verifique se o número está correto (código do país + DDD + número)
- Verifique se o navegador não está bloqueando pop-ups

### O painel admin não abre

- Verifique se a senha está correta
- Limpe os dados do navegador e tente novamente
- Verifique se o `localStorage` está habilitado

---

## Segurança

### Senha do painel

- A senha é guardada apenas no navegador (localStorage, com hash SHA-256)
- Cada dispositivo tem a sua própria senha
- Para trocar: painel → Configurações → Nova senha

### Token da planilha

- O token protege a escrita (POST), não a leitura (GET)
- O cardápio é público por natureza — quem abre o site já vê os itens
- O token está em `planilha.gs` e `planilha-site.js`
- **Recomendação**: troque o token periodicamente

### Dados do cliente

- A planilha grava os dados que o cliente digita (nome, endereço, pagamento)
- Sai da sua máquina e vai para uma conta do Google
- Vale avisar na descrição do cardápio que as informações são usadas para o pedido

---

## Manutenção

### Adicionar fotos novas

1. Jogue as fotos na pasta `novas_img/`
2. Abra o PowerShell na pasta do projeto
3. Execute:
   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\redimensionar-fotos.ps1
   ```
4. O script reduz para 840px, regrava em JPEG 82, tira acento e troca espaço por hífen
5. As fotos são salvas em `img/`
6. Atualize o `cardapio.json` com os novos nomes de arquivo
7. Suba as fotos novas para a hospedagem

### Atualizar o script da planilha

1. Edite o `planilha.gs`
2. No Google Sheets: **Extensões → Apps Script**
3. Cole o novo código e salve
4. **Implantar → Nova implantação** (obrigatório!)
5. Atualize a URL em `planilha-site.js` se mudou
6. Suba o arquivo atualizado para a hospedagem

### ⚠️ Importante: modo replace

O script do Google Sheets, no modo `replace`, **limpa toda a aba** antes de escrever. Por isso, sempre que enviar dados para a planilha, é preciso incluir **todos** os campos da aba, não apenas o que mudou.

**Exemplo**: se você quiser mudar apenas a cor primária, envie **todos** os campos da aba Config, incluindo a nova cor. Se enviar apenas a cor, os outros campos serão apagados.

### Fazer backup

1. Abra o painel admin
2. Vá em **Arquivo JSON**
3. Clique em **⬇ Baixar cardapio.json**
4. Guarde o arquivo em local seguro

---

## Suporte

Para dúvidas ou problemas, consulte o `README.md` original ou abra uma issue no repositório.

---

**Última atualização**: 03/10/2026
**Versão**: 1.0
