// ============================================================
// GEM Alfragide — Script de Exportação v3
// Instalar: Google Sheets → Extensões → Apps Script → colar → Guardar
// Utilizar: menu "📅 GEM Alfragide" → "Exportar para GEM"
//           (ou "Diagnóstico" para verificar nomes das folhas)
//
// v3: Remove folha Horários (não necessária para geração);
//     Férias/Ausências exportam só linhas com dados reais;
//     Mês anterior exporta apenas últimas 8 colunas (carryover).
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 GEM Alfragide')
    .addItem('Exportar para GEM', 'exportarParaGEM')
    .addItem('Diagnóstico (listar folhas)', 'diagnostico')
    .addToUi();
}

// ── DIAGNÓSTICO ──────────────────────────────────────────────
function diagnostico() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const folhas = ss.getSheets();
  const linhas = folhas.map(f =>
    '"' + f.getName() + '"  →  ' + f.getLastRow() + ' linhas, ' + f.getLastColumn() + ' colunas'
  );
  SpreadsheetApp.getUi().alert(
    'Folhas detetadas em "' + ss.getName() + '":\n\n' + linhas.join('\n')
  );
}

// ── EXPORTAÇÃO ───────────────────────────────────────────────
function exportarParaGEM() {
  const ss  = SpreadsheetApp.getActiveSpreadsheet();
  const ui  = SpreadsheetApp.getUi();

  // 5 secções obrigatórias (Horários removido — GEM gera TSV directamente)
  const SECÇÕES = [
    { secção: 'Equipa e regras', variantes: ['Equipa e regras', 'equipa e regras', 'EQUIPA E REGRAS'], modo: 'completo' },
    { secção: 'Códigos',         variantes: ['Códigos', 'Codigos', 'codigos', 'CÓDIGOS', 'CODIGOS'],   modo: 'completo' },
    { secção: 'Férias',          variantes: ['Férias', 'Ferias', 'ferias', 'FÉRIAS', 'FERIAS'],         modo: 'sparse'   },
    { secção: 'Ausências',       variantes: ['Ausências', 'Ausencias', 'ausencias', 'AUSÊNCIAS', 'AUSENCIAS'], modo: 'sparse' },
  ];

  const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho',
                    'julho','agosto','setembro','outubro','novembro','dezembro'];

  let csv    = '';
  let avisos = [];

  // 1 — Exportar as 4 folhas obrigatórias
  for (const cfg of SECÇÕES) {
    const folha = encontrarFolha(ss, cfg.variantes);
    if (!folha) {
      avisos.push('Folha não encontrada: "' + cfg.secção + '"');
      continue;
    }
    const dados = cfg.modo === 'sparse' ? toCsvSparse(folha) : toCsv(folha);
    if (!dados) {
      // Férias/Ausências vazias são válidas (sem férias/ausências no mês)
      csv += '=== ' + cfg.secção + ' ===\n(sem registos este mês)\n\n';
      continue;
    }
    csv += '=== ' + cfg.secção + ' ===\n' + dados + '\n\n';
  }

  // 2 — Encontrar a folha do mês anterior
  let ultimaFolhaMes = null;
  for (const folha of ss.getSheets()) {
    const nome = folha.getName().toLowerCase();
    if (MESES_PT.some(m => nome.includes(m))) {
      ultimaFolhaMes = folha;
    }
  }

  if (!ultimaFolhaMes) {
    avisos.push('Nenhuma folha de mês encontrada — carryover não incluído.');
  } else {
    // Exportar apenas as últimas 8 colunas (suficiente para carryover)
    const dados = toCsvUltimasColunas(ultimaFolhaMes, 8);
    if (dados) {
      csv += '=== ' + ultimaFolhaMes.getName() + ' (últimos 8 dias) ===\n' + dados + '\n\n';
    } else {
      avisos.push('Folha de mês "' + ultimaFolhaMes.getName() + '" está vazia.');
    }
  }

  if (!csv.trim()) {
    ui.alert(
      '❌ Ficheiro vazio',
      'Nenhuma folha foi exportada.\n\n' +
      'Corre o "Diagnóstico" para ver os nomes exactos das folhas.\n\n' +
      (avisos.length ? 'Problemas:\n' + avisos.join('\n') : ''),
      ui.ButtonSet.OK
    );
    return;
  }

  // 3 — Guardar no Drive (raiz), substituindo versão anterior
  const NOME_FICHEIRO = 'alfragide-gem.csv';
  const raiz = DriveApp.getRootFolder();
  const existentes = raiz.getFilesByName(NOME_FICHEIRO);
  while (existentes.hasNext()) existentes.next().setTrashed(true);
  const ficheiro = raiz.createFile(NOME_FICHEIRO, csv, MimeType.CSV);

  const prefixo = avisos.length ? '⚠️ Avisos:\n' + avisos.join('\n') + '\n\n' : '';
  ui.alert(
    '✅ GEM Export v3 — Concluído',
    prefixo +
    'Ficheiro criado: ' + NOME_FICHEIRO + '\n\n' +
    'Descarrega em:\n' + ficheiro.getDownloadUrl() + '\n\n' +
    'Depois anexa no GEM e envia o pedido de horário.',
    ui.ButtonSet.OK
  );
}

