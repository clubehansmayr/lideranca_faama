/* =====================================================================
   Especialidade — a ficha e a tabela que ela vira no papel.

   Requisito de Desbravadores e de Aventureiros que, em vez de data,
   foto e link, pede uma especialidade: o texto de como foi cumprida e a
   ficha dela. No arquivo a ficha sai numa tabela logo abaixo do texto:

     ┌───────┬────────────────────────────────────────┬────────┐
     │       │        NOME DA ESPECIALIDADE           │        │
     │ logo  ├──────┬────────┬───────┬─────┬──────────┤ dis-   │
     │ do    │ Área │ Código │ Nível │ Ano │ Instituição│ tin-  │
     │ clube ├──────┼────────┼───────┼─────┼──────────┤ tivo   │
     │       │  AM  │  012   │   I   │2026 │   APL    │        │
     └───────┴────────────────────────────────────────┴────────┘

   O logo da esquerda é o do clube — Desbravadores ou Aventureiros,
   conforme a categoria do cartão. O da direita é a imagem do distintivo,
   que o candidato envia se quiser; sem ela a coluna não existe.

   Coluna sem valor também não existe: nem o título, nem o espaço. Quem
   preencheu só área e código vê uma tabela de duas colunas.

   Mora num módulo próprio porque quatro telas precisam dela: a pasta
   (onde o candidato preenche), o relatório em PDF, o em Word e a
   pré-visualização.
   ===================================================================== */

import { EMBLEMA_CATEGORIA } from './emblemas.js';

/* A ordem aqui é a ordem das caixas na tela E a ordem das colunas. */
export const CAMPOS_ESPECIALIDADE = [
  { chave: 'area',        rotulo: 'Área',                  obrigatorio: true,
    dica: 'Ex.: Atividades Missionárias' },
  { chave: 'codigo',      rotulo: 'Código',                obrigatorio: true,
    dica: 'O código da especialidade no manual.' },
  { chave: 'nivel',       rotulo: 'Nível',                 obrigatorio: false,
    dica: 'I, II, III — se a especialidade tiver.' },
  { chave: 'ano',         rotulo: 'Ano',                   obrigatorio: false,
    dica: 'Em que ano foi concluída.' },
  { chave: 'instituicao', rotulo: 'Instituição de origem', obrigatorio: false,
    dica: 'Clube, igreja ou entidade que ministrou.' }
];

/* O nome fica fora da lista acima: ele não é coluna, é a primeira linha
   da tabela, atravessando tudo. */
export const CAMPO_NOME = {
  chave: 'nome', rotulo: 'Nome da especialidade', obrigatorio: true,
  dica: 'Sai na primeira linha da tabela.'
};

/** Os cartões que trabalham com especialidade. O de Jovens não tem. */
export const CATEGORIAS_COM_ESPECIALIDADE = ['desbravadores', 'aventureiros'];

export const temEspecialidade = categoria =>
  CATEGORIAS_COM_ESPECIALIDADE.includes(categoria);

/* O logo do clube é o emblema do ministério, que já mora no emblemas.js.
   Repetir os caminhos aqui daria uma segunda lista para esquecer de
   atualizar no dia em que a arte mudar. */
export const logoDaCategoria = categoria =>
  (temEspecialidade(categoria) ? EMBLEMA_CATEGORIA[categoria] : null) ?? null;

/* As cores da tabela. Escolhidas para continuar legíveis impressas em
   preto e branco: o escuro vira cinza-chumbo, o claro vira quase branco,
   e o contraste entre os dois se mantém. */
export const CORES_ESPECIALIDADE = {
  escuro: { r: 0.12, g: 0.22, b: 0.39 },   // #1F3864
  claro:  { r: 0.87, g: 0.90, b: 0.96 },   // #DEE7F5
  linha:  { r: 1,    g: 1,    b: 1    }
};

export const HEX_ESPECIALIDADE = { escuro: '1F3864', claro: 'DEE7F5' };

/** Valor limpo de um campo, ou string vazia. */
const v = (e, chave) => String(e?.[chave] ?? '').replace(/\s+/g, ' ').trim();

export const nomeDaEspecialidade = e => v(e, 'nome');

/** As colunas que realmente vão para a tabela: as que têm valor. */
export function colunasPreenchidas(especialidade) {
  return CAMPOS_ESPECIALIDADE
    .map(c => ({ ...c, valor: v(especialidade, c.chave) }))
    .filter(c => c.valor);
}

/** Alguma coisa foi preenchida? */
export const temAlgumaEspecialidade = e =>
  !!nomeDaEspecialidade(e) || colunasPreenchidas(e).length > 0;

/**
 * Está completa para marcar o requisito como concluído?
 * Nome, área e código — os três obrigatórios. Mesma conta do banco, em
 * especialidade_completa().
 */
