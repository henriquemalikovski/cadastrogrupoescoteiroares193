import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import * as S from '../shared/schema.js';
import { listas, validarEnvio } from '../server/validar.js';
import { criarApp } from '../server.js';
import { definirTransporte } from '../server/email.js';

// "Hoje" fixo nos testes de schema: 15/10/2026 16:51 em Brasília.
const AGORA = new Date('2026-10-15T19:51:00Z');

// Modelo de JSON das instruções (formato esperado na saída).
const MODELO = {
  versao: '2.0',
  enviadoEm: '2026-10-15T16:51:00-03:00',
  grupo: 'Grupo Escoteiro Arés 193/RS',
  informacoesGerais: {
    nome: 'Fulano de Tal', nomeSocial: null, dataNascimento: '2015-03-20', idadeNoEnvio: 11,
    etnia: 'Não desejo informar', sexo: 'Masculino', estrangeiro: false, paisNascimento: 'BR - Brasil',
    ufNascimento: 'Rio Grande do Sul', cidadeNascimento: 'Venâncio Aires', rg: null, rgOrgaoExpedidor: null,
    cpf: '12345678909', estadoCivil: 'Solteiro(a)', religiao: null, denominacao: null,
    documentoEstrangeiroTipo: null, documentoEstrangeiroNumero: null,
    escolaridade: 'Ensino fundamental incompleto', profissao: '* Estudante *', areaAtuacao: null,
    endereco: { cep: '95800000', logradouro: 'Rua Exemplo', numero: '100', complemento: null, estado: 'Rio Grande do Sul', cidade: 'Venâncio Aires', bairro: 'Centro' },
    email: 'familia@exemplo.com', celular: '51999999999', telefoneSecundario: null, clubes: [],
    radioAmadorIndicativo: null, radioAmadorClasse: null, ramoPretendido: 'Escoteiro',
  },
  responsaveis: [{
    ordem: 1, registroEscoteiro: null, parentesco: 'Mãe', nome: 'Maria de Tal', dataNascimento: '1985-07-10',
    sexo: 'Feminino', estrangeiro: false, paisNascimento: 'BR - Brasil', documentoEstrangeiroNumero: null,
    ufNascimento: 'Rio Grande do Sul', cidadeNascimento: 'Santa Cruz do Sul', estadoCivil: 'Casado(a)',
    cpf: '98765432100', rg: null, rgOrgaoExpedidor: null, email: 'maria@exemplo.com', celular: '51988888888',
    telefoneSecundario: null, mesmoEnderecoDoAssociado: true,
    endereco: { cep: '95800000', logradouro: 'Rua Exemplo', numero: '100', complemento: null, estado: 'Rio Grande do Sul', cidade: 'Venâncio Aires', bairro: 'Centro' },
    escolaridade: 'Ensino superior completo', profissao: 'Professor(a)', localTrabalho: null,
  }],
  fichaMedica: {
    altura: 1.45, peso: 38, tipoSanguineo: 'O', fatorRh: '+',
    usaEquipamentoAuxilio: true, equipamentos: ['Óculos'], equipamentoOutroDescricao: null,
    acompanhamentoMedicoRegular: false, acompanhamentoMedicoDescricao: null,
    problemaCronico: true, problemasCronicos: ['Asma'], problemaCronicoOutroDescricao: null,
    alergias: [{ tipo: 'Medicamentos', descricao: 'Dipirona — urticária' }], condicoes: [], comportamentos: [],
    transtorno: false, transtornoDescricao: null, transtornoUsaMedicacao: null, transtornoMedicacaoDescricao: null,
    transtornoAcompanhamentoProfissional: null, transtornoAcompanhamentoDescricao: null,
    usaMedicamento: true,
    medicamentos: [{ medicamento: 'Salbutamol (bombinha)', usoContinuo: false, informacoes: 'Em caso de crise de asma' }],
    impedimentoFisico: false, impedimentoFisicoDescricao: null, restricaoAlimentar: false, restricaoAlimentarDescricao: null,
    sabeNadar: true, sonambulo: false, planoSaude: true, convenio: 'Unimed', convenioOutro: null, numeroCarteirinha: '0000000000',
    medicoPreferenciaNome: null, medicoPreferenciaTelefone: null, condutaEmergencia: 'Aceitar decisões médicas',
    contatoEmergenciaTipo: 'Pais/responsáveis', contatoEmergenciaNome: null, contatoEmergenciaTelefone: null, observacoes: null,
  },
  consentimentoLgpd: true,
  preenchidoPor: 'Maria de Tal',
  relacaoComAssociado: 'Responsável',
};

