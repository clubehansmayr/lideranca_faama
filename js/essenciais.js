/* =====================================================================
   Informações essenciais — os sete campos e a frase que eles montam.

   Todos são FACULTATIVOS. A frase é montada só com o que foi preenchido,
   e precisa continuar correndo bem em qualquer combinação: com os sete,
   com um só, com o pastor sem o ancião, com a igreja sem o distrito.

   Mora num módulo próprio porque três telas precisam dela: a pasta (que
   mostra a frase se formando enquanto o candidato digita), o relatório
   (PDF e Word) e a pré-visualização.
   ===================================================================== */

/* A ordem aqui é a ordem das caixas na tela E a ordem dentro da frase:
   do menor para o maior, que é como se diz em português.

   Cada lugar tem duas formas. "no distrito X" abre a enumeração; "do
   distrito X" continua uma que já começou. Sem isso, um requisito em que
   só a União foi preenchida sairia "cumprido da União Norte Brasileira". */
export const CAMPOS_ESSENCIAIS = [
  { chave: 'pastor',   rotulo: 'Nome do pastor',  papel: 'pessoa' },
  { chave: 'anciao',   rotulo: 'Nome do ancião',  papel: 'pessoa' },
  { chave: 'igreja',   rotulo: 'Nome da igreja',  papel: 'lugar',
    abre: 'na igreja',   segue: 'na igreja' },
  { chave: 'cidade',   rotulo: 'Nome da cidade',  papel: 'lugar',
    abre: 'na cidade',   segue: 'da cidade' },
  { chave: 'distrito', rotulo: 'Distrito',        papel: 'lugar',
    abre: 'no distrito', segue: 'do distrito' },
  { chave: 'campo',    rotulo: 'Campo',           papel: 'lugar',
    abre: 'no Campo',    segue: 'do Campo' },
  { chave: 'uniao',    rotulo: 'União',           papel: 'lugar',
    abre: 'na União',    segue: 'da União' }
];

const LUGARES = CAMPOS_ESSENCIAIS.filter(c => c.papel === 'lugar');

/** Valor limpo de um campo, ou string vazia. */
const v = (e, chave) => String(e?.[chave] ?? '').replace(/\s+/g, ' ').trim();

/** Alguma das sete foi preenchida? */
export const temAlgumaEssencial = e =>
  CAMPOS_ESSENCIAIS.some(c => v(e, c.chave));

/**
 * A frase de abertura do requisito.
 *
 * Devolve null quando nada foi preenchido — aí o arquivo simplesmente
 * não ganha parágrafo nenhum.
 */
export function aberturaEssenciais(essenciais) {
  if (!temAlgumaEssencial(essenciais)) return null;

  const pastor = v(essenciais, 'pastor');
  const anciao = v(essenciais, 'anciao');

  /* ------------------------------------------------- quem supervisionou */
  let supervisao = '';

  if (pastor && anciao) supervisao = `sob a supervisão do Pastor ${pastor} e ancião ${anciao}`;
  else if (pastor)      supervisao = `sob a supervisão do Pastor ${pastor}`;
  else if (anciao)      supervisao = `sob a supervisão do ancião ${anciao}`;

  /* ------------------------------------------------------------- onde */
  const lugares = LUGARES
    .map(c => ({ c, valor: v(essenciais, c.chave) }))
    .filter(x => x.valor);

  /* O primeiro da fila sempre ABRE a enumeração, mesmo vindo depois da
     supervisão: "…do Pastor X, na cidade Y" soa certo, enquanto "…do
     Pastor X, da cidade Y" faria parecer que o pastor é que é de lá. */
  const onde = lugares
    .map(({ c, valor }, i) => `${i === 0 ? c.abre : c.segue} ${valor}`)
    .join(', ');

  const pedacos = [supervisao, onde].filter(Boolean);

  return `O presente requisito foi cumprido ${pedacos.join(', ')}.`;
}
