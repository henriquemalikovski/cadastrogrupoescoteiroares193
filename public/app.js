// Formulário em etapas, montado a partir de shared/schema.js.
// Sem framework: o schema descreve os campos e este arquivo os desenha, valida e envia.
import * as S from '/shared/schema.js';

const CHAVE_RASCUNHO = 'pre-cadastro-escoteiro:rascunho:v1';
const URL_VIACEP = (cep) => `https://viacep.com.br/ws/${cep}/json/`;
const URL_IBGE = (uf) => `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${uf}/municipios?orderBy=nome`;

const $ = (id) => document.getElementById(id);
const ui = {
  carregando: $('carregando'),
  avisoRascunho: $('aviso-rascunho'),
  avisoRascunhoTexto: $('aviso-rascunho-texto'),
  progresso: $('progresso'),
  listaEtapas: $('lista-etapas'),
  barra: $('barra-progresso'),
  anuncio: $('anuncio'),
  form: $('formulario'),
  etapa: $('etapa'),
  falha: $('falha-envio'),
  website: $('website'),
  voltar: $('botao-voltar'),
  avancar: $('botao-avancar'),
  resultado: $('resultado'),
  areaLimpar: $('area-limpar'),
  limpar: $('botao-limpar'),
};

const ETAPAS = S.ETAPAS;
const INDICE_REVISAO = ETAPAS.findIndex((e) => e.id === 'revisao');
const abertoEm = Date.now();

let listas = null;
let estado = null;
let indiceEtapa = 0;
let veioDaRevisao = false;
let enviando = false;
let registros = [];                         // campos desenhados na etapa atual
const tocados = new Set();                  // campos que a pessoa já preencheu e saiu
const etapasComErros = new Set();           // etapas em que "Próximo" já foi tentado
const errosExtras = new Map();              // erros que dependem de serviço externo (CEP inexistente)
const cacheCidades = new Map();

// ---------------------------------------------------------------------------
// Utilidades de DOM
// ---------------------------------------------------------------------------

function el(tag, attrs = {}, ...filhos) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const f of filhos.flat()) if (f !== null && f !== undefined && f !== false) e.append(f);
  return e;
}

function anunciar(texto) {
  ui.anuncio.textContent = '';
  setTimeout(() => { ui.anuncio.textContent = texto; }, 50);
}

const agora = () => new Date();
const contexto = (indice = null) => ({ ...S.criarContexto(estado, listas, { agora: agora() }), indice });
const etapaAtual = () => ETAPAS[indiceEtapa];

function temValor(v) {
  if (Array.isArray(v)) return v.length > 0;
  return v !== null && v !== undefined && v !== '' && v !== false;
}

async function buscarJson(url, tempoMs) {
  const controle = new AbortController();
  const timer = setTimeout(() => controle.abort(), tempoMs);
  try {
    const resposta = await fetch(url, { signal: controle.signal, referrerPolicy: 'no-referrer' });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return await resposta.json();
  } finally {
    clearTimeout(timer);
  }
}

function baixarJson(json) {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: S.nomeArquivo(json) });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ---------------------------------------------------------------------------
// Rascunho no localStorage
// ---------------------------------------------------------------------------

function lerRascunho() {
  try {
    const bruto = localStorage.getItem(CHAVE_RASCUNHO);
    if (!bruto) return null;
    const rascunho = JSON.parse(bruto);
    return S.ehObjeto(rascunho?.estado) ? rascunho : null;
  } catch {
    return null;
  }
}

let timerRascunho = null;
function salvarRascunho() {
  clearTimeout(timerRascunho);
  timerRascunho = setTimeout(() => {
    try {
      localStorage.setItem(CHAVE_RASCUNHO, JSON.stringify({ estado, etapa: indiceEtapa, salvoEm: new Date().toISOString() }));
    } catch { /* armazenamento indisponível: segue sem rascunho */ }
  }, 300);
}

function apagarRascunho() {
  clearTimeout(timerRascunho);
  try { localStorage.removeItem(CHAVE_RASCUNHO); } catch { /* nada a fazer */ }
}

// Junta o rascunho salvo com o estado inicial (cobre campos novos no schema).
function mesclar(base, salvo) {
  if (!S.ehObjeto(base) || !S.ehObjeto(salvo)) return salvo === undefined ? base : salvo;
  const r = { ...base };
  for (const [k, v] of Object.entries(salvo)) r[k] = S.ehObjeto(base[k]) ? mesclar(base[k], v) : v;
  return r;
}

function restaurar(rascunho) {
  const inicial = S.estadoInicial();
  const salvo = rascunho.estado;
  const novo = mesclar(inicial, salvo);
  novo.responsaveis = (Array.isArray(salvo.responsaveis) ? salvo.responsaveis : [])
    .filter(S.ehObjeto).slice(0, S.MAX_RESPONSAVEIS)
    .map((item) => mesclar(S.novoItem('responsaveis'), item));
  return novo;
}

// ---------------------------------------------------------------------------
// Combobox com busca (profissões, países, convênios, cidades)
// ---------------------------------------------------------------------------