// Estado do formulário (como o navegador envia) que deve gerar exatamente o MODELO.
function cadastroValido() {
  const d = S.estadoInicial();
  Object.assign(d.informacoesGerais, {
    nome: 'Fulano de Tal', dataNascimento: '2015-03-20', etnia: 'Não desejo informar', sexo: 'Masculino',
    estrangeiro: false, ufNascimento: 'Rio Grande do Sul', cidadeNascimento: 'Venâncio Aires',
    cpf: '123.456.789-09', escolaridade: 'Ensino fundamental incompleto',
    endereco: { cep: '95800000', logradouro: 'Rua Exemplo', numero: '100', complemento: '', estado: 'Rio Grande do Sul', cidade: 'Venâncio Aires', bairro: 'Centro' },
    email: 'familia@exemplo.com', celular: '51999999999',
  });
  d.responsaveis.push(Object.assign(S.novoItem('responsaveis'), {
    parentesco: 'Mãe', nome: 'Maria de Tal', dataNascimento: '1985-07-10', sexo: 'Feminino', estrangeiro: false,
    ufNascimento: 'Rio Grande do Sul', cidadeNascimento: 'Santa Cruz do Sul', estadoCivil: 'Casado(a)', cpf: '98765432100',
    email: 'maria@exemplo.com', celular: '51988888888', mesmoEnderecoDoAssociado: true,
    escolaridade: 'Ensino superior completo', profissao: 'Professor(a)',
  }));
  Object.assign(d.fichaMedica, {
    altura: '1,45', peso: '38', tipoSanguineo: 'O', fatorRh: '+',
    usaEquipamentoAuxilio: true, equipamentos: ['Óculos'], acompanhamentoMedicoRegular: false,
    problemaCronico: true, problemasCronicos: ['Asma'],
    alergias: [{ tipo: 'Medicamentos', descricao: 'Dipirona — urticária' }],
    _condicoesNenhuma: true, _comportamentosNenhuma: true,
    transtorno: false, usaMedicamento: true,
    medicamentos: [{ medicamento: 'Salbutamol (bombinha)', usoContinuo: false, informacoes: 'Em caso de crise de asma' }],
    impedimentoFisico: false, restricaoAlimentar: false, sabeNadar: true, sonambulo: false,
    planoSaude: true, convenio: 'Unimed', numeroCarteirinha: '0000000000',
    condutaEmergencia: 'Aceitar decisões médicas', contatoEmergenciaTipo: 'Pais/responsáveis',
  });
  Object.assign(d, { consentimentoLgpd: true, preenchidoPor: 'Maria de Tal', relacaoComAssociado: 'Responsável' });
  S.aplicarSugestoes(d, listas, { agora: AGORA }); // estado civil, profissão e ramo pela idade
  return d;
}

function segundoResponsavel() {
  return Object.assign(S.novoItem('responsaveis'), {
    parentesco: 'Pai', nome: 'João de Tal', dataNascimento: '1983-01-05', sexo: 'Masculino', estrangeiro: false,
    ufNascimento: 'Rio Grande do Sul', cidadeNascimento: 'Lajeado', estadoCivil: 'Casado(a)', cpf: '52998224725',
    email: 'joao@exemplo.com', celular: '51977777777', mesmoEnderecoDoAssociado: true,
    escolaridade: 'Ensino médio completo', profissao: 'Motorista',
  });
}

