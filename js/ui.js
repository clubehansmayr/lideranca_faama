/* =====================================================================
   Peças de interface usadas por todas as telas internas:
   barra superior, menu do usuário, notificações, toast e instalação do app.
   ===================================================================== */

import { sb, sair } from './cliente.js';
import { comprimirAvatar, previa, ErroImagem } from './imagem.js';

export const $  = (s, raiz = document) => raiz.querySelector(s);
export const $$ = (s, raiz = document) => [...raiz.querySelectorAll(s)];

/* Escapa texto antes de jogar no HTML. Nomes e descrições vêm de usuários:
   sem isso, alguém poderia injetar script no nome e atingir o revisor. */
export function esc(v) {
  return String(v ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ------------------------------------------------------------------ toast */

let toastAtual;

export function toast(texto, tipo = '') {
  clearTimeout(toastAtual);
  let el = $('#toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.className = `toast ${tipo}`;
  el.textContent = texto;
  requestAnimationFrame(() => el.classList.add('visivel'));
  toastAtual = setTimeout(() => el.classList.remove('visivel'), 3800);
}

/* ----------------------------------------------------------------- datas */

export function dataBR(iso) {
  if (!iso) return '';
  const [a, m, d] = String(iso).slice(0, 10).split('-');
  return `${d}/${m}/${a}`;
}

export function quandoFoi(iso) {
  const seg = (Date.now() - new Date(iso)) / 1000;
  if (seg < 60)     return 'agora há pouco';
  if (seg < 3600)   return `há ${Math.floor(seg / 60)} min`;
  if (seg < 86400)  return `há ${Math.floor(seg / 3600)} h`;
  if (seg < 172800) return 'ontem';
  return dataBR(iso);
}

/* ---------------------------------------------------------------- avatar */

const cacheAvatar = new Map();

export async function urlAvatar(perfil) {
  if (!perfil?.foto_url) return null;
  if (cacheAvatar.has(perfil.id)) return cacheAvatar.get(perfil.id);

  const { data } = await sb.storage
    .from('fotos-perfil')
    .createSignedUrl(perfil.foto_url, 3600);

  const url = data?.signedUrl ?? null;
  cacheAvatar.set(perfil.id, url);
  return url;
}

function iniciais(nome) {
  const p = String(nome || '?').trim().split(/\s+/);
  return ((p[0]?.[0] || '') + (p.length > 1 ? p[p.length - 1][0] : '')).toUpperCase();
}

/* ---------------------------------------------------- instalação do app */

let promptInstalacao = null;

addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  promptInstalacao = e;
  const botao = $('#btn-instalar');
  if (botao) botao.hidden = false;
});

/* ----------------------------------------------------------- barra superior */

export async function montarBarra(perfil) {
  const barra = document.createElement('header');
  barra.className = 'barra';
  barra.innerHTML = `
    <a class="barra-marca" href="inicio.html" style="color:inherit;text-decoration:none">
      <img src="assets/logo.png" alt="">
      <span>App de Liderança</span>
    </a>

    <button class="icone-barra" id="btn-instalar" hidden
            title="Instalar no celular" aria-label="Instalar no celular">⬇</button>

    <button class="icone-barra" id="btn-notif" aria-label="Notificações">
      🔔<span class="selo" id="selo-notif" hidden></span>
    </button>

    <button class="avatar avatar-letra" id="btn-usuario" aria-label="Sua conta"
            style="border:2px solid rgba(255,255,255,.55)">${esc(iniciais(perfil.nome))}</button>
  `;
  document.body.prepend(barra);

  /* foto no lugar das iniciais, se houver */
  const url = await urlAvatar(perfil);
  if (url) {
    const img = document.createElement('img');
    img.className = 'avatar';
    img.id = 'btn-usuario';
    img.src = url;
    img.alt = 'Sua conta';
    $('#btn-usuario').replaceWith(img);
  }

  montarMenuUsuario(perfil, url);
  montarPainelNotificacoes();

  $('#btn-instalar')?.addEventListener('click', async () => {
    if (!promptInstalacao) return;
    promptInstalacao.prompt();
    await promptInstalacao.userChoice;
    promptInstalacao = null;
    $('#btn-instalar').hidden = true;
  });
}

/* ------------------------------------------------------- menu do usuário */

const ROTULO_TIPO = {
  administrador: 'Administrador',
  revisor:       'Revisor',
  candidato:     'Candidato'
};

function formatarCPF(cpf) {
  const d = String(cpf ?? '').replace(/\D/g, '');
  return d.length === 11
    ? d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
    : null;
}

/**
 * O menu do círculo é a própria ficha da pessoa: não há tela separada de
 * perfil. A foto é clicável e abre o seletor de arquivo.
 */
function montarMenuUsuario(perfil, urlFoto) {
  const menu = document.createElement('div');
  menu.className = 'menu-flutuante menu-perfil';
  menu.id = 'menu-usuario';

  /* Só entra o que existe — ninguém quer ver "CPF: —". */
  const dados = [
    ['E-mail',     perfil.email],
    ['Nascimento', dataBR(perfil.data_nascimento)],
    ['RA',         perfil.ra],
    ['CPF',        formatarCPF(perfil.cpf)]
  ].filter(([, valor]) => valor);

  menu.innerHTML = `
    <div class="perfil-cartao">
      <label class="perfil-foto" title="Trocar a foto de perfil">
        <span class="conteudo" id="perfil-foto-conteudo">
          ${urlFoto
            ? `<img src="${esc(urlFoto)}" alt="">`
            : esc(iniciais(perfil.nome))}
        </span>
        <span class="camera" aria-hidden="true">📷</span>
        <input type="file" accept="image/jpeg,image/png" hidden id="arquivo-avatar">
      </label>

      <div class="perfil-identidade">
        <strong>${esc(perfil.nome)}</strong>
        <small>${esc(ROTULO_TIPO[perfil.tipo] ?? perfil.tipo)}${
          perfil.turma ? ' · ' + esc(perfil.turma.nome) : ''}</small>
      </div>
    </div>

    <dl class="perfil-dados">
      ${dados.map(([rotulo, valor]) => `
        <div>
          <dt>${esc(rotulo)}</dt>
          <dd>${esc(valor)}</dd>
        </div>`).join('')}
    </dl>

    ${perfil.tipo === 'administrador'
      ? '<button class="menu-item" data-vai="admin.html">⚙️ Ver painel do Administrador</button>'
      : ''}
    <button class="menu-item perigo" id="btn-sair">↪ Sair</button>
  `;
  document.body.appendChild(menu);

  $('#btn-usuario').addEventListener('click', e => {
    e.stopPropagation();
    $('#painel-notif')?.classList.remove('aberto');
    menu.classList.toggle('aberto');
  });

  /* O menu fecha ao clicar fora; escolher foto é "dentro". */
  menu.addEventListener('click', e => {
    const item = e.target.closest('[data-vai]');
    if (item) { location.href = item.dataset.vai; return; }
    e.stopPropagation();
  });

  $('#arquivo-avatar').addEventListener('change', e => {
    const arquivo = e.target.files?.[0];
    e.target.value = '';              // deixa escolher a mesma foto de novo
    if (arquivo) trocarFoto(arquivo, perfil);
  });

  $('#btn-sair').addEventListener('click', sair);
}

/** Mostra a foto nova no círculo da barra e na ficha, sem recarregar. */
function pintarAvatar(url) {
  const naFicha = $('#perfil-foto-conteudo');
  if (naFicha) naFicha.innerHTML = `<img src="${esc(url)}" alt="">`;

  const naBarra = $('#btn-usuario');
  if (!naBarra) return;

  if (naBarra.tagName === 'IMG') { naBarra.src = url; return; }

  const img = document.createElement('img');
  img.className = 'avatar';
  img.id = 'btn-usuario';
  img.src = url;
  img.alt = 'Sua conta';

  naBarra.replaceWith(img);

  img.addEventListener('click', e => {
    e.stopPropagation();
    $('#painel-notif')?.classList.remove('aberto');
    $('#menu-usuario')?.classList.toggle('aberto');
  });
}

async function trocarFoto(arquivo, perfil) {
  const ficha = $('#perfil-foto-conteudo');
  const antes = ficha?.innerHTML;
  if (ficha) ficha.innerHTML = '<span class="girando"></span>';

  try {
    const { blob } = await comprimirAvatar(arquivo);
    const caminho = `${perfil.id}/perfil.jpg`;

    const { error: erroUp } = await sb.storage.from('fotos-perfil')
      .upload(caminho, blob, { upsert: true, contentType: 'image/jpeg' });
    if (erroUp) throw erroUp;

    const { error } = await sb.from('perfis')
      .update({ foto_url: caminho }).eq('id', perfil.id);
    if (error) throw error;

    perfil.foto_url = caminho;
    cacheAvatar.delete(perfil.id);

    pintarAvatar(await previa(blob));
    toast('Foto de perfil atualizada.', 'ok');

  } catch (erro) {
    if (ficha) ficha.innerHTML = antes;
    toast(erro instanceof ErroImagem
      ? erro.message
      : 'Não consegui trocar a foto. Tente de novo.', 'erro');
  }
}

/* --------------------------------------------------------- notificações */

async function montarPainelNotificacoes() {
  const painel = document.createElement('div');
  painel.className = 'menu-flutuante';
  painel.id = 'painel-notif';
  painel.style.minWidth = '310px';
  painel.innerHTML = `
    <div class="cabeca" style="display:flex;align-items:center;gap:10px">
      <strong style="margin-right:auto">Notificações</strong>
    </div>

    <div class="barra-notif" id="barra-notif" hidden>
      <label class="checkbox">
        <input type="checkbox" id="marcar-todas-notif">
        Selecionar todas
      </label>
      <button class="acao" id="acao-lida" disabled>Marcar como lida</button>
      <button class="acao perigo" id="acao-apagar" disabled>Apagar</button>
    </div>

    <div class="lista-notificacoes" id="lista-notif">
      <div class="vazio">Carregando…</div>
    </div>
  `;
  document.body.appendChild(painel);

  /* clicar dentro do painel não deve fechá-lo */
  painel.addEventListener('click', e => e.stopPropagation());

  $('#btn-notif').addEventListener('click', e => {
    e.stopPropagation();
    $('#menu-usuario')?.classList.remove('aberto');
    painel.classList.toggle('aberto');
    if (painel.classList.contains('aberto')) carregarNotificacoes();
  });

  $('#marcar-todas-notif').addEventListener('change', e => {
    $$('.marca-notif').forEach(c => { c.checked = e.target.checked; });
    atualizarAcoesNotif();
  });

  $('#acao-lida').addEventListener('click', async () => {
    const ids = selecionadasNotif();
    if (!ids.length) return;
    await sb.from('notificacoes').update({ lida: true }).in('id', ids);
    await carregarNotificacoes();
    atualizarSelo();
  });

  $('#acao-apagar').addEventListener('click', async () => {
    const ids = selecionadasNotif();
    if (!ids.length) return;
    await sb.from('notificacoes').delete().in('id', ids);
    await carregarNotificacoes();
    atualizarSelo();
  });

  atualizarSelo();
  setInterval(atualizarSelo, 60000);
}

const selecionadasNotif = () => $$('.marca-notif:checked').map(c => c.dataset.id);

function atualizarAcoesNotif() {
  const n = selecionadasNotif().length;
  $('#acao-lida').disabled = !n;
  $('#acao-apagar').disabled = !n;
  $('#acao-lida').textContent   = n ? `Marcar ${n} como lida` : 'Marcar como lida';
  $('#acao-apagar').textContent = n ? `Apagar ${n}` : 'Apagar';

  const total = $$('.marca-notif').length;
  const todas = $('#marcar-todas-notif');
  if (todas) {
    todas.checked = total > 0 && n === total;
    todas.indeterminate = n > 0 && n < total;
  }
}

async function atualizarSelo() {
  const { count } = await sb
    .from('notificacoes')
    .select('id', { count: 'exact', head: true })
    .eq('lida', false);

  const selo = $('#selo-notif');
  if (!selo) return;
  selo.textContent = count > 99 ? '99+' : String(count ?? 0);
  selo.hidden = !count;
}

async function carregarNotificacoes() {
  const lista = $('#lista-notif');

  const { data, error } = await sb
    .from('notificacoes')
    .select('*')
    .order('criado_em', { ascending: false })
    .limit(50);

  if (error) {
    lista.innerHTML = '<div class="vazio">Não foi possível carregar.</div>';
    $('#barra-notif').hidden = true;
    return;
  }

  if (!data?.length) {
    lista.innerHTML = '<div class="vazio"><span class="simbolo">🔕</span>Nenhuma notificação por aqui.</div>';
    $('#barra-notif').hidden = true;
    return;
  }

  $('#barra-notif').hidden = false;

  lista.innerHTML = data.map(n => `
    <div class="notificacao ${n.lida ? '' : 'nao-lida'}">
      <input type="checkbox" class="marca-notif" data-id="${n.id}"
             aria-label="Selecionar notificação">
      <div class="texto" data-id="${n.id}" ${n.link ? `data-link="${esc(n.link)}"` : ''}>
        <strong>${esc(n.titulo)}</strong>
        <span>${esc(n.mensagem || '')}</span>
        <time>${quandoFoi(n.criado_em)}</time>
      </div>
    </div>
  `).join('');

  $$('.marca-notif', lista).forEach(c =>
    c.addEventListener('change', atualizarAcoesNotif));

  $$('.texto', lista).forEach(el => {
    el.addEventListener('click', async () => {
      await sb.from('notificacoes').update({ lida: true }).eq('id', el.dataset.id);
      atualizarSelo();
      if (el.dataset.link) location.href = el.dataset.link;
      else el.closest('.notificacao').classList.remove('nao-lida');
    });
  });

  atualizarAcoesNotif();
}

/* fecha os menus ao clicar fora */
document.addEventListener('click', () => {
  $('#menu-usuario')?.classList.remove('aberto');
  $('#painel-notif')?.classList.remove('aberto');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    $('#menu-usuario')?.classList.remove('aberto');
    $('#painel-notif')?.classList.remove('aberto');
  }
});