function criarCombobox({ id, valor, opcoes = [], livre = false, descritoPor, aoDigitar, aoEscolher }) {
  const LIMITE = 80;
  const input = el('input', {
    id, type: 'text', class: 'entrada', role: 'combobox', autocomplete: 'off', autocapitalize: 'off',
    spellcheck: 'false', 'aria-autocomplete': 'list', 'aria-expanded': 'false', 'aria-controls': `${id}-lista`,
    'aria-describedby': descritoPor,
  });
  input.value = valor ?? '';
  const lista = el('ul', { id: `${id}-lista`, role: 'listbox', class: 'combo-lista', hidden: true });
  const raiz = el('div', { class: 'combo' }, input, lista);

  let todas = opcoes;
  let modoLivre = livre;
  let visiveis = [];
  let ativo = -1;

  function desenhar() {
    const q = S.normalizarBusca(input.value);
    let filtradas = todas;
    if (q) {
      filtradas = todas.filter((o) => S.normalizarBusca(o).includes(q));
      filtradas.sort((a, b) => Number(S.normalizarBusca(b).startsWith(q)) - Number(S.normalizarBusca(a).startsWith(q)));
    }
    visiveis = filtradas.slice(0, LIMITE);
    lista.replaceChildren(...visiveis.map((op, i) => el('li', {
      id: `${id}-op-${i}`, role: 'option', class: 'combo-opcao', 'aria-selected': op === input.value ? 'true' : 'false',
      onmousedown: (e) => { e.preventDefault(); escolher(op); },
    }, op)));
    if (!visiveis.length) {
      lista.append(el('li', { class: 'combo-nota', role: 'presentation' }, modoLivre ? 'Nenhuma sugestão. Pode digitar livremente.' : 'Nenhuma opção encontrada.'));
    } else if (filtradas.length > LIMITE) {
      lista.append(el('li', { class: 'combo-nota', role: 'presentation' }, `Mostrando ${LIMITE} de ${filtradas.length}. Continue digitando para filtrar.`));
    }
    ativo = -1;
    input.removeAttribute('aria-activedescendant');
  }

  function abrir() {
    if (!todas.length) return;
    desenhar();
    lista.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function fechar() {
    lista.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    ativo = -1;
  }

  function marcarAtivo(i) {
    if (!visiveis.length) return;
    ativo = Math.max(0, Math.min(i, visiveis.length - 1));
    lista.querySelectorAll('.combo-opcao').forEach((li, j) => li.classList.toggle('ativa', j === ativo));
    const atual = $(`${id}-op-${ativo}`);
    input.setAttribute('aria-activedescendant', atual.id);
    atual.scrollIntoView({ block: 'nearest' });
  }

  function escolher(op) {
    input.value = op;
    fechar();
    aoEscolher(op);
  }

  input.addEventListener('input', () => { abrir(); aoDigitar(input.value); });
  input.addEventListener('click', () => (lista.hidden ? abrir() : fechar()));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (lista.hidden) abrir(); marcarAtivo(ativo + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); marcarAtivo(ativo - 1); }
    else if (e.key === 'Enter' && !lista.hidden && ativo >= 0) { e.preventDefault(); escolher(visiveis[ativo]); }
    else if (e.key === 'Escape' && !lista.hidden) { e.preventDefault(); fechar(); }
  });
  input.addEventListener('blur', () => {
    fechar();
    const q = S.normalizarBusca(input.value);
    const exata = q && todas.find((o) => S.normalizarBusca(o) === q);
    if (exata && exata !== input.value) escolher(exata);
  });

  return {
    raiz,
    input,
    opcoes: () => todas,
    livre: () => modoLivre,
    definirOpcoes(novas, { livre: l = false } = {}) { todas = novas; modoLivre = l; if (!lista.hidden) desenhar(); },
    definirValor(v) { if (input.value !== (v ?? '')) input.value = v ?? ''; },
  };
}

// ---------------------------------------------------------------------------
// Cidades (IBGE) e CEP (ViaCEP)
// ---------------------------------------------------------------------------

function siglaDaUf(nome) {
  return Object.keys(S.SIGLAS_UF).find((s) => S.SIGLAS_UF[s] === nome) ?? null;
}

function carregarCidades(nomeUf) {
  const sigla = siglaDaUf(nomeUf);
  if (!sigla) return Promise.resolve(null);
  if (!cacheCidades.has(sigla)) {
    const promessa = buscarJson(URL_IBGE(sigla), 8000)
      .then((dados) => {
        const nomes = Array.isArray(dados) ? dados.map((m) => m?.nome).filter((n) => typeof n === 'string') : [];
        if (!nomes.length) throw new Error('lista vazia');
        return nomes.sort((a, b) => a.localeCompare(b, 'pt-BR'));
      })
      .catch(() => { cacheCidades.delete(sigla); return null; });
    cacheCidades.set(sigla, promessa);
  }
  return cacheCidades.get(sigla);
}

async function buscarCep(r, digitos) {
  const { campo, obj, prefixo } = r;
  errosExtras.delete(r.caminho);
  r.definirStatus('Buscando endereço…');
  let dados;
  try {
    dados = await buscarJson(URL_VIACEP(digitos), 6000);
  } catch {
    r.definirStatus('Não foi possível consultar o CEP agora. Preencha o endereço manualmente.');
    return;
  }
  if (S.somenteDigitos(S.obterCaminho(obj, campo.chave)) !== digitos) return; // CEP mudou durante a busca
  if (!dados || dados.erro) {
    r.definirStatus('');
    errosExtras.set(r.caminho, 'CEP não encontrado. Confira o número.');
    tocados.add(r.caminho);
    revalidar();
    return;
  }
  const alterados = [];
  const preencher = (chave, valor) => {
    if (!chave || typeof valor !== 'string' || !valor.trim()) return;
    S.definirCaminho(obj, chave, valor.trim());
    alterados.push(S.juntarCaminho(prefixo, chave));
  };
  preencher(campo.preencher.logradouro, dados.logradouro);
  preencher(campo.preencher.bairro, dados.bairro);
  preencher(campo.preencher.estado, S.SIGLAS_UF[dados.uf]);
  preencher(campo.preencher.cidade, dados.localidade);
  r.definirStatus('Endereço preenchido pelo CEP. Confira e corrija se precisar.');
  depoisDeAlterar(alterados);
}

// ---------------------------------------------------------------------------
// Desenho dos campos
// ---------------------------------------------------------------------------

const MASCARAS = {
  cpf: { formatar: S.formatarCpf, digitos: 11, inputmode: 'numeric', autocomplete: 'off', placeholder: '000.000.000-00', maxlength: 14 },
  cep: { formatar: S.formatarCep, digitos: 8, inputmode: 'numeric', autocomplete: 'postal-code', placeholder: '00000-000', maxlength: 9 },
  telefone: { formatar: S.formatarTelefone, digitos: 11, inputmode: 'tel', autocomplete: 'tel', maxlength: 15 },
};

function textoDica(campo, obj, ctx) {
  return typeof campo.dica === 'function' ? campo.dica(obj, ctx) : campo.dica;
}

function marcaObrigatorio(campo, obj, ctx) {
  return S.campoObrigatorio(campo, obj, ctx) ? el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *') : null;
}

// Cria o "registro" de um campo: guarda referências para atualizar valor, visibilidade e erros.
function novoRegistro({ campo, secao = null, obj, prefixo, indice = null }) {
  const caminho = S.juntarCaminho(prefixo, campo.chave);
  const id = S.idDoCampo(caminho);
  const r = {
    tipo: 'campo', campo, secao, obj, prefixo, indice, caminho, id,
    idDica: `${id}-dica`, idErro: `${id}-erro`, controles: [], subErros: new Map(),
    obter: () => S.obterCaminho(obj, campo.chave),
    definir: (v) => S.definirCaminho(obj, campo.chave, v),
    sincronizar: () => {},
  };
  registros.push(r);
  return r;
}

function montarInvolucro(r, { grupo = false, controle, extra = [] }) {
  const { campo, obj } = r;
  const ctx = contexto(r.indice);
  const dica = textoDica(campo, obj, ctx);
  r.erroEl = el('p', { id: r.idErro, class: 'erro', hidden: true });
  const titulo = grupo
    ? el('legend', { class: 'rotulo' }, campo.rotulo, marcaObrigatorio(campo, obj, ctx))
    : el('label', { class: 'rotulo', for: r.id }, campo.rotulo, marcaObrigatorio(campo, obj, ctx));
  r.dicaEl = el('p', { id: r.idDica, class: 'dica', hidden: !dica }, dica ?? '');
  r.wrapper = el(grupo ? 'fieldset' : 'div', {
    class: `campo${campo.curto ? ' curto' : ''}${grupo ? ' grupo' : ''}`,
    id: `${r.id}-campo`,
    hidden: campo.visivelSe ? !S.campoVisivel(campo, obj, ctx) : false,
  },
  titulo,
  r.dicaEl,
  campo.aviso ? el('p', { class: 'aviso-campo' }, campo.aviso) : null,
  controle,
  ...extra,
  r.erroEl);
  return r.wrapper;
}