const validar = (d) => S.validarCadastro(d, listas, { agora: AGORA });
const campos = (erros) => erros.map((e) => e.campo);

describe('schema: utilitários', () => {
  test('CPF: dígitos verificadores', () => {
    assert.ok(S.cpfValido('123.456.789-09'));
    assert.ok(S.cpfValido('98765432100'));
    assert.ok(!S.cpfValido('123.456.789-00'));
    assert.ok(!S.cpfValido('111.111.111-11'));
    assert.ok(!S.cpfValido('1234567890'));
  });

  test('data/hora no fuso de Brasília', () => {
    assert.equal(S.isoComFuso(AGORA), '2026-10-15T16:51:00-03:00');
    assert.equal(S.hojeISO(new Date('2026-10-16T02:00:00Z')), '2026-10-15');
  });

  test('idade e sugestão de ramo', () => {
    assert.equal(S.idadeEmAnos('2015-03-20', AGORA), 11);
    assert.equal(S.idadeEmAnos('2008-10-16', AGORA), 17); // faz 18 amanhã
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2020-06-01', AGORA)), 'Filhote');
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2019-10-15', AGORA)), 'Lobinho'); // 7 anos
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2015-03-20', AGORA)), 'Escoteiro');
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2010-01-01', AGORA)), 'Sênior');
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2007-01-01', AGORA)), 'Pioneiro');
    assert.equal(S.sugerirRamo(S.idadeEmMeses('1996-01-01', AGORA)), 'Adulto voluntário');
    assert.equal(S.sugerirRamo(S.idadeEmMeses('2023-01-01', AGORA)), null);
  });

  test('máscaras', () => {
    assert.equal(S.formatarCpf('12345678909'), '123.456.789-09');
    assert.equal(S.formatarCep('95800000'), '95800-000');
    assert.equal(S.formatarTelefone('51999999999'), '(51) 99999-9999');
    assert.equal(S.formatarTelefone('5133334444'), '(51) 3333-4444');
  });

  test('nome do arquivo sem acentos e com hífens', () => {
    assert.equal(S.nomeArquivo({ informacoesGerais: { nome: 'João Ávila da Conceição' }, enviadoEm: '2026-10-15T16:51:00-03:00' }),
      'cadastro_joao-avila-da-conceicao_2026-10-15.json');
  });
});

describe('schema: cadastro completo', () => {
  test('cadastro válido não tem erros', () => {
    assert.deepEqual(validar(cadastroValido()), []);
  });

  test('JSON gerado é idêntico ao modelo (valores e ordem das chaves)', () => {
    const json = S.montarJson(cadastroValido(), listas, { agora: AGORA });
    assert.equal(JSON.stringify(json, null, 2), JSON.stringify(MODELO, null, 2));
  });

  test('todos os textos de lista no JSON existem em paxtu-listas.json', () => {
    const d = cadastroValido();
    d.responsaveis.push(segundoResponsavel());
    const json = S.montarJson(d, listas, { agora: AGORA });
    const verificar = (secoes, objeto) => {
      for (const { campos: lista } of secoes) {
        for (const campo of lista) {
          if (!campo.lista) continue;
          const v = S.obterCaminho(objeto, campo.chave);
          const valores = Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x.tipo)) : [v];
          for (const valor of valores.filter((x) => x !== null)) {
            assert.ok(listas[campo.lista].includes(valor), `${campo.chave}: "${valor}" não está em ${campo.lista}`);
          }
        }
      }
    };
    verificar(S.etapaPorId('informacoesGerais').secoes, json.informacoesGerais);
    json.responsaveis.forEach((r) => verificar(S.etapaPorId('responsaveis').secoes, r));
    verificar(S.etapaPorId('fichaMedica').secoes, json.fichaMedica);
  });

  test('campos ocultos vão como null/[] mesmo que tenham sido preenchidos antes', () => {
    const d = cadastroValido();
    Object.assign(d.fichaMedica, { transtorno: false, transtornoDescricao: 'apagar', transtornoUsaMedicacao: true });
    Object.assign(d.fichaMedica, { usaMedicamento: false });
    d.informacoesGerais.documentoEstrangeiroNumero = 'X123';
    const json = S.montarJson(d, listas, { agora: AGORA });
    assert.equal(json.fichaMedica.transtornoDescricao, null);
    assert.equal(json.fichaMedica.transtornoUsaMedicacao, null);
    assert.deepEqual(json.fichaMedica.medicamentos, []);
    assert.equal(json.informacoesGerais.documentoEstrangeiroNumero, null);
  });

  test('chaves só da interface (começando com _) não vão para o JSON', () => {
    const texto = JSON.stringify(S.montarJson(cadastroValido(), listas, { agora: AGORA }));
    assert.ok(!texto.includes('"_'));
  });
});

