/* =====================================================================
   Pré-visualização — o requisito na tela, do jeito que vai sair no papel.

   Existe para o candidato não precisar baixar um PDF a cada vez que
   quiser conferir como está ficando. Serve também ao revisor e ao
   administrador, que avaliam sem ter de gerar arquivo.

   A folha é desenhada em centímetros de verdade (o navegador converte
   cm em pixels), com as mesmas medidas do relatório: A4, margens de
   3 / 2 / 5 / 4 cm, Times New Roman 12, entrelinha 1,5, descrição
   justificada com recuo de 1,25 cm e foto em 10,15 × 7 cm.

   O papel timbrado entra como fundo da folha, pelo porFundo() lá embaixo.
   A arte é um PDF; quem a transforma em imagem é o relatorio.js, uma vez
   por sessão.
   ===================================================================== */

import { esc } from './ui.js';
import { segmentar } from './marcador.js';

/* As mesmas medidas do relatorio.js. Se um dia mudarem lá, mudam aqui. */
const MARGEM = { esquerda: 3, direita: 2, topo: 5, base: 4 };
const FOTO   = { largura: 10.15, altura: 7 };
const RECUO  = 1.25;

const LARGURA_CM = 21;
const ALTURA_CM  = 29.7;

/** 1 cm em pixels, do jeito que o navegador conta. */
const PX_POR_CM = 96 / 2.54;

const dataBR = iso => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

/** Texto com ** viram <strong>, o resto escapado. */
const negrito = (texto, base = false) =>
  segmentar(texto, base)
    .map(p => p.negrito ? `<strong>${esc(p.texto)}</strong>` : esc(p.texto))
    .join('');

/** Um parágrafo por linha — é assim que o PDF e o Word fazem. */
const paragrafos = (texto, classe) =>
  String(texto ?? '')
    .split(/\n+/)
    .map(l => l.trim())
    .filter(Boolean)
    .map(l => `<p class="${classe}">${negrito(l)}</p>`)
    .join('');

/**
 * A tabela da especialidade, em HTML.
 *
 * Mesmo desenho do PDF e do Word: o nome atravessando o alto, as colunas
 * preenchidas embaixo, o logo do clube de um lado e o distintivo do
 * outro. Coluna sem valor não vem — quem monta a lista é o
 * tabelaEspecialidade() do especialidade.js, e aqui só se desenha.
 */
function tabelaDaPrevia(tabela, { logo, distintivo }) {
  if (!tabela) return '';

  const colunas = tabela.colunas;
  const linhas = (tabela.nome ? 1 : 0) + (colunas.length ? 2 : 0);
  if (!linhas) return '';

  const ponta = url => url
    ? `<td class="pv-espec-logo" rowspan="${linhas}"><img src="${url}" alt=""></td>`
    : '';

  const primeira = tabela.nome
    ? `<tr>
         ${ponta(logo)}
         <td class="pv-espec-nome" colspan="${Math.max(1, colunas.length)}"
           >${esc(tabela.nome)}</td>
         ${ponta(distintivo)}
       </tr>`
    : '';

  /* Texto de uma palavra só não tem onde quebrar com proveito, e o
     navegador acha que tem: ele parte "AR-014" no hífen e depois dá à
     coluna uma largura que não serve nem para a metade. Marcando a
     célula como inteira, a largura mínima passa a ser a da palavra. */
  const inteiro = t => (String(t).trim().split(/\s+/).length === 1 ? ' class="pv-inteiro"' : '');

  const cabecalho = colunas.length
    ? `<tr>
         ${tabela.nome ? '' : ponta(logo)}
         ${colunas.map(c => `<th${inteiro(c.rotulo)}>${esc(c.rotulo)}</th>`).join('')}
         ${tabela.nome ? '' : ponta(distintivo)}
       </tr>
       <tr>${colunas.map(c =>
         `<td${inteiro(c.valor)}>${esc(c.valor)}</td>`).join('')}</tr>`
    : '';

  return `<table class="pv-espec"><tbody>${primeira}${cabecalho}</tbody></table>`;
}

