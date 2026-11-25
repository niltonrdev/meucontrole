import { initializeApp } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-auth.js';
import { getFirestore, doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/9.17.1/firebase-firestore.js';
import { formatarMesAno, partesDataSaoPaulo, chaveMes, somarMeses } from './fuso.js';
import { COLECAO_USUARIOS, prepararDocumentoUsuario } from './modelo.js';

// Configuração pública do Firebase Web (já usada em produção; não é um segredo de servidor).
const firebaseConfig = {
  apiKey: 'AIzaSyA-CCBbgUoYZP4JeuKtaJPpvuKRBzy_khw',
  authDomain: 'meucontrolenrn.firebaseapp.com',
  projectId: 'meucontrolenrn',
  storageBucket: 'meucontrolenrn.appspot.com',
  messagingSenderId: '959447387085',
  appId: '1:959447387085:web:4d8ea1f2efe4c67b511284',
};

const loadingState = document.getElementById('loadingState');
const homePage = document.getElementById('homePage');
const welcomeTitle = document.getElementById('welcomeTitle');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const enterAppBtn = document.getElementById('enterAppBtn');
const appContent = document.getElementById('appContent');
const saveChangesBtn = document.getElementById('saveChangesBtn');
const saveStatusText = document.getElementById('saveStatusText');
const [
  descricaoInput,
  valorInput,
  addGastoBtn,
  tabelaGastos,
  tabelaVaziaMsg,
  totalPendenteEl,
  totalPagoEl,
  totalGeralEl,
  totalPendenteFaturaEl,
  totalPagoFaturaEl,
  totalGeralFaturaEl,
  totalEsposaEl,
  totalEsposaDivididoEl,
  currentMonthDisplay,
  prevMonthBtn,
  nextMonthBtn,
  copyMonthBtn,
] = [
  'descricao',
  'valor',
  'addGasto',
  'tabelaGastos',
  'tabelaVazia',
  'totalPendente',
  'totalPago',
  'totalGeral',
  'totalPendenteFatura',
  'totalPagoFatura',
  'totalGeralFatura',
  'totalEsposa',
  'totalEsposaDividido',
  'currentMonthDisplay',
  'prevMonthBtn',
  'nextMonthBtn',
  'copyMonthBtn',
].map((id) => document.getElementById(id));

let allData = {};
const hojeSp = partesDataSaoPaulo();
let visaoMes = { year: hojeSp.year, month: hojeSp.month };
let userId = null;
let db;
let auth;
let unsubscribe;
let hasUnsavedChanges = false;

const getMonthKey = () => chaveMes(visaoMes.year, visaoMes.month);
const formatarMoeda = (valor) => (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatarDisplayMes = () => formatarMesAno(visaoMes.year, visaoMes.month);
const escapeHtmlAttr = (str) =>
  String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
const valorMinhaParte = (gasto) => (gasto.dividido ? gasto.valor / 2 : gasto.valor);

const atualizarParteDividida = (tr, gasto) => {
  if (!tr) return;
  let parteEl = tr.querySelector('.dividido-parte');
  if (gasto.dividido) {
    const texto = `Sua parte: ${formatarMoeda(valorMinhaParte(gasto))}`;
    if (parteEl) parteEl.textContent = texto;
    else {
      parteEl = document.createElement('p');
      parteEl.className = 'dividido-parte text-xs text-indigo-600 dark:text-indigo-400 mt-0.5';
      parteEl.textContent = texto;
      tr.querySelector('.valor-cell')?.appendChild(parteEl);
    }
  } else if (parteEl) {
    parteEl.remove();
  }
};

function showSaveButton() {
  if (hasUnsavedChanges) return;
  hasUnsavedChanges = true;
  saveChangesBtn.classList.remove('hidden');
  saveStatusText.textContent = 'Você tem alterações não salvas.';
}

async function handleSaveChanges() {
  if (!hasUnsavedChanges || !userId) return;

  saveChangesBtn.disabled = true;
  saveChangesBtn.textContent = 'Salvando...';
  saveStatusText.textContent = '';

  try {
    // Mesmo contrato de antes: reescreve o documento users/{uid} inteiro
    // (gastos fixos por mês). Lançamentos futuros ficam na subcoleção e não entram aqui.
    await setDoc(doc(db, COLECAO_USUARIOS, userId), allData);
    saveChangesBtn.classList.add('hidden');
    saveStatusText.textContent = 'Salvo com sucesso!';
    hasUnsavedChanges = false;
  } catch (error) {
    console.error('Erro ao salvar:', error);
    saveStatusText.textContent = 'Erro ao salvar. Tente novamente.';
  } finally {
    saveChangesBtn.disabled = false;
    saveChangesBtn.textContent = 'Salvar Alterações';
    setTimeout(() => {
      if (!hasUnsavedChanges) saveStatusText.textContent = '';
    }, 3000);
  }
}

const handleLogin = () => {
  const provider = new GoogleAuthProvider();
  signInWithPopup(auth, provider).catch((error) => console.error('Erro no login com Google:', error));
};

const handleLogout = () => {
  if (hasUnsavedChanges && !confirm('Você tem alterações não salvas. Deseja sair mesmo assim?')) {
    return;
  }
  signOut(auth).catch((error) => console.error('Erro no logout:', error));
};

const renderizarTabela = (gastos) => {
  tabelaGastos.innerHTML = '';
  tabelaVaziaMsg.style.display = gastos.length === 0 ? 'block' : 'none';
  gastos.forEach((gasto, index) => {
    if (gasto.dividido === undefined) gasto.dividido = false;
    const tr = document.createElement('tr');
    tr.className = `transition-colors duration-300 ${gasto.status === 'pago' ? 'status-pago' : 'status-pendente'}`;
    tr.innerHTML = `
                    <td class="table-cell"><input type="text" class="descricao-input text-sm font-medium" value="${escapeHtmlAttr(gasto.descricao)}" data-index="${index}"></td>
                    <td class="table-cell valor-cell"><input type="number" class="valor-input" value="${gasto.valor.toFixed(2)}" data-index="${index}" step="0.01" title="Valor total da fatura">${gasto.dividido ? `<p class="dividido-parte text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">Sua parte: ${formatarMoeda(valorMinhaParte(gasto))}</p>` : ''}</td>
                    <td class="table-cell text-center"><label class="inline-flex items-center justify-center cursor-pointer" title="Dividir com esposa (metade para você)"><input type="checkbox" class="dividido-checkbox h-5 w-5 rounded" data-index="${index}" ${gasto.dividido ? 'checked' : ''}><span class="sr-only">Dividido</span></label></td>
                    <td class="table-cell"><select class="status-select w-full h-10 rounded-md" data-index="${index}"><option value="pendente" ${gasto.status === 'pendente' ? 'selected' : ''}>Pendente</option><option value="pago" ${gasto.status === 'pago' ? 'selected' : ''}>Pago</option></select></td>
                    <td class="table-cell text-center"><button class="delete-btn text-red-500 hover:text-red-700" data-index="${index}"><svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5 mx-auto" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" /></svg></button></td>
                `;
    tabelaGastos.appendChild(tr);
  });
  atualizarTotais(gastos);
};

const atualizarTotais = (gastos = []) => {
  const pendentes = gastos.filter((g) => g.status === 'pendente');
  const pagos = gastos.filter((g) => g.status === 'pago');
  const totalPendente = pendentes.reduce((acc, g) => acc + valorMinhaParte(g), 0);
  const totalPago = pagos.reduce((acc, g) => acc + valorMinhaParte(g), 0);
  const totalGeral = gastos.reduce((acc, g) => acc + valorMinhaParte(g), 0);
  const faturaPendente = pendentes.reduce((acc, g) => acc + g.valor, 0);
  const faturaPago = pagos.reduce((acc, g) => acc + g.valor, 0);
  const faturaGeral = gastos.reduce((acc, g) => acc + g.valor, 0);
  totalPendenteEl.textContent = formatarMoeda(totalPendente);
  totalPagoEl.textContent = formatarMoeda(totalPago);
  totalGeralEl.textContent = formatarMoeda(totalGeral);
  totalPendenteFaturaEl.textContent = `Faturas: ${formatarMoeda(faturaPendente)}`;
  totalPagoFaturaEl.textContent = `Faturas: ${formatarMoeda(faturaPago)}`;
  totalGeralFaturaEl.textContent = `Faturas: ${formatarMoeda(faturaGeral)}`;
  const gastosDivididos = gastos.filter((g) => g.dividido);
  const totalContasDivididas = gastosDivididos.reduce((acc, g) => acc + g.valor, 0);
  const parteEsposa = totalContasDivididas / 2;
  totalEsposaEl.textContent = formatarMoeda(parteEsposa);
  totalEsposaDivididoEl.textContent = `Contas divididas: ${formatarMoeda(totalContasDivididas)}`;
};

const displayMonthData = () => {
  const monthKey = getMonthKey();
  if (!allData[monthKey]) allData[monthKey] = [];
  currentMonthDisplay.textContent = formatarDisplayMes();
  renderizarTabela(allData[monthKey]);
};

function handleTableActions(event) {
  const target = event.target;
  const monthKey = getMonthKey();
  const index = target.dataset.index;
  if (!allData[monthKey] || !allData[monthKey][index]) return;

  if (target.classList.contains('status-select')) {
    allData[monthKey][index].status = target.value;
    const tr = target.closest('tr');
    if (tr) tr.className = `transition-colors duration-300 ${target.value === 'pago' ? 'status-pago' : 'status-pendente'}`;
    atualizarTotais(allData[monthKey]);
  } else if (target.classList.contains('valor-input')) {
    const novoValor = parseFloat(target.value);
    if (!isNaN(novoValor) && novoValor >= 0) {
      allData[monthKey][index].valor = novoValor;
      atualizarParteDividida(target.closest('tr'), allData[monthKey][index]);
    }
    atualizarTotais(allData[monthKey]);
  } else if (target.classList.contains('dividido-checkbox')) {
    allData[monthKey][index].dividido = target.checked;
    atualizarParteDividida(target.closest('tr'), allData[monthKey][index]);
    atualizarTotais(allData[monthKey]);
  } else if (target.classList.contains('descricao-input')) {
    const novaDescricao = target.value.trim();
    if (novaDescricao !== '') {
      allData[monthKey][index].descricao = novaDescricao;
    } else {
      target.value = allData[monthKey][index].descricao;
    }
  } else if (target.closest('.delete-btn')) {
    allData[monthKey].splice(target.closest('.delete-btn').dataset.index, 1);
    displayMonthData();
  } else {
    return;
  }
  showSaveButton();
}

const adicionarGasto = () => {
  const descricao = descricaoInput.value.trim();
  const valor = parseFloat(valorInput.value);
  if (descricao === '' || isNaN(valor) || valor <= 0) {
    alert('Preencha a descrição e um valor válido.');
    return;
  }
  const monthKey = getMonthKey();
  if (!allData[monthKey]) allData[monthKey] = [];
  allData[monthKey].push({ descricao, valor, status: 'pendente', dividido: false });
  descricaoInput.value = '';
  valorInput.value = '';
  descricaoInput.focus();
  displayMonthData();
  showSaveButton();
};

const handleMonthChange = (direction) => {
  if (hasUnsavedChanges && !confirm('Você tem alterações não salvas. Deseja mudar de mês e descartá-las?')) return;
  hasUnsavedChanges = false;
  saveChangesBtn.classList.add('hidden');
  saveStatusText.textContent = '';
  visaoMes = somarMeses(visaoMes.year, visaoMes.month, direction);
  displayMonthData();
};

const handleCopyToNextMonth = () => {
  const currentMonthKey = getMonthKey();
  const gastosAtuais = allData[currentMonthKey];
  if (!gastosAtuais || gastosAtuais.length === 0) {
    alert('Não há gastos para copiar.');
    return;
  }
  const proximo = somarMeses(visaoMes.year, visaoMes.month, 1);
  const nextMonthKey = chaveMes(proximo.year, proximo.month);
  const gastosCopiados = JSON.parse(JSON.stringify(gastosAtuais));
  gastosCopiados.forEach((gasto) => {
    gasto.status = 'pendente';
  });
  allData[nextMonthKey] = gastosCopiados;
  showSaveButton();
  handleMonthChange(1);
  alert('Gastos copiados. Clique em "Salvar Alterações" para confirmar.');
};

const showUIForLoggedInUser = (user) => {
  const nome = user.displayName ? user.displayName.split(' ')[0] : 'Usuário';
  welcomeTitle.textContent = `Olá, ${nome}!`;
  loginBtn.classList.add('hidden');
  enterAppBtn.classList.remove('hidden');
  logoutBtn.classList.remove('hidden');
};

const showUIForLoggedOutUser = () => {
  welcomeTitle.textContent = 'Seu Controle Financeiro';
  loginBtn.classList.remove('hidden');
  enterAppBtn.classList.add('hidden');
  logoutBtn.classList.add('hidden');
  appContent.classList.add('hidden');
  homePage.classList.remove('hidden');
  homePage.classList.add('flex');
};

function initialize() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, (user) => {
      loadingState.classList.add('hidden');
      homePage.classList.remove('hidden');
      homePage.classList.add('flex');

      if (unsubscribe) unsubscribe();

      if (user) {
        userId = user.uid;
        showUIForLoggedInUser(user);
        const userDocRef = doc(db, COLECAO_USUARIOS, userId);
        unsubscribe = onSnapshot(userDocRef, (snap) => {
          // Lê o documento legado como está. Campos novos (schemaVersion, contas)
          // só são preenchidos em memória; só sobem no Firestore no "Salvar Alterações".
          allData = prepararDocumentoUsuario(snap.exists() ? snap.data() : {});
          displayMonthData();
        });
      } else {
        userId = null;
        allData = prepararDocumentoUsuario({});
        hasUnsavedChanges = false;
        saveChangesBtn.classList.add('hidden');
        saveStatusText.textContent = '';
        showUIForLoggedOutUser();
        displayMonthData();
      }
    });

    loginBtn.addEventListener('click', handleLogin);
    logoutBtn.addEventListener('click', handleLogout);
    enterAppBtn.addEventListener('click', () => {
      homePage.classList.add('hidden');
      appContent.classList.remove('hidden');
    });
    saveChangesBtn.addEventListener('click', handleSaveChanges);
    tabelaGastos.addEventListener('change', handleTableActions);
    tabelaGastos.addEventListener('focusout', handleTableActions);
    tabelaGastos.addEventListener('click', handleTableActions);
    addGastoBtn.addEventListener('click', adicionarGasto);
    valorInput.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') adicionarGasto();
    });
    prevMonthBtn.addEventListener('click', () => handleMonthChange(-1));
    nextMonthBtn.addEventListener('click', () => handleMonthChange(1));
    copyMonthBtn.addEventListener('click', handleCopyToNextMonth);

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker
          .register('/service-worker.js')
          .then((reg) => console.log('Service Worker registrado.', reg))
          .catch((err) => console.log('Service Worker: Erro', err));
      });
    }
  } catch (error) {
    console.error('Erro na inicialização do Firebase:', error);
    loadingState.innerHTML = `<p class="text-red-500">Erro ao conectar. Verifique a configuração do Firebase.</p>`;
  }
}

initialize();
