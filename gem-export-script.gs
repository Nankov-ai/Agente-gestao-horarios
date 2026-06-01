// ============================================================
// GEM Alfragide — Script de Exportação v2
// Instalar: Google Sheets → Extensões → Apps Script → colar → Guardar
// Utilizar: menu "📅 GEM Alfragide" → "Exportar para GEM"
//           (ou "Diagnóstico" para verificar nomes das folhas)
// ============================================================

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('📅 GEM Alfragide')
    .addItem('Exportar para GEM', 'exportarParaGEM')
    .addItem('Diagnóstico (listar folhas)', 'diagnostico')
    .addToUi();
}

// ── DIAGNÓSTICO ──────────────────────────────────────────────
// Corre isto primeiro para ver os nomes exatos das folhas
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

  // Nomes aceites para cada secção (variantes com e sem acento, maiúsculas)
  const SECÇÕES = [
    { secção: 'Equipa e regras', variantes: ['Equipa e regras', 'equipa e regras', 'EQUIPA E REGRAS'] },
    { secção: 'Códigos',         variantes: ['Códigos', 'Codigos', 'codigos', 'CÓDIGOS', 'CODIGOS'] },
    { secção: 'Horários',        variantes: ['Horários', 'Horarios', 'horarios', 'HORÁRIOS', 'HORARIOS'] },
    { secção: 'Férias',          variantes: ['Férias', 'Ferias', 'ferias', 'FÉRIAS', 'FERIAS'] },
    { secção: 'Ausências',       variantes: ['Ausências', 'Ausencias', 'ausencias', 'AUSÊNCIAS', 'AUSENCIAS'] },
  ];

  const MESES_PT = ['janeiro','fevereiro','março','abril','maio','junho',
                    'julho','agosto','setembro','outubro','novembro','dezembro'];

  let csv    = '';
  let avisos = [];

  // 1 — Exportar as 5 folhas obrigatórias
  for (const cfg of SECÇÕES) {
    const folha = encontrarFolha(ss, cfg.variantes);
    if (!folha) {
      avisos.push('Folha não encontrada: "' + cfg.secção + '"');
      continue;
    }
    const dados = toCsv(folha);
    if (!dados) {
      avisos.push('Folha sem dados: "' + cfg.secção + '"');
      continue;
    }
    csv += '=== ' + cfg.secção + ' ===\n' + dados + '\n\n';
  }

  // 2 — Encontrar a folha do mês anterior
  //     (última folha cujo nome contém um nome de mês)
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
    const dados = toCsv(ultimaFolhaMes);
    if (dados) {
      csv += '=== ' + ultimaFolhaMes.getName() + ' ===\n' + dados + '\n\n';
    } else {
      avisos.push('Folha de mês "' + ultimaFolhaMes.getName() + '" está vazia.');
    }
  }

  // Verificar se gerou algum conteúdo
  if (!csv.trim()) {
    ui.alert(
      '❌ Ficheiro vazio',
      'Nenhuma folha foi exportada.\n\n' +
      'Corre o "Diagnóstico" no menu para ver os nomes exactos das folhas\n' +
      'e confirma que o script está instalado no ficheiro correcto.\n\n' +
      (avisos.length ? 'Problemas encontrados:\n' + avisos.join('\n') : ''),
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

  // 4 — Mostrar resultado
  const prefixo = avisos.length ? '⚠️ Avisos:\n' + avisos.join('\n') + '\n\n' : '';
  ui.alert(
    '✅ GEM Export — Concluído',
    prefixo +
    'Ficheiro criado: ' + NOME_FICHEIRO + '\n\n' +
    'Descarrega em:\n' + ficheiro.getDownloadUrl() + '\n\n' +
    'Depois anexa no GEM e envia o pedido de horário.',
    ui.ButtonSet.OK
  );
}

// ── UTILITÁRIOS ──────────────────────────────────────────────

// Encontra a primeira folha cujo nome coincide com uma das variantes
function encontrarFolha(ss, variantes) {
  // Tentativa 1: match exato
  for (const v of variantes) {
    const f = ss.getSheetByName(v);
    if (f) return f;
  }
  // Tentativa 2: match case-insensitive sobre todas as folhas
  for (const folha of ss.getSheets()) {
    const nome = folha.getName().trim().toLowerCase();
    for (const v of variantes) {
      if (nome === v.toLowerCase()) return folha;
    }
  }
  return null;
}

// Converte uma folha para CSV com escape correcto
function toCsv(folha) {
  if (folha.getLastRow() === 0) return '';
  const dados = folha.getDataRange().getValues();
  if (!dados || dados.length === 0) return '';

  return dados.map(row =>
    row.map(c => {
      if (c instanceof Date) {
        return Utilities.formatDate(c, Session.getScriptTimeZone(), 'dd/MM/yyyy');
      }
      const s = String(c);
      if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
        return '"' + s.replace(/"/g, '""') + '"';
      }
      return s;
    }).join(',')
  ).join('\n');
}
