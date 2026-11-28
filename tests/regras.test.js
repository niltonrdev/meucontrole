import { readFileSync } from 'node:fs';
import { after, afterEach, before, describe, it } from 'node:test';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc } from 'firebase/firestore';

const PROJECT_ID = 'demo-meucontrole';
const REGRAS = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');

function lancamentoOk(id, extras = {}) {
  return {
    id,
    tipo: 'saida',
    data: '2026-11-25',
    valorCentavos: 1290,
    contaId: 'nubank-pj',
    categoria: 'mercado',
    formaPagamento: 'pix',
    descricao: 'feira',
    reembolsoAReceber: false,
    ...extras,
  };
}

const gastoLegado = {
  '2026-11': [{ descricao: 'Aluguel', valor: 2000, status: 'pago', dividido: false }],
};

describe('regras Firestore (emulador)', () => {
  let env;

  before(async () => {
    env = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      firestore: {
        rules: REGRAS,
        host: process.env.FIRESTORE_EMULATOR_HOST?.split(':')[0] || '127.0.0.1',
        port: Number(process.env.FIRESTORE_EMULATOR_HOST?.split(':')[1] || 8080),
      },
    });
  });

  afterEach(async () => {
    await env.clearFirestore();
  });

  after(async () => {
    await env.cleanup();
  });

  it('o dono lê e grava o documento users/{uid} no formato legado (setDoc inteiro)', async () => {
    const db = env.authenticatedContext('uid-nilton').firestore();
    const ref = doc(db, 'users', 'uid-nilton');
    await assertSucceeds(setDoc(ref, gastoLegado));
    const snap = await assertSucceeds(getDoc(ref));
    if (snap.data()['2026-11'][0].descricao !== 'Aluguel') {
      throw new Error('formato legado não persistiu');
    }
  });

  it('visitante anônimo não lê nem grava o documento do usuário', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'uid-nilton'), gastoLegado);
    });
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, 'users', 'uid-nilton')));
    await assertFails(setDoc(doc(anon, 'users', 'uid-nilton'), gastoLegado));
  });

  it('outro usuário autenticado não acessa o documento alheio', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users', 'uid-nilton'), gastoLegado);
    });
    const outro = env.authenticatedContext('uid-outra').firestore();
    await assertFails(getDoc(doc(outro, 'users', 'uid-nilton')));
    await assertFails(setDoc(doc(outro, 'users', 'uid-nilton'), { x: 1 }));
  });

  it('o dono cria lançamento válido na subcoleção (id do doc = id do lançamento)', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const db = env.authenticatedContext('uid-nilton').firestore();
    await assertSucceeds(setDoc(doc(db, `users/uid-nilton/lancamentos/${id}`), lancamentoOk(id)));
  });

  it('rejeita lançamento com tipo inválido', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-ffffffffffff';
    const db = env.authenticatedContext('uid-nilton').firestore();
    await assertFails(
      setDoc(doc(db, `users/uid-nilton/lancamentos/${id}`), lancamentoOk(id, { tipo: 'compra' })),
    );
  });

  it('rejeita valorCentavos não inteiro', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000001';
    const db = env.authenticatedContext('uid-nilton').firestore();
    await assertFails(
      setDoc(doc(db, `users/uid-nilton/lancamentos/${id}`), lancamentoOk(id, { valorCentavos: 10.5 })),
    );
  });

  it('outro usuário não grava lançamento na subcoleção alheia', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000002';
    const db = env.authenticatedContext('uid-outra').firestore();
    await assertFails(setDoc(doc(db, `users/uid-nilton/lancamentos/${id}`), lancamentoOk(id)));
  });

  it('o dono pode apagar o próprio lançamento', async () => {
    const id = 'aaaaaaaa-bbbb-4ccc-8ddd-000000000003';
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `users/uid-nilton/lancamentos/${id}`), lancamentoOk(id));
    });
    const db = env.authenticatedContext('uid-nilton').firestore();
    await assertSucceeds(deleteDoc(doc(db, `users/uid-nilton/lancamentos/${id}`)));
  });
});
