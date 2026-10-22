/* =====================================================================
   Relatórios — PDF e Word.

   Duas modalidades:

     INDIVIDUAL  um requisito só. A seção aparece no topo.
     PASTA       o cartão inteiro, um requisito por página.

   A regra das páginas, que vale nas duas:

     Todo requisito COMEÇA em folha nova, com a seção e o enunciado no
     alto. Dois requisitos nunca dividem a mesma folha.

     Se o texto dele passar da folha, a continuação sai LIMPA: sem seção,
     sem enunciado, só o resto do texto. E o que sobrar daquela folha
     fica em branco, porque o requisito seguinte abre outra.

   Quem monta as páginas é o pasta.js: uma página por unidade (o
   requisito sozinho, ou cada alínea). Aqui só desenhamos o que vem.

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
         segmentar, negritoDeTitulo, justificaTitulo } from './marcador.js';
import { aberturaEssenciais } from './essenciais.js';
import { tabelaEspecialidade, logoDaCategoria, larguraDasColunas,
         aberturaEspecialidade,
         CORES_ESPECIALIDADE, HEX_ESPECIALIDADE } from './especialidade.js';

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

/* ------------------------------------------- o que a fonte do PDF aceita

   As fontes padrão do PDF usam a tabela WinAnsi, que tem as letras
   acentuadas do português mas não tem símbolo nenhum fora dela. Um ‣
   colado do Word, uma seta, um emoji — e o pdf-lib para tudo com
   "WinAnsi cannot encode". O relatório inteiro deixava de sair por causa
   de um caractere.

   Então, antes de desenhar: trocamos o que tem equivalente e varremos o
   que não tem. O Word não precisa disso, aceita qualquer caractere.
   ------------------------------------------------------------------ */

const TROCAS_PDF = {
  /* marcadores de lista que viram a nossa bolinha */
  '\u2023': '\u2022', '\u2043': '\u2022', '\u25AA': '\u2022',
  '\u25AB': '\u2022', '\u25CF': '\u2022', '\u25CB': '\u2022',
  '\u25E6': '\u2022', '\u25A0': '\u2022', '\u25A1': '\u2022',
  '\u2219': '\u2022', '\u00BB': '\u2022', '\u279E': '\u2022',

  /* traços e aspas de outras tabelas */
  '\u2010': '-', '\u2011': '-', '\u2012': '-', '\u2015': '\u2014',
  '\u2032': "'", '\u2033': '"', '\u2035': "'", '\u2036': '"',

  /* espaços que não são o espaço comum */
  '\u202F': ' ', '\u2009': ' ', '\u200A': ' ', '\u2007': ' ',
  '\u200B': '',  '\u200C': '',  '\u200D': '',  '\uFEFF': '',

  /* sinais que aparecem em texto de requisito */
  '\u2713': '(ok)', '\u2714': '(ok)', '\u2717': '(x)', '\u2718': '(x)',
  '\u2192': '->', '\u2190': '<-', '\u21D2': '=>',
  '\u2264': '<=', '\u2265': '>=', '\u2260': '<>'
};

/**
 * Devolve o texto que esta fonte consegue desenhar.
 *
 * O caminho comum — texto só com letras e acentos — passa direto, numa
 * única verificação. Só quando há algo estranho é que vale a pena olhar
 * caractere por caractere.
 */
function seguroNaFonte(texto, fonte) {
  const original = String(texto ?? '');
  if (!original) return '';

  try { fonte.encodeText(original); return original; } catch (_) { /* segue */ }

  const trocado = [...original].map(c => TROCAS_PDF[c] ?? c).join('');
  try { fonte.encodeText(trocado); return trocado; } catch (_) { /* segue */ }

  /* o que sobrou vira espaço, não some: apagar colaria as palavras */
  let saida = '';
  for (const c of trocado) {
    try { fonte.encodeText(c); saida += c; } catch (_) { saida += ' '; }
  }
  return saida;
}

/* ------------------------------------------- medir como o PDF desenha

   O pdf-lib mede com KERNING: "DESENVOLVIMENTO" medido de uma vez dá
   1,86 pt a menos que a soma das letras, porque ele aproxima pares como
   VO e EN. Só que o leitor de PDF, ao desenhar um texto solto, NÃO
   aplica kerning nenhum.

   Como o relatório posiciona palavra por palavra (é assim que o negrito
   no meio da frase funciona), cada palavra saía desenhada mais larga do
   que foi medida e comia o espaço seguinte. Daí "DESENVOLVIMENTODE
   NOVASHABILIDADES": a palavra com mais kerning perdia o espaço inteiro,
   e "DE", que não tem par nenhum, mantinha o dele.

   A conta certa, então, é a soma das letras — que é exatamente o que o
   leitor vai desenhar. O cache evita medir a mesma letra mil vezes.
   ------------------------------------------------------------------ */

const CACHE_LARGURA = new WeakMap();

