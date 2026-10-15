// Definição única do pré-cadastro: campos, opções, mapeamento para o Paxtu,
// validação e montagem do JSON final.
//
// Este arquivo é um módulo ES usado nos DOIS lados:
//   - no navegador, importado de /shared/schema.js por public/app.js;
//   - no servidor, importado por server/validar.js.
// Assim a validação é idêntica no formulário e no POST /api/enviar.
//
// As listas de opções NÃO ficam aqui: vêm de shared/paxtu-listas.json (cópia
// do Paxtu) e são passadas como parâmetro `listas` às funções.
//
// Para alterar um campo, edite apenas a constante ETAPAS abaixo. Cada campo tem:
//   chave        caminho no JSON (relativo ao objeto da etapa; pode ser "endereco.cep").
//                Chaves que começam com "_" são só da interface e não vão para o JSON.
//   rotulo       texto exibido.
//   tipo         texto | textoLongo | data | cpf | email | telefone | cep | numero |
//                lista (select) | busca (select com busca) | cidade | simNao | opcao (radio) |
//                caixas (checkboxes) | caixasDescricao (checkbox + "Descreva") |
//                marcar (checkbox único) | tabela (linhas repetíveis) | computado
//   obrigatorio  true ou função (objeto, ctx) => boolean.
//   visivelSe    função (objeto, ctx) => boolean. Campo oculto não é validado e vai como null/[].
//   lista        nome da lista em paxtu-listas.json; ou `opcoes` com a lista em linha.
//   paxtu        atributo `name` do campo na tela do Paxtu (para futura importação).
//   sugestao     função (objeto, ctx) => valor sugerido automaticamente (o usuário pode trocar).
//
// `ctx` traz: raiz (todos os dados), listas, agora, idade, idadeMeses, menor,
// temResponsaveis e indice (posição do item, nas etapas repetíveis).

export const VERSAO_JSON = '2.0';
export const NOME_GRUPO = 'Grupo Escoteiro Arés 193/RS';
export const FUSO = 'America/Sao_Paulo';
export const MAX_RESPONSAVEIS = 2;
export const MAIORIDADE = 18;

// Siglas usadas pelo ViaCEP e pela API do IBGE; os nomes são os da lista `uf` do Paxtu.
export const SIGLAS_UF = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo',
  SE: 'Sergipe', TO: 'Tocantins',
};
export const UF_ESTRANGEIRO = 'Estrangeiro';
export const PAIS_PADRAO = 'BR - Brasil';

// Ramos (dado só do grupo, não existe no Paxtu). Faixas em meses de idade.
export const RAMOS = ['Filhote', 'Lobinho', 'Escoteiro', 'Sênior', 'Pioneiro', 'Adulto voluntário'];
const FAIXAS_RAMO = [
  [60, 78, 'Filhote'],      // 5 a 6½ anos
  [78, 132, 'Lobinho'],     // 6½ a 10 anos
  [132, 180, 'Escoteiro'],  // 11 a 14 anos
  [180, 216, 'Sênior'],     // 15 a 17 anos
  [216, 252, 'Pioneiro'],   // 18 a 20 anos
  [252, Infinity, 'Adulto voluntário'], // a partir de 21
];

export function sugerirRamo(idadeMeses) {
  if (idadeMeses === null || idadeMeses === undefined) return null;
  const faixa = FAIXAS_RAMO.find(([min, max]) => idadeMeses >= min && idadeMeses < max);
  return faixa ? faixa[2] : null;
}

const SEM_RELIGIAO = ['Não informado', 'Sem Religião'];
const simEm = (chave) => (o) => o[chave] === true;
const marcado = (chave, opcao) => (o) => Array.isArray(o[chave]) && o[chave].includes(opcao);

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------