/* ===================================================================== */

/**
 * Monta o conteúdo da folha.
 *
 * @param {object} o
 * @param {string} o.secao    título da seção
 * @param {object} o.bloco    saída de blocoRequisito() do relatorio.js
 * @param {Map}    o.fotos    caminho no depósito -> URL assinada
 * @param {string} [o.logoClube]  endereço do logo de Desbravadores ou Aventureiros
 */
export function folhaDaPrevia({ secao, bloco, fotos, logoClube = null }) {
  const negTitulo = bloco.negritoTitulo !== false;
  const jusTitulo = bloco.justificarTitulo === true;

  const corpo = bloco.unidades.map(u => {
    const partes = u.vazio
      ? '<p class="pv-vazio">(não preenchido)</p>'
      : u.partes.map(p => {
          const url = p.fotoCaminho ? fotos.get(p.fotoCaminho) : null;

          return [
            p.rotulo ? `<p class="pv-rotulo">${esc(p.rotulo)}</p>` : '',

            u.mostrarData
              ? `<p class="pv-dado">Data do cumprimento: ${esc(dataBR(p.data))}</p>` : '',

            u.mostrarLink
              ? `<p class="pv-dado">Link: ${esc(p.link || '—')}</p>` : '',

            /* a abertura das essenciais é o primeiro parágrafo */
            p.abertura ? paragrafos(p.abertura, 'pv-descricao') : '',

            u.mostrarDescricao && p.descricao
              ? paragrafos(p.descricao, 'pv-descricao') : '',

            /* a ficha vem logo abaixo da descrição */
            u.mostrarEspecialidade
              ? tabelaDaPrevia(p.especialidade, {
                  logo: logoClube,
                  distintivo: p.distintivoCaminho ? fotos.get(p.distintivoCaminho) : null
                })
              : '',

            u.mostrarFoto && url
              ? `<figure class="pv-foto">
                   <img src="${url}" alt="">
                   ${p.legenda ? `<figcaption>${esc(p.legenda)}</figcaption>` : ''}
                 </figure>`
              : (u.mostrarFoto ? '<p class="pv-vazio">(sem foto enviada)</p>' : '')
          ].join('');
        }).join('');

    const titulo = u.alinea
      ? `<p class="pv-alinea ${negTitulo ? 'pv-forte' : ''} ${u.justificar ? 'pv-justo' : ''}"
            style="margin-left:${u.recuo ?? 0}cm">${negrito(u.alinea, negTitulo)}</p>`
      : '';

    return titulo + partes;
  }).join('');

  /* Folha de continuação não traz enunciado — é a parte 2 de 3 começando
     a folha dela. O arquivo faz igual, e quem decide é o
     paginasDaUnidade() do relatorio.js. */
  const enunciado = bloco.requisito
    ? `<p class="pv-requisito ${negTitulo ? 'pv-forte' : ''} ${jusTitulo ? 'pv-justo' : ''}"
        >${negrito(bloco.requisito, negTitulo)}</p>`
    : '';

  return `
    ${secao ? `<p class="pv-secao">${negrito(secao, true)}</p>` : ''}
    ${enunciado}
    ${corpo}`;
}

/* ------------------------------------------------------------ estilo */

/* Vai junto com o componente, injetado uma vez. Mesma escolha que fiz na
   ficha do perfil: assim a pré-visualização não depende de dois arquivos
   subirem juntos. */
let estiloPosto = false;