function descritoPor(r) {
  return `${r.idDica} ${r.idErro}`;
}

function campoTexto(r) {
  const { campo } = r;
  const mascara = MASCARAS[campo.tipo];
  const longo = campo.tipo === 'textoLongo';
  const attrs = {
    id: r.id, name: r.id, class: 'entrada', 'aria-describedby': descritoPor(r),
    'aria-required': S.campoObrigatorio(campo, r.obj, contexto(r.indice)) ? 'true' : null,
    autocomplete: campo.autocomplete ?? mascara?.autocomplete ?? (campo.tipo === 'email' ? 'email' : null),
    inputmode: campo.inputmode ?? mascara?.inputmode ?? { email: 'email', numero: 'decimal' }[campo.tipo] ?? null,
    placeholder: mascara?.placeholder ?? (campo.tipo === 'telefone' ? (campo.celular ? '(00) 00000-0000' : '(00) 0000-0000') : null),
    maxlength: mascara?.maxlength ?? (campo.tipo === 'numero' ? 6 : campo.maximo ?? (longo ? 2000 : 150)),
  };
  if (campo.tipo === 'telefone') attrs.placeholder = campo.celular ? '(00) 00000-0000' : '(00) 0000-0000';
  let entrada;
  if (longo) entrada = el('textarea', { ...attrs, rows: 3 });
  else if (campo.tipo === 'data') entrada = el('input', { ...attrs, type: 'date', min: '1900-01-01', max: S.hojeISO(), maxlength: null });
  else entrada = el('input', { ...attrs, type: campo.tipo === 'email' ? 'email' : campo.tipo === 'telefone' ? 'tel' : 'text' });

  const exibir = (v) => (mascara ? mascara.formatar(v ?? '') : (v ?? ''));
  entrada.value = exibir(r.obter());
  r.controles.push(entrada);
  r.foco = entrada;
  r.sincronizar = () => { const v = exibir(r.obter()); if (entrada.value !== v) entrada.value = v; };

  const extra = [];
  if (campo.tipo === 'cep') {
    const status = el('p', { id: `${r.id}-status`, class: 'status', 'aria-live': 'polite' });
    r.definirStatus = (t) => { status.textContent = t; };
    extra.push(status);
  }

  entrada.addEventListener('input', () => {
    let valor = entrada.value;
    if (mascara) {
      const d = S.somenteDigitos(valor).slice(0, mascara.digitos);
      entrada.value = mascara.formatar(d);
      valor = d;
    }
    r.definir(valor);
    if (campo.tipo === 'cep') {
      errosExtras.delete(r.caminho);
      if (valor.length === 8) buscarCep(r, valor);
      else r.definirStatus('');
    }
    depoisDeAlterar([]);
  });
  return montarInvolucro(r, { controle: entrada, extra });
}

function campoLista(r) {
  const { campo, obj } = r;
  const ctx = contexto(r.indice);
  const select = el('select', {
    id: r.id, name: r.id, class: 'entrada', 'aria-describedby': descritoPor(r),
    'aria-required': S.campoObrigatorio(campo, obj, ctx) ? 'true' : null,
  },
  el('option', { value: '' }, 'Selecione…'),
  S.opcoesDoCampo(campo, obj, ctx).map((op) => el('option', { value: op }, op)));
  select.value = r.obter() ?? '';
  r.controles.push(select);
  r.foco = select;
  r.sincronizar = () => { select.value = r.obter() ?? ''; };
  select.addEventListener('change', () => {
    r.definir(select.value);
    depoisDeAlterar([r.caminho]);
  });
  return montarInvolucro(r, { controle: select });
}

function campoBusca(r) {
  const { campo, obj } = r;
  const ctx = contexto(r.indice);
  const ehCidade = campo.tipo === 'cidade';
  const combo = criarCombobox({
    id: r.id,
    valor: r.obter(),
    opcoes: ehCidade ? [] : S.opcoesDoCampo(campo, obj, ctx),
    livre: ehCidade,
    descritoPor: descritoPor(r),
    aoDigitar: (v) => { r.definir(v); depoisDeAlterar([]); },
    aoEscolher: (v) => { r.definir(v); depoisDeAlterar([]); },
  });
  if (S.campoObrigatorio(campo, obj, ctx)) combo.input.setAttribute('aria-required', 'true');
  r.controles.push(combo.input);
  r.foco = combo.input;
  r.sincronizar = () => combo.definirValor(r.obter());

  if (ehCidade) {
    r.caminhoUf = S.juntarCaminho(r.prefixo, campo.ufDe);
    let pedido = 0;
    const dicaPadrao = textoDica(campo, obj, ctx) ?? '';
    const mostrarDica = (t) => { r.dicaEl.textContent = t; r.dicaEl.hidden = !t; };
    // Recarrega as cidades da UF escolhida. `limpar`: apaga a cidade se não for da nova UF.
    r.atualizarOpcoes = async ({ limpar = false } = {}) => {
      const uf = S.obterCaminho(obj, campo.ufDe);
      const meu = ++pedido;
      if (!uf) {
        combo.definirOpcoes([], { livre: false });
        combo.input.placeholder = 'Escolha o estado primeiro';
        mostrarDica(dicaPadrao);
        return;
      }
      if (uf === S.UF_ESTRANGEIRO) {
        combo.definirOpcoes([], { livre: true });
        combo.input.placeholder = 'Digite o nome da cidade';
        mostrarDica(dicaPadrao);
        return;
      }
      combo.input.placeholder = 'Carregando cidades…';
      const cidades = await carregarCidades(uf);
      if (meu !== pedido) return;
      if (cidades) {
        combo.definirOpcoes(cidades, { livre: false });
        combo.input.placeholder = 'Digite para buscar';
        mostrarDica(dicaPadrao);
        const atual = r.obter();
        if (limpar && atual && !cidades.includes(atual)) {
          r.definir('');
          r.sincronizar();
          depoisDeAlterar([]);
        }
      } else {
        combo.definirOpcoes([], { livre: true });
        combo.input.placeholder = 'Digite o nome da cidade';
        mostrarDica('Não foi possível carregar a lista de cidades. Digite o nome da cidade.');
      }
    };
    r.validarExtra = () => {
      const v = r.obter();
      if (!v || combo.livre() || !combo.opcoes().length) return null;
      return combo.opcoes().includes(v) ? null : 'Escolha uma cidade da lista.';
    };
  }
  const involucro = montarInvolucro(r, { controle: combo.raiz });
  r.atualizarOpcoes?.();
  return involucro;
}