export const ETAPAS = [
  {
    id: 'informacoesGerais',
    caminho: 'informacoesGerais',
    titulo: 'Informações gerais',
    descricao: 'Dados do novo associado: a criança, o jovem ou o adulto que vai participar do grupo.',
    secoes: [
      {
        campos: [
          { chave: 'nome', rotulo: 'Nome completo do associado', tipo: 'texto', obrigatorio: true, autocomplete: 'off', paxtu: 'associate-name' },
        ],
      },
      {
        titulo: 'Informações pessoais',
        campos: [
          { chave: 'nomeSocial', rotulo: 'Apelido ou nome social', tipo: 'texto', autocomplete: 'off', paxtu: 'associate-short-name' },
          { chave: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'data', obrigatorio: true, curto: true, paxtu: 'birth-date' },
          {
            chave: 'idadeNoEnvio', rotulo: 'Idade', tipo: 'computado', curto: true,
            calcular: (o, ctx) => idadeEmAnos(o.dataNascimento, ctx.agora),
            exibir: (v) => (v === null ? 'Informe a data de nascimento' : `${v} ${v === 1 ? 'ano' : 'anos'}`),
          },
          { chave: 'etnia', rotulo: 'Etnia', tipo: 'lista', lista: 'etnia', obrigatorio: true, paxtu: 'skin-color' },
          { chave: 'sexo', rotulo: 'Sexo', tipo: 'opcao', lista: 'sexoAssociado', obrigatorio: true, emLinha: true, paxtu: 'gender' },
          { chave: 'estrangeiro', rotulo: 'É estrangeiro?', tipo: 'simNao', obrigatorio: true, padrao: false, paxtu: 'foreigner' },
          { chave: 'paisNascimento', rotulo: 'País de nascimento', tipo: 'busca', lista: 'paises', obrigatorio: true, padrao: PAIS_PADRAO, paxtu: 'birth-country' },
          {
            chave: 'ufNascimento', rotulo: 'UF de nascimento', tipo: 'lista', lista: 'uf', obrigatorio: true, curto: true, paxtu: 'birth-district-code',
            sugestao: (o) => (o.paisNascimento && o.paisNascimento !== PAIS_PADRAO ? UF_ESTRANGEIRO : null),
          },
          { chave: 'cidadeNascimento', rotulo: 'Cidade de nascimento', tipo: 'cidade', ufDe: 'ufNascimento', obrigatorio: true, curto: true, paxtu: 'birth-city' },
          { chave: 'rg', rotulo: 'RG', tipo: 'texto', curto: true, autocomplete: 'off', maximo: 20, paxtu: 'rg' },
          { chave: 'rgOrgaoExpedidor', rotulo: 'Órgão expedidor', tipo: 'texto', curto: true, maximo: 30, dica: 'Ex.: SSP/RS', paxtu: 'rg-dispatcher' },
          { chave: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, curto: true, paxtu: 'cpf' },
          {
            chave: 'estadoCivil', rotulo: 'Estado civil', tipo: 'lista', lista: 'estadoCivil', obrigatorio: true, curto: true, paxtu: 'marital-status',
            sugestao: (o, ctx) => (ctx.idade !== null && ctx.idade < MAIORIDADE ? 'Solteiro(a)' : null),
          },
          { chave: 'religiao', rotulo: 'Religião', tipo: 'lista', lista: 'religiao', paxtu: 'religion' },
          {
            chave: 'denominacao', rotulo: 'Denominação', tipo: 'texto', paxtu: 'denomination',
            dica: 'Igreja, comunidade ou linha religiosa, se quiser informar.',
            visivelSe: (o) => Boolean(o.religiao) && !SEM_RELIGIAO.includes(o.religiao),
          },
        ],
      },
      {
        titulo: 'Dados de estrangeiro',
        visivelSe: simEm('estrangeiro'),
        campos: [
          { chave: 'documentoEstrangeiroTipo', rotulo: 'Tipo de documento', tipo: 'opcao', lista: 'documentoEstrangeiro', obrigatorio: true, emLinha: true, paxtu: 'foreign-document-type' },
          { chave: 'documentoEstrangeiroNumero', rotulo: 'Número do documento', tipo: 'texto', obrigatorio: true, maximo: 30, paxtu: 'foreign-document-number' },
        ],
      },
      {
        titulo: 'Informações profissionais e acadêmicas',
        campos: [
          { chave: 'escolaridade', rotulo: 'Escolaridade', tipo: 'lista', lista: 'escolaridade', obrigatorio: true, paxtu: 'education' },
          {
            chave: 'profissao', rotulo: 'Profissão', tipo: 'busca', lista: 'profissoes', obrigatorio: true, paxtu: 'occupation',
            dica: 'Digite para buscar. Para crianças e jovens, use "* Estudante *".',
            sugestao: (o, ctx) => (ctx.idade !== null && ctx.idade < MAIORIDADE ? '* Estudante *' : null),
          },
          { chave: 'areaAtuacao', rotulo: 'Área de atuação', tipo: 'texto', dica: 'Local de trabalho (opcional).', paxtu: 'workplace' },
        ],
      },
      {
        titulo: 'Endereço e dados de contato',
        campos: [
          {
            chave: 'endereco.cep', rotulo: 'CEP do endereço residencial', tipo: 'cep', obrigatorio: true, curto: true, paxtu: 'address-cep',
            preencher: { logradouro: 'endereco.logradouro', bairro: 'endereco.bairro', estado: 'endereco.estado', cidade: 'endereco.cidade' },
          },
          { chave: 'endereco.logradouro', rotulo: 'Endereço', tipo: 'texto', obrigatorio: true, autocomplete: 'address-line1', dica: 'Rua, avenida…', paxtu: 'address' },
          { chave: 'endereco.numero', rotulo: 'Número', tipo: 'texto', obrigatorio: true, curto: true, maximo: 20, paxtu: 'address-number' },
          { chave: 'endereco.complemento', rotulo: 'Complemento', tipo: 'texto', curto: true, autocomplete: 'address-line2', paxtu: 'address-addon' },
          { chave: 'endereco.estado', rotulo: 'Estado', tipo: 'lista', lista: 'uf', obrigatorio: true, curto: true, paxtu: 'address-district-code' },
          { chave: 'endereco.cidade', rotulo: 'Cidade', tipo: 'cidade', ufDe: 'endereco.estado', obrigatorio: true, curto: true, paxtu: 'address-city' },
          { chave: 'endereco.bairro', rotulo: 'Bairro', tipo: 'texto', obrigatorio: true, autocomplete: 'address-level3', paxtu: 'address-neighborhood' },
          { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, paxtu: 'email' },
          { chave: 'celular', rotulo: 'Celular', tipo: 'telefone', celular: true, obrigatorio: true, curto: true, paxtu: 'cellphone-number' },
          { chave: 'telefoneSecundario', rotulo: 'Telefone secundário', tipo: 'telefone', curto: true, paxtu: 'secondary-phone' },
        ],
      },
      {
        titulo: 'Informações adicionais',
        campos: [
          {
            chave: 'clubes', rotulo: 'Participa de algum destes clubes?', tipo: 'caixas', lista: 'clubes',
            paxtu: { Lions: 'club-lions', 'Loja Maçônica': 'club-maconica', 'Rotary Clube': 'club-rotary', Outros: 'club-outros' },
          },
          { chave: 'radioAmadorIndicativo', rotulo: 'Indicativo de Chamada de Rádio Amador', tipo: 'texto', curto: true, maximo: 20, paxtu: 'call-sign' },
          {
            chave: 'radioAmadorClasse', rotulo: 'Classe de Rádio Amador', tipo: 'lista', lista: 'classeRadioAmador', curto: true, paxtu: 'radio-class',
            visivelSe: (o) => typeof o.radioAmadorIndicativo === 'string' && o.radioAmadorIndicativo.trim() !== '',
          },
        ],
      },
      {
        titulo: 'Dado só para o grupo',
        soGrupo: true,
        campos: [
          {
            chave: 'ramoPretendido', rotulo: 'Ramo pretendido', tipo: 'opcao', opcoes: RAMOS,
            dica: 'Sugerido pela idade. Pode alterar se for o caso.',
            sugestao: (o, ctx) => sugerirRamo(ctx.idadeMeses),
          },
        ],
      },
    ],
  },

  {
    id: 'responsaveis',
    caminho: 'responsaveis',
    titulo: 'Responsáveis',
    descricao: 'Pais ou tutores legais do associado. No máximo 2 responsáveis.',
    repetivel: {
      maximo: MAX_RESPONSAVEIS,
      minimo: (ctx) => (ctx.menor ? 1 : 0),
      rotuloItem: (i) => (i === 0 ? 'Primeiro responsável' : 'Segundo responsável'),
    },
    // Paxtu: os nomes abaixo são os do primeiro responsável.
    secoes: [
      {
        titulo: 'Registro nos Escoteiros',
        campos: [
          { chave: '_temRegistro', rotulo: 'Este responsável já tem registro nos Escoteiros?', tipo: 'simNao', padrao: false },
          {
            chave: 'registroEscoteiro', rotulo: 'Número de registro', tipo: 'texto', obrigatorio: true, curto: true,
            inputmode: 'numeric', maximo: 20, formato: /^[0-9][0-9.\-\s]*$/, mensagemFormato: 'Use apenas números.',
            visivelSe: simEm('_temRegistro'),
          },
        ],
      },
      {
        titulo: 'Dados pessoais',
        campos: [
          { chave: 'parentesco', rotulo: 'Parentesco', tipo: 'opcao', lista: 'parentesco', obrigatorio: true, emLinha: true, paxtu: 'primary-responsible-kinship' },
          { chave: 'nome', rotulo: 'Nome completo', tipo: 'texto', obrigatorio: true, autocomplete: 'name', paxtu: 'responsible-name' },
          { chave: 'dataNascimento', rotulo: 'Data de nascimento', tipo: 'data', obrigatorio: true, curto: true, paxtu: 'responsible-birth-date' },
          { chave: 'sexo', rotulo: 'Sexo', tipo: 'opcao', lista: 'sexoResponsavel', obrigatorio: true, emLinha: true, paxtu: 'primary-responsible-gender' },
          { chave: 'estrangeiro', rotulo: 'É estrangeiro?', tipo: 'simNao', obrigatorio: true, padrao: false, paxtu: 'foreignerResponsible' },
          { chave: 'paisNascimento', rotulo: 'País de nascimento', tipo: 'busca', lista: 'paises', obrigatorio: true, padrao: PAIS_PADRAO, paxtu: 'responsible-birth-country' },
          {
            chave: 'documentoEstrangeiroNumero', rotulo: 'RNE/CRNM ou passaporte', tipo: 'texto', obrigatorio: true, maximo: 30,
            visivelSe: simEm('estrangeiro'), paxtu: 'responsible-foreign-document-number',
          },
          {
            chave: 'ufNascimento', rotulo: 'UF de nascimento', tipo: 'lista', lista: 'uf', obrigatorio: true, curto: true, paxtu: 'responsible-birth-district-code',
            sugestao: (o) => (o.paisNascimento && o.paisNascimento !== PAIS_PADRAO ? UF_ESTRANGEIRO : null),
          },
          { chave: 'cidadeNascimento', rotulo: 'Cidade de nascimento', tipo: 'cidade', ufDe: 'ufNascimento', obrigatorio: true, curto: true, paxtu: 'responsible-birth-city' },
          { chave: 'estadoCivil', rotulo: 'Estado civil', tipo: 'lista', lista: 'estadoCivil', obrigatorio: true, curto: true, paxtu: 'responsible-marital-status' },
          { chave: 'cpf', rotulo: 'CPF', tipo: 'cpf', obrigatorio: true, curto: true, paxtu: 'responsible-cpf', validar: validarCpfUnico },
          { chave: 'rg', rotulo: 'RG', tipo: 'texto', curto: true, maximo: 20, paxtu: 'responsible-rg' },
          { chave: 'rgOrgaoExpedidor', rotulo: 'Órgão expedidor', tipo: 'texto', curto: true, maximo: 30, dica: 'Ex.: SSP/RS', paxtu: 'responsible-rg-dispatcher' },
        ],
      },
      {
        titulo: 'Contato',
        campos: [
          { chave: 'email', rotulo: 'E-mail', tipo: 'email', obrigatorio: true, aviso: 'É neste e-mail que chegará a senha de acesso ao Paxtu.', paxtu: 'responsible-email' },
          { chave: 'celular', rotulo: 'Celular', tipo: 'telefone', celular: true, obrigatorio: true, curto: true, paxtu: 'responsible-cellphone-number' },
          { chave: 'telefoneSecundario', rotulo: 'Telefone secundário', tipo: 'telefone', curto: true, paxtu: 'responsible-secondary-phone' },
        ],
      },
      {
        titulo: 'Endereço',
        campos: [
          { chave: 'mesmoEnderecoDoAssociado', rotulo: 'Mesmo endereço do associado', tipo: 'marcar' },
          {
            chave: 'endereco.cep', rotulo: 'CEP', tipo: 'cep', obrigatorio: true, curto: true, paxtu: 'responsible-address-cep',
            preencher: { logradouro: 'endereco.logradouro', bairro: 'endereco.bairro', estado: 'endereco.estado', cidade: 'endereco.cidade' },
          },
          { chave: 'endereco.estado', rotulo: 'Estado', tipo: 'lista', lista: 'uf', obrigatorio: true, curto: true, paxtu: 'responsible-address-district' },
          { chave: 'endereco.cidade', rotulo: 'Cidade', tipo: 'cidade', ufDe: 'endereco.estado', obrigatorio: true, curto: true, paxtu: 'responsible-address-city' },
          { chave: 'endereco.logradouro', rotulo: 'Endereço', tipo: 'texto', obrigatorio: true, autocomplete: 'address-line1', paxtu: 'responsible-address' },
          { chave: 'endereco.bairro', rotulo: 'Bairro', tipo: 'texto', autocomplete: 'address-level3', paxtu: 'responsible-address-neighborhood' },
          { chave: 'endereco.numero', rotulo: 'Número', tipo: 'texto', obrigatorio: true, curto: true, maximo: 20, paxtu: 'responsible-address-number' },
          { chave: 'endereco.complemento', rotulo: 'Complemento', tipo: 'texto', curto: true, autocomplete: 'address-line2', paxtu: 'responsible-address-addon' },
        ].map((c) => (c.chave.startsWith('endereco.') ? { ...c, visivelSe: (o) => o.mesmoEnderecoDoAssociado !== true } : c)),
      },
      {
        titulo: 'Escolaridade e profissão',
        campos: [
          { chave: 'escolaridade', rotulo: 'Escolaridade', tipo: 'lista', lista: 'escolaridade', obrigatorio: true, paxtu: 'responsible-education' },
          { chave: 'profissao', rotulo: 'Profissão', tipo: 'busca', lista: 'profissoes', obrigatorio: true, dica: 'Digite para buscar.', paxtu: 'responsible-occupation' },
          { chave: 'localTrabalho', rotulo: 'Local de trabalho', tipo: 'texto', paxtu: 'responsible-workplace' },
        ],
      },
    ],
    // O endereço "mesmo do associado" é copiado da etapa 1 no JSON final.
    posProcessar(item, saida) {
      item.endereco = ordenarEndereco(item.mesmoEnderecoDoAssociado === true
        ? { ...saida.informacoesGerais.endereco }
        : item.endereco);
    },
  },

  {
    id: 'fichaMedica',
    caminho: 'fichaMedica',
    titulo: 'Ficha médica',
    descricao: 'Estas informações são usadas apenas para a segurança do associado nas atividades.',
    secoes: [
      {
        titulo: 'Dados biométricos',
        campos: [
          { chave: 'altura', rotulo: 'Altura (m)', tipo: 'numero', minimo: 0.3, maximo: 2.5, unidade: ' m', curto: true, dica: 'Em metros. Ex.: 1,45', paxtu: 'associate-height' },
          { chave: 'peso', rotulo: 'Peso (kg)', tipo: 'numero', minimo: 2, maximo: 300, unidade: ' kg', curto: true, dica: 'Em quilos. Ex.: 38', paxtu: 'associate-weight' },
          { chave: 'tipoSanguineo', rotulo: 'Tipo sanguíneo', tipo: 'lista', lista: 'tipoSanguineo', curto: true, paxtu: 'associate-bloodtype' },
          { chave: 'fatorRh', rotulo: 'Fator RH', tipo: 'lista', lista: 'fatorRh', curto: true, paxtu: 'associate-rh-factor' },
        ],
      },
      {
        titulo: 'Saúde física e mental',
        campos: [
          { chave: 'usaEquipamentoAuxilio', rotulo: 'Utiliza equipamento de auxílio?', tipo: 'simNao', obrigatorio: true, paxtu: 'assistive-equipment' },
          { chave: 'equipamentos', rotulo: 'Quais equipamentos?', tipo: 'caixas', lista: 'equipamentosAuxilio', obrigatorio: true, visivelSe: simEm('usaEquipamentoAuxilio'), paxtu: 'equipment-checkbox' },
          {
            chave: 'equipamentoOutroDescricao', rotulo: 'Descreva o outro equipamento', tipo: 'texto', obrigatorio: true, paxtu: 'other-equipment-description',
            visivelSe: (o) => o.usaEquipamentoAuxilio === true && marcado('equipamentos', 'Outros')(o),
          },

          { chave: 'acompanhamentoMedicoRegular', rotulo: 'Faz acompanhamento médico regular?', tipo: 'simNao', obrigatorio: true, paxtu: 'medical-monitoring' },
          { chave: 'acompanhamentoMedicoDescricao', rotulo: 'Descreva o acompanhamento', tipo: 'textoLongo', obrigatorio: true, visivelSe: simEm('acompanhamentoMedicoRegular'), dica: 'Especialidade, motivo, frequência.', paxtu: 'medical-monitoring-info' },

          { chave: 'problemaCronico', rotulo: 'Apresenta algum problema crônico de saúde?', tipo: 'simNao', obrigatorio: true, paxtu: 'chronic-illnes' },
          { chave: 'problemasCronicos', rotulo: 'Quais problemas?', tipo: 'caixas', lista: 'problemasCronicos', obrigatorio: true, visivelSe: simEm('problemaCronico'), paxtu: 'chronic-disease-option' },
          {
            chave: 'problemaCronicoOutroDescricao', rotulo: 'Descreva o outro problema', tipo: 'texto', obrigatorio: true, paxtu: 'cronical-disease-description',
            visivelSe: (o) => o.problemaCronico === true && marcado('problemasCronicos', 'Outros')(o),
          },

          {
            chave: 'alergias', rotulo: 'Possui alguma das alergias abaixo? Selecione todas que se aplicam.', tipo: 'caixasDescricao',
            lista: 'alergias', obrigatorio: true, nenhuma: 'Nenhuma alergia',
            paxtu: {
              'Ácaro': ['mite-allergy', 'mite-allergy-description'],
              Alimentos: ['foods-allergy', 'foods-allergy-description'],
              Fungos: ['fungus-allergy', 'fungus-allergy-description'],
              'Picada de Inseto': ['bug-bite-allergy', 'bug-bite-allergy-description'],
              Plantas: ['plants-allergy', 'plants-allergy-description'],
              Medicamentos: ['medicines-allergy', 'medicines-allergy-description'],
              Outros: ['other-allergy', 'other-allergy-description'],
            },
          },
          {
            chave: 'condicoes', rotulo: 'Possui alguma das condições abaixo? Selecione todas que se aplicam.', tipo: 'caixasDescricao',
            lista: 'condicoes', obrigatorio: true, nenhuma: 'Nenhuma',
            paxtu: {
              'Física': ['physical-deficiency', 'physical-deficiency-description'],
              Visual: ['visual-deficiency', 'visual-deficiency-description'],
              Auditiva: ['auditory-deficiency', 'auditory-deficiency-description'],
              Intelectual: ['intellectual-deficiency', 'intellectual-deficiency-description'],
              Autismo: ['autism-deficiency', 'autism-deficiency-description'],
            },
          },
          {
            chave: 'comportamentos', rotulo: 'Possui algum dos comportamentos abaixo? Selecione todos que se aplicam.', tipo: 'caixasDescricao',
            lista: 'comportamentos', obrigatorio: true, nenhuma: 'Nenhum',
            paxtu: Object.fromEntries([
              ['Dificuldade de obedecer instruções verbais', 'verbal-disobedience-behavior'],
              ['Dificuldades alimentares', 'feeding-difficulty-behavior'],
              ['Crises em que agrida a si mesmo', 'self-harming-behavior'],
              ['Dificuldades de sono', 'sleeping-difficulty-behavior'],
              ['Crises em que agrida os outros', 'others-harming-behavior'],
              ['Tendência a fugas', 'escape-tendency-behavior'],
              ['Dificuldade de comunicação', 'hard-communication-behavior'],
              ['Crises de ansiedade ou pânico', 'panic-anxiety-behavior'],
              ['Comportamento auto-destrutivo', 'self-destructing-behavior'],
              ['Agitação psicomotora que atrapalhe a concentração', 'psychomotor-agitation-behavior'],
            ].map(([tipo, nome]) => [tipo, [nome, `${nome}-description`]])),
          },

          { chave: 'transtorno', rotulo: 'Apresenta algum transtorno ou condição?', tipo: 'simNao', obrigatorio: true, paxtu: 'mental-disorder' },
          { chave: 'transtornoDescricao', rotulo: 'Descreva o transtorno ou condição', tipo: 'textoLongo', obrigatorio: true, visivelSe: simEm('transtorno'), paxtu: 'mental-disorder-description' },
          { chave: 'transtornoUsaMedicacao', rotulo: 'Faz uso de medicação para este transtorno?', tipo: 'simNao', obrigatorio: true, visivelSe: simEm('transtorno'), paxtu: 'mental-disorder-medication' },
          {
            chave: 'transtornoMedicacaoDescricao', rotulo: 'Descreva a medicação', tipo: 'textoLongo', obrigatorio: true, paxtu: 'mental-disorder-medication-description',
            visivelSe: (o) => o.transtorno === true && o.transtornoUsaMedicacao === true,
          },
          { chave: 'transtornoAcompanhamentoProfissional', rotulo: 'Faz acompanhamento com profissional?', tipo: 'simNao', obrigatorio: true, visivelSe: simEm('transtorno'), paxtu: 'mental-disorder-medical-treatment' },
          {
            chave: 'transtornoAcompanhamentoDescricao', rotulo: 'Descreva o acompanhamento', tipo: 'textoLongo', obrigatorio: true, paxtu: 'mental-disorder-medical-treatment-description',
            visivelSe: (o) => o.transtorno === true && o.transtornoAcompanhamentoProfissional === true,
          },

          { chave: 'usaMedicamento', rotulo: 'Faz uso de algum medicamento?', tipo: 'simNao', obrigatorio: true, paxtu: 'medicine-use' },
          {
            chave: 'medicamentos', rotulo: 'Medicamentos', tipo: 'tabela', obrigatorio: true, maximoLinhas: 20, visivelSe: simEm('usaMedicamento'),
            rotuloLinha: (i) => `Medicamento ${i + 1}`, botaoAdicionar: 'Adicionar novo',
            colunas: [
              { chave: 'medicamento', rotulo: 'Medicamento', tipo: 'texto', obrigatorio: true, paxtu: 'medicine-description[]' },
              { chave: 'usoContinuo', rotulo: 'Uso contínuo?', tipo: 'simNao', obrigatorio: true, paxtu: 'medicine-continuous[]' },
              { chave: 'informacoes', rotulo: 'Informações', tipo: 'textoLongo', dica: 'Dose, horários e observações.', paxtu: 'medicine-info[]' },
            ],
          },
        ],
      },
      {
        titulo: 'Informações gerais',
        campos: [
          { chave: 'impedimentoFisico', rotulo: 'Possui impedimento físico?', tipo: 'simNao', obrigatorio: true, paxtu: 'physical-impediment' },
          { chave: 'impedimentoFisicoDescricao', rotulo: 'Descreva o impedimento físico', tipo: 'textoLongo', obrigatorio: true, visivelSe: simEm('impedimentoFisico'), paxtu: 'physical-impediment-description' },
          { chave: 'restricaoAlimentar', rotulo: 'Possui restrição alimentar?', tipo: 'simNao', obrigatorio: true, paxtu: 'food-restriction' },
          { chave: 'restricaoAlimentarDescricao', rotulo: 'Descreva a restrição alimentar', tipo: 'textoLongo', obrigatorio: true, visivelSe: simEm('restricaoAlimentar'), paxtu: 'food-restriction-description' },
          { chave: 'sabeNadar', rotulo: 'Sabe nadar?', tipo: 'simNao', obrigatorio: true, paxtu: 'can-swim' },
          { chave: 'sonambulo', rotulo: 'É sonâmbulo?', tipo: 'simNao', obrigatorio: true, paxtu: 'is-sleepwalker' },
          { chave: 'planoSaude', rotulo: 'Utiliza plano de saúde?', tipo: 'simNao', obrigatorio: true, paxtu: 'health-insurance' },
          { chave: 'convenio', rotulo: 'Convênio médico', tipo: 'busca', lista: 'convenios', obrigatorio: true, visivelSe: simEm('planoSaude'), dica: 'Digite para buscar.', paxtu: 'health-insurance-list' },
          {
            chave: 'convenioOutro', rotulo: 'Outro convênio médico', tipo: 'texto', obrigatorio: true, paxtu: 'health-insurance-description-other',
            visivelSe: (o) => o.planoSaude === true && o.convenio === 'Outros',
          },
          { chave: 'numeroCarteirinha', rotulo: 'Número da carteirinha', tipo: 'texto', curto: true, maximo: 40, visivelSe: simEm('planoSaude'), paxtu: 'health-insurance-number' },
          { chave: 'medicoPreferenciaNome', rotulo: 'Possui médico de preferência? Nome', tipo: 'texto', paxtu: 'doctor-name' },
          { chave: 'medicoPreferenciaTelefone', rotulo: 'Telefone do médico de preferência', tipo: 'telefone', curto: true, paxtu: 'doctor-phone' },
          {
            chave: 'condutaEmergencia', rotulo: 'Em caso de emergência, qual conduta deve ser seguida?', tipo: 'opcao',
            lista: 'condutaEmergencia', obrigatorio: true, paxtu: 'medical-decisions',
          },
          {
            chave: 'contatoEmergenciaTipo', rotulo: 'Contato de emergência', tipo: 'opcao', lista: 'contatoEmergenciaTipo',
            obrigatorio: true, emLinha: true, paxtu: 'emergency-contact',
            // Sem responsáveis cadastrados (adulto), "Pais/responsáveis" não é uma opção.
            filtrarOpcoes: (opcoes, o, ctx) => (ctx.temResponsaveis ? opcoes : opcoes.filter((x) => x !== 'Pais/responsáveis')),
            sugestao: (o, ctx) => (ctx.temResponsaveis ? null : 'Outros'),
            dica: (o, ctx) => (ctx.temResponsaveis ? null : 'Como não há responsáveis cadastrados, informe outra pessoa para contato.'),
          },
          { chave: 'contatoEmergenciaNome', rotulo: 'Nome do contato de emergência', tipo: 'texto', obrigatorio: true, visivelSe: (o) => o.contatoEmergenciaTipo === 'Outros', paxtu: 'contact-name' },
          { chave: 'contatoEmergenciaTelefone', rotulo: 'Telefone do contato de emergência', tipo: 'telefone', obrigatorio: true, curto: true, visivelSe: (o) => o.contatoEmergenciaTipo === 'Outros', paxtu: 'contact-phone-number' },
        ],
      },
      {
        titulo: 'Observações',
        campos: [
          { chave: 'observacoes', rotulo: 'Há alguma outra informação importante sobre a saúde do associado? Se sim, descreva.', tipo: 'textoLongo', paxtu: 'other-observations' },
        ],
      },
    ],
  },

  {
    id: 'revisao',
    caminho: null, // campos na raiz do JSON
    titulo: 'Revisão e envio',
    descricao: 'Confira as respostas antes de enviar. Use "Editar" para corrigir alguma etapa.',
    secoes: [
      {
        titulo: 'Declaração',
        campos: [
          {
            chave: 'consentimentoLgpd', tipo: 'marcar', obrigatorio: true,
            rotulo: `Declaro que as informações são verdadeiras e autorizo o ${NOME_GRUPO} a usá-las exclusivamente para o registro do associado nos Escoteiros do Brasil e para a segurança nas atividades, conforme a LGPD (Lei 13.709/2018).`,
            mensagemObrigatorio: 'É preciso aceitar a declaração para enviar.',
          },
          { chave: 'preenchidoPor', rotulo: 'Nome de quem preencheu', tipo: 'texto', obrigatorio: true, autocomplete: 'name' },
          { chave: 'relacaoComAssociado', rotulo: 'Quem preencheu é', tipo: 'opcao', opcoes: ['O próprio associado', 'Responsável'], obrigatorio: true, emLinha: true },
        ],
      },
    ],
  },
];