// ── UTILITÁRIOS ──────────────────────────────────────────────

function encontrarFolha(ss, variantes) {
  for (const v of variantes) {
    const f = ss.getSheetByName(v);
    if (f) return f;
  }
  for (const folha of ss.getSheets()) {
    const nome = folha.getName().trim().toLowerCase();
    for (const v of variantes) {
      if (nome === v.toLowerCase()) return folha;
    }
  }
  return null;
}

// Exporta folha completa
function toCsv(folha) {
  if (folha.getLastRow() === 0) return '';
  const dados = folha.getDataRange().getValues();
  if (!dados || dados.length === 0) return '';
  return dados.map(row => linhaParaCsv(row)).join('\n');
}

// Exporta só a linha de cabeçalho + linhas com pelo menos 1 célula não vazia/não-zero
// após a primeira coluna (nome/ID do colaborador)
function toCsvSparse(folha) {
  if (folha.getLastRow() === 0) return '';
  const dados = folha.getDataRange().getValues();
  if (!dados || dados.length === 0) return '';

  const resultado = [];
  for (let i = 0; i < dados.length; i++) {
    const row = dados[i];
    if (i === 0) {
      // Sempre incluir cabeçalho
      resultado.push(linhaParaCsv(row));
      continue;
    }
    // Incluir linha só se tiver algum valor não-vazio e não-zero após a 1ª coluna
    const temDados = row.slice(1).some(c => {
      const v = String(c).trim();
      return v !== '' && v !== '0';
    });
    if (temDados) {
      resultado.push(linhaParaCsv(row));
    }
  }
  // Se só ficou o cabeçalho, retornar null (secção vazia)
  return resultado.length > 1 ? resultado.join('\n') : null;
}

// Exporta apenas as últimas N colunas (para carryover do mês anterior)
// Mantém sempre a coluna 0 (nome do colaborador)
function toCsvUltimasColunas(folha, n) {
  if (folha.getLastRow() === 0) return '';
  const dados = folha.getDataRange().getValues();
  if (!dados || dados.length === 0) return '';

  const numCols = dados[0].length;
  // Coluna 0 = nome; últimas n colunas de dados
  const inicio = Math.max(1, numCols - n);

  return dados.map(row => {
    const recortada = [row[0], ...row.slice(inicio)];
    return linhaParaCsv(recortada);
  }).join('\n');
}

function linhaParaCsv(row) {
  return row.map(c => {
    if (c instanceof Date) {
      return Utilities.formatDate(c, Session.getScriptTimeZone(), 'dd/MM/yyyy');
    }
    const s = String(c);
    if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }).join(',');
}
