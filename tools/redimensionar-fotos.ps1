<#
  Redimensiona fotos novas para o padrão do cardápio.

  Por que 840 px: o cartão de item tem no máximo ~420 px de largura
  (aspect-ratio 16/9 na grade). 840 px é 2x disso, o suficiente para
  tela retina. Acima disso você só paga bytes por pixels que o navegador
  descarta — foi o que inflava a isca-de-peixe.jpg em 1,5 MB.

  Como usar
  ---------
  1. Jogue as fotos novas na pasta "novas_img" (já existe ao lado de
     tools/, dentro do projeto). Essa pasta NÃO é alterada.

  2. Abra o PowerShell na pasta do projeto e rode:

       powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\redimensionar-fotos.ps1

     Ou aponte para outra pasta:

       powershell -NoProfile -ExecutionPolicy Bypass -File .\tools\redimensionar-fotos.ps1 -Origem "C:\fotos"

  3. O script escreve em img/ com o nome já no padrão e imprime no fim
     as linhas prontas para colar na coluna "Link da imagem" da planilha.

  O que ele faz
  -------------
  - reduz o lado maior para 840 px (nunca aumenta foto pequena)
  - regrava em JPEG qualidade 82
  - tira acento, espaço vira hífen, tudo minúsculo (padrão do projeto)
  - descarta metade por vez: o DrawImage do .NET usa bicúbica e não faz
    média de área, então pular de 3000 para 840 numa tacada só cria
    serrilhado
  - preenche de branco antes de desenhar, para PNG transparente não virar
    fundo preto ao virar JPEG
  - foto que já está pequena e já é JPEG não é reencodada à toa
  - abre webp: o GDI+ não lê esse formato, então o script cai para o WIC
    (o mesmo motor do visualizador de imagens do Windows)
  - se o arquivo que já existe em img/ for menor, mantém o que está lá
    (use -Forcar para trocar mesmo assim)
#>

param(
  # Pasta de onde vêm as fotos. Padrão: subpasta "novas_img" ao lado de tools/.
  [string]$Origem,

  # Onde gravar. Padrão: a pasta img/ do projeto.
  [string]$Destino,

  [int]$Lado = 840,
  [int]$Qualidade = 82,

  # Trocar a foto mesmo que a nova fique maior que a que já existe.
  [switch]$Forcar
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$raiz = Split-Path -Parent $PSScriptRoot
# A pasta padrão de entrada fica ao lado de tools/, dentro do projeto.
# Pasta vazia não entra no Git, então ela não atrapalha a publicação —
# e o .gitignore também a protege se sobrar foto ali na hora de subir.
if (-not $Origem) { $Origem = Join-Path $raiz 'novas_img' }
if (-not $Destino) { $Destino = Join-Path $raiz 'img' }

if (-not (Test-Path $Origem)) {
  "A pasta de fotos novas não existe: $Origem"
  ""
  "Crie a pasta, jogue as fotos dentro e rode o script de novo."
  "Para usar outra pasta:  -Origem ""C:\caminho\das\fotos"""
  exit 1
}

New-Item -ItemType Directory -Force -Path $Destino | Out-Null

$codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
  Where-Object { $_.MimeType -eq 'image/jpeg' }
if (-not $codec) { throw "codec JPEG não encontrado" }

$param = [System.Drawing.Imaging.EncoderParameters]::new(1)
$param.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
  [System.Drawing.Imaging.Encoder]::Quality, [long]$Qualidade)

# ---------- padrão de nome ----------
# minúsculo, sem acento, espaço vira hífen, sem caracteres especiais.
# É o mesmo padrão documentado no README: é o que o GitHub Pages
# (Linux, case-sensitive) consegue servir.
function Nome-Padrao($nomeArquivo) {
  $n = Split-Path -Leaf $nomeArquivo
  $n = $n -replace '\.(jpe?g|jfif|png|bmp|webp|gif|tiff?)$', ''
  $n = $n.Normalize([System.Text.NormalizationForm]::FormD)
  $n = [regex]::Replace($n, '\p{Mn}', '')   # joga fora o acento, deixa a letra
  $n = $n.ToLowerInvariant()
  $n = $n -replace '[^a-z0-9]+', '-'
  $n = $n -replace '^-+', ''
  $n = $n -replace '-+$', ''
  if (-not $n) { $n = 'foto' }
  return "$n.jpg"
}

