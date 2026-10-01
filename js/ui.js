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

/* A ficha é montada inteira aqui pelo JavaScript, então o estilo dela vem
   junto. Assim ela não depende de o arquivo de CSS ter subido ou de o
   navegador ter largado a versão antiga do cache. */
function injetarEstiloPerfil() {
  if ($('#estilo-perfil')) return;

  const estilo = document.createElement('style');
  estilo.id = 'estilo-perfil';
  estilo.textContent = `
    #menu-usuario.menu-perfil {
      width: 320px;
      max-width: calc(100vw - 24px);
      padding: 0;
      overflow: hidden;
    }

    #menu-usuario .pf-topo {
      display: flex;
      align-items: center;
      gap: 14px;
      padding: 16px 16px 15px;
      background: linear-gradient(135deg, #012056, #0a3a8c);
      color: #fff;
    }

    #menu-usuario .pf-foto {
      display: block;
      position: relative;
      flex: none;
      width: 58px;
      height: 58px;
      cursor: pointer;
    }

    #menu-usuario .pf-foto-conteudo {
      position: absolute;
      inset: 0;
      display: grid;
      place-items: center;
      overflow: hidden;
      border-radius: 50%;
      border: 2px solid rgba(255,255,255,.55);
      background: rgba(255,255,255,.14);
      font-size: 1.02rem;
      font-weight: 700;
      letter-spacing: .02em;
      color: #fff;
    }

    #menu-usuario .pf-foto-conteudo img {
      width: 100%; height: 100%; object-fit: cover; display: block;
    }

    #menu-usuario .pf-camera {
      position: absolute;
      right: -3px; bottom: -3px;
      width: 23px; height: 23px;
      display: grid; place-items: center;
      border-radius: 50%;
      background: #f2b705;
      border: 2px solid #012056;
      font-size: .62rem;
      line-height: 1;
    }

    #menu-usuario .pf-foto:hover .pf-camera { filter: brightness(1.1); }
    #menu-usuario .pf-foto:focus-within .pf-foto-conteudo {
      outline: 2px solid #f2b705; outline-offset: 2px;
    }

    #menu-usuario .pf-identidade { min-width: 0; }

    #menu-usuario .pf-identidade strong {
      display: block;
      font-size: .95rem;
      font-weight: 650;
      line-height: 1.3;
      overflow-wrap: anywhere;
    }

    #menu-usuario .pf-selo {
      display: inline-block;
      margin-top: 6px;
      padding: 2px 9px;
      border-radius: 99px;
      background: rgba(255,255,255,.2);
      font-size: .69rem;
      font-weight: 600;
      letter-spacing: .04em;
      text-transform: uppercase;
    }

    #menu-usuario .pf-turma {
      display: block;
      margin-top: 6px;
      font-size: .76rem;
      opacity: .85;
    }

    #menu-usuario .pf-campos {
      display: grid;
      grid-template-columns: 1fr 1fr;
      background: var(--branco, #fff);
    }

    #menu-usuario .pf-campo {
      padding: 11px 16px;
      border-top: 1px solid var(--borda, #dce3ee);
      min-width: 0;
    }

    #menu-usuario .pf-campo.largo { grid-column: 1 / -1; }

    #menu-usuario .pf-campo .pf-rotulo {
      display: block;
      margin-bottom: 3px;
      font-size: .65rem;
      font-weight: 600;
      letter-spacing: .09em;
      text-transform: uppercase;
      color: var(--texto-suave, #5b6b85);
    }

    #menu-usuario .pf-campo .pf-valor {
      display: block;
      font-size: .85rem;
      line-height: 1.35;
      color: var(--texto, #16233a);
      overflow-wrap: anywhere;
      font-variant-numeric: tabular-nums;
    }

    #menu-usuario .pf-acoes {
      padding: 6px;
      border-top: 1px solid var(--borda, #dce3ee);
    }
  `;
  document.head.appendChild(estilo);
}

/**
 * O menu do círculo é a própria ficha da pessoa: não há tela separada de
 * perfil. A foto é clicável e abre o seletor de arquivo.
 */
function montarMenuUsuario(perfil, urlFoto) {
  injetarEstiloPerfil();

  const menu = document.createElement('div');
  menu.className = 'menu-flutuante menu-perfil';
  menu.id = 'menu-usuario';

  /* O e-mail ocupa a linha inteira porque é sempre o mais longo; os
     outros três cabem dois por linha. Campo vazio não entra. */
  const campos = [
    { rotulo: 'E-mail',     valor: perfil.email,                      largo: true },
    { rotulo: 'Nascimento', valor: dataBR(perfil.data_nascimento) },
    { rotulo: 'RA',         valor: perfil.ra },
    { rotulo: 'CPF',        valor: formatarCPF(perfil.cpf) }
  ].filter(c => c.valor);

  menu.innerHTML = `
    <div class="pf-topo">
      <label class="pf-foto" title="Trocar a foto de perfil">
        <span class="pf-foto-conteudo" id="perfil-foto-conteudo">
          ${urlFoto ? `<img src="${esc(urlFoto)}" alt="">` : esc(iniciais(perfil.nome))}
        </span>
        <span class="pf-camera" aria-hidden="true">📷</span>
        <input type="file" accept="image/jpeg,image/png" hidden id="arquivo-avatar">
      </label>

      <div class="pf-identidade">
        <strong>${esc(perfil.nome)}</strong>
        <span class="pf-selo">${esc(ROTULO_TIPO[perfil.tipo] ?? perfil.tipo)}</span>
        ${perfil.turma ? `<span class="pf-turma">${esc(perfil.turma.nome)}</span>` : ''}
      </div>
    </div>

    <div class="pf-campos">
      ${campos.map(c => `
        <div class="pf-campo ${c.largo ? 'largo' : ''}">
          <span class="pf-rotulo">${esc(c.rotulo)}</span>
          <span class="pf-valor">${esc(c.valor)}</span>
        </div>`).join('')}
    </div>

    <div class="pf-acoes">
      ${perfil.tipo === 'administrador'
        ? '<button class="menu-item" data-vai="admin.html">⚙️ Ver painel do Administrador</button>'
        : ''}
      <button class="menu-item perigo" id="btn-sair">↪ Sair</button>
    </div>
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