function radio(r, valorTexto, rotulo, marcado, aoMarcar, i) {
  const id = `${r.id}-op${i}`;
  const input = el('input', {
    type: 'radio', id, name: r.id, value: valorTexto, checked: marcado, 'aria-describedby': descritoPor(r),
    onchange: aoMarcar,
  });
  r.controles.push(input);
  return el('div', { class: 'opcao' }, input, el('label', { for: id }, rotulo));
}

function campoSimNao(r) {
  const atual = r.obter();
  const opcoes = el('div', { class: 'opcoes em-linha' },
    radio(r, 'sim', 'Sim', atual === true, () => { r.definir(true); depoisDeAlterar([]); }, 0),
    radio(r, 'nao', 'Não', atual === false, () => { r.definir(false); depoisDeAlterar([]); }, 1));
  r.foco = r.controles[0];
  r.sincronizar = () => {
    const v = r.obter();
    r.controles[0].checked = v === true;
    r.controles[1].checked = v === false;
  };
  return montarInvolucro(r, { grupo: true, controle: opcoes });
}

function campoOpcao(r) {
  const { campo, obj } = r;
  const atual = r.obter();
  const lista = S.opcoesDoCampo(campo, obj, contexto(r.indice));
  const opcoes = el('div', { class: `opcoes${campo.emLinha ? ' em-linha' : ''}` },
    lista.map((op, i) => radio(r, op, op, atual === op, () => { r.definir(op); depoisDeAlterar([]); }, i)));
  r.foco = r.controles[0];
  r.sincronizar = () => { const v = r.obter(); r.controles.forEach((c) => { c.checked = c.value === v; }); };
  return montarInvolucro(r, { grupo: true, controle: opcoes });
}

function caixa(id, rotulo, marcado, aoMudar, describedby) {
  const input = el('input', { type: 'checkbox', id, checked: marcado, 'aria-describedby': describedby, onchange: (e) => aoMudar(e.target.checked) });
  return { input, linha: el('div', { class: 'opcao' }, input, el('label', { for: id }, rotulo)) };
}

function campoCaixas(r) {
  const { campo, obj } = r;
  const lista = S.opcoesDoCampo(campo, obj, contexto(r.indice));
  const atual = new Set(r.obter() ?? []);
  const itens = lista.map((op, i) => caixa(`${r.id}-op${i}`, op, atual.has(op), (marcado) => {
    const conjunto = new Set(r.obter() ?? []);
    if (marcado) conjunto.add(op); else conjunto.delete(op);
    r.definir(lista.filter((x) => conjunto.has(x)));
    depoisDeAlterar([]);
  }, descritoPor(r)));
  r.controles.push(...itens.map((i) => i.input));
  r.foco = r.controles[0];
  r.sincronizar = () => { const v = new Set(r.obter() ?? []); itens.forEach((it, i) => { it.input.checked = v.has(lista[i]); }); };
  return montarInvolucro(r, { grupo: true, controle: el('div', { class: 'opcoes' }, itens.map((i) => i.linha)) });
}

function campoCaixasDescricao(r) {
  const { campo, obj } = r;
  const lista = S.opcoesDoCampo(campo, obj, contexto(r.indice));
  const chaveNenhuma = S.chaveNenhuma(campo);
  const itens = () => (Array.isArray(r.obter()) ? r.obter() : []);
  const linhas = [];

  const atualizarDom = () => {
    const marcados = new Map(itens().map((i) => [i.tipo, i]));
    linhas.forEach(({ input, area, textarea, op }) => {
      const item = marcados.get(op);
      input.checked = Boolean(item);
      area.hidden = !item;
      if (item && textarea.value !== (item.descricao ?? '')) textarea.value = item.descricao ?? '';
    });
    nenhuma.input.checked = obj[chaveNenhuma] === true;
  };

  lista.forEach((op, i) => {
    const caminhoSub = `${r.caminho}.opcao${i}`;
    const idSub = S.idDoCampo(caminhoSub);
    const erroSub = el('p', { id: `${idSub}-erro`, class: 'erro', hidden: true });
    const textarea = el('textarea', {
      id: idSub, class: 'entrada', rows: 2, maxlength: 2000, 'aria-required': 'true', 'aria-describedby': `${idSub}-erro`,
      oninput: (e) => {
        const item = itens().find((x) => x.tipo === op);
        if (item) item.descricao = e.target.value;
        depoisDeAlterar([]);
      },
      onblur: () => { tocados.add(caminhoSub); revalidar(); },
    });
    const area = el('div', { class: 'descricao', hidden: true },
      el('label', { for: idSub, class: 'rotulo rotulo-menor' }, `Descreva (${op})`, el('span', { class: 'obrigatorio', 'aria-hidden': 'true' }, ' *')),
      textarea, erroSub);
    const { input, linha } = caixa(`${r.id}-op${i}`, op, false, (marcado) => {
      let novos = itens().filter((x) => x.tipo !== op);
      if (marcado) {
        novos.push({ tipo: op, descricao: '' });
        novos = lista.flatMap((t) => novos.filter((x) => x.tipo === t));
        obj[chaveNenhuma] = false;
      }
      r.definir(novos);
      atualizarDom();
      if (marcado) textarea.focus();
      depoisDeAlterar([]);
    }, descritoPor(r));
    r.controles.push(input);
    r.subErros.set(caminhoSub, { erroEl: erroSub, controle: textarea });
    linhas.push({ op, input, area, textarea });
  });

  const nenhuma = caixa(`${r.id}-nenhuma`, campo.nenhuma, false, (marcado) => {
    obj[chaveNenhuma] = marcado;
    if (marcado) r.definir([]);
    atualizarDom();
    depoisDeAlterar([]);
  }, descritoPor(r));
  r.controles.push(nenhuma.input);
  r.foco = r.controles[0];
  r.sincronizar = atualizarDom;

  const corpo = el('div', { class: 'opcoes' },
    linhas.map(({ input, area }) => el('div', { class: 'item-descricao' }, input.parentElement, area)),
    el('div', { class: 'opcao-nenhuma' }, nenhuma.linha));
  atualizarDom();
  return montarInvolucro(r, { grupo: true, controle: corpo });
}