function New-Lienzo($largura, $altura) {
  $bmp = [System.Drawing.Bitmap]::new($largura, $altura)
  $bmp.SetResolution(96, 96)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.Clear([System.Drawing.Color]::White)   # PNG transparente não vira fundo preto
  return @($bmp, $g)
}

# Lê uma foto e devolve @{ Imagem; Stream; Largura; Altura; Motor }.
#
# O GDI+ abre jpg, png, bmp, gif e tiff, mas não webp. Quando ele falha,
# o script cai para o WIC (o motor do visualizador de imagens do
# Windows), que no Windows 11 decodifica webp. O WIC já entrega a foto
# reduzida para perto do alvo, para a ponte não carregar 80 MB à toa com
# uma foto de 5472x3648.
function Ler-Imagem($caminho, $alvo) {
  $bytes = [System.IO.File]::ReadAllBytes($caminho)
  $ms = [System.IO.MemoryStream]::new()
  $ms.Write($bytes, 0, $bytes.Length)
  $ms.Position = 0

  try {
    $img = [System.Drawing.Image]::FromStream($ms)
    return @{
      Imagem = $img; Stream = $ms; Motor = 'gdi'
      Largura = $img.Width; Altura = $img.Height
    }
  } catch {
    $ms.Dispose()   # o GDI+ não abriu: libera e tenta pelo WIC
  }

  Add-Type -AssemblyName PresentationCore
  $fs = [System.IO.File]::OpenRead($caminho)
  try {
    $dec = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
      $fs,
      [System.Windows.Media.Imaging.BitmapCreateOptions]::None,
      [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad)
    $quadro = $dec.Frames[0]

    $larguraReal = $quadro.PixelWidth
    $alturaReal = $quadro.PixelHeight

    $maior = [Math]::Max($larguraReal, $alturaReal)
    $escala = [Math]::Min(1.0, $alvo / $maior)
    if ($escala -lt 1.0) {
      $geometria = [System.Windows.Media.ScaleTransform]::new($escala, $escala)
      $quadro = [System.Windows.Media.Imaging.TransformedBitmap]::new($quadro, $geometria)
    }

    $codificador = [System.Windows.Media.Imaging.BmpBitmapEncoder]::new()
    $codificador.Frames.Add(
      [System.Windows.Media.Imaging.BitmapFrame]::Create($quadro))
    $ponte = [System.IO.MemoryStream]::new()
    $codificador.Save($ponte)
    $ponte.Position = 0

    return @{
      Imagem = [System.Drawing.Image]::FromStream($ponte); Stream = $ponte; Motor = 'wic'
      Largura = $larguraReal; Altura = $alturaReal
    }
  } finally {
    $fs.Dispose()
  }
}

# NUNCA devolver a própria fonte: o Dispose do chamador destruiria a
# imagem de que a chamada seguinte ainda precisa.
function Reduzir($fonteImg, $nw, $nh) {
  $atual = $fonteImg

  while (($atual.Width -gt ($nw * 2)) -and ($atual.Height -gt ($nh * 2))) {
    $mw = [int][Math]::Max($nw, [Math]::Floor($atual.Width / 2))
    $mh = [int][Math]::Max($nh, [Math]::Floor($atual.Height / 2))
    $par = New-Lienzo $mw $mh
    $par[1].DrawImage($atual, 0, 0, $mw, $mh)
    $par[1].Dispose()
    if ($atual -ne $fonteImg) { $atual.Dispose() }
    $atual = $par[0]
  }

  $par = New-Lienzo $nw $nh
  $par[1].DrawImage($atual, 0, 0, $nw, $nh)
  $par[1].Dispose()
  if ($atual -ne $fonteImg) { $atual.Dispose() }
  return $par[0]
}

$aceitos = '^\.(jpg|jpeg|jfif|png|bmp|gif|tiff?|webp)$'

$linhas = @()
$avisos = @()
$arquivos = @()

foreach ($f in (Get-ChildItem $Origem -File -Recurse)) {
  if ($f.Extension -match $aceitos) { $arquivos += $f }
}

if (-not $arquivos) {
  "Nenhuma foto para processar em: $Origem"
  "Formatos aceitos: jpg, jpeg, jfif, png, bmp, gif, tiff, webp"
  exit 0
}

