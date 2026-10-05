/* =====================================================================
   Como cada requisito é marcado.

   Três estilos, escolhidos requisito a requisito no editor:

     numero   1.  no requisito   ·  a)  nas alíneas      (padrão)
     topico   •   no requisito   ·  •   nas alíneas, com recuo maior
     livre    sem marcador nenhum — a numeração é escrita à mão

   O cartão de Líder JA usa os três: tópicos em "MISSÃO", numeração
   escrita à mão nas "ÁREAS", e nada nos requisitos soltos.
   ===================================================================== */

export const BOLINHA = '•';

export const letra = n => String.fromCharCode(96 + n);

export const MARCADORES = [
  { chave: 'numero', nome: 'Numerado — 1. e a)' },
  { chave: 'topico', nome: 'Tópicos — bolinhas' },
  { chave: 'livre',  nome: 'Livre — sem numeração' }
];

/** O que aparece antes do título do requisito. */
export function prefixoRequisito(marcador, indice) {
  if (marcador === 'topico') return `${BOLINHA} `;
  if (marcador === 'livre')  return '';
  return `${indice}. `;
}

/** O que aparece antes do texto da alínea. */
export function prefixoAlinea(marcador, indice) {
  if (marcador === 'topico') return `${BOLINHA} `;
  if (marcador === 'livre')  return '';
  return `${letra(indice)}) `;
}

/** Etiqueta curta usada nos cartões da tela do candidato. */
export function selo(marcador, indice) {
  if (marcador === 'topico') return BOLINHA;
  if (marcador === 'livre')  return '';
  return letra(indice);
}

/** No estilo de tópicos a alínea fica mais recuada que o enunciado. */
export const recuoAlinea = marcador => (marcador === 'topico' ? 1 : 0);

/* ---------------------------------------------------------------- negrito

   No estilo livre quem escreve decide o que fica em negrito, marcando o
   trecho entre dois asteriscos:  **ÁREA 1** – Administração

   A marca viaja no próprio texto, então vale igual na tela, no PDF e no
   Word, sem precisar de campo novo no banco.
   -------------------------------------------------------------------- */

/** Quebra o texto em pedaços, dizendo quais saem em negrito. */
export function segmentar(texto, negritoBase = false) {
  return String(texto ?? '')
    .split('**')
    .map((pedaco, i) => ({ texto: pedaco, negrito: i % 2 === 1 ? true : negritoBase }))
    .filter(p => p.texto !== '');
}

/** Para a tela: escapa primeiro, depois troca as marcas por <strong>. */
export function comNegrito(texto, esc) {
  return segmentar(texto)
    .map(p => p.negrito ? `<strong>${esc(p.texto)}</strong>` : esc(p.texto))
    .join('');
}

/** No estilo livre nada é negrito por conta própria. */
export const negritoDeTitulo = marcador => marcador !== 'livre';