export function injetarEstilo() {
  if (estiloPosto) return;
  estiloPosto = true;

  const e = document.createElement('style');
  e.textContent = `
  .previa-palco {
    background: #5b6b85;
    padding: 16px;
    border-radius: var(--raio-p);
    overflow: auto;
    max-height: 68vh;
  }
  .previa-trilho { transform-origin: top left; }

  /* Uma folha A4 de verdade, de altura FIXA. Antes era uma folha só, que
     crescia com o texto, e o timbrado se repetia a cada 29,7 cm — caindo
     em cima do texto no meio da página, porque o texto não sabia onde a
     página acabava. Agora cada folha é uma folha, com a arte dela. */
  .folha-previa {
    width: ${LARGURA_CM}cm;
    height: ${ALTURA_CM}cm;
    box-sizing: border-box;
    padding: ${MARGEM.topo}cm ${MARGEM.direita}cm ${MARGEM.base}cm ${MARGEM.esquerda}cm;

    background-color: #fff;
    background-repeat: no-repeat;
    background-position: top center;
    background-size: 100% 100%;

    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.725;   /* entrelinha 1,5 do Word */
    color: #000;
  }

  /* uma folha embaixo da outra, com o mesmo respiro do papel impresso */
  .folha-previa + .folha-previa { margin-top: 18px; }

  /* A janela mostra só o pedaço do texto que cabe NESTA folha. O fluxo
     inteiro está em todas elas; o que muda é o recorte. */
  .pv-janela { overflow: hidden; }
  .pv-fluxo  { width: 100%; }

  /* a folha de medição: existe para o navegador calcular as alturas, e
     some antes de alguém ver */
  .pv-regua {
    position: absolute;
    visibility: hidden;
    pointer-events: none;
    left: -10000px;
    top: 0;
  }
    /* a folha vive dentro do aplicativo, e o estilo do aplicativo tem
     regras para .secao, .requisito e companhia. Por isso toda classe
     daqui começa com pv-, e o que vem de fora é zerado. */
  .folha-previa p,
  .folha-previa figure {
    margin: 0 0 6pt;
    padding: 0;
    background: none;
    border: 0;
    box-shadow: none;
    border-radius: 0;
    font-size: inherit;
    font-weight: 400;
    color: inherit;
  }
  .folha-previa .pv-forte { font-weight: 700; }
  .folha-previa .pv-justo { text-align: justify; }
  .folha-previa .pv-secao { font-weight: 700; }
  .folha-previa .pv-requisito { margin-bottom: 8pt; }
  .folha-previa .pv-alinea { margin-bottom: 6pt; }
  .folha-previa .pv-rotulo { font-style: italic; }
  .folha-previa .pv-descricao {
    text-align: justify;
    text-indent: ${RECUO}cm;
    margin-bottom: 0;
  }
  .folha-previa .pv-descricao:last-of-type { margin-bottom: 8pt; }
  .folha-previa .pv-vazio { color: #555; }
  .folha-previa .pv-foto { margin: 10pt 0; text-align: center; }
  .folha-previa .pv-foto img {
    max-width: ${FOTO.largura}cm;
    max-height: ${FOTO.altura}cm;
    display: inline-block;
  }
  .folha-previa figcaption { font-size: 10pt; margin-top: 4pt; }

  /* a tabela da especialidade — as mesmas cores do PDF e do Word */
  /* layout automático de propósito: é ele que dá a cada coluna a largura
     do conteúdo dela, que é o que o PDF e o Word fazem na mão. Com
     table-layout: fixed todas ficavam iguais, e "Instituição de origem"
     quebrava em quatro linhas enquanto "Ano" sobrava. */
  .folha-previa .pv-espec {
    width: 100%;
    border-collapse: collapse;
    margin: 8pt 0 12pt;
  }
  .folha-previa .pv-espec td,
  .folha-previa .pv-espec th {
    border: 1px solid #fff;
    padding: 4pt 5pt;
    text-align: center;
    vertical-align: middle;
    background: #1F3864;
    color: #fff;
    font-weight: 700;
    font-size: 9pt;
    /* nenhum overflow-wrap aqui, de propósito. Ele encolhe a largura
       mínima que o navegador reserva para a coluna, e "AR-014" acabava
       partido em duas linhas numa coluna que tinha espaço de sobra. */
  }
  .folha-previa .pv-espec tr:last-child td {
    background: #DEE7F5;
    color: #000;
    font-weight: 400;
    font-size: 10pt;
  }
  .folha-previa .pv-espec .pv-inteiro { white-space: nowrap; }
  .folha-previa .pv-espec .pv-espec-nome { font-size: 11pt; white-space: normal; }
  .folha-previa .pv-espec .pv-espec-logo {
    width: 2.6cm;
    background: #1F3864;
    padding: 4pt;
  }
  .folha-previa .pv-espec .pv-espec-logo img {
    display: block;
    width: 100%;
    max-height: 2cm;
    object-fit: contain;
    margin: 0 auto;
  }

  .previa-montando {
    margin: 0;
    padding: 28px 16px;
    color: #e8edf6;
    font-size: .9rem;
    text-align: center;
  }

  .previa-rodape {
    font-size: .78rem;
    color: var(--texto-suave);
    margin: 10px 0 0;
    line-height: 1.5;
  }`;

  document.head.appendChild(e);
}

