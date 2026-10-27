// AutoApprove RPA — Background Service Worker (Manifest V3)
// Gerenciador Multi-Tarefas Universais (Aprovações IAM, Macros Livres, Relatórios, Cadastros)
const DEFAULT_TASKS = [
  {
    "id": "task-iam-approvals",
    "name": "Aprovação de Acessos IAM em Lote (418 Itens)",
    "description": "Itera sobre solicitações pendentes, abre subpágina/modal, assina conformidade, concede vigência de 90 dias e avança páginas.",
    "category": "Segurança & IAM",
    "pattern": "list_detail_pagination",
    "targetUrl": "http://localhost:3000/iam-portal.html",
    "repeatMode": "loop_list",
    "repeatCount": 418,
    "steps": [
      {
        "id": "step-1",
        "order": 1,
        "label": "Selecionar linha da solicitação pendente na grade",
        "action": "click",
        "cssSelector": "tr[data-request-status=\"pending\"]:first-of-type",
        "ariaSelector": "role=row[name=/IAM-2026/i]",
        "waitBeforeMs": 280,
        "timeoutMs": 8000,
        "isLoopTarget": true
      },
      {
        "id": "step-2",
        "order": 2,
        "label": "Marcar aceite de conformidade LGPD / Governança",
        "action": "check",
        "cssSelector": "input[data-testid=\"policy-compliance-checkbox\"]",
        "ariaSelector": "role=checkbox[name=\"Confirmo revisão de alçada e conformidade\"]",
        "waitBeforeMs": 240,
        "timeoutMs": 5000,
        "isLoopTarget": true
      },
      {
        "id": "step-3",
        "order": 3,
        "label": "Selecionar vigência padrão de concessão (90 dias)",
        "action": "select",
        "cssSelector": "select[data-testid=\"grant-duration-select\"]",
        "ariaSelector": "role=combobox[name=\"Vigência da concessão\"]",
        "value": "90d",
        "waitBeforeMs": 220,
        "timeoutMs": 5000,
        "isLoopTarget": true
      },
      {
        "id": "step-4",
        "order": 4,
        "label": "Acionar botão primário Aprovar Concessão",
        "action": "click",
        "cssSelector": "button[data-action=\"approve-access\"]",
        "ariaSelector": "role=button[name=\"Aprovar Concessão\"]",
        "waitBeforeMs": 320,
        "timeoutMs": 6000,
        "isLoopTarget": true
      },
      {
        "id": "step-5",
        "order": 5,
        "label": "Confirmar efetivação no diálogo de auditoria",
        "action": "click",
        "cssSelector": "button[data-action=\"confirm-modal-submit\"]",
        "ariaSelector": "role=button[name=\"Confirmar e Assinar\"]",
        "waitBeforeMs": 300,
        "timeoutMs": 8000,
        "isLoopTarget": true
      }
    ],
    "listConfig": {
      "listRowSelector": "tr.linha-solicitacao-pendente, tr[data-status=\"pending\"]",
      "openDetailSelector": "button[data-action=\"abrir-detalhe\"], button.btn-abrir-detalhe, .btn-primary",
      "returnMode": "auto",
      "returnSelector": "button#btn-cancelar-aprovacao, button.btn-voltar",
      "paginationEnabled": true,
      "itemsPerPage": 10,
      "nextPageSelector": "button#btn-proxima-pagina, a.pagination-next"
    }
  },
  {
    "id": "task-report-export",
    "name": "Exportação Periódica de Relatórios Financeiros",
    "description": "Navega até o módulo de relatórios, filtra por período contábil, seleciona formato Excel XLSX e dispara o download.",
    "category": "Finanças & Controladoria",
    "pattern": "free_macro",
    "targetUrl": "https://portal.empresa.com.br/relatorios",
    "repeatMode": "once",
    "steps": [
      {
        "id": "step-rep-1",
        "order": 1,
        "label": "Acessar menu Relatórios Gerenciais",
        "action": "click",
        "cssSelector": "a[href*=\"/relatorios\"], button#menu-relatorios",
        "ariaSelector": "role=link[name=\"Relatórios\"]",
        "waitBeforeMs": 500,
        "timeoutMs": 8000,
        "isLoopTarget": false
      },
      {
        "id": "step-rep-2",
        "order": 2,
        "label": "Selecionar período: \"Último Trimestre\"",
        "action": "select",
        "cssSelector": "select#periodo-filtro, select[name=\"filtroPeriodo\"]",
        "ariaSelector": "role=combobox[name=\"Período\"]",
        "value": "trimestre_anterior",
        "waitBeforeMs": 300,
        "timeoutMs": 5000,
        "isLoopTarget": false
      },
      {
        "id": "step-rep-3",
        "order": 3,
        "label": "Clicar em Gerar e Exportar Planilha Excel (.xlsx)",
        "action": "click",
        "cssSelector": "button#btn-exportar-excel, button[data-action=\"export-xlsx\"]",
        "ariaSelector": "role=button[name=\"Exportar Excel\"]",
        "waitBeforeMs": 400,
        "timeoutMs": 12000,
        "isLoopTarget": false
      }
    ]
  },
  {
    "id": "task-supplier-registry",
    "name": "Cadastro em Lote de Fornecedores / Colaboradores",
    "description": "Preenche múltiplos formulários com Razão Social, CNPJ, dados bancários e termo de homologação.",
    "category": "Compras & Suprimentos",
    "pattern": "form_submission",
    "targetUrl": "https://compras.empresa.com.br/fornecedores/novo",
    "repeatMode": "repeat_n",
    "repeatCount": 50,
    "steps": [
      {
        "id": "step-sup-1",
        "order": 1,
        "label": "Preencher CNPJ / Matrícula",
        "action": "fill",
        "cssSelector": "input#input-cnpj, input[name=\"documento\"]",
        "ariaSelector": "role=textbox[name=\"Documento\"]",
        "value": "33.041.260/0652-90",
        "waitBeforeMs": 250,
        "timeoutMs": 5000,
        "isLoopTarget": true
      },
      {
        "id": "step-sup-2",
        "order": 2,
        "label": "Clicar em Consultar na Receita Federal",
        "action": "click",
        "cssSelector": "button#btn-consultar-cnpj",
        "ariaSelector": "role=button[name=\"Consultar\"]",
        "waitBeforeMs": 400,
        "timeoutMs": 10000,
        "isLoopTarget": true
      },
      {
        "id": "step-sup-3",
        "order": 3,
        "label": "Salvar e Concluir Homologação",
        "action": "click",
        "cssSelector": "button#btn-salvar-homologacao, button[type=\"submit\"]",
        "ariaSelector": "role=button[name=\"Salvar\"]",
        "waitBeforeMs": 300,
        "timeoutMs": 8000,
        "isLoopTarget": true
      }
    ]
  },
  {
    "id": "task-free-recorder",
    "name": "Macro Universal Livre (Gravação de Qualquer Tarefa)",
    "description": "Modo livre sem restrições. Você clica na tela e o robô aprende exatamente a sequência que você realizou.",
    "category": "Universal / Personalizado",
    "pattern": "free_macro",
    "targetUrl": "about:blank",
    "repeatMode": "repeat_n",
    "repeatCount": 1,
    "steps": []
  }
];
const DEFAULT_CONFIG = {
  "targetUrl": "https://governanca.empresa.com.br/iam/aprovacoes-pendentes",
  "baseDelayMs": 420,
  "randomJitterMs": 380,
  "maxRetries": 3,
  "activeTaskId": "task-iam-approvals"
};