function validarCpfUnico(valor, o, ctx) {
  const cpf = somenteDigitos(valor);
  const ig = ehObjeto(ctx.raiz.informacoesGerais) ? ctx.raiz.informacoesGerais : {};
  if (cpf && cpf === somenteDigitos(ig.cpf)) return 'O CPF do responsável não pode ser igual ao do associado.';
  const outros = Array.isArray(ctx.raiz.responsaveis) ? ctx.raiz.responsaveis : [];
  const repetido = outros.some((r, i) => i !== ctx.indice && ehObjeto(r) && somenteDigitos(r.cpf) === cpf);
  if (cpf && repetido) return 'Os dois responsáveis não podem ter o mesmo CPF.';
  return null;
}

// ---------------------------------------------------------------------------
// Utilitários gerais
// ---------------------------------------------------------------------------

export function ehObjeto(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

export function somenteDigitos(v) {
  return typeof v === 'string' || typeof v === 'number' ? String(v).replace(/\D/g, '') : '';
}

export function obterCaminho(obj, caminho) {
  return String(caminho).split('.').reduce((atual, parte) => (atual === null || atual === undefined ? undefined : atual[parte]), obj);
}

export function definirCaminho(obj, caminho, valor) {
  const partes = String(caminho).split('.');
  let atual = obj;
  partes.slice(0, -1).forEach((parte) => {
    if (!ehObjeto(atual[parte]) && !Array.isArray(atual[parte])) atual[parte] = {};
    atual = atual[parte];
  });
  atual[partes.at(-1)] = valor;
}

export function juntarCaminho(prefixo, chave) {
  return prefixo ? `${prefixo}.${chave}` : chave;
}

// Id de elemento HTML a partir do caminho do campo (o mesmo no front e nas mensagens do servidor).
export function idDoCampo(caminho) {
  return `campo-${String(caminho).replace(/[^A-Za-z0-9_]+/g, '-')}`;
}

export function chaveNenhuma(campo) {
  return `_${campo.chave}Nenhuma`;
}

export function normalizarBusca(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[*]/g, '').toLowerCase().trim();
}

