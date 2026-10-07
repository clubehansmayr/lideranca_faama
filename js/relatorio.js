/* =====================================================================
   Relatórios — PDF e Word.

   Duas modalidades:

     INDIVIDUAL  um requisito só. A seção aparece no topo.
     PASTA       o cartão inteiro. Cada requisito começa em página nova e
                 leva o título da sua seção no alto — em TODA página, não
                 só na primeira da seção: quem folheia a pasta impressa
                 precisa saber de que seção é a folha que está na mão.
                 Os requisitos em branco também entram, como folha a
                 preencher; só não entram os que o revisor marcou como
                 terminado, porque o candidato não precisava cumpri-los.

   Formatação:
     Times New Roman 12 em tudo, entrelinha 1,5.
     Seção, requisito e alínea em negrito.
     Descrição justificada com recuo de 1,25 cm na primeira linha.
     Foto em no máximo 10,15 cm de largura por 7 cm de altura.
     Legenda da foto em corpo 10.

   Sobre a fonte no PDF: o formato não embute Times New Roman (é
   proprietária), então usamos Times — a fonte padrão do PDF, com as
   mesmas medidas de letra. No Word pedimos "Times New Roman" pelo nome,
   e o Word usa a fonte instalada de verdade.
   ===================================================================== */

import { sb } from './cliente.js';
import { prefixoRequisito, prefixoAlinea, recuoAlinea,
         segmentar, negritoDeTitulo } from './marcador.js';

/* ------------------------------------------------------------ medidas */

const CM   = 28.3465;                  // 1 cm em pontos (PDF)
const TWIP = 567;                      // 1 cm em twips  (Word)
const PX   = 96 / 2.54;                // 1 cm em pixels a 96 dpi

const A4_PT = [595.28, 841.89];

/* Margens largas no topo e na base: os papéis timbrados costumam ter
   cabeçalho e rodapé grandes, e o texto não pode encostar neles. */
export const MARGEM_CM = {
  esquerda: 3,
  direita:  2,
  topo:     5,
  base:     4
};

const FOTO_CM = { largura: 10.15, altura: 7 };

const CORPO   = 12;
const LEGENDA = 10;

/* Entrelinha 1,5 como no Word: a altura de uma linha simples é cerca de
   1,15 vez o corpo da fonte, e 1,5 multiplica isso. */
const AVANCO = tamanho => tamanho * 1.15 * 1.5;

const RECUO_CM = 1.25;

/* Quanto a alínea recua a mais que o enunciado, no estilo de tópicos. */
const RECUO_TOPICO_CM = 0.75;

/* ------------------------------------------------------------ apoio */

const dataBR = iso => {
  if (!iso) return '—';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
};

const limpar = t => String(t ?? '')
  .replace(/[\u0000-\u001F\u007F]/g, ' ')
  .replace(/\u00A0/g, ' ');

/* Igual ao limpar, mas preserva as quebras de linha: o texto de uma
   alínea em estilo de tópicos é uma lista, uma linha por item. */
const limparLinhas = t => String(t ?? '')
  .replace(/\r\n?/g, '\n')
  .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ')
  .replace(/\u00A0/g, ' ')
  .replace(/[ \t]+$/gm, '');

/**
 * Parte uma sequência que não tem onde quebrar.
 *
 * "11111111…", um link colado inteiro, um nome de arquivo comprido: sem
 * espaço no meio, não há ponto de quebra, e a linha passaria da margem
 * direita — no papel isso some, porque o timbrado tem borda. Aqui a
 * sequência é cortada exatamente onde deixa de caber.
 *
 * Devolve sempre uma lista; quando a palavra cabe, é ela sozinha.
 */
function partirPalavra(palavra, fonte, tamanho, largura) {
  if (fonte.widthOfTextAtSize(palavra, tamanho) <= largura) return [palavra];

  const pedacos = [];
  let atual = '';

  /* for...of percorre por caractere de verdade (emoji inteiro, não
     metade dele) */
  for (const letra of palavra) {
    if (atual && fonte.widthOfTextAtSize(atual + letra, tamanho) > largura) {
      pedacos.push(atual);
      atual = letra;
    } else {
      atual += letra;
    }
  }

  if (atual) pedacos.push(atual);
  return pedacos;
}

async function baixar(bucket, caminho) {
  if (!caminho) return null;
  const { data, error } = await sb.storage.from(bucket).download(caminho);
  if (error || !data) return null;
  return new Uint8Array(await data.arrayBuffer());
}