function campoMarcar(r) {
  const { campo, obj } = r;
  const ctx = contexto(r.indice);
  const input = el('input', {
    type: 'checkbox', id: r.id, checked: r.obter() === true, 'aria-describedby': descritoPor(r),
    'aria-required': S.campoObrigatorio(campo, obj, ctx) ? 'true' : null,
    onchange: (e) => { r.definir(e.target.checked); depoisDeAlterar([]); },
  });
  r.controles.push(input);
  r.foco = input;
  r.sincronizar = () => { input.checked = r.obter() === true; };
  r.erroEl = el('p', { id: r.idErro, class: 'erro', hidden: true });
  r.dicaEl = el('p', { id: r.idDica, class: 'dica', hidden: true });
  const extras = [];
  if (campo.chave === 'mesmoEnderecoDoAssociado') {
    const resumo = el('p', { class: 'dica resumo-endereco' });
    r.aoAtualizar = () => {
      resumo.hidden = r.obter() !== true;
      resumo.textContent = `Endereço do associado: ${resumoEndereco(estado.informacoesGerais.endereco)}`;
    };
    extras.push(resumo);
  }
  r.wrapper = el('div', { class: `campo campo-marcar${campo.chave === 'consentimentoLgpd' ? ' consentimento' : ''}`, id: `${r.id}-campo` },
    el('div', { class: 'opcao' }, input,
      el('label', { for: r.id }, campo.rotulo, marcaObrigatorio(campo, obj, ctx))),
    r.dicaEl, ...extras, r.erroEl);
  r.aoAtualizar?.();
  return r.wrapper;
}

function campoTabela(r) {
  const { campo } = r;
  const linhasEl = el('div', { class: 'linhas-tabela' });
  let filhos = [];
  const linhas = () => (Array.isArray(r.obter()) ? r.obter() : []);
  const botaoAdicionar = el('button', { type: 'button', class: 'botao botao-secundario botao-pequeno' }, `+ ${campo.botaoAdicionar}`);

  r.desenharLinhas = (focarLinha = null) => {
    registros = registros.filter((x) => !filhos.includes(x));
    filhos = [];
    linhasEl.replaceChildren(...linhas().map((linha, i) => {
      const prefixo = `${r.caminho}.${i}`;
      const antes = registros.length;
      const campos = campo.colunas.map((coluna) => desenharCampo({ campo: coluna, obj: linha, prefixo, indice: r.indice }));
      filhos.push(...registros.slice(antes));
      const titulo = el('h4', { class: 'titulo-linha', id: `${S.idDoCampo(prefixo)}-titulo`, tabindex: '-1' }, campo.rotuloLinha(i));
      return el('div', { class: 'linha-tabela', role: 'group', 'aria-labelledby': titulo.id },
        el('div', { class: 'cabecalho-linha' }, titulo,
          el('button', {
            type: 'button', class: 'botao-link botao-remover', 'aria-label': `Remover ${campo.rotuloLinha(i).toLowerCase()}`,
            onclick: () => {
              r.definir(linhas().filter((_, j) => j !== i));
              r.desenharLinhas();
              depoisDeAlterar([]);
              botaoAdicionar.focus();
            },
          }, 'Remover')),
        el('div', { class: 'campos-linha' }, campos));
    }));
    botaoAdicionar.hidden = linhas().length >= campo.maximoLinhas;
    if (focarLinha !== null) $(`${S.idDoCampo(`${r.caminho}.${focarLinha}`)}-titulo`)?.focus();
  };
  botaoAdicionar.addEventListener('click', () => {
    r.definir([...linhas(), S.novaLinha(campo)]);
    r.desenharLinhas(linhas().length - 1);
    depoisDeAlterar([]);
  });
  r.foco = botaoAdicionar;
  r.controles.push(botaoAdicionar);
  r.sincronizar = () => r.desenharLinhas();
  r.desenharLinhas();
  return montarInvolucro(r, { grupo: true, controle: el('div', {}, linhasEl, botaoAdicionar) });
}

function campoComputado(r) {
  const { campo, obj } = r;
  const saida = el('output', { id: r.id, class: 'valor-calculado' });
  r.sincronizar = () => { saida.textContent = campo.exibir(campo.calcular(obj, contexto(r.indice))); };
  r.sincronizar();
  r.wrapper = el('div', { class: `campo${campo.curto ? ' curto' : ''}` }, el('span', { class: 'rotulo' }, campo.rotulo), saida);
  r.erroEl = null;
  return r.wrapper;
}

function desenharCampo(opcoes) {
  const r = novoRegistro(opcoes);
  switch (r.campo.tipo) {
    case 'lista': return campoLista(r);
    case 'busca': case 'cidade': return campoBusca(r);
    case 'simNao': return campoSimNao(r);
    case 'opcao': return campoOpcao(r);
    case 'caixas': return campoCaixas(r);
    case 'caixasDescricao': return campoCaixasDescricao(r);
    case 'marcar': return campoMarcar(r);
    case 'tabela': return campoTabela(r);
    case 'computado': return campoComputado(r);
    default: return campoTexto(r);
  }
}

function desenharSecoes(etapa, obj, prefixo, indice, nivel = 3) {
  return etapa.secoes.map((secao) => {
    const ctx = contexto(indice);
    const elemento = el('section', { class: `secao${secao.soGrupo ? ' secao-grupo' : ''}`, hidden: !S.secaoVisivel(secao, obj, ctx) },
      secao.titulo ? el(`h${nivel}`, { class: 'titulo-secao' }, secao.titulo,
        secao.soGrupo ? el('span', { class: 'selo' }, 'Só para o grupo · não existe no Paxtu') : null) : null,
      el('div', { class: 'campos' }, secao.campos.map((campo) => desenharCampo({ campo, secao, obj, prefixo, indice }))));
    registros.push({ tipo: 'secao', secao, obj, indice, elemento });
    return elemento;
  });
}

function resumoEndereco(e) {
  if (!e) return '—';
  const partes = [
    [e.logradouro, e.numero].filter(Boolean).join(', '),
    e.complemento, e.bairro,
    [e.cidade, siglaDaUf(e.estado) ?? e.estado].filter(Boolean).join('/'),
    e.cep ? `CEP ${S.formatarCep(e.cep)}` : '',
  ].filter(Boolean);
  return partes.length ? partes.join(' — ') : 'ainda não preenchido na etapa 1';
}

// ---------------------------------------------------------------------------
// Atualização após cada alteração
// ---------------------------------------------------------------------------

function depoisDeAlterar(alterados = []) {
  const sugeridos = S.aplicarSugestoes(estado, listas, { agora: agora() });
  const todos = new Set([...alterados, ...sugeridos]);
  const ctxBase = contexto();
  const tabelasVazias = [];

  for (const r of registros) {
    const ctx = { ...ctxBase, indice: r.indice };
    if (r.tipo === 'secao') {
      r.elemento.hidden = !S.secaoVisivel(r.secao, r.obj, ctx);
      continue;
    }
    if (r.campo.visivelSe) r.wrapper.hidden = !S.campoVisivel(r.campo, r.obj, ctx);
    if (todos.has(r.caminho) || r.campo.tipo === 'computado') r.sincronizar();
    r.aoAtualizar?.();
    if (r.campo.tipo === 'tabela' && !r.wrapper.hidden && r.campo.obrigatorio && !r.obter()?.length) tabelasVazias.push(r);
  }
  for (const r of registros) {
    if (r.caminhoUf && todos.has(r.caminhoUf)) r.atualizarOpcoes({ limpar: true });
  }
  // Ao responder "Sim" em "Faz uso de algum medicamento?", já abre a primeira linha.
  for (const r of tabelasVazias) {
    r.definir([S.novaLinha(r.campo)]);
    r.desenharLinhas();
  }
  atualizarBotoes();
  revalidar();
  salvarRascunho();
}

