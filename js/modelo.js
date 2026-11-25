import { ehChaveMes } from './fuso.js';

/** Versão do esquema gravada no documento do usuário (campos novos, opcionais). */
export const SCHEMA_VERSION = 1;

/** RN-01: tipos de lançamento. */
export const TIPOS_LANCAMENTO = Object.freeze(['entrada', 'saida', 'transferencia', 'ajuste']);

export const CATEGORIAS = Object.freeze([
  { id: 'comida_fora', nome: 'Comida fora' },
  { id: 'mercado', nome: 'Mercado' },
  { id: 'transporte', nome: 'Transporte' },
  { id: 'lazer', nome: 'Lazer' },
  { id: 'outros', nome: 'Outros' },
]);

export const CATEGORIA_IDS = Object.freeze(CATEGORIAS.map((c) => c.id));

/** Contas previstas para PRs seguintes (não há tela de lançamento neste PR). */
export const CONTAS_PADRAO = Object.freeze([
  { id: 'bb', nome: 'BB' },
  { id: 'nubank-pj', nome: 'Nubank PJ' },
  { id: 'mercado-pago', nome: 'Mercado Pago' },
]);

export const CONTA_IDS = Object.freeze(CONTAS_PADRAO.map((c) => c.id));

/**
 * Lançamentos NÃO ficam no documento users/{uid}.
 * O botão "Salvar Alterações" faz setDoc do documento inteiro (sem merge).
 * Uma subcoleção users/{uid}/lancamentos/{id} não é apagada por esse save.
 */
export const COLECAO_USUARIOS = 'users';
export const SUBCOLECAO_LANCAMENTOS = 'lancamentos';

function gerarId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  throw new Error('crypto.randomUUID não está disponível neste ambiente.');
}

/** RNF-03: valor monetário dos lançamentos em centavos inteiros. */
export function reaisParaCentavos(reais) {
  const n = Number(reais);
  if (!Number.isFinite(n)) {
    throw new TypeError('Valor em reais inválido.');
  }
  return Math.round(n * 100);
}

export function centavosParaReais(centavos) {
  if (!Number.isInteger(centavos)) {
    throw new TypeError('Centavos devem ser um inteiro.');
  }
  return centavos / 100;
}

/**
 * Monta um lançamento novo. Não grava no Firestore (sem tela neste PR).
 * @param {object} campos
 */
export function criarLancamento(campos = {}) {
  const tipo = campos.tipo;
  const categoria = campos.categoria;
  const valorCentavos = campos.valorCentavos;
  const itens = Array.isArray(campos.itens)
    ? campos.itens.map((item) => ({
        nome: String(item.nome ?? ''),
        valor: Number.isInteger(item.valor) ? item.valor : reaisParaCentavos(item.valor),
      }))
    : [];

  const lancamento = {
    id: campos.id || gerarId(),
    tipo,
    data: campos.data,
    valorCentavos,
    contaId: campos.contaId,
    categoria,
    formaPagamento: campos.formaPagamento ?? '',
    descricao: campos.descricao ?? '',
    reembolsoAReceber: Boolean(campos.reembolsoAReceber),
  };

  if (itens.length > 0) {
    lancamento.itens = itens;
  }

  const erro = validarLancamento(lancamento);
  if (erro) {
    throw new Error(erro);
  }
  return lancamento;
}

export function validarLancamento(lancamento) {
  if (!lancamento || typeof lancamento !== 'object') return 'Lançamento inválido.';
  if (typeof lancamento.id !== 'string' || lancamento.id.length < 8) return 'id inválido.';
  if (!TIPOS_LANCAMENTO.includes(lancamento.tipo)) return 'tipo inválido (RN-01).';
  if (typeof lancamento.data !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(lancamento.data)) {
    return 'data deve ser AAAA-MM-DD no fuso America/Sao_Paulo.';
  }
  if (!Number.isInteger(lancamento.valorCentavos)) return 'valorCentavos deve ser inteiro (RNF-03).';
  if (typeof lancamento.contaId !== 'string' || !lancamento.contaId) return 'conta inválida.';
  if (!CATEGORIA_IDS.includes(lancamento.categoria)) return 'categoria inválida.';
  if (typeof lancamento.formaPagamento !== 'string') return 'forma de pagamento inválida.';
  if (typeof lancamento.descricao !== 'string') return 'descrição inválida.';
  if (typeof lancamento.reembolsoAReceber !== 'boolean') return 'reembolsoAReceber deve ser boolean.';
  if (lancamento.itens !== undefined) {
    if (!Array.isArray(lancamento.itens)) return 'itens deve ser uma lista.';
    for (const item of lancamento.itens) {
      if (!item || typeof item.nome !== 'string' || !Number.isInteger(item.valor)) {
        return 'cada item precisa de nome (texto) e valor (centavos inteiros).';
      }
    }
  }
  return null;
}

/**
 * Completa campos novos em memória, sem apagar chaves de mês nem gastos fixos.
 * Não envia nada ao Firestore por conta própria.
 */
export function prepararDocumentoUsuario(dadosBrutos) {
  const dados = { ...(dadosBrutos && typeof dadosBrutos === 'object' ? dadosBrutos : {}) };
  if (dados.schemaVersion == null) {
    dados.schemaVersion = SCHEMA_VERSION;
  }
  if (!Array.isArray(dados.contas) || dados.contas.length === 0) {
    dados.contas = CONTAS_PADRAO.map((c) => ({ ...c }));
  }
  return dados;
}

/** Gastos fixos do mês, no formato legado (descrição, valor em reais, status, dividido). */
export function gastosDoMes(dados, monthKey) {
  const lista = dados?.[monthKey];
  return Array.isArray(lista) ? lista : [];
}

export function chavesDeMesNoDocumento(dados) {
  return Object.keys(dados || {}).filter(ehChaveMes);
}