describe('schema: regras de validação', () => {
  test('menor de 18 sem responsável → erro', () => {
    const d = cadastroValido();
    d.responsaveis = [];
    assert.ok(campos(validar(d)).includes('responsaveis'));
  });

  test('mais de 2 responsáveis → erro', () => {
    const d = cadastroValido();
    d.responsaveis.push(segundoResponsavel(), segundoResponsavel());
    const erros = validar(d);
    assert.ok(erros.some((e) => e.campo === 'responsaveis' && /máximo/.test(e.mensagem)));
  });

  test('CPF do responsável igual ao do associado ou ao do outro responsável → erro', () => {
    const d = cadastroValido();
    d.responsaveis[0].cpf = '12345678909';
    assert.ok(campos(validar(d)).includes('responsaveis.0.cpf'));
    const d2 = cadastroValido();
    d2.responsaveis.push({ ...segundoResponsavel(), cpf: '98765432100' });
    assert.ok(campos(validar(d2)).includes('responsaveis.1.cpf'));
  });

  test('alergia, condição ou comportamento marcado sem descrição → erro pedindo descrição', () => {
    const d = cadastroValido();
    d.fichaMedica.alergias = [{ tipo: 'Medicamentos', descricao: '  ' }];
    d.fichaMedica._condicoesNenhuma = false;
    d.fichaMedica.condicoes = [{ tipo: 'Autismo', descricao: '' }];
    d.fichaMedica._comportamentosNenhuma = false;
    d.fichaMedica.comportamentos = [{ tipo: 'Tendência a fugas', descricao: '' }];
    const erros = validar(d);
    const indice = (lista, tipo) => listas[lista].indexOf(tipo);
    assert.ok(campos(erros).includes(`fichaMedica.alergias.opcao${indice('alergias', 'Medicamentos')}`));
    assert.ok(campos(erros).includes(`fichaMedica.condicoes.opcao${indice('condicoes', 'Autismo')}`));
    assert.ok(campos(erros).includes(`fichaMedica.comportamentos.opcao${indice('comportamentos', 'Tendência a fugas')}`));
    assert.ok(erros.every((e) => !e.campo.includes('opcao') || /Descreva/.test(e.mensagem)));
  });

  test('alergias sem resposta (nem item nem "Nenhuma") → erro no formulário', () => {
    const d = cadastroValido();
    d.fichaMedica.alergias = [];
    d.fichaMedica._alergiasNenhuma = false;
    assert.ok(campos(validar(d)).includes('fichaMedica.alergias'));
    d.fichaMedica._alergiasNenhuma = true;
    assert.ok(!campos(validar(d)).includes('fichaMedica.alergias'));
  });

  test('plano de saúde "Outros" sem informar o convênio → erro', () => {
    const d = cadastroValido();
    d.fichaMedica.convenio = 'Outros';
    assert.ok(campos(validar(d)).includes('fichaMedica.convenioOutro'));
    d.fichaMedica.convenioOutro = 'Plano da empresa';
    assert.deepEqual(validar(d), []);
  });

  test('perguntas Sim/Não da ficha médica são obrigatórias', () => {
    const d = cadastroValido();
    d.fichaMedica.sabeNadar = null;
    assert.ok(campos(validar(d)).includes('fichaMedica.sabeNadar'));
  });

  test('"Sim" exige a descrição e o medicamento', () => {
    const d = cadastroValido();
    Object.assign(d.fichaMedica, { restricaoAlimentar: true, medicamentos: [] });
    const c = campos(validar(d));
    assert.ok(c.includes('fichaMedica.restricaoAlimentarDescricao'));
    assert.ok(c.includes('fichaMedica.medicamentos'));
  });

  test('adulto de 30 anos sem responsáveis: etapa 2 dispensada e contato "Outros" exigido', () => {
    const d = cadastroValido();
    d.informacoesGerais.dataNascimento = '1996-05-10';
    d.responsaveis = [];
    d.relacaoComAssociado = 'O próprio associado';
    const alterados = S.aplicarSugestoes(d, listas, { agora: AGORA });
    assert.ok(alterados.includes('informacoesGerais.ramoPretendido'));
    assert.equal(d.informacoesGerais.ramoPretendido, 'Adulto voluntário');
    // "Pais/responsáveis" já estava escolhido, então a sugestão não o troca sozinha: deve dar erro.
    assert.ok(campos(validar(d)).includes('fichaMedica.contatoEmergenciaTipo'));
    assert.ok(!campos(validar(d)).includes('responsaveis'));
    d.fichaMedica.contatoEmergenciaTipo = 'Outros';
    const c = campos(validar(d));
    assert.ok(c.includes('fichaMedica.contatoEmergenciaNome'));
    assert.ok(c.includes('fichaMedica.contatoEmergenciaTelefone'));
    Object.assign(d.fichaMedica, { contatoEmergenciaNome: 'Ana Amiga', contatoEmergenciaTelefone: '51966666666' });
    // Adulto: "* Estudante *" e "Solteiro(a)" deixam de ser sugeridos e voltam a ficar em branco.
    assert.equal(d.informacoesGerais.profissao, '');
    d.informacoesGerais.profissao = 'Engenheiro(a)';
    d.informacoesGerais.estadoCivil = 'Casado(a)';
    d.informacoesGerais.escolaridade = 'Ensino superior completo';
    assert.deepEqual(validar(d), []);
  });

  test('sem responsáveis, a sugestão de contato é "Outros"', () => {
    const d = S.estadoInicial();
    d.informacoesGerais.dataNascimento = '1990-01-01';
    S.aplicarSugestoes(d, listas, { agora: AGORA });
    assert.equal(d.fichaMedica.contatoEmergenciaTipo, 'Outros');
  });

  test('CPF, e-mail, celular e CEP inválidos → mensagens corretas', () => {
    const d = cadastroValido();
    Object.assign(d.informacoesGerais, { cpf: '12345678900', email: 'familia@', celular: '5133334444' });
    d.informacoesGerais.endereco.cep = '9580';
    const erros = validar(d);
    const msg = (c) => erros.find((e) => e.campo === c)?.mensagem;
    assert.match(msg('informacoesGerais.cpf'), /CPF inválido/);
    assert.match(msg('informacoesGerais.email'), /E-mail inválido/);
    assert.match(msg('informacoesGerais.celular'), /Celular inválido/);
    assert.match(msg('informacoesGerais.endereco.cep'), /CEP inválido/);
  });

  test('data de nascimento no futuro → erro', () => {
    const d = cadastroValido();
    d.informacoesGerais.dataNascimento = '2026-10-16';
    assert.match(validar(d).find((e) => e.campo === 'informacoesGerais.dataNascimento').mensagem, /futuro/);
  });

  test('texto de lista diferente do Paxtu → erro', () => {
    const d = cadastroValido();
    d.informacoesGerais.estadoCivil = 'solteiro(a)';
    d.fichaMedica.equipamentos = ['oculos'];
    const c = campos(validar(d));
    assert.ok(c.includes('informacoesGerais.estadoCivil'));
    assert.ok(c.includes('fichaMedica.equipamentos'));
  });

  test('estrangeiro exige documento', () => {
    const d = cadastroValido();
    d.informacoesGerais.estrangeiro = true;
    const c = campos(validar(d));
    assert.ok(c.includes('informacoesGerais.documentoEstrangeiroTipo'));
    assert.ok(c.includes('informacoesGerais.documentoEstrangeiroNumero'));
  });

  test('dados ausentes ou em formato errado não quebram a validação', () => {
    assert.equal(validar(null).length, 1);
    assert.ok(validar({}).length > 0);
    assert.ok(validar({ informacoesGerais: [], responsaveis: 'x', fichaMedica: 1 }).length > 0);
    assert.ok(validarEnvio({ responsaveis: [null, 3] }).length > 0);
  });
});