chrome.runtime.onInstalled.addListener(async () => {
  const stored = await chrome.storage.local.get([
    'rpaTasks',
    'rpaActiveTaskId',
    'rpaWorkflow',
    'rpaLogs',
    'rpaStats',
  ]);

  if (!stored.rpaTasks || !Array.isArray(stored.rpaTasks) || stored.rpaTasks.length === 0) {
    await chrome.storage.local.set({ rpaTasks: DEFAULT_TASKS });
  }
  if (!stored.rpaActiveTaskId) {
    await chrome.storage.local.set({ rpaActiveTaskId: 'task-iam-approvals' });
  }
  if (!stored.rpaWorkflow) {
    await chrome.storage.local.set({ rpaWorkflow: DEFAULT_CONFIG });
  }
  if (!stored.rpaLogs) {
    await chrome.storage.local.set({ rpaLogs: [] });
  }
  if (!stored.rpaStats) {
    await chrome.storage.local.set({
      rpaStats: {
        status: 'idle',
        approved: 0,
        failed: 0,
        currentPage: 1,
        totalItems: 418,
        activeTabId: null,
      },
    });
  }

  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  }
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== 'rpa-heartbeat') return;
  const { rpaStats } = await chrome.storage.local.get('rpaStats');
  if (rpaStats?.status === 'running' && rpaStats.activeTabId) {
    try {
      await chrome.tabs.sendMessage(rpaStats.activeTabId, { type: 'RPA_PING' });
    } catch {
      // Tab closed or navigating
    }
  }
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    if (msg.type === 'SET_ACTIVE_TASK') {
      await chrome.storage.local.set({ rpaActiveTaskId: msg.taskId });
      sendResponse({ ok: true });
    } else if (msg.type === 'SAVE_TASK') {
      const { rpaTasks = [] } = await chrome.storage.local.get('rpaTasks');
      const idx = rpaTasks.findIndex((t) => t.id === msg.task.id);
      let updated;
      if (idx >= 0) {
        updated = [...rpaTasks];
        updated[idx] = msg.task;
      } else {
        updated = [msg.task, ...rpaTasks];
      }
      await chrome.storage.local.set({ rpaTasks: updated, rpaActiveTaskId: msg.task.id });
      sendResponse({ ok: true });
    } else if (msg.type === 'DELETE_TASK') {
      const { rpaTasks = [] } = await chrome.storage.local.get('rpaTasks');
      const filtered = rpaTasks.filter((t) => t.id !== msg.taskId);
      const nextActive = filtered[0]?.id || 'task-iam-approvals';
      await chrome.storage.local.set({ rpaTasks: filtered, rpaActiveTaskId: nextActive });
      sendResponse({ ok: true });
    } else if (msg.type === 'START_BATCH_EXECUTION') {
      try {
        let [targetTab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!targetTab?.id) {
          const allTabs = await chrome.tabs.query({});
          targetTab = allTabs[0];
        }
        if (!targetTab?.id) {
          sendResponse({ ok: false, error: 'Nenhuma aba ativa encontrada.' });
          return;
        }

        const { rpaTasks = [], rpaActiveTaskId, rpaWorkflow = {}, rpaStats = {} } =
          await chrome.storage.local.get(['rpaTasks', 'rpaActiveTaskId', 'rpaWorkflow', 'rpaStats']);

        const activeTask =
          rpaTasks.find((t) => t.id === rpaActiveTaskId) || rpaTasks[0] || DEFAULT_TASKS[0];

        await chrome.alarms.create('rpa-heartbeat', { periodInMinutes: 0.1 });
        await chrome.storage.local.set({
          rpaStats: {
            ...rpaStats,
            status: 'running',
            activeTabId: targetTab.id,
          },
        });

        chrome.tabs.sendMessage(targetTab.id, {
          type: 'RPA_EXECUTE_TASK',
          task: activeTask,
          config: rpaWorkflow,
        }).catch(async () => {
          await chrome.scripting.executeScript({
            target: { tabId: targetTab.id },
            files: ['content.js'],
          });
          chrome.tabs.sendMessage(targetTab.id, {
            type: 'RPA_EXECUTE_TASK',
            task: activeTask,
            config: rpaWorkflow,
          });
        });

        sendResponse({ ok: true, tabId: targetTab.id });
      } catch (err) {
        sendResponse({ ok: false, error: 'Falha ao injetar comando na aba: ' + String(err) });
      }
    } else if (msg.type === 'STOP_BATCH_EXECUTION') {
      const { rpaStats } = await chrome.storage.local.get('rpaStats');
      if (rpaStats?.activeTabId) {
        chrome.tabs.sendMessage(rpaStats.activeTabId, { type: 'RPA_ABORT' }).catch(() => {});
      }
      await chrome.alarms.clear('rpa-heartbeat');
      await chrome.storage.local.set({
        rpaStats: { ...(rpaStats || {}), status: 'idle' },
      });
      sendResponse({ ok: true });
    } else if (msg.type === 'START_RECORDING_WIZARD') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        chrome.tabs.sendMessage(tab.id, {
          type: 'RPA_START_RECORDING',
          mode: msg.mode || 'free',
          taskId: msg.taskId,
        }).catch(async () => {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js'],
          });
          chrome.tabs.sendMessage(tab.id, {
            type: 'RPA_START_RECORDING',
            mode: msg.mode || 'free',
            taskId: msg.taskId,
          });
        });
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'SAVE_RECORDED_STEPS') {
      const { rpaTasks = [], rpaActiveTaskId } = await chrome.storage.local.get([
        'rpaTasks',
        'rpaActiveTaskId',
      ]);
      const targetId = msg.taskId || rpaActiveTaskId;
      const idx = rpaTasks.findIndex((t) => t.id === targetId);
      if (idx >= 0) {
        const updated = [...rpaTasks];
        updated[idx] = {
          ...updated[idx],
          steps: msg.steps,
          listConfig: msg.listConfig || updated[idx].listConfig,
        };
        await chrome.storage.local.set({ rpaTasks: updated });
      }
      sendResponse({ ok: true });
    } else if (msg.type === 'UPDATE_STATS') {
      const { rpaStats = {}, rpaLogs = [] } = await chrome.storage.local.get([
        'rpaStats',
        'rpaLogs',
      ]);
      const updatedStats = { ...rpaStats, ...msg.patch };
      let updatedLogs = rpaLogs;
      if (msg.logEntry) {
        updatedLogs = [msg.logEntry, ...rpaLogs].slice(0, 400);
      }
      await chrome.storage.local.set({ rpaStats: updatedStats, rpaLogs: updatedLogs });
      sendResponse({ ok: true });
    }
  })();
  return true;
});
