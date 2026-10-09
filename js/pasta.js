/* =====================================================================
   Pasta — a mesma tela serve aos dois papéis:

   CANDIDATO (dono da pasta): preenche data, descrição e foto de cada
     parte, e marca como "Concluído" quando todas estiverem completas.
     O que está aprovado fica travado (o banco também recusa).

   REVISOR / ADMINISTRADOR: não altera nada do conteúdo. Só aprova,
     devolve para pendente e escreve a correção.

   A UNIDADE preenchível é: um requisito sem alíneas, ou cada alínea de
   um requisito que tenha alíneas. Um requisito com alíneas é só o
   enunciado que agrupa.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, toast, esc, dataBR, $, $$ } from './ui.js';
import { emblemaClasse } from './emblemas.js';
import { comprimir, previa, ErroImagem } from './imagem.js';
import { caixaTexto, lerTexto, ligarTextoRico } from './textorico.js';
import { prefixoRequisito, prefixoAlinea, selo, comNegrito } from './marcador.js';

const estado = {
  eu: null, pasta: null, secoes: [], respostas: new Map(),
  souDono: false, podeAvaliar: false, urlsFoto: new Map(), pendentesFoto: new Map(),
  prova: null, selecionados: new Set()
};

const ROTULO = {
  pendente: 'Pendente', concluido: 'Concluído',
  aprovado: 'Aprovado', dispensado: 'Terminado'
};

/* "Terminado" é o requisito que o candidato não precisou cumprir — há
   enunciados com 5 requisitos em que bastam 3. Ele fecha a pendência sem
   ser aprovado, e fica de fora do arquivo da pasta. */
const DISPENSADO = 'dispensado';

/** Já não está pendurado em ninguém: aprovado ou terminado. */
const RESOLVIDO = new Set(['aprovado', DISPENSADO]);

/** Travado para o candidato: não se edita mais. */
const TRAVADO = new Set(['aprovado', DISPENSADO]);

/** Chave de uma unidade: requisito sozinho ou requisito+alínea. */
const chaveUnidade = (requisitoId, alineaId) => `${requisitoId}:${alineaId ?? ''}`;

/* Cada unidade escolhe quais dos três campos pede. Uma parte só está
   completa quando o que foi pedido está preenchido — nem mais, nem menos. */
const pedeData = u => u.exigir_data !== false;
const pedeDesc = u => u.exigir_descricao !== false;
const pedeFoto = u => !!u.permitir_fotos;
const pedeLink = u => !!u.exigir_link;

/* Tem alguma coisa gravada? Basta um campo — não precisa estar completo.
   É a mesma conta que o banco faz em tem_conteudo(), e é o que decide se
   o requisito entra na pasta gerada. */
const temConteudo = resposta => (resposta?.partes ?? []).some(p =>
  p.data_cumprimento || p.descricao || p.legenda || p.link || p.foto_path);

function parteCompleta(u, p) {
  if (pedeData(u) && !p.data_cumprimento) return false;
  if (pedeDesc(u) && !(p.descricao ?? '').trim()) return false;
  if (pedeFoto(u) && !p.foto_path) return false;
  if (pedeLink(u) && !(p.link ?? '').trim()) return false;
  return true;
}

/* ------------------------------------------------------------ utilidades */

function ocupado(botao, sim, texto) {
  botao.disabled = sim;
  botao.innerHTML = sim ? '<span class="girando"></span>' : texto;
}

function abrirModal(html) {
  const caixa = $('#caixa-modal');
  caixa.className = 'modal';
  caixa.innerHTML = html;
  $('#fundo-modal').classList.add('aberto');
  caixa.querySelectorAll('[data-fechar]').forEach(b => b.addEventListener('click', fecharModal));
  return caixa;
}
function fecharModal() { $('#fundo-modal').classList.remove('aberto'); }

