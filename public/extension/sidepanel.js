// AutoApprove Companion — Controlador Multi-Tarefas & Macros Universais
let currentTasks = [];
let activeTask = null;

async function syncUI() {
  const {
    rpaTasks = [],
    rpaActiveTaskId,
    rpaStats = {},
    rpaLogs = [],
  } = await chrome.storage.local.get([
    'rpaTasks',
    'rpaActiveTaskId',
    'rpaStats',
    'rpaLogs',
  ]);

  currentTasks = rpaTasks;
  activeTask = rpaTasks.find((t) => t.id === rpaActiveTaskId) || rpaTasks[0];

  // Atualiza Seletor de Tarefas
  const selectEl = document.getElementById('select-active-task');
  if (selectEl) {
    selectEl.innerHTML = rpaTasks
      .map((t) => '<option value="' + t.id + '" ' + (activeTask && activeTask.id === t.id ? 'selected' : '') + '>' + t.name + '</option>')
      .join('');
  }

  // Atualiza Metadados da Tarefa
  if (activeTask) {
    document.getElementById('task-badge-category').textContent = activeTask.category || 'Geral';
    document.getElementById('task-badge-pattern').textContent =
      activeTask.pattern === 'list_detail_pagination'
        ? 'Tabela com Paginação'
        : activeTask.pattern === 'form_submission'
        ? 'Formulário'
        : 'Macro Livre';
    document.getElementById('task-steps-count').textContent = (activeTask.steps?.length || 0) + ' passos';
    document.getElementById('steps-task-title').textContent = activeTask.name;

    // Atualiza controles de repetição
    const repOnce = document.getElementById('rep-once');
    const repN = document.getElementById('rep-n');
    const repLoop = document.getElementById('rep-loop');
    const inputCount = document.getElementById('input-repeat-count');

    if (activeTask.repeatMode === 'once' && repOnce) repOnce.checked = true;
    if (activeTask.repeatMode === 'repeat_n' && repN) {
      repN.checked = true;
      if (inputCount) inputCount.value = String(activeTask.repeatCount || 10);
    }
    if (activeTask.repeatMode === 'loop_list' && repLoop) repLoop.checked = true;

    // Renderiza Passos Gravados
    renderStepsList(activeTask.steps || []);
  }

  // Atualiza Métricas
  document.getElementById('st-approved').textContent = String(rpaStats.approved || 0);
  document.getElementById('st-page').textContent = String(rpaStats.currentPage || 1);
  document.getElementById('st-status').textContent = rpaStats.status === 'running' ? 'Executando' : 'Pronto';

  // Atualiza Logs
  const logBox = document.getElementById('log-list');
  if (logBox) {
    logBox.innerHTML = rpaLogs
      .slice(0, 60)
      .map((l) => {
        const cls =
          l.outcome === 'approved' || l.level === 'success'
            ? 'log-success'
            : l.level === 'warn'
            ? 'log-warn'
            : l.level === 'error'
            ? 'log-error'
            : '';
        return '<div class="log-line ' + cls + '">[' + (l.timestamp || '').slice(11, 19) + '] ' + l.message + '</div>';
      })
      .join('');
  }
}

function renderStepsList(steps) {
  const container = document.getElementById('steps-list-container');
  const emptyState = document.getElementById('steps-empty-state');
  if (!container) return;

  if (steps.length === 0) {
    container.innerHTML = '';
    if (emptyState) emptyState.style.display = 'block';
    return;
  }

  if (emptyState) emptyState.style.display = 'none';

  container.innerHTML = steps
    .map(
      (s, idx) => `
    <div class="step-item">
      <div class="step-item-main">
        <div>
          <span class="step-badge-order">#${idx + 1}</span>
          <strong class="step-title">[${s.action.toUpperCase()}] ${s.label}</strong>
        </div>
        <span class="step-selector">${s.cssSelector}</span>
      </div>
      <button class="step-delete-btn" data-step-id="${s.id}" title="Excluir este passo">✕</button>
    </div>
  `
    )
    .join('');

  container.querySelectorAll('.step-delete-btn').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const stepId = btn.getAttribute('data-step-id');
      if (!activeTask || !stepId) return;
      activeTask.steps = activeTask.steps.filter((s) => s.id !== stepId);
      await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task: activeTask });
      syncUI();
    });
  });
}

