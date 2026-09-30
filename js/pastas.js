/* =====================================================================
   Gerenciador de Pastas — administrador e revisor.

   O RLS já faz o recorte sozinho: o administrador enxerga todas as
   pastas, o revisor só as dos candidatos atribuídos a ele. Esta tela não
   precisa filtrar nada por perfil — se o banco devolveu, é porque pode ver.
   ===================================================================== */

import { sb, exigirSessao, traduzErro } from './cliente.js';
import { montarBarra, esc, dataBR, $, $$ } from './ui.js';

const estado = {
  eu: null, vista: 'avaliar',
  pastas: [], candidatos: [], contagens: new Map(),
  tentativas: []
};

/* ------------------------------------------------------------ utilidades */

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

function vazio(simbolo, texto) {
  return `<div class="vazio" style="background:var(--branco);border:1px solid var(--borda);
                                    border-radius:var(--raio)">
    <span class="simbolo">${simbolo}</span>${texto}</div>`;
}

/* =============================================================== CARGA */

async function carregar() {
  const [pa, ca, re, te] = await Promise.all([
    sb.from('pastas')
      .select(`*,
               formulario:formularios(nome, categoria),
               candidato:perfis!pastas_candidato_id_fkey(id, nome, turma:turmas(nome))`)
      .order('criado_em', { ascending: false }),

    sb.from('perfis')
      .select('*, turma:turmas(nome)')
      .eq('tipo', 'candidato')
      .order('nome'),

    sb.from('respostas').select('pasta_id, status'),

    sb.from('tentativas')
      .select(`*, candidato:perfis!tentativas_candidato_id_fkey(id, nome, turma:turmas(nome))`)
      .order('enviada_em', { ascending: false })
      .limit(60)
  ]);

  if (pa.error) { $('#area').innerHTML = vazio('⚠️', esc(traduzErro(pa.error))); return; }

  estado.pastas       = pa.data ?? [];
  estado.candidatos   = ca.data ?? [];
  estado.tentativas   = te.data ?? [];

  // quantos requisitos aguardando avaliação em cada pasta
  estado.contagens = new Map();
  for (const r of re.data ?? []) {
    const c = estado.contagens.get(r.pasta_id) ??
              { concluidos: 0, aprovados: 0, total: 0 };
    c.total++;
    if (r.status === 'concluido') c.concluidos++;
    if (r.status === 'aprovado')  c.aprovados++;
    estado.contagens.set(r.pasta_id, c);
  }

  atualizarContadores();
  desenhar();
}

const paraAvaliar   = () => estado.pastas.filter(p =>
  p.status === 'ativa' && (estado.contagens.get(p.id)?.concluidos ?? 0) > 0);
const aprovadas     = () => estado.pastas.filter(p => p.status === 'aprovada');

function atualizarContadores() {
  const põe = (id, n) => { $(id).textContent = n || ''; };
  põe('#c-avaliar', paraAvaliar().length);
  põe('#c-candidatos', estado.candidatos.length);
  põe('#c-aprovados', aprovadas().length);
  põe('#c-prova', new Set(
    estado.tentativas.filter(t => t.aprovada).map(t => t.candidato_id)).size);
}

/* ============================================================= DESENHO */

function linhaPessoa(candidato) {
  return `
  <div class="pessoa-linha">
    <span class="mini-avatar">${esc(iniciais(candidato?.nome))}</span>
    <div>
      <strong>${esc(candidato?.nome ?? '—')}</strong>
      <small>${candidato?.turma ? esc(candidato.turma.nome) : 'sem turma informada'}</small>
    </div>
  </div>`;
}