$('#fundo-modal').addEventListener('click', e => {
  if (e.target.id === 'fundo-modal') fecharModal();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') fecharModal(); });

/* =============================================================== CARGA */

async function carregar() {
  const id = new URLSearchParams(location.search).get('id');
  if (!id) { location.replace('inicio.html'); return; }

  const { data: pasta, error } = await sb
    .from('pastas')
    .select('*, formulario:formularios(*), candidato:perfis!pastas_candidato_id_fkey(id, nome, turma:turmas(nome))')
    .eq('id', id)
    .single();

  if (error || !pasta) {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">🔒</span>
       Pasta não encontrada ou você não tem acesso a ela.</div>`;
    return;
  }

  estado.pasta = pasta;
  estado.souDono = pasta.candidato_id === estado.eu.id;
  estado.podeAvaliar = !estado.souDono &&
    ['administrador', 'revisor'].includes(estado.eu.tipo);

  $('#emblema-pasta').src = emblemaClasse(pasta.formulario.chave);
  $('#titulo-pasta').textContent = pasta.formulario.nome;
  $('#sub-pasta').textContent = estado.souDono
    ? 'Seu cartão de liderança'
    : `${pasta.candidato.nome}${pasta.candidato.turma ? ' · ' + pasta.candidato.turma.nome : ''}`;

  if (estado.podeAvaliar) {
    $('#aviso-papel').innerHTML = `
      <div class="aviso-revisor">
        <span>👁️</span>
        <span>Você está avaliando. O conteúdo não pode ser alterado por você —
        apenas aprovar, devolver para correção ou reabrir.</span>
      </div>`;
  }

  if (pasta.status === 'solicitada') {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">⏳</span>
       Esta pasta está indisponível no momento.<br>
       Fale com o administrador.</div>`;
    return;
  }

  /* A pasta de Jovens tem a prova PDL ao lado — ela não tranca nada,
     mas quem já passou baixa o certificado aqui dentro. */
  const { data: prova } = await sb.rpc('estado_prova',
    { p_formulario: pasta.formulario_id });

  estado.prova = prova ?? null;

  await carregarConteudo();
}

async function carregarConteudo() {
  const [sec, res] = await Promise.all([
    sb.from('secoes')
      .select('*, requisitos(*, alineas(*))')
      .eq('formulario_id', estado.pasta.formulario_id)
      .eq('ativo', true).order('ordem'),

    sb.from('respostas')
      .select('*, partes(*)')
      .eq('pasta_id', estado.pasta.id)
  ]);

  if (sec.error) { toast(traduzErro(sec.error), 'erro'); return; }

  estado.secoes = (sec.data ?? []).map(s => ({
    ...s,
    requisitos: (s.requisitos ?? [])
      .filter(r => r.ativo)
      .sort((a, b) => a.ordem - b.ordem)
      .map(r => ({
        ...r,
        alineas: (r.alineas ?? []).filter(a => a.ativo).sort((a, b) => a.ordem - b.ordem)
      }))
  })).filter(s => s.requisitos.length);

  estado.respostas = new Map();
  for (const r of res.data ?? []) {
    r.partes = (r.partes ?? []).sort((a, b) => a.ordem - b.ordem);
    estado.respostas.set(chaveUnidade(r.requisito_id, r.alinea_id), r);
  }

  /* um requisito marcado como terminado sai do arquivo, então também
     sai da seleção — senão o botão prometeria o que não entrega */
  for (const chave of [...estado.selecionados]) {
    if (estado.respostas.get(chave)?.status === DISPENSADO) {
      estado.selecionados.delete(chave);
    }
  }

  await assinarFotos();
  desenhar();
  atualizarSelecao();
}

/** URLs temporárias das fotos — o bucket é privado, não dá para linkar direto. */
async function assinarFotos() {
  const caminhos = [];
  for (const r of estado.respostas.values()) {
    for (const p of r.partes) if (p.foto_path) caminhos.push(p.foto_path);
  }
  if (!caminhos.length) return;

  const { data } = await sb.storage.from('evidencias').createSignedUrls(caminhos, 3600);
  for (const item of data ?? []) {
    if (item.signedUrl) estado.urlsFoto.set(item.path, item.signedUrl);
  }
}

/* ------------------------------------------------ unidades preenchíveis */

/** Lista plana de unidades de um requisito: ele mesmo, ou suas alíneas. */
function unidadesDo(req) {
  const marcador = req.marcador ?? 'numero';

  if (!req.alineas.length) {
    return [{ ...req, requisitoId: req.id, alineaId: null,
              rotulo: null, posicao: 1, marcador }];
  }

  return req.alineas.map((a, i) => ({
    ...a, requisitoId: req.id, alineaId: a.id,
    rotulo: selo(marcador, i + 1), posicao: i + 1, marcador
  }));
}

function unidadesDaSecao(secao) {
  return secao.requisitos.flatMap(unidadesDo);
}

/* ============================================================= DESENHO */

function progressoSecao(secao) {
  const unidades = unidadesDaSecao(secao);
  const total = unidades.length;

  /* o terminado conta junto com o aprovado: ele fecha a pendência. Sem
     isso a pasta com requisitos opcionais nunca chegaria a 100%. */
  const resolvidos = unidades.filter(u =>
    RESOLVIDO.has(
      estado.respostas.get(chaveUnidade(u.requisitoId, u.alineaId))?.status)
  ).length;

  return { total, resolvidos, pct: total ? Math.round(100 * resolvidos / total) : 0 };
}

function desenhar() {
  if (!estado.secoes.length) {
    $('#conteudo-pasta').innerHTML =
      `<div class="vazio"><span class="simbolo">📄</span>
       Este formulário ainda não tem requisitos cadastrados.<br>
       O administrador precisa montá-lo no Editor de Requisitos.</div>`;
    return;
  }

  const totalGeral = estado.secoes.reduce((n, s) => n + progressoSecao(s).total, 0);
  const aprovGeral = estado.secoes.reduce((n, s) => n + progressoSecao(s).resolvidos, 0);
  const pctGeral = totalGeral ? Math.round(100 * aprovGeral / totalGeral) : 0;

  $('#conta-geral').textContent = `${aprovGeral}/${totalGeral}`;
  $('#barra-geral').style.width = `${pctGeral}%`;

  $('#conteudo-pasta').innerHTML = barraSelecao() + estado.secoes.map(s => {
    const p = progressoSecao(s);
    return `
    <section class="secao-pasta">
      <div class="secao-cabeca">
        <h2>${esc(s.titulo)}</h2>
        <div class="medidor">
          <div class="trilho"><i style="width:${p.pct}%"></i></div>
          <span>${p.resolvidos}/${p.total} · ${p.pct}%</span>
        </div>
      </div>
      ${s.requisitos.map((r, i) => blocoRequisito(r, i)).join('')}
    </section>`;
  }).join('') + rodapePasta();
}

/** Fica no alto e só aparece quando há requisito marcado. */
function barraSelecao() {
  return `
  <div class="barra-selecao" id="barra-selecao" hidden>
    <span class="conta" id="conta-selecao"></span>
    <button class="botao botao-vazado" id="limpar-selecao">Limpar seleção</button>
    <button class="botao botao-dourado" id="gerar-selecionados">
      📄 Gerar arquivos selecionados
    </button>
  </div>`;
}

function atualizarSelecao() {
  const barra = $('#barra-selecao');
  if (!barra) return;

  const n = estado.selecionados.size;
  barra.hidden = n === 0;
  $('#conta-selecao').textContent =
    `${n} requisito${n === 1 ? '' : 's'} selecionado${n === 1 ? '' : 's'}`;
}

/** Quem passou na prova pode rebaixar o certificado sempre que quiser. */
function blocoCertificado() {
  const p = estado.prova;
  if (!estado.souDono || !p?.aprovado || !p.tem_certificado) return '';

  return `
  <section class="bloco" style="text-align:center;margin-top:8px">
    <h2 style="justify-content:center">Certificado da prova PDL</h2>
    <p class="dica-campo" style="margin:-8px auto 16px;max-width:460px">
      Seu certificado de conclusão da prova. Pode ser baixado quantas vezes
      precisar — ele fica sempre aqui.
    </p>
    <button class="botao botao-dourado" id="btn-certificado-pasta"
            style="width:auto;padding:12px 26px">
      🎓 Baixar certificado
    </button>
  </section>`;
}

/** Bloco final: gerar a pasta inteira num arquivo só. */
function rodapePasta() {
  return blocoCertificado() + `
  <section class="bloco" style="text-align:center;margin-top:8px">
    <h2 style="justify-content:center">Pasta completa</h2>
    <p class="dica-campo" style="margin:-8px auto 16px;max-width:460px">
      Gera um arquivo único com os requisitos já preenchidos deste cartão,
      um por página, cada um começando com a seção e o enunciado. Os que
      estão em branco e os marcados como terminado ficam de fora. Serve
      para imprimir e entregar.
    </p>
    <button class="botao botao-dourado" id="btn-pasta-completa"
            style="width:auto;padding:12px 26px">
      📁 Gerar pasta
    </button>
  </section>`;
}

function blocoRequisito(req, indice) {
  // sem alíneas: um cartão só, o próprio requisito
  if (!req.alineas.length) {
    const marcador = req.marcador ?? 'numero';
    return cartaoUnidade(unidadesDo(req)[0],
      `${prefixoRequisito(marcador, indice + 1)}${req.titulo}`);
  }

  // com alíneas: enunciado agrupando os cartões
  const marcador = req.marcador ?? 'numero';

  return `
  <div class="req-grupo ${marcador}">
    <div class="titulo-grupo">${esc(prefixoRequisito(marcador, indice + 1))}${comNegrito(req.titulo, esc)}</div>
    <div class="corpo-grupo">
      ${unidadesDo(req).map((u, k) => cartaoUnidade(u,
        `${prefixoAlinea(marcador, k + 1)}${u.titulo}`)).join('')}
    </div>
  </div>`;
}

function cartaoUnidade(u, tituloVisivel) {
  const chave = chaveUnidade(u.requisitoId, u.alineaId);
  const resposta = estado.respostas.get(chave);
  const status = resposta?.status ?? 'pendente';
  const temCorrecao = !!resposta?.correcao;
  const partes = resposta?.partes ?? [];

  const prontas = partes.filter(p => parteCompleta(u, p)).length;
  const terminado = status === DISPENSADO;

  const classe = temCorrecao && !RESOLVIDO.has(status) ? 'corrigido' : status;

  return `
  <article class="req-cartao ${classe} marca-${u.marcador ?? 'numero'}" data-unidade="${chave}">
    <div class="req-cabeca" data-abrir>
      ${terminado ? '<span class="marca-req vazia"></span>' : `
      <label class="marca-req" title="Selecionar para gerar junto">
        <input type="checkbox" data-sel="${chave}"
               ${estado.selecionados.has(chave) ? 'checked' : ''}>
      </label>`}
      ${u.rotulo ? `<span class="marca-alinea">${u.rotulo}</span>` : ''}
      <div>
        <h3 class="titulo-unidade">${comNegrito(tituloVisivel, esc)}</h3>
        <div class="meta">
          ${terminado
            ? 'Não precisa ser cumprido'
            : (u.qtd_partes > 1
                ? `${prontas} de ${u.qtd_partes} partes preenchidas`
                : (prontas ? 'Preenchido' : 'Não preenchido'))}
          ${temCorrecao && !RESOLVIDO.has(status) ? ' · <strong>tem correção</strong>' : ''}
        </div>
      </div>
      <div class="lado">
        <span class="selo-status ${status}">${ROTULO[status]}</span>
        <span class="seta">▾</span>
      </div>
    </div>

    <div class="req-corpo">
      ${temCorrecao && !RESOLVIDO.has(status) ? `
        <div class="caixa-correcao">
          <strong>Correção do revisor</strong>
          <p>${esc(resposta.correcao)}</p>
        </div>` : ''}

      ${terminado ? `
        <div class="caixa-dispensa">
          <strong>Requisito terminado</strong>
          <p>Este requisito não precisa ser cumprido. Ele fecha a pendência
             da pasta e <strong>não sai</strong> quando a pasta é gerada em
             PDF ou Word.</p>
        </div>`
      : Array.from({ length: u.qtd_partes }, (_, i) => {
          const parte = partes[i] ?? { ordem: i + 1 };
          return blocoParte(u, parte, i, status);
        }).join('')}

      ${rodapeUnidade(u, resposta, status, prontas)}
    </div>
  </article>`;
}

function blocoParte(u, parte, i, status) {
  const travado = TRAVADO.has(status) || !estado.souDono;
  const completa = parteCompleta(u, parte);
  const urlFoto = parte.foto_path ? estado.urlsFoto.get(parte.foto_path) : null;

  // só a foto pedida, e nada mais: ela ocupa a largura inteira
  const duasColunas = pedeFoto(u) && pedeDesc(u);

  return `
  <div class="parte" data-parte="${parte.id ?? ''}" data-ordem="${i + 1}">
    ${u.qtd_partes > 1 ? `
      <div class="parte-cabeca">
        <span class="rotulo">Parte ${i + 1} de ${u.qtd_partes}</span>
        <span class="completa ${completa ? 'sim' : 'nao'}">
          ${completa ? '✓ completa' : 'incompleta'}
        </span>
      </div>` : ''}

    ${pedeData(u) ? `
      <div style="margin-bottom:12px">
        <label>Data do cumprimento</label>
        <input type="date" data-campo="data" value="${esc(parte.data_cumprimento ?? '')}"
               ${travado ? 'disabled' : ''}>
      </div>` : ''}

    ${pedeLink(u) ? `
      <div style="margin-bottom:12px">
        <label>Link</label>
        <input type="url" data-campo="link" inputmode="url"
               placeholder="https://..." value="${esc(parte.link ?? '')}"
               ${travado ? 'disabled' : ''}>
        <div class="dica-campo">Endereço do vídeo ou da página. Cole o link inteiro.</div>
      </div>` : ''}

    <div class="parte-grade ${duasColunas ? 'com-foto' : ''}">
      ${pedeDesc(u) ? `
        <div>
          <label>Descrição</label>
          ${caixaTexto({
            campo: 'descricao',
            valor: parte.descricao ?? '',
            travado,
            placeholder: 'Descreva o que foi feito…'
          })}
          <div class="dica-campo" style="margin-top:6px">
            O texto sai justificado, com recuo de 1,25 cm — cada Enter começa
            um parágrafo novo, do jeito que vai aparecer no relatório.
          </div>
          ${u.dica_cumprimento
            ? `<div class="orientacao">${esc(u.dica_cumprimento)}</div>` : ''}
        </div>` : ''}

      ${pedeFoto(u) ? `
        <div>
          <label>Foto</label>
          <div class="caixa-foto ${travado ? 'somente-leitura' : ''}" data-caixa-foto>
            ${urlFoto
              ? `<img src="${urlFoto}" alt="Evidência">
                 ${travado ? '' : '<button type="button" class="trocar-foto">Trocar</button>'}`
              : `<div class="instrucao">
                   <span class="icone">📷</span>
                   ${travado ? 'Sem foto enviada' : 'Toque para escolher<br>JPEG ou PNG'}
                 </div>`}
            ${travado ? '' :
              '<input type="file" accept="image/jpeg,image/png" hidden data-arquivo>'}
          </div>

          ${travado
            ? (parte.legenda
                ? `<div class="legenda-vista">${esc(parte.legenda)}</div>` : '')
            : `<div class="campo-legenda">
                 <label>Legenda da foto</label>
                 <input type="text" data-campo="legenda" maxlength="180"
                        placeholder="Ex.: entrega dos certificados, 12/05/2026"
                        value="${esc(parte.legenda ?? '')}">
               </div>`}

          ${u.dica_foto ? `<div class="orientacao">${esc(u.dica_foto)}</div>` : ''}
        </div>` : ''}
    </div>
  </div>`;
}

function rodapeUnidade(u, resposta, status, prontas) {
  const chave = chaveUnidade(u.requisitoId, u.alineaId);
  const completo = prontas >= u.qtd_partes;
  const terminado = status === DISPENSADO;

  const temAlgo = temConteudo(resposta);

  /* só faz sentido gerar o relatório quando há algo escrito */
  const botaoPdf = prontas > 0 && !terminado
    ? `<button class="botao botao-vazado" data-pdf="${chave}"
               title="Gerar no papel timbrado, em PDF ou Word">📄 Gerar arquivo</button>`
    : '';

  if (estado.podeAvaliar) {
    /* Só dá para marcar como terminado o que está em branco — é esse o
       sentido: o candidato não escolheu cumprir este. */
    const botaoTerminar = !temAlgo && !terminado && status !== 'aprovado'
      ? `<button class="botao botao-vazado" data-terminar="${chave}"
                 title="Fechar este requisito sem conteúdo: ele não precisa ser cumprido e fica fora do arquivo da pasta">✓ Marcar como terminado</button>`
      : '';

    return `
    <div class="req-rodape">
      <span class="estado">
        ${terminado
          ? 'Terminado — não precisa ser cumprido' +
            (resposta?.corrigido_em ? ' · ' + dataBR(resposta.corrigido_em) : '')
          : status === 'aprovado'
          ? 'Aprovado' + (resposta?.aprovado_em ? ' em ' + dataBR(resposta.aprovado_em) : '')
          : status === 'concluido' ? 'Enviado para avaliação'
          : 'O candidato ainda não enviou'}
      </span>
      ${botaoPdf}
      ${terminado
        ? `<button class="botao botao-vazado" data-destravar="${chave}">Desmarcar</button>`
        : status === 'aprovado'
        ? `<button class="botao botao-vazado" data-reabrir="${chave}">Reabrir</button>`
        : `${botaoTerminar}
           <button class="botao botao-vazado" data-corrigir="${chave}">Devolver com correção</button>
           <button class="botao botao-principal" data-aprovar="${chave}"
                   style="background:var(--verde)">Aprovar</button>`}
    </div>`;
  }

  if (terminado) {
    return `<div class="req-rodape">
      <span class="estado">✓ Terminado pelo revisor — você não precisa cumprir este requisito.</span>
    </div>`;
  }

  if (status === 'aprovado') {
    return `<div class="req-rodape">
      <span class="estado">✓ Aprovado pelo revisor — não pode mais ser alterado.</span>
      ${botaoPdf}
    </div>`;
  }

  return `
  <div class="req-rodape">
    <span class="estado" data-estado>
      ${completo ? 'Tudo preenchido' : `Faltam ${u.qtd_partes - prontas} parte(s)`}
    </span>
    ${botaoPdf}
    ${temAlgo
      ? `<button class="botao-icone perigo" data-limpar="${chave}"
                 title="Apagar tudo o que está preenchido aqui">🗑️</button>`
      : ''}
    <button class="botao botao-vazado" data-salvar="${chave}">Salvar</button>
    <button class="botao botao-dourado" data-concluir="${chave}"
            ${completo ? '' : 'disabled'}
            title="${completo ? '' : 'Preencha todas as partes primeiro'}">
      ${status === 'concluido' ? 'Reenviar para avaliação' : 'Marcar como concluído'}
    </button>
  </div>`;
}

/* ============================================================== EVENTOS */

/** Recupera a unidade a partir da chave "requisitoId:alineaId". */
function unidadePorChave(chave) {
  return estado.secoes
    .flatMap(s => s.requisitos)
    .flatMap(unidadesDo)
    .find(u => chaveUnidade(u.requisitoId, u.alineaId) === chave);
}

$('#conteudo-pasta').addEventListener('click', async e => {
  /* a caixinha fica dentro do cabeçalho que abre o cartão: o clique nela
     não pode abrir nem fechar nada */
  if (e.target.closest('.marca-req:not(.vazia)')) { e.stopPropagation(); return; }

  if (e.target.closest('#limpar-selecao')) {
    estado.selecionados.clear();
    $$('[data-sel]').forEach(c => { c.checked = false; });
    atualizarSelecao();
    return;
  }

  if (e.target.closest('#gerar-selecionados')) { gerarSelecionados(); return; }

  if (e.target.closest('#btn-certificado-pasta')) {
    return baixarCertificado(e.target.closest('button'));
  }
  if (e.target.closest('#btn-pasta-completa')) { gerarPastaCompleta(); return; }

  const cabeca = e.target.closest('[data-abrir]');
  if (cabeca) { cabeca.closest('.req-cartao').classList.toggle('aberto'); return; }

  const caixa = e.target.closest('[data-caixa-foto]');
  if (caixa && !caixa.classList.contains('somente-leitura')) {
    caixa.querySelector('[data-arquivo]')?.click();
    return;
  }

  const b = e.target.closest('button');
  if (!b) return;
  const d = b.dataset;

  if (d.limpar)    return modalLimpar(d.limpar);
  if (d.salvar)    return salvarUnidade(d.salvar, b, false);
  if (d.concluir)  return salvarUnidade(d.concluir, b, true);
  if (d.aprovar)   return avaliar(d.aprovar, 'aprovado');
  if (d.reabrir)   return avaliar(d.reabrir, 'pendente');
  if (d.corrigir)  return modalCorrecao(d.corrigir);
  if (d.terminar)  return modalTerminar(d.terminar);
  if (d.destravar) return marcarTerminado(d.destravar, false, b);
  if (d.pdf)       return gerarUmRequisito(d.pdf);
});

/* ========================================================= CERTIFICADO */

async function baixarCertificado(botao) {
  const texto = botao.innerHTML;
  ocupado(botao, true, texto);

  try {
    const { data: prova } = await sb.from('provas')
      .select('certificado_path, cert_nome_y, cert_nome_tamanho')
      .eq('id', estado.prova.prova_id).single();

    const C = await import('./certificado.js');

    const arquivo = await C.gerarCertificado({
      caminho: prova.certificado_path,
      nome: estado.eu.nome,
      y: Number(prova.cert_nome_y),
      tamanho: Number(prova.cert_nome_tamanho)
    });

    C.baixar(arquivo, C.nomeArquivo(['Certificado PDL', estado.eu.nome], 'pdf'));
    toast('Certificado gerado.', 'ok');

  } catch (erro) {
    toast(erro?.message ?? 'Não consegui gerar o certificado.', 'erro');
  } finally {
    ocupado(botao, false, texto);
  }
}

/* ========================================================== RELATÓRIOS */

/** Onde a resposta de uma unidade está guardada. */
const acharResposta = (requisitoId, alineaId) =>
  estado.respostas.get(chaveUnidade(requisitoId, alineaId));

/* O requisito marcado como terminado não foi escolhido pelo candidato:
   ele some do arquivo, em vez de sair como página em branco. */
const estaTerminada = u =>
  acharResposta(u.requisitoId, u.alineaId)?.status === DISPENSADO;

/** Tem conteúdo preenchido? (requisito em branco não entra na pasta) */
const estaPreenchida = u => temConteudo(acharResposta(u.requisitoId, u.alineaId));

/**
 * Posições das unidades de um requisito que ainda vão para o arquivo.
 * Devolve lista vazia quando o requisito inteiro ficou de fora — nesse
 * caso ele não vira página nenhuma.
 */
function posicoesQueSaem(req, aceita = () => true) {
  return unidadesDo(req)
    .map((u, k) => ({ u, k }))
    .filter(({ u }) => !estaTerminada(u) && aceita(u))
    .map(({ k }) => k);
}

/**
 * Transforma um requisito nas PÁGINAS dele — uma por unidade.
 *
 * A unidade preenchível é o requisito sozinho, ou cada alínea. Cada uma
 * começa em folha própria, levando no alto a seção e o enunciado: dois
 * requisitos nunca dividem a mesma folha. Quando o texto de um deles
 * passa da folha, a continuação sai sem cabeçalho nenhum e o resto da
 * folha fica em branco — quem cuida disso é o relatorio.js.
 *
 * @param {object} R         o módulo relatorio.js já carregado
 * @param {object} req       o requisito
 * @param {number} indice    número dele dentro da seção
 * @param {number[]} posicoes quais unidades entram
 * @param {string} secao     título da seção, repetido em cada página
 */
function paginasDoRequisito(R, req, indice, posicoes, secao) {
  const bloco = R.blocoRequisito(req, indice, acharResposta);

  return posicoes.map(k => ({
    secao,
    requisito: bloco.requisito,
    negritoTitulo: bloco.negritoTitulo,
    unidades: [bloco.unidades[k]]
  }));
}

/** Pergunta o formato e executa. */
function escolherFormato(titulo, descricao, aoEscolher) {
  abrirModal(`
    <div class="modal-topo">
      <h2>${esc(titulo)}</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;color:var(--texto-suave);line-height:1.55;margin:0 0 6px">
      ${esc(descricao)}
    </p>
    <div id="aviso-formato" class="aviso"></div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-formato="word">📝 Word</button>
      <button class="botao botao-principal" data-formato="pdf">📄 PDF</button>
    </div>`);

  $$('[data-formato]', $('#caixa-modal')).forEach(b => {
    b.addEventListener('click', async () => {
      const texto = b.innerHTML;
      $$('[data-formato]').forEach(x => { x.disabled = true; });
      ocupado(b, true, texto);

      try {
        await aoEscolher(b.dataset.formato);
        fecharModal();
        toast('Arquivo gerado.', 'ok');
      } catch (erro) {
        $$('[data-formato]').forEach(x => { x.disabled = false; });
        ocupado(b, false, texto);
        const aviso = $('#aviso-formato');
        aviso.className = 'aviso visivel erro';
        aviso.textContent = 'Não foi possível gerar. ' + (erro?.message ?? '');
      }
    });
  });
}

/* ------------------------------------------- um requisito por vez */

function gerarUmRequisito(chave) {
  const u = unidadePorChave(chave);
  if (!u) return;

  /* A regra do terminado vale nos três caminhos de geração, e não só no
     botão: numa aba aberta há tempo o botão pode ter sobrado de antes de
     o revisor marcar. */
  if (estaTerminada(u)) {
    toast('Este requisito foi marcado como terminado e não sai em arquivo.', 'erro');
    return;
  }

  const secao = estado.secoes.find(s => s.requisitos.some(r => r.id === u.requisitoId));
  const requisito = secao.requisitos.find(r => r.id === u.requisitoId);
  const indice = secao.requisitos.indexOf(requisito) + 1;

  escolherFormato(
    'Gerar relatório do requisito',
    'Sai no papel timbrado da pasta, em Times New Roman 12.',
    async formato => {
      const R = await import('./relatorio.js');

      const bloco = R.blocoRequisito(requisito, indice, acharResposta);

      // só a unidade pedida, não as irmãs
      if (u.alineaId) {
        bloco.unidades = bloco.unidades.filter((_, k) => k === u.posicao - 1);
      }

      const arquivo = await R.gerarRelatorio(
        { paginas: [{ secao: secao.titulo, ...bloco }], quebraPorRequisito: false },
        formato,
        estado.pasta.formulario.timbrado_path
      );

      R.baixarArquivo(arquivo, R.nomeArquivo([
        estado.pasta.candidato.nome,
        estado.pasta.formulario.nome,
        u.alineaId ? `${indice}-${u.posicao}` : String(indice)
      ], arquivo.extensao));
    }
  );
}

/* ------------------------------------------ os requisitos marcados */

function gerarSelecionados() {
  if (!estado.selecionados.size) return;

  escolherFormato(
    'Gerar os requisitos selecionados',
    `${estado.selecionados.size} requisito(s) marcados, um por página, no papel ` +
    'timbrado da pasta. Sai um arquivo só, com todos eles dentro.',
    async formato => {
      const R = await import('./relatorio.js');
      const paginas = [];

      for (const secao of estado.secoes) {
        secao.requisitos.forEach((req, i) => {
          /* quais posições deste requisito foram marcadas */
          const posicoes = posicoesQueSaem(req, u =>
            estado.selecionados.has(chaveUnidade(u.requisitoId, u.alineaId)));

          if (!posicoes.length) return;

          paginas.push(...paginasDoRequisito(R, req, i + 1, posicoes, secao.titulo));
        });
      }

      const arquivo = await R.gerarRelatorio(
        { paginas, quebraPorRequisito: true },
        formato,
        estado.pasta.formulario.timbrado_path
      );

      R.baixarArquivo(arquivo, R.nomeArquivo([
        estado.pasta.candidato.nome,
        estado.pasta.formulario.nome,
        'selecionados'
      ], arquivo.extensao));
    }
  );
}

/* ------------------------------------------------- a pasta inteira */

function gerarPastaCompleta() {
  /* Só o que tem conteúdo. A pasta é o que o candidato cumpriu — folha
     em branco não prova nada e só engrossa o maço na hora de imprimir. */
  const cheio = estado.secoes.some(s =>
    s.requisitos.some(r => posicoesQueSaem(r, estaPreenchida).length));

  if (!cheio) {
    toast('Nada preenchido ainda nesta pasta — não há o que gerar.', 'erro');
    return;
  }

  escolherFormato(
    'Gerar pasta completa',
    'Um requisito por página, cada um começando com a seção e o enunciado. ' +
    'Entram só os que têm alguma coisa preenchida: os em branco e os ' +
    'marcados como terminado ficam de fora. Pode demorar alguns segundos ' +
    'se houver muitas fotos.',
    async formato => {
      const R = await import('./relatorio.js');

      const paginas = [];

      for (const secao of estado.secoes) {
        secao.requisitos.forEach((req, i) => {
          const posicoes = posicoesQueSaem(req, estaPreenchida);

          /* nada preenchido neste requisito: não vira página nenhuma */
          if (!posicoes.length) return;

          paginas.push(...paginasDoRequisito(R, req, i + 1, posicoes, secao.titulo));
        });
      }

      const arquivo = await R.gerarRelatorio(
        { paginas, quebraPorRequisito: true },
        formato,
        estado.pasta.formulario.timbrado_path
      );

      R.baixarArquivo(arquivo, R.nomeArquivo([
        estado.pasta.candidato.nome,
        estado.pasta.formulario.nome,
        'pasta completa'
      ], arquivo.extensao));
    }
  );
}

$('#conteudo-pasta').addEventListener('change', e => {
  if (!e.target.matches('[data-sel]')) return;

  const chave = e.target.dataset.sel;
  e.target.checked ? estado.selecionados.add(chave) : estado.selecionados.delete(chave);
  atualizarSelecao();
});

/* foto escolhida */
$('#conteudo-pasta').addEventListener('change', async e => {
  if (!e.target.matches('[data-arquivo]')) return;

  const arquivo = e.target.files?.[0];
  if (!arquivo) return;

  const bloco = e.target.closest('.parte');
  const caixa = e.target.closest('[data-caixa-foto]');

  try {
    const { blob } = await comprimir(arquivo);
    const chave = `${bloco.closest('.req-cartao').dataset.unidade}|${bloco.dataset.ordem}`;
    estado.pendentesFoto.set(chave, blob);

    caixa.innerHTML =
      `<img src="${await previa(blob)}" alt="">` +
      '<button type="button" class="trocar-foto">Trocar</button>' +
      '<input type="file" accept="image/jpeg,image/png" hidden data-arquivo>';

    marcarSujo(bloco);
  } catch (erro) {
    toast(erro instanceof ErroImagem ? erro.message : 'Falha ao ler a imagem.', 'erro');
  }
});

$('#conteudo-pasta').addEventListener('input', e => {
  if (e.target.dataset.campo) marcarSujo(e.target.closest('.parte'));
});

function marcarSujo(bloco) {
  const estadoEl = bloco.closest('.req-corpo')?.querySelector('[data-estado]');
  if (estadoEl) estadoEl.textContent = 'Alterações não salvas';
}

/* ============================================================== SALVAR */

async function salvarUnidade(chave, botao, concluir) {
  const cartao = $(`.req-cartao[data-unidade="${chave}"]`);
  const u = unidadePorChave(chave);
  if (!u) return;

  const texto = botao.textContent.trim();
  ocupado(botao, true, texto);

  try {
    // 1. garante que a resposta existe (o gatilho cria as partes vazias)
    let resposta = estado.respostas.get(chave);

    if (!resposta) {
      const { data: criada, error } = await sb.from('respostas')
        .insert({
          pasta_id: estado.pasta.id,
          requisito_id: u.requisitoId,
          alinea_id: u.alineaId,
          status: 'pendente'
        })
        .select('id').single();

      if (error) throw error;

      // as partes nascem por gatilho DEPOIS do insert, então precisam
      // de uma segunda leitura para virem junto
      const { data, error: erroLeitura } = await sb.from('respostas')
        .select('*, partes(*)').eq('id', criada.id).single();

      if (erroLeitura) throw erroLeitura;

      data.partes = (data.partes ?? []).sort((a, b) => a.ordem - b.ordem);
      resposta = data;
      estado.respostas.set(chave, resposta);
    }

    // 2. grava cada parte
    for (const bloco of $$('.parte', cartao)) {
      const ordem = Number(bloco.dataset.ordem);
      const parte = resposta.partes.find(p => p.ordem === ordem);
      if (!parte) continue;

      const data = bloco.querySelector('[data-campo="data"]')?.value || null;
      const caixaDesc = bloco.querySelector('[data-campo="descricao"]');
      const descricao = caixaDesc ? (lerTexto(caixaDesc) || null) : null;
      const legenda = bloco.querySelector('[data-campo="legenda"]')?.value.trim() || null;
      const link = bloco.querySelector('[data-campo="link"]')?.value.trim() || null;

      const mudanca = { data_cumprimento: data, descricao, legenda, link };

      const chaveFoto = `${chave}|${ordem}`;
      const blob = estado.pendentesFoto.get(chaveFoto);

      if (blob) {
        const caminho = `${estado.pasta.id}/${resposta.id}/${parte.id}.jpg`;
        const { error: erroUp } = await sb.storage.from('evidencias')
          .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });

        if (erroUp) throw erroUp;

        mudanca.foto_path = caminho;
        mudanca.foto_bytes = blob.size;
        estado.pendentesFoto.delete(chaveFoto);
      }

      const { error } = await sb.from('partes').update(mudanca).eq('id', parte.id);
      if (error) throw error;
    }

    // 3. status
    if (concluir) {
      const { error } = await sb.from('respostas')
        .update({ status: 'concluido' }).eq('id', resposta.id);
      if (error) throw error;
      toast('Enviado para avaliação.', 'ok');
    } else {
      toast('Salvo.', 'ok');
    }

    await carregarConteudo();
    $(`.req-cartao[data-unidade="${chave}"]`)?.classList.add('aberto');

  } catch (erro) {
    ocupado(botao, false, texto);
    toast(traduzErro(erro), 'erro');
  }
}