export function slug(texto) {
  return String(texto ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'associado';
}

function textoOuNulo(v) {
  if (typeof v === 'number') return String(v);
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t === '' ? null : t;
}

export function paraNumero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string' || v.trim() === '') return null;
  const t = v.trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null;
  return Number(t);
}

// ---------------------------------------------------------------------------
// Datas e idade (sempre no fuso de Brasília)
// ---------------------------------------------------------------------------

export function partesNoFuso(agora = new Date(), fuso = FUSO) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(agora).map(({ type, value }) => [type, value]));
  return { ano: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second };
}

const doisDigitos = (n) => String(n).padStart(2, '0');

export function hojeISO(agora = new Date()) {
  const p = partesNoFuso(agora);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}`;
}

// Ex.: 2026-10-15T16:51:00-03:00
export function isoComFuso(agora = new Date()) {
  const p = partesNoFuso(agora);
  const comoUtc = Date.UTC(p.ano, p.mes - 1, p.dia, p.hora, p.minuto, p.segundo);
  const deslocamento = Math.round((comoUtc - Math.floor(agora.getTime() / 1000) * 1000) / 60000);
  const sinal = deslocamento < 0 ? '-' : '+';
  const abs = Math.abs(deslocamento);
  return `${p.ano}-${doisDigitos(p.mes)}-${doisDigitos(p.dia)}T${doisDigitos(p.hora)}:${doisDigitos(p.minuto)}:${doisDigitos(p.segundo)}`
    + `${sinal}${doisDigitos(Math.floor(abs / 60))}:${doisDigitos(abs % 60)}`;
}

export function dataValida(v) {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [a, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function idadeEmMeses(dataNascimento, agora = new Date()) {
  if (!dataValida(dataNascimento)) return null;
  const [a, m, d] = dataNascimento.split('-').map(Number);
  const h = partesNoFuso(agora);
  const meses = (h.ano - a) * 12 + (h.mes - m) - (h.dia < d ? 1 : 0);
  return meses >= 0 ? meses : null;
}

export function idadeEmAnos(dataNascimento, agora = new Date()) {
  const meses = idadeEmMeses(dataNascimento, agora);
  return meses === null ? null : Math.floor(meses / 12);
}

// ---------------------------------------------------------------------------
// Formatação (máscaras visuais; no JSON vão só os dígitos)
// ---------------------------------------------------------------------------

export function formatarCpf(v) {
  const d = somenteDigitos(v).slice(0, 11);
  let s = d.slice(0, 3);
  if (d.length > 3) s += `.${d.slice(3, 6)}`;
  if (d.length > 6) s += `.${d.slice(6, 9)}`;
  if (d.length > 9) s += `-${d.slice(9)}`;
  return s;
}

export function formatarCep(v) {
  const d = somenteDigitos(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

export function formatarTelefone(v) {
  const d = somenteDigitos(v).slice(0, 11);
  if (!d) return '';
  if (d.length <= 2) return `(${d}`;
  const resto = d.slice(2);
  const corte = d.length === 11 ? 5 : 4;
  return `(${d.slice(0, 2)}) ${resto.length > corte ? `${resto.slice(0, corte)}-${resto.slice(corte)}` : resto}`;
}

export function formatarData(v) {
  return dataValida(v) ? v.split('-').reverse().join('/') : '';
}

export function formatarNumero(v) {
  const n = paraNumero(v);
  return n === null ? '' : String(n).replace('.', ',');
}

export function nomeArquivo(json) {
  const nome = json?.informacoesGerais?.nome;
  const data = String(json?.enviadoEm ?? hojeISO()).slice(0, 10);
  return `cadastro_${slug(nome)}_${data}.json`;
}

// ---------------------------------------------------------------------------
// Contexto, visibilidade e opções
// ---------------------------------------------------------------------------

export function criarContexto(dados, listas, { agora = new Date() } = {}) {
  const raiz = ehObjeto(dados) ? dados : {};
  const ig = ehObjeto(raiz.informacoesGerais) ? raiz.informacoesGerais : {};
  const idadeMeses = idadeEmMeses(ig.dataNascimento, agora);
  const idade = idadeMeses === null ? null : Math.floor(idadeMeses / 12);
  const responsaveis = Array.isArray(raiz.responsaveis) ? raiz.responsaveis : [];
  return {
    raiz, listas: listas ?? {}, agora, idade, idadeMeses,
    // Sem data de nascimento válida, trata como menor (regra mais segura).
    menor: idade === null || idade < MAIORIDADE,
    temResponsaveis: responsaveis.length > 0,
    indice: null,
  };
}

export function etapaPorId(id) {
  return ETAPAS.find((e) => e.id === id);
}

export function* camposDe(etapa) {
  for (const secao of etapa.secoes) for (const campo of secao.campos) yield { secao, campo };
}

export function secaoVisivel(secao, o, ctx) {
  return !secao.visivelSe || Boolean(secao.visivelSe(o, ctx));
}

export function campoVisivel(campo, o, ctx, secao = null) {
  if (secao && !secaoVisivel(secao, o, ctx)) return false;
  return !campo.visivelSe || Boolean(campo.visivelSe(o, ctx));
}

export function campoObrigatorio(campo, o, ctx) {
  return typeof campo.obrigatorio === 'function' ? Boolean(campo.obrigatorio(o, ctx)) : Boolean(campo.obrigatorio);
}

export function opcoesDoCampo(campo, o, ctx) {
  let opcoes = campo.opcoes ?? ctx.listas?.[campo.lista] ?? [];
  if (campo.filtrarOpcoes) opcoes = campo.filtrarOpcoes(opcoes, o, ctx);
  return opcoes;
}

// Percorre os objetos de dados de cada etapa (um por etapa, ou um por item nas repetíveis).
function* instancias(dados, ctx) {
  for (const etapa of ETAPAS) {
    if (etapa.repetivel) {
      const itens = Array.isArray(dados[etapa.caminho]) ? dados[etapa.caminho] : [];
      for (let i = 0; i < itens.length; i++) {
        if (ehObjeto(itens[i])) yield { etapa, objeto: itens[i], prefixo: `${etapa.caminho}.${i}`, ctx: { ...ctx, indice: i } };
      }
    } else {
      const objeto = etapa.caminho ? dados[etapa.caminho] : dados;
      if (ehObjeto(objeto)) yield { etapa, objeto, prefixo: etapa.caminho, ctx };
    }
  }
}

// ---------------------------------------------------------------------------
// Estado inicial do formulário e sugestões automáticas
// ---------------------------------------------------------------------------

function valorInicial(campo) {
  if (campo.padrao !== undefined) return structuredClone(campo.padrao);
  switch (campo.tipo) {
    case 'caixas': case 'caixasDescricao': case 'tabela': return [];
    case 'simNao': return null;
    case 'marcar': return false;
    default: return '';
  }
}

export function objetoInicial(campos) {
  const o = {};
  for (const campo of campos) {
    if (campo.tipo === 'computado') continue;
    definirCaminho(o, campo.chave, valorInicial(campo));
    if (campo.tipo === 'caixasDescricao') o[chaveNenhuma(campo)] = false;
  }
  return o;
}

const todosCampos = (etapa) => [...camposDe(etapa)].map(({ campo }) => campo);

export function novoItem(idEtapa) {
  return objetoInicial(todosCampos(etapaPorId(idEtapa)));
}

export function novaLinha(campoTabela) {
  return objetoInicial(campoTabela.colunas);
}

export function estadoInicial() {
  const dados = { _sugestoes: {} };
  for (const etapa of ETAPAS) {
    if (etapa.repetivel) dados[etapa.caminho] = [];
    else if (etapa.caminho) dados[etapa.caminho] = objetoInicial(todosCampos(etapa));
    else Object.assign(dados, objetoInicial(todosCampos(etapa)));
  }
  return dados;
}

// Aplica as sugestões (ramo pela idade, "* Estudante *" etc.). Só altera um campo
// se ele estiver vazio ou ainda com a sugestão anterior, ou seja, nunca sobrescreve
// algo que a pessoa escolheu. Devolve os caminhos alterados.
export function aplicarSugestoes(dados, listas, opcoes = {}) {
  const ctxBase = criarContexto(dados, listas, opcoes);
  if (!ehObjeto(dados._sugestoes)) dados._sugestoes = {};
  const memoria = dados._sugestoes;
  const alterados = [];
  for (const { etapa, objeto, prefixo, ctx } of instancias(dados, ctxBase)) {
    for (const { campo } of camposDe(etapa)) {
      if (!campo.sugestao) continue;
      const caminho = juntarCaminho(prefixo, campo.chave);
      const sugerido = campo.sugestao(objeto, ctx) ?? null;
      const anterior = memoria[caminho] ?? null;
      if (sugerido === anterior) continue;
      const atual = obterCaminho(objeto, campo.chave);
      if (atual === null || atual === undefined || atual === '' || atual === anterior) {
        definirCaminho(objeto, campo.chave, sugerido ?? valorInicial(campo));
        alterados.push(caminho);
      }
      memoria[caminho] = sugerido;
    }
  }
  return alterados;
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

const REGEX_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAXIMO_TEXTO = 150;
const MAXIMO_TEXTO_LONGO = 2000;

export function cpfValido(v) {
  const d = somenteDigitos(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  for (const n of [9, 10]) {
    let soma = 0;
    for (let i = 0; i < n; i++) soma += Number(d[i]) * (n + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(d[n])) return false;
  }
  return true;
}

export function emailValido(v) {
  return typeof v === 'string' && v.length <= 254 && REGEX_EMAIL.test(v.trim());
}

function estaVazio(campo, v) {
  switch (campo.tipo) {
    case 'simNao': return v === null || v === undefined || v === '';
    case 'marcar': return v !== true;
    case 'caixas': case 'tabela': case 'caixasDescricao': return !Array.isArray(v) || v.length === 0;
    case 'numero': return v === null || v === undefined || String(v).trim() === '';
    default: return v === null || v === undefined || (typeof v === 'string' && v.trim() === '');
  }
}

function mensagemObrigatorio(campo) {
  if (campo.mensagemObrigatorio) return campo.mensagemObrigatorio;
  switch (campo.tipo) {
    case 'simNao': return 'Responda Sim ou Não.';
    case 'lista': case 'busca': case 'opcao': return 'Selecione uma opção.';
    case 'cidade': return 'Informe a cidade.';
    case 'data': return 'Informe a data.';
    case 'caixas': return 'Marque pelo menos uma opção.';
    case 'tabela': return 'Adicione pelo menos um item.';
    case 'marcar': return 'Marque esta opção para continuar.';
    default: return 'Preencha este campo.';
  }
}

function validarTipo(campo, v, o, ctx) {
  switch (campo.tipo) {
    case 'texto': case 'textoLongo': case 'cidade': {
      if (typeof v !== 'string') return 'Valor inválido.';
      const maximo = campo.maximo ?? (campo.tipo === 'textoLongo' ? MAXIMO_TEXTO_LONGO : MAXIMO_TEXTO);
      if (v.trim().length > maximo) return `Use no máximo ${maximo} caracteres.`;
      if (campo.formato && !campo.formato.test(v.trim())) return campo.mensagemFormato ?? 'Formato inválido.';
      return null;
    }
    case 'data':
      if (!dataValida(v) || v < '1900-01-01') return 'Data inválida.';
      if (v > hojeISO(ctx.agora)) return 'A data não pode ser no futuro.';
      return null;
    case 'cpf':
      return cpfValido(v) ? null : 'CPF inválido. Confira os números.';
    case 'email':
      return emailValido(v) ? null : 'E-mail inválido. Ex.: nome@exemplo.com';
    case 'telefone': {
      const d = somenteDigitos(v);
      if (campo.celular) return d.length === 11 && d[0] !== '0' && d[2] === '9' ? null : 'Celular inválido. Use DDD + 9 dígitos. Ex.: (51) 99999-9999';
      return (d.length === 10 || d.length === 11) && d[0] !== '0' ? null : 'Telefone inválido. Use DDD + número.';
    }
    case 'cep':
      return somenteDigitos(v).length === 8 && /^[\d\s.-]+$/.test(String(v)) ? null : 'CEP inválido. Use 8 dígitos.';
    case 'numero': {
      const n = paraNumero(v);
      if (n === null) return 'Informe apenas números. Ex.: 1,45';
      if (n < campo.minimo || n > campo.maximo) {
        return `Informe um valor entre ${formatarNumero(campo.minimo)} e ${formatarNumero(campo.maximo)}${campo.unidade ?? ''}.`;
      }
      return null;
    }
    case 'lista': case 'busca': case 'opcao':
      return opcoesDoCampo(campo, o, ctx).includes(v) ? null : 'Escolha uma opção da lista.';
    case 'simNao': case 'marcar':
      return typeof v === 'boolean' ? null : 'Valor inválido.';
    case 'caixas': {
      if (!Array.isArray(v)) return 'Valor inválido.';
      const opcoes = opcoesDoCampo(campo, o, ctx);
      if (v.some((x) => !opcoes.includes(x)) || new Set(v).size !== v.length) return 'Opção inválida.';
      return null;
    }
    default:
      return null;
  }
}

function novoErro(etapa, caminho, rotulo, mensagem) {
  return { etapa: etapa.id, campo: caminho, rotulo, mensagem };
}

function validarCampos(etapa, secoes, o, prefixo, ctx, rotuloPrefixo, erros) {
  for (const secao of secoes) {
    if (!secaoVisivel(secao, o, ctx)) continue;
    for (const campo of secao.campos) {
      if (campo.tipo === 'computado' || !campoVisivel(campo, o, ctx)) continue;
      const caminho = juntarCaminho(prefixo, campo.chave);
      const rotulo = rotuloPrefixo ? `${rotuloPrefixo} › ${campo.rotulo}` : campo.rotulo;
      const v = obterCaminho(o, campo.chave);
      const erro = (mensagem, c = caminho, r = rotulo) => erros.push(novoErro(etapa, c, r, mensagem));

      if (campo.tipo === 'caixasDescricao') {
        validarCaixasDescricao(campo, v, o, ctx, caminho, rotulo, erro);
        continue;
      }
      if (estaVazio(campo, v)) {
        if (campoObrigatorio(campo, o, ctx)) erro(mensagemObrigatorio(campo));
        continue;
      }
      if (campo.tipo === 'tabela') {
        validarTabela(etapa, campo, v, caminho, rotulo, ctx, erros, erro);
        continue;
      }
      const mensagem = validarTipo(campo, v, o, ctx) ?? campo.validar?.(v, o, ctx) ?? null;
      if (mensagem) erro(mensagem);
    }
  }
}

function validarCaixasDescricao(campo, v, o, ctx, caminho, rotulo, erro) {
  if (v !== undefined && !Array.isArray(v)) return erro('Valor inválido.');
  const itens = v ?? [];
  const nenhuma = o[chaveNenhuma(campo)];
  if (itens.length === 0) {
    // `false` = o formulário registrou que a pessoa ainda não respondeu.
    // Sem a marcação (JSON enviado direto à API), lista vazia vale como "nenhuma".
    if (campoObrigatorio(campo, o, ctx) && nenhuma === false) erro(`Marque as opções que se aplicam ou "${campo.nenhuma}".`);
    return;
  }
  if (nenhuma === true) return erro(`Desmarque "${campo.nenhuma}" ou as demais opções.`);
  const opcoes = opcoesDoCampo(campo, o, ctx);
  const vistos = new Set();
  for (const item of itens) {
    const indice = ehObjeto(item) ? opcoes.indexOf(item.tipo) : -1;
    if (indice < 0 || vistos.has(item.tipo)) return erro('Opção inválida.');
    vistos.add(item.tipo);
    const descricao = typeof item.descricao === 'string' ? item.descricao.trim() : '';
    if (!descricao) erro(`Descreva: ${item.tipo}.`, `${caminho}.opcao${indice}`, `${rotulo} › ${item.tipo}`);
    else if (descricao.length > MAXIMO_TEXTO_LONGO) erro(`Use no máximo ${MAXIMO_TEXTO_LONGO} caracteres.`, `${caminho}.opcao${indice}`, `${rotulo} › ${item.tipo}`);
  }
}

function validarTabela(etapa, campo, linhas, caminho, rotulo, ctx, erros, erro) {
  if (!Array.isArray(linhas)) return erro('Valor inválido.');
  if (linhas.length > campo.maximoLinhas) return erro(`No máximo ${campo.maximoLinhas} itens.`);
  linhas.forEach((linha, i) => {
    const prefixo = `${caminho}.${i}`;
    if (!ehObjeto(linha)) return erro('Item inválido.', prefixo);
    validarCampos(etapa, [{ campos: campo.colunas }], linha, prefixo, ctx, `${rotulo} › ${campo.rotuloLinha(i)}`, erros);
  });
}

// Valida uma etapa. Devolve uma lista de { etapa, campo, rotulo, mensagem } (vazia = ok).
export function validarEtapa(idEtapa, dados, listas, opcoes = {}) {
  const etapa = etapaPorId(idEtapa);
  const ctx = criarContexto(dados, listas, opcoes);
  const erros = [];
  const raiz = ctx.raiz;

  if (etapa.repetivel) {
    const itens = raiz[etapa.caminho];
    if (!Array.isArray(itens)) {
      erros.push(novoErro(etapa, etapa.caminho, etapa.titulo, 'Formato inválido.'));
      return erros;
    }
    const { maximo, minimo, rotuloItem } = etapa.repetivel;
    if (itens.length > maximo) {
      erros.push(novoErro(etapa, etapa.caminho, etapa.titulo, `Informe no máximo ${maximo} responsáveis.`));
    }
    if (itens.length < minimo(ctx)) {
      erros.push(novoErro(etapa, etapa.caminho, etapa.titulo, 'Como o associado tem menos de 18 anos, informe pelo menos um responsável.'));
    }
    itens.slice(0, maximo).forEach((item, i) => {
      const prefixo = `${etapa.caminho}.${i}`;
      if (!ehObjeto(item)) erros.push(novoErro(etapa, prefixo, rotuloItem(i), 'Formato inválido.'));
      else validarCampos(etapa, etapa.secoes, item, prefixo, { ...ctx, indice: i }, rotuloItem(i), erros);
    });
    return erros;
  }

  const objeto = etapa.caminho ? raiz[etapa.caminho] : raiz;
  if (!ehObjeto(objeto)) {
    erros.push(novoErro(etapa, etapa.caminho ?? '', etapa.titulo, 'Etapa não preenchida.'));
    return erros;
  }
  validarCampos(etapa, etapa.secoes, objeto, etapa.caminho, ctx, '', erros);
  return erros;
}

// Valida o cadastro inteiro (usado antes do envio e no servidor).
export function validarCadastro(dados, listas, opcoes = {}) {
  if (!ehObjeto(dados)) return [{ etapa: null, campo: '', rotulo: 'Cadastro', mensagem: 'Dados ausentes ou em formato inválido.' }];
  return ETAPAS.flatMap((etapa) => validarEtapa(etapa.id, dados, listas, opcoes));
}

// ---------------------------------------------------------------------------
// Montagem do JSON final
// ---------------------------------------------------------------------------

function vazioJson(campo) {
  return ['caixas', 'caixasDescricao', 'tabela'].includes(campo.tipo) ? [] : null;
}

function normalizarValor(campo, v, o, ctx) {
  switch (campo.tipo) {
    case 'cpf': case 'telefone': case 'cep': return somenteDigitos(v) || null;
    case 'numero': return paraNumero(v);
    case 'simNao': return typeof v === 'boolean' ? v : null;
    case 'marcar': return v === true;
    case 'computado': return campo.calcular(o, ctx);
    case 'caixas': {
      const marcados = new Set(Array.isArray(v) ? v : []);
      return opcoesDoCampo(campo, o, ctx).filter((op) => marcados.has(op));
    }
    case 'caixasDescricao': {
      if (o[chaveNenhuma(campo)] === true || !Array.isArray(v)) return [];
      const itens = v.filter(ehObjeto);
      return opcoesDoCampo(campo, o, ctx).flatMap((op) => {
        const item = itens.find((i) => i.tipo === op);
        return item ? [{ tipo: op, descricao: textoOuNulo(item.descricao) }] : [];
      });
    }
    case 'tabela':
      return (Array.isArray(v) ? v : []).filter(ehObjeto).map((linha) => montarCampos([{ campos: campo.colunas }], linha, ctx));
    default: return textoOuNulo(v);
  }
}

function montarCampos(secoes, o, ctx) {
  const saida = {};
  for (const secao of secoes) {
    for (const campo of secao.campos) {
      if (campo.chave.startsWith('_')) continue;
      const visivel = campoVisivel(campo, o, ctx, secao);
      definirCaminho(saida, campo.chave, visivel ? normalizarValor(campo, obterCaminho(o, campo.chave), o, ctx) : vazioJson(campo));
    }
  }
  return saida;
}

const ORDEM_ENDERECO = ['cep', 'logradouro', 'numero', 'complemento', 'estado', 'cidade', 'bairro'];
function ordenarEndereco(endereco) {
  return Object.fromEntries(ORDEM_ENDERECO.map((k) => [k, endereco?.[k] ?? null]));
}

// Monta o JSON final: listas com o texto exato do Paxtu, campos ocultos como null/[],
// CPF/CEP/telefones só com dígitos, datas AAAA-MM-DD.
export function montarJson(dados, listas, { agora = new Date(), grupo = NOME_GRUPO } = {}) {
  const raiz = ehObjeto(dados) ? dados : {};
  const ctx = criarContexto(raiz, listas, { agora });
  const saida = { versao: VERSAO_JSON, enviadoEm: isoComFuso(agora), grupo };
  for (const etapa of ETAPAS) {
    if (etapa.repetivel) {
      const itens = (Array.isArray(raiz[etapa.caminho]) ? raiz[etapa.caminho] : []).slice(0, etapa.repetivel.maximo);
      saida[etapa.caminho] = itens.filter(ehObjeto).map((item, i) => {
        const montado = { ordem: i + 1, ...montarCampos(etapa.secoes, item, { ...ctx, indice: i }) };
        etapa.posProcessar?.(montado, saida);
        return montado;
      });
    } else if (etapa.caminho) {
      const objeto = ehObjeto(raiz[etapa.caminho]) ? raiz[etapa.caminho] : {};
      saida[etapa.caminho] = montarCampos(etapa.secoes, objeto, ctx);
    } else {
      Object.assign(saida, montarCampos(etapa.secoes, raiz, ctx));
    }
  }
  return saida;
}

// Mapa "caminho no JSON → nome do campo no Paxtu", para uma futura importação automática.
export function mapaPaxtu() {
  const mapa = {};
  for (const etapa of ETAPAS) {
    const base = etapa.repetivel ? `${etapa.caminho}[]` : etapa.caminho;
    for (const { campo } of camposDe(etapa)) {
      if (campo.paxtu) mapa[juntarCaminho(base, campo.chave)] = campo.paxtu;
      for (const coluna of campo.colunas ?? []) {
        if (coluna.paxtu) mapa[juntarCaminho(base, `${campo.chave}[].${coluna.chave}`)] = coluna.paxtu;
      }
    }
  }
  return mapa;
}