// Troca de Tarefa Selecionada
document.getElementById('select-active-task')?.addEventListener('change', async (ev) => {
  const newTaskId = ev.target.value;
  await chrome.runtime.sendMessage({ type: 'SET_ACTIVE_TASK', taskId: newTaskId });
  syncUI();
});

// Criar Nova Tarefa
document.getElementById('btn-new-task')?.addEventListener('click', async () => {
  const taskName = prompt('Digite o nome da nova automação (ex: Preenchimento de Relatório, Baixar Faturas):');
  if (!taskName?.trim()) return;

  const newTask = {
    id: 'task-custom-' + Date.now(),
    name: taskName.trim(),
    description: 'Automação personalizada criada pelo usuário.',
    category: 'Personalizado',
    pattern: 'free_macro',
    targetUrl: 'about:blank',
    repeatMode: 'repeat_n',
    repeatCount: 1,
    steps: [],
  };

  await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task: newTask });
  syncUI();
  triggerRecording('free');
});

// Navegação de Abas Internas do Sidepanel
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    const target = btn.getAttribute('data-tab');
    document.getElementById(target)?.classList.add('active');
  });
});

// Ações Principais
document.getElementById('btn-start')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_BATCH_EXECUTION' });
  syncUI();
});

document.getElementById('btn-stop')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'STOP_BATCH_EXECUTION' });
  syncUI();
});

function triggerRecording(mode) {
  chrome.runtime.sendMessage({
    type: 'START_RECORDING_WIZARD',
    mode: mode || 'free',
    taskId: activeTask?.id,
  });
}

document.getElementById('btn-quick-record')?.addEventListener('click', () => triggerRecording('free'));
document.getElementById('btn-launch-free-record')?.addEventListener('click', () => triggerRecording('free'));
document.getElementById('btn-launch-wizard-record')?.addEventListener('click', () => triggerRecording('list_wizard'));
document.getElementById('btn-start-record-empty')?.addEventListener('click', () => triggerRecording('free'));

// Limpar Passos
document.getElementById('btn-clear-steps')?.addEventListener('click', async () => {
  if (!activeTask) return;
  if (confirm('Tem certeza que deseja apagar todos os passos gravados desta tarefa?')) {
    activeTask.steps = [];
    await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task: activeTask });
    syncUI();
  }
});

// Atualização de Modos de Repetição
document.querySelectorAll('input[name="repeatMode"]').forEach((radio) => {
  radio.addEventListener('change', async (ev) => {
    if (!activeTask) return;
    const mode = ev.target.value;
    activeTask.repeatMode = mode;
    if (mode === 'repeat_n') {
      const cnt = Number(document.getElementById('input-repeat-count')?.value) || 10;
      activeTask.repeatCount = cnt;
    }
    await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task: activeTask });
    syncUI();
  });
});

document.getElementById('input-repeat-count')?.addEventListener('input', async (ev) => {
  if (!activeTask || activeTask.repeatMode !== 'repeat_n') return;
  activeTask.repeatCount = Number(ev.target.value) || 1;
  await chrome.runtime.sendMessage({ type: 'SAVE_TASK', task: activeTask });
});

// Velocidades Anti-Bot
document.querySelectorAll('.speed-btn').forEach((btn) => {
  btn.addEventListener('click', async () => {
    document.querySelectorAll('.speed-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const speed = btn.getAttribute('data-speed');
    const { rpaWorkflow = {} } = await chrome.storage.local.get('rpaWorkflow');
    if (speed === 'human') {
      rpaWorkflow.baseDelayMs = 500;
      rpaWorkflow.randomJitterMs = 400;
    } else if (speed === 'fast') {
      rpaWorkflow.baseDelayMs = 200;
      rpaWorkflow.randomJitterMs = 150;
    } else {
      rpaWorkflow.baseDelayMs = 50;
      rpaWorkflow.randomJitterMs = 40;
    }
    await chrome.storage.local.set({ rpaWorkflow });
  });
});

// Exportar CSV
document.getElementById('btn-export-csv')?.addEventListener('click', async () => {
  const { rpaLogs = [] } = await chrome.storage.local.get('rpaLogs');
  const csv = ['timestamp,level,outcome,message']
    .concat(
      rpaLogs.map(
        (l) => '"' + l.timestamp + '","' + l.level + '","' + (l.outcome || '') + '","' + (l.message || '').replace(/"/g, '""') + '"'
      )
    )
    .join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'auditoria_extensao_rpa.csv';
  a.click();
});

chrome.storage.onChanged.addListener(syncUI);
syncUI();