/* ============================================================== LIXEIRO */

/**
 * Esvazia um requisito ou alínea: datas, descrições, legendas e fotos.
 * O banco recusa se já estiver aprovado, e devolve o status para pendente.
 */
function modalLimpar(chave) {
  const u = unidadePorChave(chave);
  const resposta = estado.respostas.get(chave);
  if (!u || !resposta) return;

  const nome = (u.alineaId ? prefixoAlinea(u.marcador ?? 'numero', u.posicao) : '') + u.titulo;
  const fotos = resposta.partes.filter(p => p.foto_path).length;

  abrirModal(`
    <div class="modal-topo">
      <h2>Apagar o que está preenchido</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Apagar tudo o que você escreveu e enviou em
      <strong>${esc(nome)}</strong>?
    </p>
    <div class="aviso visivel erro" style="margin-top:12px">
      Some a data, a descrição, a legenda${fotos ? ` e ${fotos} foto(s)` : ''}.
      As fotos são apagadas de vez — não dá para recuperar depois.
      O requisito volta a ficar <strong>pendente</strong>, como se nunca
      tivesse sido preenchido.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar"
              style="background:var(--vermelho)">Apagar tudo</button>
    </div>`);

  $('#confirmar').addEventListener('click', async e => {
    ocupado(e.target, true, 'Apagar tudo');

    try {
      const caminhos = resposta.partes.filter(p => p.foto_path).map(p => p.foto_path);

      /* O banco primeiro. Se a rede cair entre um passo e outro, é melhor
         sobrar arquivo órfão no depósito do que o banco apontar para foto
         que não existe mais e a tela quebrar. */
      const { error } = await sb.rpc('limpar_resposta', { p_resposta: resposta.id });
      if (error) throw error;

      if (caminhos.length) {
        await sb.storage.from('evidencias').remove(caminhos);
        for (const c of caminhos) estado.urlsFoto.delete(c);
      }

      // 3. fotos escolhidas mas ainda não salvas
      for (const k of [...estado.pendentesFoto.keys()]) {
        if (k.startsWith(`${chave}|`)) estado.pendentesFoto.delete(k);
      }

      toast('Requisito esvaziado.', 'ok');
      fecharModal();
      await carregarConteudo();
      $(`.req-cartao[data-unidade="${chave}"]`)?.classList.add('aberto');

    } catch (erro) {
      ocupado(e.target, false, 'Apagar tudo');
      toast(traduzErro(erro), 'erro');
    }
  });
}

