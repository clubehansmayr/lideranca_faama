/* =====================================================================
   Pré-visualização — o requisito na tela, do jeito que vai sair no papel.

   Existe para o candidato não precisar baixar um PDF a cada vez que
   quiser conferir como está ficando. Serve também ao revisor e ao
   administrador, que avaliam sem ter de gerar arquivo.

   A folha é desenhada em centímetros de verdade (o navegador converte
   cm em pixels), com as mesmas medidas do relatório: A4, margens de
   3 / 2 / 5 / 4 cm, Times New Roman 12, entrelinha 1,5, descrição
   justificada com recuo de 1,25 cm e foto em 10,15 × 7 cm.

   O que NÃO aparece aqui é o papel timbrado: ele é um PDF, e desenhá-lo
   custaria baixar e converter a arte a cada abertura. Fica o aviso no
   rodapé da janela.
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

/* ===================================================================== */

/**
 * Monta o conteúdo da folha.
 *
 * @param {object} o
 * @param {string} o.secao    título da seção
 * @param {object} o.bloco    saída de blocoRequisito() do relatorio.js
 * @param {Map}    o.fotos    caminho no depósito -> URL assinada
 */
export function folhaDaPrevia({ secao, bloco, fotos }) {
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

  return `
    ${secao ? `<p class="pv-secao">${negrito(secao, true)}</p>` : ''}
    <p class="pv-requisito ${negTitulo ? 'pv-forte' : ''} ${jusTitulo ? 'pv-justo' : ''}"
      >${negrito(bloco.requisito, negTitulo)}</p>
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

  .folha-previa {
    width: ${LARGURA_CM}cm;
    min-height: ${ALTURA_CM}cm;
    box-sizing: border-box;
    padding: ${MARGEM.topo}cm ${MARGEM.direita}cm ${MARGEM.base}cm ${MARGEM.esquerda}cm;

    /* background-COLOR, não o atalho "background": o atalho zera repeat,
       position e size, e as três linhas abaixo iriam por água abaixo —
       o timbrado saía em tamanho natural e repetido nos dois sentidos.
       Por isso elas vêm DEPOIS, e a cor é declarada sozinha. */
    background-color: #fff;
    background-repeat: repeat-y;
    background-position: top center;
    background-size: 100% ${ALTURA_CM}cm;

    box-shadow: 0 10px 30px rgba(0,0,0,.35);
    font-family: "Times New Roman", Times, serif;
    font-size: 12pt;
    line-height: 1.725;   /* entrelinha 1,5 do Word */
    color: #000;
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

  .previa-rodape {
    font-size: .78rem;
    color: var(--texto-suave);
    margin: 10px 0 0;
    line-height: 1.5;
  }`;

  document.head.appendChild(e);
}

/**
 * Encaixa a folha na largura disponível. A folha tem 21 cm de verdade;
 * numa tela de celular isso não cabe, então ela é reduzida por inteiro —
 * nada de reflow, senão a quebra de linha deixaria de ser a do papel.
 */
export function ajustarEscala(palco) {
  const trilho = palco.querySelector('.previa-trilho');
  const folha  = palco.querySelector('.folha-previa');
  if (!trilho || !folha) return;

  const larguraFolha = LARGURA_CM * PX_POR_CM;
  const disponivel = palco.clientWidth - 32;        /* o respiro das bordas */
  const fator = Math.min(1, disponivel / larguraFolha);

  trilho.style.transform = `scale(${fator})`;
  trilho.style.width  = `${larguraFolha}px`;
  trilho.style.height = `${folha.offsetHeight * fator}px`;
}

/**
 * Põe o papel timbrado atrás da folha.
 *
 * A arte é a primeira página do PDF do timbrado, convertida em imagem.
 * Ela se repete a cada 29,7 cm, então um requisito comprido mostra o
 * timbrado em todas as folhas, como no arquivo gerado.
 *
 * @param {HTMLElement} palco  o contêiner da pré-visualização
 * @param {string} url         endereço da imagem; nada acontece sem ele
 */
export function porFundo(palco, url) {
  const folha = palco?.querySelector('.folha-previa');
  if (!folha || !url) return;

  folha.style.backgroundImage = `url("${url}")`;
}