// ---------------------------------------------------------------------------
// Erros
// ---------------------------------------------------------------------------

function errosDaEtapa(indice) {
  const etapa = ETAPAS[indice];
  const erros = S.validarEtapa(etapa.id, estado, listas, { agora: agora() });
  const comErro = new Set(erros.map((e) => e.campo));
  // Erros que só o navegador conhece (CEP inexistente, cidade fora da lista do IBGE).
  if (indice === indiceEtapa) {
    for (const r of registros) {
      if (r.tipo !== 'campo' || comErro.has(r.caminho) || !visivelNaTela(r)) continue;
      const mensagem = errosExtras.get(r.caminho) ?? r.validarExtra?.();
      if (mensagem) erros.push({ etapa: etapa.id, campo: r.caminho, rotulo: r.campo.rotulo, mensagem });
    }
  }
  return erros;
}

function visivelNaTela(r) {
  return r.wrapper && !r.wrapper.closest('[hidden]');
}

function definirErro(erroEl, controles, mensagem, wrapper = null) {
  if (!erroEl) return;
  erroEl.textContent = mensagem ?? '';
  erroEl.hidden = !mensagem;
  controles.forEach((c) => (mensagem ? c.setAttribute('aria-invalid', 'true') : c.removeAttribute('aria-invalid')));
  wrapper?.classList.toggle('com-erro', Boolean(mensagem));
}

function exibirErros(erros) {
  const mostrarTodos = etapasComErros.has(etapaAtual().id);
  const mensagens = new Map();
  for (const e of erros) if (!mensagens.has(e.campo)) mensagens.set(e.campo, e.mensagem);
  const conhecidos = new Set();

  for (const r of registros) {
    if (r.tipo !== 'campo') continue;
    conhecidos.add(r.caminho);
    const mostrar = mostrarTodos || tocados.has(r.caminho);
    definirErro(r.erroEl, r.controles, mostrar ? mensagens.get(r.caminho) : null, r.wrapper);
    for (const [caminhoSub, alvo] of r.subErros) {
      conhecidos.add(caminhoSub);
      const mostrarSub = mostrarTodos || tocados.has(caminhoSub);
      definirErro(alvo.erroEl, [alvo.controle], mostrarSub ? mensagens.get(caminhoSub) : null);
    }
  }

  const caixa = $('erro-etapa');
  if (!caixa) return;
  const soltos = mostrarTodos ? erros.filter((e) => !conhecidos.has(e.campo)) : [];
  caixa.replaceChildren(...soltos.map((e) => el('p', {}, e.mensagem)));
  caixa.hidden = soltos.length === 0;
}

function revalidar() {
  exibirErros(errosDaEtapa(indiceEtapa));
}

function focarPrimeiroErro() {
  const alvo = ui.etapa.querySelector('[aria-invalid="true"]') ?? $('erro-etapa');
  if (!alvo || alvo.hidden) return;
  alvo.focus();
  alvo.scrollIntoView({ block: 'center' });
}

// ---------------------------------------------------------------------------
// Etapas
// ---------------------------------------------------------------------------

function desenharProgresso() {
  ui.listaEtapas.replaceChildren(...ETAPAS.map((etapa, i) => el('li', {
    class: i === indiceEtapa ? 'atual' : i < indiceEtapa ? 'feita' : '',
    'aria-current': i === indiceEtapa ? 'step' : null,
  },
  el('span', { class: 'numero', 'aria-hidden': 'true' }, i < indiceEtapa ? '✓' : String(i + 1)),
  el('span', { class: 'nome' }, etapa.titulo),
  i < indiceEtapa ? el('span', { class: 'sr-only' }, ' (concluída)') : null)));
  ui.barra.max = ETAPAS.length;
  ui.barra.value = indiceEtapa + 1;
}

function atualizarBotoes() {
  const etapa = etapaAtual();
  ui.voltar.hidden = indiceEtapa === 0;
  let rotulo = 'Próximo';
  if (etapa.id === 'revisao') rotulo = enviando ? 'Enviando…' : 'Enviar cadastro';
  else if (veioDaRevisao) rotulo = 'Salvar e voltar à revisão';
  else if (etapa.repetivel && estado[etapa.caminho].length === 0) rotulo = 'Pular etapa';
  ui.avancar.textContent = rotulo;
  ui.avancar.disabled = enviando;
}

function desenharEtapa() {
  registros = [];
  const etapa = etapaAtual();
  S.aplicarSugestoes(estado, listas, { agora: agora() });
  const conteudo = [
    el('h2', { id: 'titulo-etapa', tabindex: '-1' },
      el('span', { class: 'etapa-numero' }, `Etapa ${indiceEtapa + 1} de ${ETAPAS.length}`), etapa.titulo),
    etapa.descricao ? el('p', { class: 'descricao-etapa' }, etapa.descricao) : null,
    etapa.id !== 'revisao' ? el('p', { class: 'legenda' }, 'Campos com ', el('span', { class: 'obrigatorio' }, '*'), ' são obrigatórios.') : null,
    el('div', { id: 'erro-etapa', class: 'aviso aviso-erro', hidden: true, tabindex: '-1', role: 'alert' }),
  ];
  if (etapa.repetivel) conteudo.push(...desenharResponsaveis(etapa));
  else if (etapa.id === 'revisao') conteudo.push(...desenharRevisao(), ...desenharSecoes(etapa, estado, null, null));
  else conteudo.push(...desenharSecoes(etapa, estado[etapa.caminho], etapa.caminho, null));
  ui.etapa.replaceChildren(...conteudo.flat().filter(Boolean));
  desenharProgresso();
  atualizarBotoes();
  revalidar();
}

function desenharResponsaveis(etapa) {
  const ctx = contexto();
  const itens = estado[etapa.caminho];
  const { maximo, rotuloItem } = etapa.repetivel;
  const partes = [
    el('p', { class: 'aviso' }, ctx.menor
      ? 'Como o associado tem menos de 18 anos, informe pelo menos um responsável.'
      : 'Como o associado tem 18 anos ou mais, esta etapa é opcional. Se não quiser informar responsáveis, use "Pular etapa".'),
  ];
  itens.forEach((item, i) => {
    const podeRemover = i > 0 || !ctx.menor;
    partes.push(el('section', { class: 'bloco-item', 'aria-labelledby': `titulo-item-${i}` },
      el('div', { class: 'cabecalho-item' },
        el('h3', { id: `titulo-item-${i}`, tabindex: '-1' }, rotuloItem(i)),
        podeRemover ? el('button', {
          type: 'button', class: 'botao-link botao-remover', 'aria-label': `Remover ${rotuloItem(i).toLowerCase()}`,
          onclick: () => {
            if (!window.confirm(`Remover os dados do ${rotuloItem(i).toLowerCase()}?`)) return;
            itens.splice(i, 1);
            limparMarcasDe(etapa.caminho);
            desenharEtapa();
            salvarRascunho();
            $('titulo-etapa').focus();
          },
        }, 'Remover') : null),
      desenharSecoes(etapa, item, `${etapa.caminho}.${i}`, i, 4)));
  });
  if (itens.length < maximo) {
    partes.push(el('button', {
      type: 'button', class: 'botao botao-secundario',
      onclick: () => {
        itens.push(S.novoItem(etapa.id));
        desenharEtapa();
        salvarRascunho();
        $(`titulo-item-${itens.length - 1}`)?.focus();
      },
    }, itens.length === 0 ? '+ Adicionar responsável' : '+ Adicionar segundo responsável'));
  }
  return partes;
}