describe('API POST /api/enviar', () => {
  let servidor;
  let base;
  const enviados = [];
  let falharEmail = false;

  before(async () => {
    definirTransporte({
      sendMail: async (msg) => {
        if (falharEmail) throw Object.assign(new Error('Invalid login'), { code: 'EAUTH' });
        enviados.push(msg);
        return {};
      },
    });
    const app = criarApp({ limiteEnvios: 100 });
    await new Promise((ok) => { servidor = app.listen(0, ok); });
    base = `http://127.0.0.1:${servidor.address().port}`;
  });

  after(() => servidor.close());

  const corpo = (dados, extra = {}) => ({ dados, website: '', abertoEm: 1_000_000, enviadoEmCliente: 1_060_000, ...extra });
  const post = (body, url = base) => fetch(`${url}/api/enviar`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });

  test('associado de 11 anos com 2 responsáveis, alergia e medicamento → e-mail com anexo e aviso de saúde', async () => {
    const d = cadastroValido();
    d.responsaveis.push(segundoResponsavel());
    const resposta = await post(corpo(d));
    assert.equal(resposta.status, 200);
    assert.deepEqual(await resposta.json(), { ok: true });
    const msg = enviados.at(-1);
    assert.equal(msg.subject, 'Novo associado: Fulano de Tal — Escoteiro');
    assert.match(msg.text, /ATENÇÃO/);
    assert.match(msg.text, /Maria de Tal \(Mãe\)/);
    assert.match(msg.text, /\(51\) 98888-8888/);
    assert.ok(!msg.text.includes('Dipirona') && !msg.html.includes('Dipirona'), 'dados médicos não podem ir no corpo');
    assert.equal(msg.attachments.length, 1);
    assert.match(msg.attachments[0].filename, /^cadastro_fulano-de-tal_\d{4}-\d{2}-\d{2}\.json$/);
    const anexo = JSON.parse(msg.attachments[0].content.toString('utf8'));
    assert.equal(anexo.responsaveis.length, 2);
    assert.equal(anexo.fichaMedica.alergias[0].descricao, 'Dipirona — urticária');
    assert.ok(msg.attachments[0].content.toString('utf8').includes('\n  "versao"'), 'JSON indentado com 2 espaços');
  });

  test('sem nada de saúde a destacar → sem aviso no corpo', async () => {
    const d = cadastroValido();
    Object.assign(d.fichaMedica, { alergias: [], _alergiasNenhuma: true, usaMedicamento: false, problemaCronico: false });
    await post(corpo(d));
    assert.ok(!enviados.at(-1).text.includes('ATENÇÃO'));
  });

  test('3 responsáveis direto na API → 400', async () => {
    const d = cadastroValido();
    d.responsaveis.push(segundoResponsavel(), { ...segundoResponsavel(), cpf: '11144477735' });
    const antes = enviados.length;
    const resposta = await post(corpo(d));
    assert.equal(resposta.status, 400);
    const json = await resposta.json();
    assert.ok(json.erros.some((e) => e.campo === 'responsaveis'));
    assert.equal(enviados.length, antes);
  });

  test('dados inválidos → 400 com lista de erros', async () => {
    const d = cadastroValido();
    d.informacoesGerais.cpf = '000';
    const resposta = await post(corpo(d));
    assert.equal(resposta.status, 400);
    const json = await resposta.json();
    assert.ok(json.erros.some((e) => e.campo === 'informacoesGerais.cpf'));
  });

  test('honeypot preenchido → 200 sem enviar e-mail', async () => {
    const antes = enviados.length;
    const resposta = await post(corpo(cadastroValido(), { website: 'http://spam' }));
    assert.equal(resposta.status, 200);
    assert.equal(enviados.length, antes);
  });

  test('enviado em menos de 5 segundos → rejeitado', async () => {
    const resposta = await post(corpo(cadastroValido(), { enviadoEmCliente: 1_002_000 }));
    assert.equal(resposta.status, 400);
    assert.match((await resposta.json()).erro, /rápido/);
  });

  test('falha no SMTP → 500 com mensagem genérica', async () => {
    falharEmail = true;
    try {
      const resposta = await post(corpo(cadastroValido()));
      assert.equal(resposta.status, 500);
      const json = await resposta.json();
      assert.equal(json.ok, false);
      assert.ok(!JSON.stringify(json).includes('EAUTH') && !JSON.stringify(json).includes('Invalid login'));
    } finally {
      falharEmail = false;
    }
  });

  test('sem Content-Type JSON → 415; outro método → 405', async () => {
    const r1 = await fetch(`${base}/api/enviar`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'oi' });
    assert.equal(r1.status, 415);
    const r2 = await fetch(`${base}/api/enviar`);
    assert.equal(r2.status, 405);
  });

  test('JSON malformado → 400; corpo acima de 100 kB → 413', async () => {
    const r1 = await fetch(`${base}/api/enviar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{x' });
    assert.equal(r1.status, 400);
    const r2 = await post({ grande: 'x'.repeat(110 * 1024) });
    assert.equal(r2.status, 413);
  });

  test('limite de envios por IP → 429 em português', async () => {
    const app = criarApp({ limiteEnvios: 1 });
    const outro = await new Promise((ok) => { const s = app.listen(0, () => ok(s)); });
    const url = `http://127.0.0.1:${outro.address().port}`;
    try {
      await post(corpo(cadastroValido()), url);
      const resposta = await post(corpo(cadastroValido()), url);
      assert.equal(resposta.status, 429);
      assert.match((await resposta.json()).erro, /Aguarde/);
    } finally {
      outro.close();
    }
  });

  test('rotas: /saude, /, /privacidade, /shared/* e cabeçalhos de segurança', async () => {
    const saude = await fetch(`${base}/saude`);
    assert.equal(await saude.text(), 'ok');
    const inicio = await fetch(`${base}/`);
    assert.match(inicio.headers.get('content-security-policy'), /connect-src 'self' https:\/\/viacep\.com\.br https:\/\/servicodados\.ibge\.gov\.br/);
    assert.equal(inicio.headers.get('x-content-type-options'), 'nosniff');
    assert.ok(inicio.headers.get('referrer-policy'));
    assert.match(await inicio.text(), /Pré-cadastro de novo associado/);
    assert.equal((await fetch(`${base}/privacidade`)).status, 200);
    const schema = await fetch(`${base}/shared/schema.js`);
    assert.match(schema.headers.get('content-type'), /javascript/);
    const lista = await fetch(`${base}/shared/paxtu-listas.json`);
    assert.deepEqual(await lista.json(), listas);
    assert.equal((await fetch(`${base}/app.js`)).status, 200);
  });

  test('nenhum e-mail ou credencial no código do front-end', async () => {
    const { readFileSync } = await import('node:fs');
    for (const arquivo of ['public/app.js', 'public/index.html', 'public/privacidade.html', 'shared/schema.js']) {
      const texto = readFileSync(new URL(`../${arquivo}`, import.meta.url), 'utf8');
      assert.ok(!/[\w.+-]+@[\w-]+\.[\w.]+/.test(texto.replace(/nome@exemplo\.com/g, '')), `${arquivo} contém e-mail`);
      assert.ok(!/SMTP_|EMAIL_DESTINO/.test(texto), `${arquivo} referencia variável secreta`);
    }
  });
});