export const especialidadeCompleta = e =>
  !!v(e, 'nome') && !!v(e, 'area') && !!v(e, 'codigo');

/**
 * O parágrafo que abre a descrição.
 *
 * Pedido do professor: além da tabela, as informações da especialidade
 * também no texto, como primeiro parágrafo. Ele não é digitado — é montado
 * a partir das caixas da ficha, como a frase das informações essenciais.
 * Por isso não dá para apagar: apagar seria esvaziar a ficha, e aí o
 * parágrafo some junto, sozinho.
 *
 * Só entra o que foi preenchido. Com três campos a frase tem três itens;
 * com os seis, seis — e continua correndo bem nas duas.
 *
 * Devolve null com a ficha em branco: aí a descrição começa no texto do
 * candidato mesmo.
 */
export function aberturaEspecialidade(especialidade) {
  const itens = [CAMPO_NOME, ...CAMPOS_ESPECIALIDADE]
    .map(c => v(especialidade, c.chave))
    .filter(Boolean)
    .map(valor => `“${valor}”`);

  if (!itens.length) return null;

  const lista = itens.length === 1
    ? itens[0]
    : `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}`;

  return `Especialidade escolhida: ${lista}.`;
}

/** O que falta, em palavras, para avisar o candidato. */
export function faltaNaEspecialidade(e) {
  const falta = [CAMPO_NOME, ...CAMPOS_ESPECIALIDADE]
    .filter(c => c.obrigatorio && !v(e, c.chave))
    .map(c => c.rotulo.toLowerCase());

  return falta;
}

/**
 * A largura de cada coluna, repartindo o espaço disponível.
 *
 * Duas medidas por coluna:
 *
 *   o IDEAL   cabe o título e o valor numa linha só
 *   o MÍNIMO  cabe a maior palavra deles sem ser cortada no meio
 *
 * Repartir em partes iguais não serve: "Ano" sobraria enquanto
 * "Instituição de origem" quebraria em três linhas. Repartir só pelo
 * ideal também não: "Código" é um título curto, e a coluna ficava tão
 * estreita que partia "AR-014" em duas linhas.
 *
 * Então todo mundo recebe o mínimo, e o que sobra é dividido em proporção
 * ao que cada uma ainda queria.
 *
 * Quem mede é quem chama, porque as duas saídas medem de jeitos
 * diferentes: o PDF tem a fonte na mão e mede letra por letra; o Word,
 * não — quem monta o arquivo não sabe como a máquina de quem abrir vai
 * desenhar o Times New Roman, e ali a conta é por caractere.
 *
 * @param {object[]} colunas
 * @param {object} o
 * @param {number} o.total    largura a repartir
 * @param {number} o.respiro  o que cada coluna gasta de margem interna
 * @param {Function} o.medirTitulo  (texto) => largura
 * @param {Function} o.medirValor   (texto) => largura
 */
export function larguraDasColunas(colunas, { total, respiro, medirTitulo, medirValor }) {
  if (!colunas.length) return [];

  const maiorPalavra = (texto, medir) =>
    Math.max(0, ...String(texto).split(/\s+/).map(medir));

  const ideais = colunas.map(c =>
    respiro + Math.max(medirTitulo(c.rotulo), medirValor(c.valor)));

  const minimos = colunas.map(c => respiro + Math.max(
    maiorPalavra(c.rotulo, medirTitulo),
    maiorPalavra(c.valor,  medirValor)));

  const somaIdeais  = ideais.reduce((s, n) => s + n, 0);
  const somaMinimos = minimos.reduce((s, n) => s + n, 0);

  /* nem o mínimo cabe: reparte proporcional e deixa quebrar */
  if (somaMinimos >= total) return minimos.map(n => total * n / somaMinimos);

  /* sobra espaço: cresce todo mundo junto, até encher a linha */
  if (somaIdeais <= total) return ideais.map(n => total * n / somaIdeais);

  const sobra = total - somaMinimos;
  const falta = ideais.map((n, k) => Math.max(0, n - minimos[k]));
  const somaFalta = falta.reduce((s, n) => s + n, 0) || 1;

  return minimos.map((n, k) => n + sobra * falta[k] / somaFalta);
}

/**
 * A tabela pronta para desenhar, do jeito que os três formatos querem.
 *
 * Devolve null quando não há nada a mostrar — aí o arquivo sai só com a
 * descrição, sem tabela nenhuma.
 */
export function tabelaEspecialidade(especialidade) {
  if (!temAlgumaEspecialidade(especialidade)) return null;

  return {
    nome: nomeDaEspecialidade(especialidade),
    colunas: colunasPreenchidas(especialidade)
  };
}
