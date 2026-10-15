// Validação no servidor usando exatamente as mesmas regras do formulário (shared/schema.js).
import { readFileSync } from 'node:fs';
import { validarCadastro, montarJson, NOME_GRUPO } from '../shared/schema.js';

export const listas = JSON.parse(readFileSync(new URL('../shared/paxtu-listas.json', import.meta.url), 'utf8'));

export function validarEnvio(dados, agora = new Date()) {
  return validarCadastro(dados, listas, { agora });
}

export function gerarJson(dados, { agora = new Date(), grupo = NOME_GRUPO } = {}) {
  return montarJson(dados, listas, { agora, grupo });
}