function desenhar() {
  const area = $('#area');

  if (estado.vista === 'avaliar') {
    const lista = paraAvaliar();

    area.innerHTML = lista.length
      ? `<div class="grade-pastas">${lista.map(p => {
          const c = estado.contagens.get(p.id);
          return `
          <article class="cartao-pasta">
            <div class="nome-pasta">${esc(p.formulario.nome)}</div>
            ${linhaPessoa(p.candidato)}
            <div class="rodape">
              <span class="info">
                <span class="destaque">${c.concluidos}</span>
                requisito(s) aguardando você
              </span>
              <button class="botao botao-principal" data-abrir="${p.id}">Acessar pasta</button>
            </div>
          </article>`;
        }).join('')}</div>`
      : vazio('☕', 'Nada para avaliar agora.<br>Quando alguém marcar um requisito como concluído, ele aparece aqui.');
    return;
  }

  if (estado.vista === 'candidatos') {
    area.innerHTML = estado.candidatos.length
      ? `<div class="grade-pastas">${estado.candidatos.map(c => {
          const pastas = estado.pastas.filter(p => p.candidato_id === c.id);
          return `
          <article class="cartao-pasta" style="border-left-color:var(--borda)">
            ${linhaPessoa(c)}
            ${pastas.length
              ? pastas.map(p => {
                  const q = estado.contagens.get(p.id) ?? { aprovados: 0, total: 0 };
                  return `
                  <div class="rodape" style="border-top:1px solid var(--borda)">
                    <span class="info">
                      ${esc(p.formulario.nome)} · ${q.aprovados} aprovado(s)
                    </span>
                    <button class="botao botao-vazado" data-abrir="${p.id}">Abrir</button>
                  </div>`;
                }).join('')
              : '<div class="rodape"><span class="info">Sem pastas — algo saiu do lugar.</span></div>'}
          </article>`;
        }).join('')}</div>`
      : vazio('👥', estado.eu.tipo === 'revisor'
          ? 'Nenhum candidato foi atribuído a você ainda.<br>O administrador faz isso no painel dele.'
          : 'Nenhum candidato cadastrado ainda.');
    return;
  }

  if (estado.vista === 'prova') {
    area.innerHTML = telaProva();
    return;
  }

  if (estado.vista === 'aprovados') {
    const lista = aprovadas();

    area.innerHTML = lista.length
      ? `<div class="grade-pastas">${lista.map(p => `
          <article class="cartao-pasta aprovada">
            <div class="nome-pasta">${esc(p.formulario.nome)}</div>
            ${linhaPessoa(p.candidato)}
            <div class="rodape">
              <span class="info">Aprovado em ${dataBR(p.aprovada_em ?? p.criado_em)}</span>
              <button class="botao botao-vazado" data-abrir="${p.id}">Ver pasta</button>
            </div>
          </article>`).join('')}</div>`
      : vazio('🏅', 'Nenhum cartão aprovado por completo ainda.');
  }
}

/* --------------------------------------------------------- prova PDL */

const notaBR = n => Number(n).toFixed(1).replace('.', ',');

function telaProva() {
  const feitas = estado.tentativas;

  if (!feitas.length) {
    return `
      <h2 class="titulo-secao-lista">Prova PDL</h2>
      <p class="dica-campo" style="margin:-4px 0 12px">
        A prova fica sempre aberta ao lado da pasta de Jovens, e pode ser
        refeita quantas vezes o candidato precisar.
      </p>
      ${vazio('📄', 'Ninguém fez a prova ainda.')}`;
  }

  return `
    <h2 class="titulo-secao-lista">Prova PDL</h2>
    <p class="dica-campo" style="margin:-4px 0 12px">
      A prova fica sempre aberta ao lado da pasta de Jovens, e pode ser
      refeita quantas vezes o candidato precisar. A lista traz da mais
      recente para a mais antiga.
    </p>
    <div class="grade-pastas">${feitas.map(t => `
      <article class="cartao-pasta ${t.aprovada ? 'aprovada' : ''}">
        <div class="nome-pasta">
          ${t.aprovada ? 'Aprovado' : 'Ainda não alcançou'} · ${esc(notaBR(t.nota))}
        </div>
        ${linhaPessoa(t.candidato)}
        <div class="rodape">
          <span class="info">
            ${t.acertos} de ${t.total} questões · ${dataBR(t.enviada_em)}
          </span>
        </div>
      </article>`).join('')}</div>`;
}

/* ============================================================== EVENTOS */

$('#nav').addEventListener('click', e => {
  const b = e.target.closest('[data-vista]');
  if (!b) return;

  estado.vista = b.dataset.vista;
  $$('.nav-item').forEach(n => n.classList.toggle('ativo', n === b));
  desenhar();
});

$('#area').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;

  if (b.dataset.abrir)   { location.href = `pasta.html?id=${b.dataset.abrir}`; return; }
});

/* ---------------------------------------------------------------- início */

(async function iniciar() {
  const perfil = await exigirSessao();
  if (!perfil) return;

  if (!['administrador', 'revisor'].includes(perfil.tipo)) {
    document.body.innerHTML =
      '<div class="vazio" style="padding:80px 20px"><span class="simbolo">🔒</span>' +
      'Esta área é para administradores e revisores.<br>' +
      '<a href="inicio.html" class="link">Voltar ao início</a></div>';
    return;
  }

  estado.eu = perfil;
  await montarBarra(perfil);
  carregar();
})();