/* ===================================================================== */
/*  1. Conteúdo — a estrutura neutra que os dois formatos consomem       */
/* ===================================================================== */

/**
 * Monta os blocos de um requisito (com suas alíneas, quando houver).
 *
 * @param {object} req      requisito { id, titulo, alineas[] , campos… }
 * @param {number} indice   número do requisito dentro da seção
 * @param {Function} achar  (requisitoId, alineaId) => resposta | undefined
 */
export function blocoRequisito(req, indice, achar) {
  const marcador = req.marcador ?? 'numero';

  const unidades = req.alineas?.length
    ? req.alineas.map((a, i) => ({ ...a, alineaId: a.id, posicao: i + 1 }))
    : [{ ...req, alineaId: null, posicao: 1 }];

  return {
    requisito: `${prefixoRequisito(marcador, indice)}${limparLinhas(req.titulo)}`,
    negritoTitulo: negritoDeTitulo(marcador),
    // quando tem alíneas, o requisito é só o enunciado
    unidades: unidades.map(u => {
      const resposta = achar(req.id, u.alineaId);
      const partes = resposta?.partes ?? [];

      return {
        alinea: u.alineaId
          ? `${prefixoAlinea(marcador, u.posicao)}${limparLinhas(u.titulo)}`
          : null,
        recuo: u.alineaId ? recuoAlinea(marcador) * RECUO_TOPICO_CM : 0,
        mostrarData: u.exigir_data !== false,
        mostrarDescricao: u.exigir_descricao !== false,
        mostrarFoto: !!u.permitir_fotos,
        mostrarLink: !!u.exigir_link,
        vazio: !partes.some(p => p.data_cumprimento || p.descricao || p.foto_path || p.link),
        partes: Array.from({ length: u.qtd_partes || 1 }, (_, i) => {
          const p = partes[i] ?? {};
          return {
            rotulo: (u.qtd_partes || 1) > 1
              ? `Parte ${i + 1} de ${u.qtd_partes}` : null,
            data: p.data_cumprimento ?? null,
            /* limparLinhas, não limpar: o limpar troca \n por espaço, e
               aí a descrição chegaria aos dois formatos como um
               parágrafo só — cada Enter do candidato tem de virar
               parágrafo com recuo, na tela, no PDF e no Word */
            descricao: limparLinhas(p.descricao),
            link: limpar(p.link),
            fotoCaminho: p.foto_path ?? null,
            legenda: limpar(p.legenda)
          };
        })
      };
    })
  };
}

/** Baixa as fotos de todos os blocos, uma vez só. */
async function carregarFotos(paginas) {
  const tarefas = [];

  for (const pag of paginas) {
    for (const u of pag.unidades) {
      for (const p of u.partes) {
        if (u.mostrarFoto && p.fotoCaminho) {
          tarefas.push(
            baixar('evidencias', p.fotoCaminho).then(b => { p.fotoBytes = b; })
          );
        }
      }
    }
  }

  await Promise.all(tarefas);
}

/* ===================================================================== */
/*  2. PDF                                                               */
/* ===================================================================== */