function larguraReal(texto, fonte, tamanho) {
  let porFonte = CACHE_LARGURA.get(fonte);
  if (!porFonte) { porFonte = new Map(); CACHE_LARGURA.set(fonte, porFonte); }

  let porTamanho = porFonte.get(tamanho);
  if (!porTamanho) { porTamanho = new Map(); porFonte.set(tamanho, porTamanho); }

  let total = 0;
  for (const letra of String(texto ?? '')) {
    let w = porTamanho.get(letra);
    if (w === undefined) {
      /* o seguroNaFonte já tirou o que a fonte não aceita; isto aqui é
         só para nunca derrubar o relatório por causa de uma medida */
      try { w = fonte.widthOfTextAtSize(letra, tamanho); } catch (_) { w = 0; }
      porTamanho.set(letra, w);
    }
    total += w;
  }
  return total;
}

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
  if (larguraReal(palavra, fonte, tamanho) <= largura) return [palavra];

  const pedacos = [];
  let atual = '';

  /* for...of percorre por caractere de verdade (emoji inteiro, não
     metade dele) */
  for (const letra of palavra) {
    if (atual && larguraReal(atual + letra, fonte, tamanho) > largura) {
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
    /* no estilo livre o enunciado é um parágrafo, e parágrafo sai
       justificado — nos outros dois é título curto ou lista */
    justificarTitulo: justificaTitulo(marcador),
    // quando tem alíneas, o requisito é só o enunciado
    unidades: unidades.map(u => {
      const resposta = achar(req.id, u.alineaId);
      const partes = resposta?.partes ?? [];

      return {
        alinea: u.alineaId
          ? `${prefixoAlinea(marcador, u.posicao)}${limparLinhas(u.titulo)}`
          : null,
        recuo: u.alineaId ? recuoAlinea(marcador) * RECUO_TOPICO_CM : 0,
        justificar: justificaTitulo(marcador),
        mostrarData: u.exigir_data !== false,
        /* a especialidade traz descrição própria, mesmo com
           exigir_descricao desligado — ela é o texto do requisito */
        mostrarDescricao: u.exigir_descricao !== false || !!u.exigir_especialidade,
        mostrarFoto: !!u.permitir_fotos,
        mostrarLink: !!u.exigir_link,
        mostrarEssenciais: !!u.exigir_essenciais,
        mostrarEspecialidade: !!u.exigir_especialidade,
        vazio: !partes.some(p => p.data_cumprimento || p.descricao
                              || p.foto_path || p.link || p.essenciais
                              || p.especialidade || p.especialidade_foto_path),
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
            /* A frase de abertura vem antes da descrição, e existe mesmo
               que o requisito não peça descrição nenhuma.

               São duas, nunca juntas: o requisito pede as sete essenciais
               OU a especialidade — as duas chaves não podem estar ligadas
               ao mesmo tempo, o banco não deixa. */
            abertura: u.exigir_essenciais    ? aberturaEssenciais(p.essenciais)
                    : u.exigir_especialidade ? aberturaEspecialidade(p.especialidade)
                    : null,
            fotoCaminho: p.foto_path ?? null,
            legenda: limpar(p.legenda),

            /* a ficha da especialidade, já reduzida às colunas que têm
               valor — null quando nada foi preenchido */
            especialidade: u.exigir_especialidade
              ? tabelaEspecialidade(p.especialidade) : null,
            distintivoCaminho: u.exigir_especialidade
              ? (p.especialidade_foto_path ?? null) : null
          };
        })
      };
    })
  };
}

/* A partir de quantas partes cada uma ganha folha própria.

   Com duas partes elas convivem bem na mesma folha. De três em diante o
   requisito vira um relatório dentro do relatório — cada parte com data,
   texto e foto — e misturá-las numa página só faz a leitura se perder. */
export const PARTES_EM_FOLHAS = 3;

/**
 * As PÁGINAS de uma unidade (o requisito sozinho, ou uma alínea dele).
 *
 * Em geral é uma página só, e o relatorio.js abre as seguintes sozinho
 * quando o texto transborda. Pedindo três partes ou mais, cada parte sai
 * numa folha própria: a primeira leva seção, enunciado e alínea no alto,
 * as outras não levam nada — a "Parte 2 de 3" começa a folha dela e o que
 * sobrar da folha anterior fica em branco.
 *
 * Na especialidade a conta começa em DUAS. Cada parte ali é uma
 * especialidade inteira — descrição e tabela —, e duas delas na mesma
 * folha viram um amontoado. Duas especialidades, duas folhas.
 *
 * @param {object} bloco     saída de blocoRequisito()
 * @param {object} unidade   uma das bloco.unidades
 * @param {string} [secao]   título da seção, no alto da primeira folha
 */
