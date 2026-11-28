import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CATEGORIA_IDS,
  CONTA_IDS,
  CONTAS_PADRAO,
  SCHEMA_VERSION,
  TIPOS_LANCAMENTO,
  centavosParaReais,
  chavesDeMesNoDocumento,
  criarLancamento,
  gastosDoMes,
  prepararDocumentoUsuario,
  reaisParaCentavos,
  validarLancamento,
} from '../js/modelo.js';
import {
  chaveMes,
  chaveMesDeInstant,
  dataIsoSaoPaulo,
  ehChaveMes,
  formatarMesAno,
  somarMeses,
} from '../js/fuso.js';

describe('conversão RNF-03 (centavos inteiros)', () => {
  it('converte reais para centavos com arredondamento', () => {
    assert.equal(reaisParaCentavos(10.1), 1010);
    assert.equal(reaisParaCentavos(10.15), 1015);
    assert.equal(reaisParaCentavos('1.99'), 199);
  });

  it('converte centavos de volta para reais', () => {
    assert.equal(centavosParaReais(1290), 12.9);
    assert.equal(centavosParaReais(0), 0);
  });

  it('rejeita centavos não inteiros', () => {
    assert.throws(() => centavosParaReais(1.5), /inteiro/);
  });
});

describe('fuso America/Sao_Paulo', () => {
  it('usa o calendário de São Paulo, não UTC', () => {
    const quaseMeiaNoiteUtc = new Date('2026-11-26T02:30:00.000Z');
    assert.equal(dataIsoSaoPaulo(quaseMeiaNoiteUtc), '2026-11-25');
    assert.equal(chaveMesDeInstant(quaseMeiaNoiteUtc), '2026-11');
  });

  it('formata mês/ano em pt-BR', () => {
    assert.match(formatarMesAno(2026, 11), /novembro de 2026/i);
  });

  it('navega meses sem Date.setMonth', () => {
    assert.deepEqual(somarMeses(2026, 12, 1), { year: 2027, month: 1 });
    assert.deepEqual(somarMeses(2026, 1, -1), { year: 2025, month: 12 });
    assert.equal(chaveMes(2026, 3), '2026-03');
  });

  it('reconhece chave de mês legado', () => {
    assert.equal(ehChaveMes('2024-01'), true);
    assert.equal(ehChaveMes('schemaVersion'), false);
    assert.equal(ehChaveMes('contas'), false);
  });
});

describe('documento legado de gastos fixos', () => {
  const legado = {
    '2026-10': [{ descricao: 'Aluguel', valor: 2000, status: 'pago', dividido: false }],
    '2026-11': [{ descricao: 'Energia', valor: 150.5, status: 'pendente', dividido: true }],
  };

  it('não apaga nem reescreve gastos ao preparar o esquema novo', () => {
    const preparado = prepararDocumentoUsuario(legado);
    assert.deepEqual(preparado['2026-11'], legado['2026-11']);
    assert.deepEqual(preparado['2026-10'], legado['2026-10']);
    assert.equal(preparado.schemaVersion, SCHEMA_VERSION);
    assert.deepEqual(
      preparado.contas.map((c) => c.id),
      [...CONTA_IDS],
    );
    assert.deepEqual(chavesDeMesNoDocumento(preparado).sort(), ['2026-10', '2026-11']);
    assert.equal(gastosDoMes(preparado, '2026-11')[0].dividido, true);
  });

  it('preserva schemaVersion e contas já gravados', () => {
    const comCampos = {
      ...legado,
      schemaVersion: 1,
      contas: [{ id: 'bb', nome: 'BB' }],
    };
    const preparado = prepararDocumentoUsuario(comCampos);
    assert.equal(preparado.schemaVersion, 1);
    assert.equal(preparado.contas.length, 1);
    assert.equal(preparado.contas[0].id, 'bb');
  });
});

describe('lançamentos tipados (RN-01)', () => {
  it('cria lançamento com id estável e campos obrigatórios', () => {
    const id = '11111111-2222-4333-8444-555555555555';
    const lanc = criarLancamento({
      id,
      tipo: 'saida',
      data: '2026-11-25',
      valorCentavos: 4500,
      contaId: 'bb',
      categoria: 'comida_fora',
      formaPagamento: 'débito',
      descricao: 'almoço',
      reembolsoAReceber: true,
      itens: [{ nome: 'prato', valor: 4000 }, { nome: 'suco', valor: 500 }],
    });
    assert.equal(lanc.id, id);
    assert.equal(validarLancamento(lanc), null);
    assert.equal(lanc.itens.length, 2);
  });

  it('gera UUID quando o id não é informado', () => {
    const lanc = criarLancamento({
      tipo: 'entrada',
      data: '2026-11-25',
      valorCentavos: 100,
      contaId: 'mercado-pago',
      categoria: 'outros',
      descricao: 'ajuste pix',
    });
    assert.match(lanc.id, /^[0-9a-f-]{36}$/i);
    assert.equal(lanc.reembolsoAReceber, false);
  });

  it('rejeita tipo fora de RN-01 e categoria desconhecida', () => {
    assert.match(
      validarLancamento({
        id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
        tipo: 'compra',
        data: '2026-11-25',
        valorCentavos: 1,
        contaId: 'bb',
        categoria: 'mercado',
        formaPagamento: '',
        descricao: 'x',
        reembolsoAReceber: false,
      }),
      /tipo/i,
    );
    assert.ok(TIPOS_LANCAMENTO.includes('transferencia'));
    assert.ok(TIPOS_LANCAMENTO.includes('ajuste'));
    assert.ok(CATEGORIA_IDS.includes('lazer'));
    assert.equal(CONTAS_PADRAO.length, 3);
  });
});