function limparMarcasDe(prefixo) {
  for (const mapa of [tocados, errosExtras]) {
    for (const chave of [...mapa.keys()]) if (chave.startsWith(`${prefixo}.`)) mapa.delete(chave);
  }
}

function irPara(indice) {
  indiceEtapa = indice;
  const etapa = etapaAtual();
  if (etapa.repetivel && contexto().menor && estado[etapa.caminho].length === 0) {
    estado[etapa.caminho].push(S.novoItem(etapa.id));
  }
  ui.falha.hidden = true;
  ui.avisoRascunho.hidden = true;
  desenharEtapa();
  salvarRascunho();
  window.scrollTo(0, 0);
  $('titulo-etapa').focus({ preventScroll: true });
}

function avancar() {
  const etapa = etapaAtual();
  if (etapa.id === 'revisao') return enviar();
  const erros = errosDaEtapa(indiceEtapa);
  if (erros.length) {
    etapasComErros.add(etapa.id);
    exibirErros(erros);
    anunciar(erros.length === 1 ? 'Há 1 campo para corrigir.' : `Há ${erros.length} campos para corrigir.`);
    focarPrimeiroErro();
    return;
  }
  const destino = veioDaRevisao ? INDICE_REVISAO : indiceEtapa + 1;
  if (destino === INDICE_REVISAO) veioDaRevisao = false;
  irPara(destino);
}

function editarEtapa(indice) {
  veioDaRevisao = true;
  irPara(indice);
}

// ---------------------------------------------------------------------------
// Revisão
// ---------------------------------------------------------------------------

function formatar(campo, v, obj, ctx) {
  const vazio = '—';
  switch (campo.tipo) {
    case 'simNao': return v === true ? 'Sim' : v === false ? 'Não' : vazio;
    case 'marcar': return v === true ? 'Sim' : 'Não';
    case 'data': return S.formatarData(v) || vazio;
    case 'cpf': return S.formatarCpf(v) || vazio;
    case 'cep': return S.formatarCep(v) || vazio;
    case 'telefone': return S.formatarTelefone(v) || vazio;
    case 'numero': return temValor(v) ? `${S.formatarNumero(v)}${campo.unidade ?? ''}` : vazio;
    case 'computado': return campo.exibir(campo.calcular(obj, ctx));
    case 'caixas': return v?.length ? v.join(', ') : 'Nenhum';
    case 'caixasDescricao':
      if (!v?.length) return obj[S.chaveNenhuma(campo)] === true ? campo.nenhuma : vazio;
      return el('ul', { class: 'lista-revisao' }, v.map((i) => el('li', {}, el('strong', {}, i.tipo), `: ${i.descricao || vazio}`)));
    case 'tabela':
      if (!v?.length) return vazio;
      return el('ul', { class: 'lista-revisao' }, v.map((l) => el('li', {},
        el('strong', {}, l.medicamento || vazio),
        ` — uso contínuo: ${l.usoContinuo === true ? 'Sim' : l.usoContinuo === false ? 'Não' : vazio}`,
        l.informacoes ? ` — ${l.informacoes}` : '')));
    default: return temValor(v) ? String(v) : vazio;
  }
}

function listaDefinicoes(etapa, obj, indice) {
  const ctx = contexto(indice);
  const blocos = [];
  for (const secao of etapa.secoes) {
    if (!S.secaoVisivel(secao, obj, ctx)) continue;
    const linhas = [];
    for (const campo of secao.campos) {
      if (campo.chave.startsWith('_') || !S.campoVisivel(campo, obj, ctx)) continue;
      linhas.push(el('div', { class: 'par' }, el('dt', {}, campo.rotulo), el('dd', {}, formatar(campo, S.obterCaminho(obj, campo.chave), obj, ctx))));
    }
    if (linhas.length) blocos.push(secao.titulo ? el('h4', { class: 'subtitulo-revisao' }, secao.titulo) : null, el('dl', { class: 'revisao-lista' }, linhas));
  }
  return blocos;
}

function desenharRevisao() {
  return ETAPAS.map((etapa, indice) => {
    if (etapa.id === 'revisao') return null;
    const cabecalho = el('div', { class: 'cabecalho-revisao' },
      el('h3', {}, etapa.titulo),
      el('button', { type: 'button', class: 'botao botao-secundario botao-pequeno', 'aria-label': `Editar ${etapa.titulo}`, onclick: () => editarEtapa(indice) }, 'Editar'));
    let corpo;
    if (etapa.repetivel) {
      const itens = estado[etapa.caminho];
      corpo = itens.length
        ? itens.map((item, i) => el('div', { class: 'item-revisao' }, el('h4', {}, etapa.repetivel.rotuloItem(i)), listaDefinicoes(etapa, item, i)))
        : [el('p', {}, 'Nenhum responsável informado.')];
    } else {
      corpo = listaDefinicoes(etapa, estado[etapa.caminho], null);
    }
    return el('section', { class: 'revisao-etapa' }, cabecalho, corpo);
  });
}

// ---------------------------------------------------------------------------
// Envio
// ---------------------------------------------------------------------------

function mostrarErrosDoCadastro(erros, mensagem) {
  const indice = ETAPAS.findIndex((e) => e.id === erros[0]?.etapa);
  if (indice < 0) return mostrarFalha(mensagem, erros);
  etapasComErros.add(ETAPAS[indice].id);
  if (indice !== indiceEtapa) {
    veioDaRevisao = indice !== INDICE_REVISAO;
    irPara(indice);
  }
  exibirErros(erros.filter((e) => e.etapa === ETAPAS[indice].id));
  anunciar(`${mensagem} Corrija os campos destacados na etapa "${ETAPAS[indice].titulo}".`);
  focarPrimeiroErro();
}

