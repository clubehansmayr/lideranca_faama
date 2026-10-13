/* =====================================================================
   Papel timbrado de verdade no Word.

   O PDF de fundo serve ao relatório em PDF. Para o Word havia um
   arremedo: a primeira página do PDF virava uma imagem gigante colada
   atrás do texto. Funciona, mas é uma figura — some ao editar, pesa o
   arquivo e não é cabeçalho coisa nenhuma.

   Aqui a conta é outra. O administrador envia um .docx que já tem a arte
   montada como cabeçalho e rodapé, com as margens certas. O relatório é
   escrito DENTRO desse arquivo: trocamos só o miolo e deixamos o resto
   como está — cabeçalho, rodapé, margens, tamanho da folha, estilos.

   Em termos de .docx (que por dentro é um zip de XML):

     do modelo  vem tudo, menos os parágrafos do corpo
     do nosso   vêm os parágrafos, mais as fotos que eles citam

   A parte chata é a das fotos: cada uma é um arquivo dentro do zip,
   apontado por um "rId" numa lista de relações. Os rId do nosso arquivo
   podem colidir com os do modelo, então são renumerados.
   ===================================================================== */

const FFLATE = 'https://cdn.jsdelivr.net/npm/fflate@0.8.2/+esm';

const DOC   = 'word/document.xml';
const RELS  = 'word/_rels/document.xml.rels';
const TIPOS = '[Content_Types].xml';

const TIPO_IMAGEM =
  'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image';

/** Pega o que está entre <w:body> e o último <w:sectPr (ou o fim). */
function miolo(xml) {
  const abre = xml.indexOf('<w:body>');
  if (abre < 0) throw new Error('O arquivo não tem corpo de documento.');

  const inicio = abre + '<w:body>'.length;
  const corte = xml.lastIndexOf('<w:sectPr');

  return xml.slice(inicio, corte > inicio ? corte : xml.indexOf('</w:body>'));
}

/** Troca o miolo do modelo pelo nosso, preservando o sectPr dele. */
function trocarMiolo(xmlModelo, novoMiolo) {
  const abre = xmlModelo.indexOf('<w:body>');
  if (abre < 0) throw new Error('O modelo não tem corpo de documento.');

  const inicio = abre + '<w:body>'.length;
  const corte = xmlModelo.lastIndexOf('<w:sectPr');
  const fim = corte > inicio ? corte : xmlModelo.indexOf('</w:body>');

  return xmlModelo.slice(0, inicio) + novoMiolo + xmlModelo.slice(fim);
}

/** Lista as relações de imagem de um document.xml.rels. */
function imagensDe(relsXml) {
  const achados = [];
  const re = /<Relationship\b[^>]*>/g;
  let m;

  while ((m = re.exec(relsXml))) {
    const tag = m[0];
    if (!tag.includes(TIPO_IMAGEM)) continue;

    const id = /Id="([^"]+)"/.exec(tag)?.[1];
    const alvo = /Target="([^"]+)"/.exec(tag)?.[1];
    if (id && alvo) achados.push({ id, alvo });
  }
  return achados;
}

/** Garante que o tipo de um arquivo de imagem está declarado. */
function garantirTipo(tiposXml, extensao) {
  if (new RegExp(`Extension="${extensao}"`, 'i').test(tiposXml)) return tiposXml;

  const tipo = extensao === 'png' ? 'image/png'
             : extensao === 'gif' ? 'image/gif'
             : extensao === 'bmp' ? 'image/bmp'
             : 'image/jpeg';

  return tiposXml.replace(/(<Types[^>]*>)/,
    `$1<Default Extension="${extensao}" ContentType="${tipo}"/>`);
}

/* ===================================================================== */

/**
 * Escreve o nosso relatório dentro do modelo timbrado.
 *
 * @param {Uint8Array} nossoBytes   o .docx que o docx.js acabou de montar
 * @param {Uint8Array} modeloBytes  o .docx enviado pelo administrador
 * @returns {Promise<Uint8Array>}   o .docx final
 */
export async function dentroDoModelo(nossoBytes, modeloBytes) {
  const { unzipSync, zipSync, strToU8, strFromU8 } = await import(FFLATE);

  const nosso  = unzipSync(nossoBytes);
  const saida  = unzipSync(modeloBytes);

  if (!saida[DOC])  throw new Error('O modelo não parece ser um .docx válido.');
  if (!nosso[DOC])  throw new Error('Falha ao montar o relatório.');

  let corpo = miolo(strFromU8(nosso[DOC]));

  /* ---------------------------------------------------- as fotos */

  const nossasRels = nosso[RELS] ? strFromU8(nosso[RELS]) : '';
  const imagens = imagensDe(nossasRels);

  if (imagens.length) {
    let relsModelo = strFromU8(saida[RELS] ?? '<Relationships></Relationships>');
    let tipos = strFromU8(saida[TIPOS] ?? '');

    const novas = [];

    imagens.forEach((img, i) => {
      const origem = `word/${img.alvo.replace(/^\/+/, '')}`;
      const dados = nosso[origem];
      if (!dados) return;

      const extensao = (origem.split('.').pop() || 'png').toLowerCase();

      /* nome próprio: o modelo tem as imagens dele, e dois arquivos não
         podem ocupar o mesmo lugar dentro do zip */
      const destino = `word/media/relatorio${i + 1}.${extensao}`;
      const novoId = `rIdRelatorio${i + 1}`;

      saida[destino] = dados;
      novas.push(`<Relationship Id="${novoId}" Type="${TIPO_IMAGEM}" `
               + `Target="media/relatorio${i + 1}.${extensao}"/>`);

      /* o corpo aponta para o rId antigo; passa a apontar para o novo */
      corpo = corpo.split(`r:embed="${img.id}"`).join(`r:embed="${novoId}"`);
      corpo = corpo.split(`r:link="${img.id}"`).join(`r:link="${novoId}"`);

      tipos = garantirTipo(tipos, extensao);
    });

    if (novas.length) {
      relsModelo = relsModelo.replace('</Relationships>',
        novas.join('') + '</Relationships>');
      saida[RELS] = strToU8(relsModelo);
      saida[TIPOS] = strToU8(tipos);
    }
  }

  /* --------------------------------------------- o miolo no lugar */

  saida[DOC] = strToU8(trocarMiolo(strFromU8(saida[DOC]), corpo));

  return zipSync(saida, { level: 6 });
}