foreach ($arquivo in $arquivos) {
  $nomeNovo = Nome-Padrao $arquivo.Name
  # Atenção ao nome: o PowerShell ignora maiúscula/minúscula em variáveis,
  # então $destino colidiria com o parâmetro $Destino (a pasta) e a partir
  # da segunda foto o caminho viraria "...\foto.jpg\outra.jpg".
  $alvo = Join-Path $Destino $nomeNovo

  # Não reprocessar arquivo que já está dentro da própria img/.
  if ((Split-Path -Parent $arquivo.FullName) -eq $Destino) { continue }

  $kbOrigem = [int][Math]::Round($arquivo.Length / 1KB)

  try {
    $lido = Ler-Imagem $arquivo.FullName $Lado
  } catch {
    $avisos += "$($arquivo.Name): não consegui abrir. Converta para jpg e rode de novo."
    continue
  }

  $img = $lido.Imagem
  $ms = $lido.Stream
  $larguraOrig = $lido.Largura
  $alturaOrig = $lido.Altura

  # Sem aumentar: se a foto já é menor que o alvo, ela fica como está.
  $larguraAgora = $img.Width
  $alturaAgora = $img.Height
  $escala = [Math]::Min(1.0, [Math]::Min($Lado / $larguraAgora, $Lado / $alturaAgora))
  $nw = [int][Math]::Round($larguraAgora * $escala)
  $nh = [int][Math]::Round($alturaAgora * $escala)
  if ($nw -lt 1) { $nw = 1 }
  if ($nh -lt 1) { $nh = 1 }

  $reduzido = Reduzir $img $nw $nh

  # GDI+ escolhe o codec pela extensão e .jfif não é reconhecida:
  # grava sempre num .jpg temporário e só depois põe o nome final.
  $tmp = Join-Path $env:TEMP ("cf-" + [System.IO.Path]::GetRandomFileName() + ".jpg")
  $reduzido.Save($tmp, $codec, $param)
  $reduzido.Dispose()
  $img.Dispose()
  $ms.Dispose()

  # Se a foto já estava no tamanho e já era JPEG, e o reencode ficou
  # maior, o original já estava melhor: usa ele.
  $dentroLimite = ($larguraOrig -le $Lado) -and ($alturaOrig -le $Lado)
  $eJpeg = $arquivo.Extension -match '^\.(jpe?g|jfif)$'

  if ($dentroLimite -and $eJpeg -and $arquivo.Length -le (Get-Item $tmp).Length) {
    Copy-Item $arquivo.FullName $alvo -Force
    Remove-Item $tmp -Force
    $situacao = "COPIADO"
  } else {
    $tamanhoNovo = (Get-Item $tmp).Length
    $existente = Test-Path $alvo
    $tamanhoAtual = if ($existente) { (Get-Item $alvo).Length } else { [long]::MaxValue }

    if ($existente -and -not $Forcar -and $tamanhoNovo -ge $tamanhoAtual) {
      # O que já está em img/ é menor. Não troca sem querer.
      Remove-Item $tmp -Force
      $situacao = "MANTIVE"
    } else {
      Move-Item $tmp $alvo -Force
      $situacao = if ($existente) { "SUBSTITUI" } else { "NOVO" }
    }
  }

  $confere = [System.Drawing.Image]::FromFile($alvo)
  $dimFinal = "{0}x{1}" -f $confere.Width, $confere.Height
  $confere.Dispose()
  $kbFinal = [int][Math]::Round((Get-Item $alvo).Length / 1KB)

  $renomeou = if ($arquivo.Name -ne $nomeNovo) { "de: " + $arquivo.Name } else { "" }

  $linhas += [PSCustomObject]@{
    Item      = $arquivo.BaseName
    Destino   = "img/$nomeNovo"
    DimAntes  = "{0}x{1}" -f $larguraOrig, $alturaOrig
    DimDepois = $dimFinal
    AntesKB   = $kbOrigem
    DepoisKB  = $kbFinal
    Situacao  = $situacao
    Motor     = $lido.Motor
    Renomeou  = $renomeou
  }
}

$linhas | Select-Object Item, DimAntes, DimDepois, AntesKB, DepoisKB, Situacao, Motor, Renomeou | Format-Table -AutoSize

if ($avisos) { ""; "AVISOS:"; $avisos | ForEach-Object { "  $_" } }

""
'Para colar na coluna "Link da imagem" da planilha, uma linha por foto:'
""
($linhas | ForEach-Object { $_.Destino }) -join "`n"