function mostrarFalha(mensagem, erros = []) {
  ui.falha.replaceChildren(...[
    el('h2', { class: 'titulo-aviso' }, 'O cadastro não foi enviado'),
    el('p', {}, mensagem),
    erros.length ? el('ul', {}, erros.map((e) => el('li', {}, e.rotulo ? `${e.rotulo}: ${e.mensagem}` : e.mensagem))) : null,
    el('p', {}, 'Suas respostas continuam salvas neste aparelho. Você pode tentar de novo ou baixar o arquivo e enviá-lo para a secretaria do grupo.'),
    el('div', { class: 'acoes' },
      el('button', { type: 'button', class: 'botao botao-primario', onclick: () => baixarJson(S.montarJson(estado, listas, { agora: agora() })) }, 'Baixar JSON'),
      el('button', { type: 'button', class: 'botao botao-secundario', onclick: () => enviar() }, 'Tentar novamente')),
  ].filter(Boolean));
  ui.falha.hidden = false;
  ui.falha.focus();
}

// Um erro guardado (ex.: CEP inexistente) só conta se o campo ainda estiver visível.
function extraAindaVale(caminho) {
  const etapa = ETAPAS.find((e) => e.caminho && caminho.startsWith(`${e.caminho}.`));
  if (!etapa) return null;
  let resto = caminho.slice(etapa.caminho.length + 1);
  let obj = estado[etapa.caminho];
  let indice = null;
  if (etapa.repetivel) {
    indice = Number(resto.split('.')[0]);
    obj = obj[indice];
    resto = resto.slice(String(indice).length + 1);
  }
  if (!obj) return null;
  const achado = [...S.camposDe(etapa)].find(({ campo }) => campo.chave === resto);
  return achado && S.campoVisivel(achado.campo, obj, contexto(indice), achado.secao) ? etapa : null;
}

async function enviar() {
  if (enviando) return;
  ui.falha.hidden = true;
  const erros = S.validarCadastro(estado, listas, { agora: agora() });
  for (const [caminho, mensagem] of errosExtras) {
    const etapa = extraAindaVale(caminho);
    if (etapa) erros.push({ etapa: etapa.id, campo: caminho, rotulo: '', mensagem });
  }
  if (erros.length) return mostrarErrosDoCadastro(erros, 'Há informações a corrigir antes de enviar.');

  enviando = true;
  atualizarBotoes();
  anunciar('Enviando o cadastro…');
  const corpo = { dados: estado, website: ui.website.value, abertoEm, enviadoEmCliente: Date.now() };
  let resposta = null;
  let retorno = {};
  try {
    resposta = await fetch('/api/enviar', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corpo) });
    retorno = await resposta.json().catch(() => ({}));
  } catch {
    resposta = null;
  }
  enviando = false;
  atualizarBotoes();

  if (resposta?.ok && retorno.ok) return mostrarSucesso();
  if (resposta?.status === 400 && Array.isArray(retorno.erros) && retorno.erros.length) {
    return mostrarErrosDoCadastro(retorno.erros, retorno.erro ?? 'O servidor encontrou dados inválidos.');
  }
  const mensagem = !resposta
    ? 'Não conseguimos falar com o servidor. Verifique sua conexão com a internet.'
    : retorno.erro ?? 'Ocorreu um erro ao enviar.';
  mostrarFalha(mensagem);
}

function mostrarSucesso() {
  const json = S.montarJson(estado, listas, { agora: agora() });
  apagarRascunho();
  ui.form.hidden = true;
  ui.progresso.hidden = true;
  ui.areaLimpar.hidden = true;
  ui.avisoRascunho.hidden = true;
  ui.resultado.replaceChildren(
    el('h2', { id: 'resultado-titulo' }, 'Cadastro enviado!'),
    el('p', {}, 'Recebemos o pré-cadastro de ', el('strong', {}, json.informacoesGerais.nome), '. A secretaria do grupo vai conferir os dados e fazer o registro no Paxtu.'),
    el('p', {}, 'Guarde uma cópia do que foi enviado:'),
    el('div', { class: 'acoes' },
      el('button', { type: 'button', class: 'botao botao-primario', onclick: () => baixarJson(json) }, 'Baixar cópia (JSON)'),
      el('button', { type: 'button', class: 'botao botao-secundario', onclick: () => recomecar() }, 'Preencher outro cadastro')),
  );
  ui.resultado.hidden = false;
  window.scrollTo(0, 0);
  ui.resultado.focus();
  anunciar(`Cadastro de ${json.informacoesGerais.nome} enviado com sucesso.`);
}

function recomecar() {
  apagarRascunho();
  estado = S.estadoInicial();
  tocados.clear();
  etapasComErros.clear();
  errosExtras.clear();
  veioDaRevisao = false;
  ui.resultado.hidden = true;
  ui.avisoRascunho.hidden = true;
  ui.form.hidden = false;
  ui.progresso.hidden = false;
  ui.areaLimpar.hidden = false;
  irPara(0);
}

// ---------------------------------------------------------------------------
// Início
// ---------------------------------------------------------------------------

async function iniciar() {
  try {
    const resposta = await fetch('/shared/paxtu-listas.json');
    if (!resposta.ok) throw new Error();
    listas = await resposta.json();
  } catch {
    ui.carregando.textContent = 'Não foi possível carregar o formulário. Verifique a conexão e recarregue a página.';
    ui.carregando.classList.add('aviso-erro');
    return;
  }

  estado = S.estadoInicial();
  const rascunho = lerRascunho();
  if (rascunho) {
    estado = restaurar(rascunho);
    indiceEtapa = Math.min(Math.max(Number(rascunho.etapa) || 0, 0), ETAPAS.length - 1);
    const quando = new Date(rascunho.salvoEm);
    ui.avisoRascunhoTexto.textContent = Number.isNaN(quando.getTime())
      ? 'Recuperamos o preenchimento salvo neste aparelho.'
      : `Recuperamos o preenchimento salvo neste aparelho em ${quando.toLocaleDateString('pt-BR')} às ${quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;
    ui.avisoRascunho.hidden = false;
  }

  ui.form.addEventListener('submit', (e) => { e.preventDefault(); avancar(); });
  // Enter num campo de texto não deve pular de etapa.
  ui.form.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && !['checkbox', 'radio'].includes(e.target.type)) e.preventDefault();
  });
  // Ao sair de um campo já preenchido, mostra o erro dele (ex.: CPF inválido).
  ui.etapa.addEventListener('focusout', (e) => {
    const r = registros.find((x) => x.tipo === 'campo' && x.wrapper?.contains(e.target) && !x.subErros.size);
    if (r && temValor(r.obter()) && !tocados.has(r.caminho)) {
      tocados.add(r.caminho);
      setTimeout(revalidar, 0);
    }
  });
  ui.voltar.addEventListener('click', () => { veioDaRevisao = false; irPara(Math.max(0, indiceEtapa - 1)); });
  ui.limpar.addEventListener('click', () => {
    if (window.confirm('Apagar todas as respostas deste aparelho e recomeçar?')) recomecar();
  });

  ui.carregando.hidden = true;
  ui.form.hidden = false;
  ui.progresso.hidden = false;
  ui.areaLimpar.hidden = false;
  desenharEtapa();
}

iniciar();