/* ============================================================ AVALIAR */

async function avaliar(chave, novoStatus) {
  const resposta = estado.respostas.get(chave);
  if (!resposta) { toast('O candidato ainda não enviou nada aqui.', 'erro'); return; }

  const { error } = await sb.from('respostas')
    .update({ status: novoStatus }).eq('id', resposta.id);

  if (error) { toast(traduzErro(error), 'erro'); return; }

  toast(novoStatus === 'aprovado' ? 'Aprovado.' : 'Reaberto.', 'ok');
  await carregarConteudo();
  $(`.req-cartao[data-unidade="${chave}"]`)?.classList.add('aberto');
}

/* ========================================================== TERMINADO */

/**
 * Fecha um requisito que o candidato não precisava cumprir.
 *
 * Quase sempre esse requisito nunca foi tocado e por isso nem linha tem
 * na tabela de respostas — por isso vai pela função do banco, que cria a
 * linha quando falta. O banco também confere que está mesmo em branco e
 * que quem pediu é revisor ou administrador.
 */
async function marcarTerminado(chave, marcar, botao) {
  const u = unidadePorChave(chave);
  if (!u) return false;

  const texto = botao?.textContent.trim();
  if (botao) ocupado(botao, true, texto);

  const { error } = await sb.rpc('dispensar_resposta', {
    p_pasta:     estado.pasta.id,
    p_requisito: u.requisitoId,
    p_alinea:    u.alineaId,
    p_marcar:    marcar
  });

  if (error) {
    if (botao) ocupado(botao, false, texto);
    toast(traduzErro(error), 'erro');
    return false;
  }

  toast(marcar
    ? 'Marcado como terminado. Fica fora do arquivo da pasta.'
    : 'Desmarcado. O requisito volta a ficar pendente.', 'ok');

  await carregarConteudo();
  $(`.req-cartao[data-unidade="${chave}"]`)?.classList.add('aberto');
  return true;
}