export function paginasDaUnidade(bloco, unidade, { secao = null } = {}) {
  const cabecalho = {
    secao,
    requisito: bloco.requisito,
    negritoTitulo: bloco.negritoTitulo,
    justificarTitulo: bloco.justificarTitulo
  };

  const partes = unidade.partes ?? [];
  const aPartirDe = unidade.mostrarEspecialidade ? 2 : PARTES_EM_FOLHAS;

  /* Unidade vazia não se divide: três folhas dizendo "(não preenchido)"
     não informam mais do que uma. */
  if (unidade.vazio || partes.length < aPartirDe) {
    return [{ ...cabecalho, unidades: [unidade] }];
  }

  /* Parte sem nada escrito não ganha folha. Uma página só com
     "Parte 2 de 3" e um travessão não prova coisa nenhuma — é a mesma
     regra que tira os requisitos em branco da pasta. O rótulo das outras
     continua dizendo a verdade: a parte 3 sai como "Parte 3 de 3" mesmo
     que a 2 não tenha saído. */
  const cheias = partes.filter(p =>
    p.data || p.descricao || p.link || p.abertura
    || p.fotoCaminho || p.especialidade || p.distintivoCaminho);

  if (!cheias.length) return [{ ...cabecalho, unidades: [unidade] }];

  return cheias.map((parte, i) => i === 0
    ? { ...cabecalho, unidades: [{ ...unidade, partes: [parte] }] }
    : {
        secao: null,
        requisito: null,
        negritoTitulo: bloco.negritoTitulo,
        justificarTitulo: bloco.justificarTitulo,
        /* sem alínea: o cabeçalho ficou na folha da primeira parte */
        unidades: [{ ...unidade, alinea: null, partes: [parte] }]
      });
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
        if (u.mostrarEspecialidade && p.distintivoCaminho) {
          tarefas.push(
            baixar('evidencias', p.distintivoCaminho).then(b => { p.distintivoBytes = b; })
          );
        }
      }
    }
  }

  await Promise.all(tarefas);
}

/**
 * O logo do clube, do próprio site — não é arquivo do candidato, é arte
 * que já viaja junto com o aplicativo.
 *
 * Volta null se não vier: a tabela da especialidade sai sem a coluna do
 * logo, o que é bem melhor do que o arquivo não sair.
 */
async function logoDoClube(categoria) {
  const caminho = logoDaCategoria(categoria);
  if (!caminho) return null;

  try {
    const resposta = await fetch(new URL(caminho, document.baseURI));
    if (!resposta.ok) return null;
    return new Uint8Array(await resposta.arrayBuffer());

  } catch (erro) {
    console.warn('Logo do clube não carregou:', erro);
    return null;
  }
}