/* ===================================================================== */
/*  Paginação                                                            */
/* ===================================================================== */

/* A altura útil de uma folha: o A4 menos as margens de cima e de baixo. */
const UTIL_CM = ALTURA_CM - MARGEM.topo - MARGEM.base;

/** Espera as imagens carregarem: sem elas, toda altura medida está errada. */
function esperarImagens(raiz) {
  const fotos = [...raiz.querySelectorAll('img')].filter(i => !i.complete);
  if (!fotos.length) return Promise.resolve();

  return Promise.all(fotos.map(i => new Promise(pronto => {
    i.addEventListener('load',  pronto, { once: true });
    i.addEventListener('error', pronto, { once: true });
  })));
}

/**
 * Onde o texto PODE ser cortado, em pixels a partir do topo do fluxo.
 *
 * Dentro de um parágrafo, qualquer começo de linha serve — e o navegador
 * sabe onde cada linha começa: um Range sobre o parágrafo devolve um
 * retângulo por linha. Fora dele, não: uma foto ou uma tabela é inteira
 * ou não é, então só o topo e o pé delas entram na lista.
 */
function cortesPossiveis(fluxo) {
  const topoDoFluxo = fluxo.getBoundingClientRect().top;
  const cortes = new Set([0]);

  const ATOMICOS = new Set(['FIGURE', 'IMG', 'TABLE']);

  for (const bloco of fluxo.children) {
    const caixa = bloco.getBoundingClientRect();

    if (ATOMICOS.has(bloco.tagName) || bloco.querySelector('table, img')) {
      cortes.add(caixa.top - topoDoFluxo);
      cortes.add(caixa.bottom - topoDoFluxo);
      continue;
    }

    const alcance = document.createRange();
    alcance.selectNodeContents(bloco);

    const linhas = [...alcance.getClientRects()].filter(r => r.height > 1);
    if (!linhas.length) { cortes.add(caixa.top - topoDoFluxo); continue; }

    /* o começo do parágrafo e o começo de cada linha dele */
    cortes.add(caixa.top - topoDoFluxo);
    for (const l of linhas) cortes.add(l.top - topoDoFluxo);
    cortes.add(caixa.bottom - topoDoFluxo);
  }

  return [...cortes].sort((a, b) => a - b);
}

/** Em quais alturas cada folha começa. */
function dividirEmFolhas(cortes, alturaTotal, alturaUtil) {
  const inicios = [0];
  let inicio = 0;

  /* 400 folhas é mais do que qualquer requisito vai ter; a trava existe
     para uma conta que não avance nunca não travar a tela. */
  while (inicio + alturaUtil < alturaTotal - 1 && inicios.length < 400) {
    const limite = inicio + alturaUtil;

    /* o último corte que ainda cabe nesta folha */
    const cabe = cortes.filter(c => c > inicio + 1 && c <= limite + 0.5);
    const proximo = cabe.length ? cabe[cabe.length - 1] : limite;

    inicios.push(proximo);
    inicio = proximo;
  }

  inicios.push(alturaTotal);          // o fim, para fechar a última folha
  return inicios;
}