function modalTerminar(chave) {
  const u = unidadePorChave(chave);
  if (!u) return;

  const nome = (u.alineaId ? prefixoAlinea(u.marcador ?? 'numero', u.posicao) : '') + u.titulo;

  abrirModal(`
    <div class="modal-topo">
      <h2>Marcar como terminado</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.9rem;line-height:1.55">
      Marcar <strong>${esc(nome)}</strong> como terminado?
    </p>
    <div class="aviso visivel info" style="margin-top:12px">
      Use quando o candidato <strong>não precisa cumprir</strong> este
      requisito — por exemplo, quando o enunciado pede 3 de 5.
      <br><br>
      O requisito deixa de ser pendência, fica travado para o candidato e
      <strong>não sai</strong> quando a pasta é gerada em PDF ou Word.
      Dá para desmarcar depois.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="confirmar-terminar">Marcar como terminado</button>
    </div>`);

  /* fecha só quando deu certo: se o banco recusar, o aviso tem de ficar
     visível em vez de sumir junto com a janela */
  $('#confirmar-terminar').addEventListener('click', async e => {
    if (await marcarTerminado(chave, true, e.target)) fecharModal();
  });
}

function modalCorrecao(chave) {
  const u = unidadePorChave(chave);
  const resposta = estado.respostas.get(chave);

  if (!resposta) { toast('O candidato ainda não enviou nada aqui.', 'erro'); return; }

  const nome = (u.alineaId ? prefixoAlinea(u.marcador ?? 'numero', u.posicao) : '') + u.titulo;

  abrirModal(`
    <div class="modal-topo">
      <h2>Devolver com correção</h2>
      <button class="fechar" data-fechar>×</button>
    </div>
    <p style="font-size:.88rem;color:var(--texto-suave);margin:0 0 14px">
      <strong>${esc(nome)}</strong>
    </p>
    <div class="campo">
      <label for="texto-correcao">O que precisa ser ajustado</label>
      <textarea id="texto-correcao" style="min-height:120px"
        placeholder="Seja específico: o candidato vai ler isto para saber o que refazer."
        >${esc(resposta.correcao ?? '')}</textarea>
    </div>
    <div class="aviso visivel info">
      Volta para <strong>pendente</strong>, e o candidato recebe aviso no
      aplicativo e por e-mail.
    </div>
    <div class="modal-acoes">
      <button class="botao botao-vazado" data-fechar>Cancelar</button>
      <button class="botao botao-principal" id="enviar-correcao">Enviar correção</button>
    </div>`);

  $('#enviar-correcao').addEventListener('click', async e => {
    const texto = $('#texto-correcao').value.trim();
    if (!texto) { toast('Escreva a correção antes de enviar.', 'erro'); return; }

    ocupado(e.target, true, 'Enviar correção');

    const { error } = await sb.from('respostas')
      .update({ status: 'pendente', correcao: texto, corrigido_em: new Date() })
      .eq('id', resposta.id);

    if (error) { ocupado(e.target, false, 'Enviar correção'); toast(traduzErro(error), 'erro'); return; }

    toast('Correção enviada ao candidato.', 'ok');
    fecharModal();
    await carregarConteudo();
  });
}

/* ---------------------------------------------------------------- início */

$('#btn-voltar').addEventListener('click', () => {
  location.href = estado.podeAvaliar ? 'pastas.html' : 'inicio.html';
});

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  estado.eu = perfil;
  await montarBarra(perfil);
  ligarTextoRico($('#conteudo-pasta'));
  carregar();
})();