async function montarPdf(doc, timbradoBytes) {
  const { PDFDocument, StandardFonts, rgb } =
    await import('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/+esm');

  const pdf = await PDFDocument.create();

  const fontes = {
    normal:  await pdf.embedFont(StandardFonts.TimesRoman),
    negrito: await pdf.embedFont(StandardFonts.TimesRomanBold)
  };

  const PRETO = rgb(0, 0, 0);

  const M = {
    esquerda: MARGEM_CM.esquerda * CM,
    direita:  MARGEM_CM.direita  * CM,
    topo:     MARGEM_CM.topo     * CM,
    base:     MARGEM_CM.base     * CM
  };
  const util = A4_PT[0] - M.esquerda - M.direita;

  let fundo = null;
  if (timbradoBytes) {
    try { [fundo] = await pdf.embedPdf(timbradoBytes); } catch (_) { fundo = null; }
  }

  let pagina = null;
  let y = 0;

  /* Título da seção da página que está sendo escrita. Fica guardado
     porque ele se repete no alto de TODA folha — inclusive quando um
     requisito grande transborda para a folha seguinte. */
  let secaoAtual = null;

  /* Quantas folhas já foram abertas. Serve para descobrir, depois de
     escrever uma alínea, se ela passou de folha no meio do caminho. */
  let folhas = 0;

  function novaPagina() {
    pagina = pdf.addPage(A4_PT);
    if (fundo) pagina.drawPage(fundo, { x: 0, y: 0, width: A4_PT[0], height: A4_PT[1] });
    y = A4_PT[1] - M.topo;
    folhas++;
    desenharSecao();
  }

  /* Desenha direto, sem passar pelo escrever(): o escrever chama
     garantir(), que chamaria novaPagina() de novo — e daria laço. */
  function desenharSecao() {
    if (!secaoAtual) return;

    const fonte  = fontes.negrito;
    const avanco = AVANCO(CORPO);

    for (const l of quebrar(secaoAtual, fonte, CORPO, util)) {
      pagina.drawText(l.palavras.join(' '), {
        x: M.esquerda, y: y - CORPO, size: CORPO, font: fonte, color: PRETO
      });
      y -= avanco;
    }
    y -= 4;
  }

  const garantir = altura => { if (y - altura < M.base) novaPagina(); };

  function quebrar(texto, fonte, tamanho, largura, recuo = 0) {
    /* limparLinhas, não limpar: o limpar troca \n por espaço e faria todo
       texto virar um parágrafo só — inclusive a descrição do candidato. */
    const paragrafos = limparLinhas(texto).split(/\n+/).filter(p => p.trim());
    const linhas = [];

    for (const par of paragrafos) {
      let atual = [], primeira = true;

      const empurrar = palavra => {
        const teste = [...atual, palavra].join(' ');
        const disponivel = largura - (primeira ? recuo : 0);

        if (fonte.widthOfTextAtSize(teste, tamanho) <= disponivel || !atual.length) {
          atual.push(palavra);
        } else {
          linhas.push({ palavras: atual, primeira, ultima: false });
          primeira = false;
          atual = [palavra];
        }
      };

      for (const palavra of par.trim().split(/\s+/)) {
        /* a primeira linha é a mais estreita (tem o recuo); medir por ela
           nunca faz um pedaço estourar depois */
        const disponivel = largura - (primeira ? recuo : 0);
        for (const pedaco of partirPalavra(palavra, fonte, tamanho, disponivel)) {
          empurrar(pedaco);
        }
      }

      if (atual.length) linhas.push({ palavras: atual, primeira, ultima: true });
    }
    return linhas;
  }

  /**
   * Escreve um texto que pode misturar trechos normais e em negrito,
   * marcados com ** no próprio conteúdo. A quebra de linha é feita
   * palavra a palavra, medindo cada uma com a fonte que lhe cabe.
   */
  function escrever(texto, { negrito = false, tamanho = CORPO,
                             centro = false, recuoCm = 0 } = {}) {
    if (!texto) return;

    const avanco  = AVANCO(tamanho);
    const recuo   = recuoCm * CM;
    const largura = util - recuo;
    const espaco  = fontes.normal.widthOfTextAtSize(' ', tamanho);

    for (const paragrafo of limparLinhas(texto).split(/\n+/)) {
      if (!paragrafo.trim()) continue;

      /* cada palavra guarda a própria fonte */
      const palavras = [];
      for (const pedaco of segmentar(paragrafo, negrito)) {
        const fonte = pedaco.negrito ? fontes.negrito : fontes.normal;
        for (const palavra of pedaco.texto.split(/\s+/)) {
          if (!palavra) continue;
          for (const parte of partirPalavra(palavra, fonte, tamanho, largura)) {
            palavras.push({ palavra: parte, fonte, w: fonte.widthOfTextAtSize(parte, tamanho) });
          }
        }
      }
      if (!palavras.length) continue;

      let linha = [];

      const soltarLinha = () => {
        if (!linha.length) return;

        garantir(avanco);
        const total = linha.reduce((n, p) => n + p.w, 0) + espaco * (linha.length - 1);
        let x = centro ? M.esquerda + (util - total) / 2 : M.esquerda + recuo;

        for (const p of linha) {
          pagina.drawText(p.palavra, {
            x, y: y - tamanho, size: tamanho, font: p.fonte, color: PRETO
          });
          x += p.w + espaco;
        }

        y -= avanco;
        linha = [];
      };

      for (const p of palavras) {
        const usado = linha.reduce((n, q) => n + q.w, 0) + espaco * Math.max(0, linha.length - 1);
        const cabe  = usado + (linha.length ? espaco : 0) + p.w;
        if (cabe > largura && linha.length) soltarLinha();
        linha.push(p);
      }

      soltarLinha();
    }
  }

  function justificar(texto) {
    if (!texto) return;
    const fonte = fontes.normal;
    const avanco = AVANCO(CORPO);
    const recuo = RECUO_CM * CM;

    for (const l of quebrar(texto, fonte, CORPO, util, recuo)) {
      garantir(avanco);

      const x0 = M.esquerda + (l.primeira ? recuo : 0);
      const disponivel = util - (l.primeira ? recuo : 0);

      if (l.ultima || l.palavras.length === 1) {
        pagina.drawText(l.palavras.join(' '), {
          x: x0, y: y - CORPO, size: CORPO, font: fonte, color: PRETO
        });
      } else {
        const largura = l.palavras.reduce(
          (s, p) => s + fonte.widthOfTextAtSize(p, CORPO), 0);
        const folga = (disponivel - largura) / (l.palavras.length - 1);

        let x = x0;
        for (const palavra of l.palavras) {
          pagina.drawText(palavra, {
            x, y: y - CORPO, size: CORPO, font: fonte, color: PRETO
          });
          x += fonte.widthOfTextAtSize(palavra, CORPO) + folga;
        }
      }
      y -= avanco;
    }
  }

  async function desenharFoto(bytes, legenda) {
    let img = null;
    try { img = await pdf.embedJpg(bytes); }
    catch (_) { try { img = await pdf.embedPng(bytes); } catch (_) { return; } }

    /* Cabe dentro de 8 × 5,5 cm sem distorcer: a proporção da foto é
       mantida, e a caixa é o limite. */
    const maxL = FOTO_CM.largura * CM;
    const maxA = FOTO_CM.altura  * CM;
    const escala = Math.min(maxL / img.width, maxA / img.height);

    const w = img.width * escala;
    const h = img.height * escala;

    const alturaLegenda = legenda ? AVANCO(LEGENDA) : 0;
    garantir(h + alturaLegenda + 6);

    pagina.drawImage(img, {
      x: M.esquerda + (util - w) / 2, y: y - h, width: w, height: h
    });
    y -= h + 5;

    if (legenda) {
      const t = limpar(legenda);
      const w2 = fontes.normal.widthOfTextAtSize(t, LEGENDA);
      pagina.drawText(t, {
        x: M.esquerda + (util - Math.min(w2, util)) / 2,
        y: y - LEGENDA,
        size: LEGENDA, font: fontes.normal, color: PRETO
      });
      y -= alturaLegenda;
    }
  }

  /* ------------------------------------------------------- montagem */

  for (const [i, pag] of doc.paginas.entries()) {
    /* a seção é definida ANTES de abrir a folha: a novaPagina já a
       escreve no alto, e com isso ela sai também nas folhas de
       continuação, sem repetição em dobro */
    secaoAtual = pag.secao ?? null;

    if (i === 0 || doc.quebraPorRequisito) novaPagina();
    else if (pag.secao) { escrever(pag.secao, { negrito: true }); y -= 4; }

    escrever(pag.requisito, { negrito: pag.negritoTitulo !== false });
    y -= 6;

    /* As alíneas de um mesmo requisito saem seguidas, para não gastar
       folha à toa. Mas quando uma delas passa de página, a sobra dela e
       o começo da seguinte dividiriam a mesma folha — e aí não se sabe
       mais onde uma termina. Então: alínea que transbordou empurra a
       próxima para uma folha limpa. */
    let transbordou = false;

    for (const [k, u] of pag.unidades.entries()) {
      if (k > 0 && transbordou) {
        novaPagina();
        /* o enunciado vem junto: senão a alínea abre a folha sozinha,
           sem dizer de que requisito ela é */
        escrever(pag.requisito, { negrito: pag.negritoTitulo !== false });
        y -= 6;
      }

      const folhaInicial = folhas;

      if (u.alinea) {
        escrever(u.alinea, {
          negrito: pag.negritoTitulo !== false,
          recuoCm: u.recuo ?? 0
        });
        y -= 4;
      }

      if (u.vazio) {
        escrever('(não preenchido)');
        y -= 8;

      } else {
        for (const p of u.partes) {
          if (p.rotulo) { escrever(p.rotulo); y -= 2; }
          if (u.mostrarData) { escrever(`Data do cumprimento: ${dataBR(p.data)}`); y -= 4; }
          if (u.mostrarLink)  { escrever(`Link: ${p.link || '—'}`); y -= 4; }
          if (u.mostrarDescricao && p.descricao) { justificar(p.descricao); y -= 6; }
          if (u.mostrarFoto && p.fotoBytes) { await desenharFoto(p.fotoBytes, p.legenda); y -= 6; }
        }
        y -= 6;
      }

      /* abriu folha nova enquanto escrevia esta alínea? */
      transbordou = folhas > folhaInicial;
    }
  }

  return await pdf.save();
}