/** Alguma página pede a tabela da especialidade? */
const pedeEspecialidade = paginas => paginas.some(pag =>
  pag.unidades.some(u => u.mostrarEspecialidade
                      && u.partes.some(p => p.especialidade)));

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
  /* A folha nova sai limpa: nenhum título é reescrito aqui. Quem abre a
     folha no meio de um texto é o garantir(), e o que está nela ainda é
     o mesmo requisito — repetir cabeçalho ali faria parecer que começou
     requisito novo. O título vem uma vez só, na folha em que o requisito
     começa, escrito lá embaixo na montagem. */
  function novaPagina() {
    pagina = pdf.addPage(A4_PT);
    if (fundo) pagina.drawPage(fundo, { x: 0, y: 0, width: A4_PT[0], height: A4_PT[1] });
    y = A4_PT[1] - M.topo;
  }

  const garantir = altura => { if (y - altura < M.base) novaPagina(); };

  function quebrar(texto, fonte, tamanho, largura, recuo = 0) {
    /* limparLinhas, não limpar: o limpar troca \n por espaço e faria todo
       texto virar um parágrafo só — inclusive a descrição do candidato. */
    /* Sanear DEPOIS de separar os parágrafos: a quebra de linha não
       existe no WinAnsi, e saneando o texto inteiro ela viraria espaço —
       todo parágrafo se juntaria num só. */
    const paragrafos = limparLinhas(texto).split(/\n+/)
      .map(par => seguroNaFonte(par, fonte))
      .filter(par => par.trim());
    const linhas = [];

    for (const par of paragrafos) {
      let atual = [], primeira = true;

      const empurrar = palavra => {
        const teste = [...atual, palavra].join(' ');
        const disponivel = largura - (primeira ? recuo : 0);

        if (larguraReal(teste, fonte, tamanho) <= disponivel || !atual.length) {
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
                             centro = false, recuoCm = 0,
                             justificado = false } = {}) {
    if (!texto) return;

    const avanco  = AVANCO(tamanho);
    const recuo   = recuoCm * CM;
    const largura = util - recuo;
    const espaco  = larguraReal(' ', fontes.normal, tamanho);

    /* Igual ao quebrar(): primeiro separa os parágrafos, depois saneia
       cada um. As duas fontes usam a mesma tabela, então sanear por uma
       vale para as duas — inclusive para os trechos em negrito. */
    for (const bruto of limparLinhas(texto).split(/\n+/)) {
      const paragrafo = seguroNaFonte(bruto, fontes.normal);
      if (!paragrafo.trim()) continue;

      /* cada palavra guarda a própria fonte */
      const palavras = [];
      for (const pedaco of segmentar(paragrafo, negrito)) {
        const fonte = pedaco.negrito ? fontes.negrito : fontes.normal;
        for (const palavra of pedaco.texto.split(/\s+/)) {
          if (!palavra) continue;
          for (const parte of partirPalavra(palavra, fonte, tamanho, largura)) {
            palavras.push({ palavra: parte, fonte, w: larguraReal(parte, fonte, tamanho) });
          }
        }
      }
      if (!palavras.length) continue;

      let linha = [];

      /* @param {boolean} ultima  última linha do parágrafo? A última não
         se estica: num texto justificado ela termina onde o texto
         termina, senão as palavras ficariam espalhadas pela folha. */
      const soltarLinha = ultima => {
        if (!linha.length) return;

        garantir(avanco);

        const palavrada = linha.reduce((n, p) => n + p.w, 0);
        const vaos = linha.length - 1;

        let folga = espaco;
        let x = M.esquerda + recuo;

        if (centro) {
          x = M.esquerda + (util - (palavrada + espaco * vaos)) / 2;
        } else if (justificado && !ultima && vaos > 0) {
          /* o que sobra até a margem é dividido entre os vãos */
          folga = (largura - palavrada) / vaos;
        }

        for (const p of linha) {
          pagina.drawText(p.palavra, {
            x, y: y - tamanho, size: tamanho, font: p.fonte, color: PRETO
          });
          x += p.w + folga;
        }

        y -= avanco;
        linha = [];
      };

      for (const p of palavras) {
        const usado = linha.reduce((n, q) => n + q.w, 0) + espaco * Math.max(0, linha.length - 1);
        const cabe  = usado + (linha.length ? espaco : 0) + p.w;
        if (cabe > largura && linha.length) soltarLinha(false);
        linha.push(p);
      }

      soltarLinha(true);
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
          (s, p) => s + larguraReal(p, fonte, CORPO), 0);
        const folga = (disponivel - largura) / (l.palavras.length - 1);

        let x = x0;
        for (const palavra of l.palavras) {
          pagina.drawText(palavra, {
            x, y: y - CORPO, size: CORPO, font: fonte, color: PRETO
          });
          x += larguraReal(palavra, fonte, CORPO) + folga;
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

    /* Quantas linhas a legenda vai ocupar. Isso é medido ANTES de desenhar
       a foto para que as duas coisas caibam na mesma folha: legenda solta
       no alto da página seguinte, longe da foto, não quer dizer nada. */
    const linhasLegenda = legenda
      ? quebrar(legenda, fontes.normal, LEGENDA, util).length
      : 0;

    garantir(h + linhasLegenda * AVANCO(LEGENDA) + 6);

    pagina.drawImage(img, {
      x: M.esquerda + (util - w) / 2, y: y - h, width: w, height: h
    });
    y -= h + 5;

    /* Centralizada e quebrando em linhas. Antes era um drawText só, com o
       x calculado na mão: legenda comprida saía numa linha só e passava
       da margem — às vezes da própria folha. O escrever() mede palavra a
       palavra e centraliza cada linha. */
    if (legenda) escrever(legenda, { tamanho: LEGENDA, centro: true });
  }

  /* ------------------------------------------- tabela da especialidade */

  /**
   * A ficha da especialidade, desenhada à mão.
   *
   * O pdf-lib não tem tabela: são retângulos e textos medidos um a um.
   * A conta é toda feita ANTES de desenhar, porque a tabela não se parte
   * ao meio — ou cabe na folha, ou começa na seguinte inteira.
   *
   * @param {{nome: string, colunas: object[]}} tabela  só as colunas com valor
   * @param {Uint8Array} [distintivo]  a imagem que o candidato enviou
   */
  async function desenharEspecialidade(tabela, distintivo) {
    const PAD_X = 5, PAD_Y = 4;
    const T_NOME = 11, T_TITULO = 9, T_VALOR = 10;

    const { escuro, claro, linha } = CORES_ESPECIALIDADE;
    const COR_ESCURO = rgb(escuro.r, escuro.g, escuro.b);
    const COR_CLARO  = rgb(claro.r,  claro.g,  claro.b);
    const COR_LINHA  = rgb(linha.r,  linha.g,  linha.b);

    /* ------------------------------------------------- as imagens */

    const embutir = async bytes => {
      if (!bytes) return null;
      try { return await pdf.embedPng(bytes); }
      catch (_) { try { return await pdf.embedJpg(bytes); } catch (_) { return null; } }
    };

    const logo  = await embutir(doc.logoClube);
    const selo  = await embutir(distintivo);

    const LARGURA_LOGO = 2.6 * CM;
    const faixaLogo = logo ? LARGURA_LOGO : 0;
    const faixaSelo = selo ? LARGURA_LOGO : 0;

    const miolo = util - faixaLogo - faixaSelo;
    if (miolo < 4 * CM) return;             // folha estreita demais: desiste

    /* Aqui dá para medir de verdade: a fonte está na mão. */
    const larguras = larguraDasColunas(tabela.colunas, {
      total: miolo,
      respiro: 2 * PAD_X + 2,
      medirTitulo: t => larguraReal(t, fontes.negrito, T_TITULO),
      medirValor:  t => larguraReal(t, fontes.normal,  T_VALOR)
    });

    /* ------------------------------------------------ alturas das linhas */

    const linhasDe = (texto, fonte, tamanho, largura) =>
      quebrar(texto, fonte, tamanho, Math.max(largura - 2 * PAD_X, 10))
        .map(l => l.palavras.join(' '));

    const linhasNome = tabela.nome
      ? linhasDe(tabela.nome, fontes.negrito, T_NOME, miolo) : [];

    const linhasTitulo = tabela.colunas.map((c, k) =>
      linhasDe(c.rotulo, fontes.negrito, T_TITULO, larguras[k]));
    const linhasValor = tabela.colunas.map((c, k) =>
      linhasDe(c.valor, fontes.normal, T_VALOR, larguras[k]));

    const alturaDe = (linhas, tamanho) =>
      linhas * (tamanho + 3) + 2 * PAD_Y;

    const hNome   = linhasNome.length ? alturaDe(linhasNome.length, T_NOME) : 0;
    const hTitulo = alturaDe(Math.max(1, ...linhasTitulo.map(l => l.length)), T_TITULO);
    const hValor  = alturaDe(Math.max(1, ...linhasValor.map(l => l.length)), T_VALOR);

    const alturaTotal = hNome + (tabela.colunas.length ? hTitulo + hValor : 0);
    if (!alturaTotal) return;

    garantir(alturaTotal + 10);

    /* ------------------------------------------------------- desenho */

    const topo = y;
    const x0 = M.esquerda;

    /* Texto centralizado numa caixa, linha a linha. */
    const texto = (linhas, { x, largura, topoCaixa, altura, fonte, tamanho, cor }) => {
      const alturaTexto = linhas.length * (tamanho + 3);
      let yl = topoCaixa - (altura - alturaTexto) / 2 - tamanho;

      for (const l of linhas) {
        const w = larguraReal(l, fonte, tamanho);
        pagina.drawText(l, {
          x: x + (largura - w) / 2, y: yl, size: tamanho, font: fonte, color: cor
        });
        yl -= tamanho + 3;
      }
    };

    /* as duas pontas: um retângulo só, do alto ao pé da tabela */
    const ponta = (x, imagem) => {
      pagina.drawRectangle({
        x, y: topo - alturaTotal, width: LARGURA_LOGO, height: alturaTotal,
        color: COR_ESCURO, borderColor: COR_LINHA, borderWidth: 1
      });

      const caixaL = LARGURA_LOGO - 2 * PAD_X;
      const caixaA = alturaTotal - 2 * PAD_Y;
      const escala = Math.min(caixaL / imagem.width, caixaA / imagem.height);
      const w = imagem.width * escala, h = imagem.height * escala;

      pagina.drawImage(imagem, {
        x: x + (LARGURA_LOGO - w) / 2,
        y: topo - alturaTotal + (alturaTotal - h) / 2,
        width: w, height: h
      });
    };

    if (logo) ponta(x0, logo);
    if (selo) ponta(x0 + faixaLogo + miolo, selo);

    const xMiolo = x0 + faixaLogo;
    let yLinha = topo;

    /* linha 1: o nome, atravessando as colunas */
    if (hNome) {
      pagina.drawRectangle({
        x: xMiolo, y: yLinha - hNome, width: miolo, height: hNome,
        color: COR_ESCURO, borderColor: COR_LINHA, borderWidth: 1
      });
      texto(linhasNome, {
        x: xMiolo, largura: miolo, topoCaixa: yLinha, altura: hNome,
        fonte: fontes.negrito, tamanho: T_NOME, cor: COR_LINHA
      });
      yLinha -= hNome;
    }

    /* linhas 2 e 3: títulos e valores, coluna a coluna */
    let xc = xMiolo;

    tabela.colunas.forEach((c, k) => {
      const w = larguras[k];

      pagina.drawRectangle({
        x: xc, y: yLinha - hTitulo, width: w, height: hTitulo,
        color: COR_ESCURO, borderColor: COR_LINHA, borderWidth: 1
      });
      texto(linhasTitulo[k], {
        x: xc, largura: w, topoCaixa: yLinha, altura: hTitulo,
        fonte: fontes.negrito, tamanho: T_TITULO, cor: COR_LINHA
      });

      pagina.drawRectangle({
        x: xc, y: yLinha - hTitulo - hValor, width: w, height: hValor,
        color: COR_CLARO, borderColor: COR_LINHA, borderWidth: 1
      });
      texto(linhasValor[k], {
        x: xc, largura: w, topoCaixa: yLinha - hTitulo, altura: hValor,
        fonte: fontes.normal, tamanho: T_VALOR, cor: PRETO
      });

      xc += w;
    });

    y = topo - alturaTotal - 10;
  }

  /* ------------------------------------------------------- montagem */

  for (const [i, pag] of doc.paginas.entries()) {
    if (i === 0 || doc.quebraPorRequisito) novaPagina();

    /* O título da seção sai UMA VEZ, na folha em que o requisito começa.
       Na folha de continuação não vai título nenhum — o que está lá ainda
       é o texto deste mesmo requisito. */
    if (pag.secao) { escrever(pag.secao, { negrito: true }); y -= 4; }

    /* Página sem enunciado é continuação: a parte 2 de 3 começa direto no
       conteúdo dela, sem repetir o que já saiu na folha da parte 1. */
    if (pag.requisito) {
      escrever(pag.requisito, {
        negrito: pag.negritoTitulo !== false,
        justificado: pag.justificarTitulo === true
      });
      y -= 6;
    }

    for (const u of pag.unidades) {
      if (u.alinea) {
        escrever(u.alinea, {
          negrito: pag.negritoTitulo !== false,
          recuoCm: u.recuo ?? 0,
          justificado: u.justificar === true
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
          /* a abertura é o PRIMEIRO parágrafo do texto */
          if (p.abertura) { justificar(p.abertura); y -= 6; }
          if (u.mostrarLink)  { escrever(`Link: ${p.link || '—'}`); y -= 4; }
          if (u.mostrarDescricao && p.descricao) { justificar(p.descricao); y -= 6; }
          /* a ficha vem logo ABAIXO da descrição, como Wilson pediu */
          if (u.mostrarEspecialidade && p.especialidade) {
            await desenharEspecialidade(p.especialidade, p.distintivoBytes);
          }
          if (u.mostrarFoto && p.fotoBytes) { await desenharFoto(p.fotoBytes, p.legenda); y -= 6; }
        }
        y -= 6;
      }
    }
  }

  return await pdf.save();
}

/* ===================================================================== */
/*  3. Word                                                              */
/* ===================================================================== */

/* O pdf.js é o único jeito de transformar o timbrado em PIXELS — para o
   fundo da pré-visualização e para o Word sem modelo. O pdf-lib, que o
   relatório usa, só sabe COPIAR páginas de PDF para dentro de outro PDF.

   O endereço importa. "/+esm" é um empacotamento que o jsdelivr monta
   sozinho; com o pdf.js ele não funciona — o módulo até baixa, mas quebra
   na hora de abrir o documento. O caminho abaixo é o arquivo que o próprio
   projeto publica. A segunda linha é a mesma coisa noutro depósito, para o
   caso de um deles estar fora do ar. */
const PDFJS = [
  ['https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.min.mjs',
   'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs'],
  ['https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.min.mjs',
   'https://unpkg.com/pdfjs-dist@4.8.69/build/pdf.worker.min.mjs']
];

async function carregarPdfjs() {
  let ultimo = null;

  for (const [lib, trabalhador] of PDFJS) {
    try {
      const pdfjs = await import(lib);
      if (typeof pdfjs.getDocument !== 'function') throw new Error('módulo incompleto');

      pdfjs.GlobalWorkerOptions.workerSrc = trabalhador;
      return pdfjs;

    } catch (erro) { ultimo = erro; }
  }

  throw ultimo ?? new Error('não foi possível carregar o pdf.js');
}

/** Converte a 1ª página do timbrado em imagem, para virar fundo no Word. */
export async function timbradoComoImagem(bytes) {
  try {
    const pdfjs = await carregarPdfjs();

    const doc = await pdfjs.getDocument({ data: bytes }).promise;
    const pagina = await doc.getPage(1);
    const vista = pagina.getViewport({ scale: 2 });

    const tela = document.createElement('canvas');
    tela.width = vista.width;
    tela.height = vista.height;

    await pagina.render({ canvasContext: tela.getContext('2d'), viewport: vista }).promise;

    const blob = await new Promise(r => tela.toBlob(r, 'image/png'));
    return new Uint8Array(await blob.arrayBuffer());

  } catch (erro) {
    /* O aviso vai para o console de propósito. Quando isto falhava em
       silêncio, a folha saía branca e não havia como saber por quê. */
    console.warn('Não consegui converter o papel timbrado em imagem:', erro);
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
     quer dizer "pode quebrar no meio da palavra".

     Ele é remédio para UM caso só: a sequência sem espaço nenhum, que não
     tem onde quebrar e passaria da margem direita. Ligado no documento
     inteiro, o Word passa a cortar qualquer palavra no fim da linha —
     "clube de L / íderes", "a programa / ção cívica". Então só entra no
     parágrafo que realmente tem uma sequência comprida demais.

     45 caracteres: a palavra mais comprida do português tem 29
     ("pneumoultramicroscopicossilicovulcanoconiótico" é piada de
     dicionário, não texto de cartão). Acima disso é link colado ou
     digitação travada. */
  const COMPRIDA = 45;

  const precisaQuebrarPalavra = t =>
    String(t ?? '').split(/\s+/).some(p => p.length > COMPRIDA);

  const paragrafo = (t, opcoes = {}) => new D.Paragraph({
    children: trechos(t, opcoes),
    alignment: opcoes.centro      ? D.AlignmentType.CENTER
             : opcoes.justificado ? D.AlignmentType.JUSTIFIED
             :                      D.AlignmentType.LEFT,
    indent: opcoes.recuoCm ? { left: Math.round(opcoes.recuoCm * TWIP) } : undefined,
    spacing: { line: ENTRELINHA_15, after: opcoes.depois ?? 0 },
    wordWrap: precisaQuebrarPalavra(t)
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
      wordWrap: precisaQuebrarPalavra(par)
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
      /* sem entrelinha aqui, de propósito: com w:line fixo o Word (e o
         LibreOffice) corta a imagem na altura da linha, e a foto sai uma
         tira achatada. Parágrafo de imagem usa a altura da própria
         imagem. */
      spacing: { after: legenda ? 40 : 160 }
    })];

    if (legenda) {
      filhos.push(new D.Paragraph({
        children: [texto(legenda, { tamanho: LEGENDA })],
        alignment: D.AlignmentType.CENTER,
        spacing: { line: ENTRELINHA_15, after: 160 },
        wordWrap: precisaQuebrarPalavra(legenda)
      }));
    }
    return filhos;
  };

  /* ------------------------------------------- tabela da especialidade */

  /* No Word a tabela é tabela de verdade — o usuário pode clicar nela e
     mexer. São DUAS, uma dentro da outra:

       a de fora   três celulas numa linha só: logo, miolo, distintivo
       a de dentro o nome no alto e, embaixo, as colunas preenchidas

     Poderia ser uma tabela só, com as pontas atravessando as três linhas
     por rowSpan. Tentei: o Word e o LibreOffice desalinham a grade, e a
     linha dos títulos sai deslocada uma coluna para o lado. Tabela
     aninhada não tem esse problema — cada uma tem a grade dela. */
  const tabelaEspec = (tabela, distintivo) => {
    const colunas = tabela.colunas;
    if (!tabela.nome && !colunas.length) return [];

    const pct = n => ({ size: n, type: D.WidthType.PERCENTAGE });

    const ESCURO = HEX_ESPECIALIDADE.escuro;
    const CLARO  = HEX_ESPECIALIDADE.claro;

    const borda = { style: D.BorderStyle.SINGLE, size: 6, color: 'FFFFFF' };
    const semBorda = { style: D.BorderStyle.NONE, size: 0, color: 'FFFFFF' };

    const todasAsBordas = b => ({
      top: b, bottom: b, left: b, right: b,
      insideHorizontal: b, insideVertical: b
    });

    /* O logo do site é PNG; o distintivo vem do candidato e passa pelo
       compressor, que entrega JPEG. O docx precisa saber qual é — então
       olhamos os primeiros bytes em vez de confiar na origem. */
    const tipoImagem = bytes =>
      (bytes?.[0] === 0x89 && bytes?.[1] === 0x50) ? 'png' : 'jpg';

    const dxa = n => ({ size: Math.round(n), type: D.WidthType.DXA });

    const celula = (filhos, { largura, fundo, span = 1 }) => new D.TableCell({
      width: dxa(largura),
      columnSpan: span,
      shading: { fill: fundo },
      verticalAlign: D.VerticalAlign.CENTER,
      margins: { top: 60, bottom: 60, left: 60, right: 60 },
      children: filhos
    });

    const linhaDeTexto = (t, { tamanho, negrito, branco }) => new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      spacing: { line: 240 },
      children: [new D.TextRun({
        text: limpar(t), bold: negrito, font: FONTE,
        size: meio(tamanho), color: branco ? 'FFFFFF' : '000000'
      })]
    });

    /* ----------------------------------------------------- as larguras

       Em twips, não em porcentagem. Porcentagem dentro de tabela aninhada
       o Word trata como sugestão: na primeira tentativa o logo comeu
       metade da folha e a ficha ficou espremida, quebrando "Instituição"
       em cinco linhas. Com a grade em twips e layout fixo, cada coluna
       sai do tamanho pedido.

       A conta parte da nossa largura útil (16 cm). Como a tabela também
       pede 100% da linha, um modelo timbrado com margens diferentes a
       estica ou encolhe inteira, sem desmanchar as proporções. */
    const UTIL = (21 - MARGEM_CM.esquerda - MARGEM_CM.direita) * TWIP;
    const LADO = 2.6 * TWIP;

    const temLogo = !!doc.logoClube;
    const temSelo = !!distintivo;

    const larguraMiolo = UTIL - (temLogo ? LADO : 0) - (temSelo ? LADO : 0);

    /* Sem a fonte na mão, a conta é por caractere. Times New Roman 10 dá
       uns 0,19 cm por letra na média do português; o negrito 9 do título
       fica perto disso. Chutar um pouco para cima é melhor que para
       baixo: coluna folgada só deixa espaço em branco, coluna apertada
       parte palavra no meio. */
    const LETRA = 0.20 * TWIP;
    const RESPIRO = 0.45 * TWIP;          // as duas margens internas da célula

    const colunasDoMiolo = larguraDasColunas(colunas, {
      total: larguraMiolo,
      respiro: RESPIRO,
      medirTitulo: t => String(t).length * LETRA,
      medirValor:  t => String(t).length * LETRA
    });

    /* ------------------------------------------------ a tabela de dentro */

    const dentro = [];

    if (tabela.nome) {
      dentro.push(new D.TableRow({ children: [
        celula([linhaDeTexto(tabela.nome, { tamanho: 11, negrito: true, branco: true })],
               { largura: larguraMiolo, fundo: ESCURO,
                 span: Math.max(1, colunas.length) })
      ] }));
    }

    if (colunas.length) {
      dentro.push(new D.TableRow({ children: colunas.map((c, k) =>
        celula([linhaDeTexto(c.rotulo, { tamanho: 9, negrito: true, branco: true })],
               { largura: colunasDoMiolo[k], fundo: ESCURO })) }));

      dentro.push(new D.TableRow({ children: colunas.map((c, k) =>
        celula([linhaDeTexto(c.valor, { tamanho: 10, negrito: false, branco: false })],
               { largura: colunasDoMiolo[k], fundo: CLARO })) }));
    }

    const miolo = new D.Table({
      width: pct(100),
      layout: D.TableLayoutType.FIXED,
      columnWidths: (colunas.length ? colunasDoMiolo : [larguraMiolo]).map(Math.round),
      borders: todasAsBordas(borda),
      rows: dentro
    });

    /* -------------------------------------------------- a tabela de fora */

    const imagem = bytes => celula([new D.Paragraph({
      alignment: D.AlignmentType.CENTER,
      children: [new D.ImageRun({
        type: tipoImagem(bytes), data: bytes,
        transformation: { width: 56, height: 56 }
      })]
    })], { largura: LADO, fundo: ESCURO });

    const fora = new D.TableRow({ children: [
      ...(temLogo ? [imagem(doc.logoClube)] : []),
      celula([miolo], { largura: larguraMiolo, fundo: ESCURO }),
      ...(temSelo ? [imagem(distintivo)] : [])
    ] });

    return [
      new D.Table({
        width: pct(100),
        layout: D.TableLayoutType.FIXED,
        columnWidths: [
          ...(temLogo ? [LADO] : []), larguraMiolo, ...(temSelo ? [LADO] : [])
        ].map(Math.round),
        borders: todasAsBordas(semBorda),
        rows: [fora]
      }),
      /* um respiro depois da tabela: no Word duas tabelas coladas viram
         uma só, e o texto seguinte encosta na borda */
      new D.Paragraph({ children: [], spacing: { after: 160 } })
    ];
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

    /* Idem ao PDF: sem enunciado, a folha é continuação de uma parte. */
    if (pag.requisito) {
      filhos.push(...paragrafosDeLinhas(pag.requisito, {
        negrito: pag.negritoTitulo !== false,
        justificado: pag.justificarTitulo === true,
        depois: 120
      }));
    }

    for (const u of pag.unidades) {
      if (u.alinea) {
        filhos.push(...paragrafosDeLinhas(u.alinea, {
          negrito: pag.negritoTitulo !== false,
          justificado: u.justificar === true,
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

        /* a abertura é o PRIMEIRO parágrafo do texto */
        if (p.abertura) filhos.push(...justificado(p.abertura));
        if (u.mostrarLink) {
          filhos.push(paragrafo(`Link: ${p.link || '—'}`, { depois: 80 }));
        }
        if (u.mostrarDescricao && p.descricao) filhos.push(...justificado(p.descricao));

        /* a ficha vem logo ABAIXO da descrição */
        if (u.mostrarEspecialidade && p.especialidade) {
          filhos.push(...tabelaEspec(p.especialidade, p.distintivoBytes));
        }

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
const TIPO_WORD =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export async function gerarRelatorio(doc, formato, timbrado, timbradoDocx) {
  await carregarFotos(doc.paginas);

  /* O logo do clube só é baixado quando alguma folha traz especialidade
     — a imensa maioria das pastas não traz nenhuma. */
  if (doc.logoClube === undefined) {
    doc.logoClube = pedeEspecialidade(doc.paginas)
      ? await logoDoClube(doc.categoria)
      : null;
  }

  if (formato !== 'word') {
    return { bytes: await montarPdf(doc, await baixar('timbrados', timbrado)),
             extensao: 'pdf', tipo: 'application/pdf' };
  }

  /* Havendo modelo em Word, o relatório é escrito DENTRO dele: a arte
     vira cabeçalho e rodapé de verdade, com as margens do próprio
     modelo. É melhor que a figura de fundo por todos os lados. */
  if (timbradoDocx) {
    try {
      const modelo = await baixar('timbrados', timbradoDocx);

      if (modelo) {
        const base = await montarWord(doc, null);   // sem a figura de fundo
        const { dentroDoModelo } = await import('./timbradoword.js');

        return { bytes: await dentroDoModelo(base, modelo),
                 extensao: 'docx', tipo: TIPO_WORD };
      }
    } catch (erro) {
      /* modelo estragado ou fora do ar: não é motivo para o candidato
         ficar sem o arquivo. Cai no fundo de sempre. */
      console.warn('Modelo timbrado em Word não pôde ser usado:', erro);
    }
  }

  return { bytes: await montarWord(doc, await baixar('timbrados', timbrado)),
           extensao: 'docx', tipo: TIPO_WORD };
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