/**
 * Monta as folhas da pré-visualização.
 *
 * Recebe uma lista: cada item é o conteúdo de uma página do ARQUIVO, do
 * jeito que o paginasDaUnidade() do relatorio.js mandou — é assim que a
 * tela herda as quebras obrigatórias (uma especialidade por folha, uma
 * parte por folha). Cada item ainda pode transbordar e virar duas ou três
 * folhas; quem decide isso é a medição aqui.
 *
 * O texto é medido uma vez por item, numa folha escondida. As folhas
 * desenhadas carregam todas o fluxo inteiro; o que muda é o recorte —
 * assim a quebra de linha é a mesma em todas, que é o ponto da
 * pré-visualização.
 *
 * @param {HTMLElement} palco      o contêiner da pré-visualização
 * @param {string[]} conteudos     HTML de cada página, do folhaDaPrevia()
 */
export async function montarFolhas(palco, conteudos) {
  const trilho = palco.querySelector('.previa-trilho');
  if (!trilho) return;

  const alturaUtil = UTIL_CM * PX_POR_CM;
  const folhas = [];

  for (const conteudo of [].concat(conteudos)) {
    /* ---------------------------------------------------- a medição */

    const regua = document.createElement('div');
    regua.className = 'folha-previa pv-regua';
    regua.innerHTML = `<div class="pv-fluxo">${conteudo}</div>`;
    palco.appendChild(regua);

    await esperarImagens(regua);

    const fluxo = regua.querySelector('.pv-fluxo');
    const alturaTotal = fluxo.getBoundingClientRect().height;
    const inicios = dividirEmFolhas(cortesPossiveis(fluxo), alturaTotal, alturaUtil);

    regua.remove();

    /* ---------------------------------------------------- as folhas */

    for (let k = 0; k < inicios.length - 1; k++) {
      const de = inicios[k];
      const ate = Math.min(inicios[k + 1], de + alturaUtil);

      const folha = document.createElement('section');
      folha.className = 'folha-previa';
      folha.innerHTML = `
        <div class="pv-janela" style="height:${Math.max(0, ate - de)}px">
          <div class="pv-fluxo" style="margin-top:${-de}px">${conteudo}</div>
        </div>`;

      folhas.push(folha);
    }
  }

  trilho.innerHTML = '';
  for (const f of folhas) trilho.appendChild(f);
}

/**
 * Encaixa as folhas na largura disponível. A folha tem 21 cm de verdade;
 * numa tela de celular isso não cabe, então tudo é reduzido por inteiro —
 * nada de reflow, senão a quebra de linha deixaria de ser a do papel.
 */
export function ajustarEscala(palco) {
  const trilho = palco.querySelector('.previa-trilho');
  if (!trilho) return;

  const larguraFolha = LARGURA_CM * PX_POR_CM;
  const disponivel = palco.clientWidth - 32;        /* o respiro das bordas */
  const fator = Math.min(1, disponivel / larguraFolha);

  trilho.style.transform = `scale(${fator})`;
  trilho.style.width  = `${larguraFolha}px`;
  trilho.style.height = `${trilho.scrollHeight * fator}px`;
}

/**
 * Põe o papel timbrado atrás de TODAS as folhas.
 *
 * A arte é a primeira página do PDF do timbrado, convertida em imagem.
 * Cada folha recebe uma cópia dela, como no arquivo gerado.
 *
 * @param {HTMLElement} palco  o contêiner da pré-visualização
 * @param {string} url         endereço da imagem; nada acontece sem ele
 */
export function porFundo(palco, url) {
  if (!palco || !url) return;

  for (const folha of palco.querySelectorAll('.folha-previa')) {
    folha.style.backgroundImage = `url("${url}")`;
  }
}