/* ===================================================================== */
/*  3. Word                                                              */
/* ===================================================================== */

/** Converte a 1ª página do timbrado em imagem, para virar fundo no Word. */
async function timbradoComoImagem(bytes) {
  try {
    const pdfjs = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/+esm');
    pdfjs.GlobalWorkerOptions.workerSrc =
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs';

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pagina = await doc.getPage(1);
    const vista = pagina.getViewport({ scale: 2 });

    const tela = document.createElement('canvas');
    tela.width = vista.width;
    tela.height = vista.height;

    await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;

    const blob = await new Promise(r => tela.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());

  } catch (_) {
    return null;   // sem fundo, o documento sai em folha branca
  }
}

async function montarWord(doc, timbradoBytes) {
  const D = await import('https://cdn.jsdelivr.net/npm/docx@9.0.2/+esm');

  const FONTE = 'Times New Roman';
  const meio = pt => pt * 2;                    // docx mede em meio-ponto
  const ENTRELINHA_15 = 360;                    // 240 = simples

  const texto = (t, { negrito = false, tamanho = CORPO } = {}) =>
    new D.TextRun({ text: limpar(t), bold: negrito, font: FONTE, size: meio(tamanho) });

  /* Um pedaço de texto pode virar vários trechos, quando há ** marcando
     negrito dentro dele. */
  const trechos = (t, opcoes = {}) =>
    segmentar(limpar(t), opcoes.negrito ?? false).map(p =>
      new D.TextRun({
        text: p.texto,
        bold: p.negrito,
        font: FONTE,
        size: meio(opcoes.tamanho ?? CORPO)
      }));

  /* wordWrap: true vira <w:wordWrap w:val="0"> no arquivo — que no Word
     quer dizer "pode quebrar no meio da palavra". Sem isso uma sequência
     sem espaço ("11111…", um link colado inteiro) passa da margem direita
     e some na impressão. */
  const paragrafo = (t, opcoes = {}) => new D.Paragraph({
    children: trechos(t, opcoes),
    alignment: opcoes.centro ? D.AlignmentType.CENTER : D.AlignmentType.LEFT,
    indent: opcoes.recuoCm ? { left: Math.round(opcoes.recuoCm * TWIP) } : undefined,
    spacing: { line: ENTRELINHA_15, after: opcoes.depois ?? 0 },
    wordWrap: true
  });

  /* Uma alínea em estilo de tópicos é uma lista: cada linha vira um
     parágrafo próprio, senão o Word junta tudo numa linha só. */
  const paragrafosDeLinhas = (t, opcoes = {}) => {
    const linhas = String(t ?? '').split(/\n/).map(l => l.trim()).filter(Boolean);
    if (!linhas.length) return [];

    return linhas.map((linha, i) => paragrafo(linha, {
      ...opcoes,
      depois: i === linhas.length - 1 ? (opcoes.depois ?? 0) : 0
    }));
  };

  /* Um parágrafo por quebra de linha: o recuo de 1,25 cm entra em todos,
     igual ao que a tela mostra enquanto o candidato escreve. */
  const justificado = t => {
    const partes = limparLinhas(t).split(/\n+/).map(p => p.trim()).filter(Boolean);
    if (!partes.length) return [];

    return partes.map((par, i) => new D.Paragraph({
      children: [texto(par)],
      alignment: D.AlignmentType.JUSTIFIED,
      indent: { firstLine: Math.round(RECUO_CM * TWIP) },
      spacing: { line: ENTRELINHA_15, after: i === partes.length - 1 ? 120 : 0 },
      wordWrap: true
    }));
  };

  const imagem = (bytes, legenda) => {
    const filhos = [new D.Paragraph({
      children: [new D.ImageRun({
        type: 'jpg',
        data: bytes,
        transformation: {
          width:  Math.round(FOTO_CM.largura * PX),
          height: Math.round(FOTO_CM.altura  * PX)
        }
      })],
      alignment: D.AlignmentType.CENTER,
      spacing: { line: ENTRELINHA_15, after: legenda ? 40 : 160 }
    })];

    if (legenda) {
      filhos.push(new D.Paragraph({
        children: [texto(legenda, { tamanho: LEGENDA })],
        alignment: D.AlignmentType.CENTER,
        spacing: { line: ENTRELINHA_15, after: 160 }
      }));
    }
    return filhos;
  };

  /* fundo timbrado, quando der para converter */
  let cabecalho = undefined;
  if (timbradoBytes) {
    const png = await timbradoComoImagem(timbradoBytes);

    if (png) {
      cabecalho = {
        default: new D.Header({
          children: [new D.Paragraph({
            children: [new D.ImageRun({
              type: 'png',
              data: png,
              transformation: {
                width:  Math.round(21   * PX),
                height: Math.round(29.7 * PX)
              },
              floating: {
                horizontalPosition: {
                  relative: D.HorizontalPositionRelativeFrom.PAGE, offset: 0
                },
                verticalPosition: {
                  relative: D.VerticalPositionRelativeFrom.PAGE, offset: 0
                },
                behindDocument: true,
                zIndex: -1
              }
            })]
          })]
        })
      };
    }
  }

  /* ------------------------------------------------------- montagem */

  const filhos = [];

  for (const [i, pag] of doc.paginas.entries()) {
    if (i > 0 && doc.quebraPorRequisito) {
      filhos.push(new D.Paragraph({ children: [new D.PageBreak()] }));
    }

    if (pag.secao) filhos.push(paragrafo(pag.secao, { negrito: true, depois: 80 }));

    filhos.push(...paragrafosDeLinhas(pag.requisito, {
      negrito: pag.negritoTitulo !== false, depois: 120
    }));

    for (const u of pag.unidades) {
      if (u.alinea) {
        filhos.push(...paragrafosDeLinhas(u.alinea, {
          negrito: pag.negritoTitulo !== false,
          depois: 80,
          recuoCm: u.recuo ?? 0
        }));
      }

      if (u.vazio) {
        filhos.push(paragrafo('(não preenchido)', { depois: 160 }));
        continue;
      }

      for (const p of u.partes) {
        if (p.rotulo) filhos.push(paragrafo(p.rotulo, { depois: 40 }));

        if (u.mostrarData) {
          filhos.push(paragrafo(`Data do cumprimento: ${dataBR(p.data)}`, { depois: 80 }));
        }
        if (u.mostrarLink) {
          filhos.push(paragrafo(`Link: ${p.link || '—'}`, { depois: 80 }));
        }
        if (u.mostrarDescricao && p.descricao) filhos.push(...justificado(p.descricao));
        if (u.mostrarFoto && p.fotoBytes)      filhos.push(...imagem(p.fotoBytes, p.legenda));
      }
    }
  }

  const documento = new D.Document({
    styles: {
      default: {
        document: { run: { font: FONTE, size: meio(CORPO) } }
      }
    },
    sections: [{
      properties: {
        page: {
          size: { width: Math.round(21 * TWIP), height: Math.round(29.7 * TWIP) },
          margin: {
            top:    Math.round(MARGEM_CM.topo     * TWIP),
            bottom: Math.round(MARGEM_CM.base     * TWIP),
            left:   Math.round(MARGEM_CM.esquerda * TWIP),
            right:  Math.round(MARGEM_CM.direita  * TWIP),
            header: 0, footer: 0
          }
        }
      },
      headers: cabecalho,
      children: filhos
    }]
  });

  const blob = await D.Packer.toBlob(documento);
  return new Uint8Array(await blob.arrayBuffer());
}

/* ===================================================================== */
/*  4. Porta de entrada                                                  */
/* ===================================================================== */

/**
 * @param {object} doc      { paginas[], quebraPorRequisito }
 * @param {string} formato  'pdf' | 'word'
 * @param {string} timbrado caminho do PDF de fundo no Storage
 */
export async function gerarRelatorio(doc, formato, timbrado) {
  await carregarFotos(doc.paginas);

  const timbradoBytes = await baixar('timbrados', timbrado);

  return formato === 'word'
    ? { bytes: await montarWord(doc, timbradoBytes), extensao: 'docx',
        tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    : { bytes: await montarPdf(doc, timbradoBytes), extensao: 'pdf',
        tipo: 'application/pdf' };
}

export function baixarArquivo({ bytes, tipo }, nome) {
  const url = URL.createObjectURL(new Blob([bytes], { type: tipo }));

  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();

  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function nomeArquivo(pedacos, extensao) {
  return pedacos
    .filter(Boolean)
    .join(' - ')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 90) + '.' + extensao;
}
