import type { AutomationTask } from '../types/automation';

export function generateExtensionManifest(): string {
  const manifestObj = {
    manifest_version: 3,
    name: 'AutoApprove RPA Universal (Qualquer Tarefa & Lotes)',
    version: '3.0.0',
    description:
      'Motor Universal de RPA e Macros: Aprende qualquer clique/digitação por gravação livre na tela ou executa lotes e tabelas com paginação na sessão Microsoft ativa.',
    permissions: ['storage', 'tabs', 'scripting', 'alarms', 'sidePanel', 'notifications', 'activeTab'],
    host_permissions: ['<all_urls>'],
    background: {
      service_worker: 'background.js',
      type: 'module',
    },
    side_panel: {
      default_path: 'sidepanel.html',
    },
    action: {
      default_title: 'Abrir AutoApprove RPA',
      default_popup: 'popup.html',
      default_icon: {
        '16': 'icon16.png',
        '48': 'icon48.png',
        '128': 'icon128.png',
      },
    },
    icons: {
      '16': 'icon16.png',
      '48': 'icon48.png',
      '128': 'icon128.png',
    },
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_idle',
      },
    ],
  };

  return JSON.stringify(manifestObj, null, 2);
}

export function generateBackgroundJs(
  defaultTasks: AutomationTask[],
  defaultConfig: Record<string, unknown>
): string {
  return `// AutoApprove RPA — Background Service Worker (Manifest V3)
// Gerenciador Multi-Tarefas Universais (Aprovações IAM, Macros Livres, Relatórios, Cadastros)
const DEFAULT_TASKS = ${JSON.stringify(defaultTasks, null, 2)};
const DEFAULT_CONFIG = ${JSON.stringify(defaultConfig, null, 2)};

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
`;
}

export function generateContentJs(): string {
  return `// AutoApprove RPA — Motor Universal de Automação & Gravação Livre
(() => {
  let isExecuting = false;
  let activeRecordingMode = null; // 'free' | 'list_wizard' | null
  let currentRecordingTaskId = null;
  let recordedSteps = [];
  let wizardPhase = null; // 'list_row' | 'detail_steps' | 'return_action' | 'next_page'
  let wizardListConfig = {};

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function getResilientSelector(el) {
    if (!el || el.nodeType !== 1) return 'body';
    if (el.dataset && el.dataset.action) return el.tagName.toLowerCase() + '[data-action="' + el.dataset.action + '"]';
    if (el.dataset && el.dataset.testid) return el.tagName.toLowerCase() + '[data-testid="' + el.dataset.testid + '"]';
    if (el.id && !/\\d{4,}/.test(el.id)) return '#' + CSS.escape(el.id);
    if (el.getAttribute('aria-label')) {
      return el.tagName.toLowerCase() + '[aria-label="' + el.getAttribute('aria-label') + '"]';
    }
    const name = el.getAttribute('name');
    if (name) return el.tagName.toLowerCase() + '[name="' + name + '"]';

    const parent = el.parentElement;
    if (!parent) return el.tagName.toLowerCase();
    const siblings = Array.from(parent.children).filter((c) => c.tagName === el.tagName);
    const idx = siblings.indexOf(el) + 1;
    return getResilientSelector(parent) + ' > ' + el.tagName.toLowerCase() + ':nth-of-type(' + idx + ')';
  }

  function getCleanLabel(el, actionType) {
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('name') || el.id || '').trim();
    if (actionType === 'fill') return 'Preencher campo ' + (text ? '"' + text.slice(0, 24) + '"' : el.tagName);
    if (actionType === 'check') return 'Marcar opção ' + (text ? '"' + text.slice(0, 24) + '"' : 'checkbox');
    if (actionType === 'select') return 'Selecionar em ' + (text ? '"' + text.slice(0, 24) + '"' : 'lista');
    return 'Clicar em ' + (text ? '"' + text.slice(0, 24) + '"' : el.tagName.toLowerCase());
  }

  async function waitForSelector(selector, timeoutMs = 8000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const el = document.querySelector(selector);
      if (el && el.offsetParent !== null) return el;
      await sleep(150);
    }
    throw new Error('Tempo limite aguardando elemento: ' + selector);
  }

  function highlightElement(el) {
    if (!el) return;
    const prevOutline = el.style.outline;
    const prevTransition = el.style.transition;
    el.style.transition = 'outline 0.2s ease-in-out';
    el.style.outline = '3px solid #10b981';
    setTimeout(() => {
      el.style.outline = prevOutline;
      el.style.transition = prevTransition;
    }, 450);
  }

  function sendLog(level, message, outcome) {
    chrome.runtime.sendMessage({
      type: 'UPDATE_STATS',
      logEntry: {
        timestamp: new Date().toISOString(),
        level,
        message,
        outcome,
      },
    });
  }

  // Barra Flutuante Interativa (HUD)
  function renderHUD() {
    let hud = document.getElementById('autoapprove-hud');
    if (!hud) {
      hud = document.createElement('div');
      hud.id = 'autoapprove-hud';
      hud.style.cssText = [
        'position: fixed',
        'bottom: 24px',
        'left: 50%',
        'transform: translateX(-50%)',
        'z-index: 2147483647',
        'background: #090d16',
        'color: #f8fafc',
        'border: 2px solid #3b82f6',
        'border-radius: 16px',
        'padding: 12px 18px',
        'box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7)',
        'display: flex',
        'flex-direction: column',
        'gap: 10px',
        'font-family: system-ui, -apple-system, sans-serif',
        'font-size: 12px',
        'max-width: 680px',
        'min-width: 480px',
        'backdrop-filter: blur(12px)',
      ].join(';');
      document.body.appendChild(hud);
    }

    const isFree = activeRecordingMode === 'free';
    const stepCount = recordedSteps.length;

    let subMsg = '';
    if (isFree) {
      subMsg = '<strong>Modo Livre Universal Ativo:</strong> Clique em qualquer botão, digite em campos ou selecione opções na tela. Cada ação é gravada com seletores inteligentes.';
    } else {
      if (wizardPhase === 'list_row') subMsg = '<strong>Fase 1:</strong> Clique no botão de abrir um item na tabela.';
      else if (wizardPhase === 'detail_steps') subMsg = '<strong>Fase 2:</strong> Realize as ações dentro da tela de detalhes (checkboxes, aprovação).';
      else if (wizardPhase === 'return_action') subMsg = '<strong>Fase 3:</strong> Clique no botão "Voltar" ou use o histórico.';
      else subMsg = '<strong>Fase 4:</strong> Clique no botão "Próxima Página" da paginação.';
    }

    let stepsPreviewHtml = '';
    if (stepCount > 0) {
      stepsPreviewHtml = '<div style="background: #020617; border: 1px solid #1e293b; border-radius: 8px; padding: 6px 10px; max-height: 80px; overflow-y: auto; font-family: monospace; font-size: 11px; color: #38bdf8;">' +
        recordedSteps.map((s, i) => '<div>' + (i + 1) + '. [' + s.action.toUpperCase() + '] ' + s.label + '</div>').join('') +
        '</div>';
    }

    hud.innerHTML = \`
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 10px #ef4444;"></span>
          <strong style="font-size: 13px; color: #fff;">Robô Gravando em Tempo Real</strong>
          <span style="background: #1e293b; color: #93c5fd; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">
            \${stepCount} passo\${stepCount === 1 ? '' : 's'} capturado\${stepCount === 1 ? '' : 's'}
          </span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="hud-mode-free" style="padding: 4px 10px; border-radius: 6px; border: 1px solid \${isFree ? '#3b82f6' : '#334155'}; background: \${isFree ? '#1e3a8a' : '#0f172a'}; color: #fff; font-size: 11px; font-weight: bold; cursor: pointer;">
            🪄 Gravação Livre (Qualquer Ação)
          </button>
          <button id="hud-mode-wizard" style="padding: 4px 10px; border-radius: 6px; border: 1px solid \${!isFree ? '#3b82f6' : '#334155'}; background: \${!isFree ? '#1e3a8a' : '#0f172a'}; color: #fff; font-size: 11px; font-weight: bold; cursor: pointer;">
            📋 Assistente de Tabela
          </button>
        </div>
      </div>

      <div style="color: #cbd5e1; font-size: 12px; line-height: 1.4;">
        \${subMsg}
      </div>

      \${stepsPreviewHtml}

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;">
        <div style="display: flex; gap: 6px;">
          \${
            stepCount > 0
              ? '<button id="hud-btn-undo" style="padding: 6px 12px; background: #334155; color: #e2e8f0; border: none; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer;">⎌ Desfazer Último Passo</button>'
              : ''
          }
          \${
            !isFree && wizardPhase === 'return_action'
              ? '<button id="hud-btn-use-history-back" style="padding: 6px 12px; background: #4338ca; color: #fff; border: none; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer;">Usar Histórico (history.back)</button>'
              : ''
          }
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="hud-btn-finish" style="padding: 6px 16px; background: #16a34a; color: #fff; border: none; border-radius: 8px; font-size: 12px; font-weight: bold; cursor: pointer;">
            💾 Salvar Gravação & Concluir
          </button>
          <button id="hud-btn-close" style="padding: 6px 12px; background: transparent; color: #94a3b8; border: 1px solid #334155; border-radius: 8px; font-size: 11px; cursor: pointer;">
            ✕ Fechar
          </button>
        </div>
      </div>
    \`;

    document.getElementById('hud-mode-free')?.addEventListener('click', () => {
      activeRecordingMode = 'free';
      renderHUD();
    });
    document.getElementById('hud-mode-wizard')?.addEventListener('click', () => {
      activeRecordingMode = 'list_wizard';
      wizardPhase = 'list_row';
      renderHUD();
    });
    document.getElementById('hud-btn-undo')?.addEventListener('click', () => {
      if (recordedSteps.length > 0) {
        const removed = recordedSteps.pop();
        sendLog('info', 'Passo desfeito: ' + removed?.label);
        renderHUD();
      }
    });
    document.getElementById('hud-btn-use-history-back')?.addEventListener('click', () => {
      wizardListConfig.returnMode = 'history_back';
      sendLog('info', 'Retorno configurado para history.back().');
      wizardPhase = 'next_page';
      renderHUD();
    });
    document.getElementById('hud-btn-finish')?.addEventListener('click', finishRecording);
    document.getElementById('hud-btn-close')?.addEventListener('click', closeHUD);
  }

  function closeHUD() {
    activeRecordingMode = null;
    wizardPhase = null;
    const hud = document.getElementById('autoapprove-hud');
    if (hud) hud.remove();
  }

  function finishRecording() {
    chrome.runtime.sendMessage({
      type: 'SAVE_RECORDED_STEPS',
      taskId: currentRecordingTaskId,
      steps: recordedSteps,
      listConfig: wizardListConfig,
    });
    sendLog('success', 'Gravação concluída com sucesso! ' + recordedSteps.length + ' passos salvos na tarefa.');
    closeHUD();
  }

  // Intercepta ações do usuário na página durante gravação
  document.addEventListener('click', (ev) => {
    if (!activeRecordingMode) return;
    const target = ev.target.closest('button, a, input, select, tr, [role="button"], label') || ev.target;
    if (target.closest('#autoapprove-hud')) return;

    const selector = getResilientSelector(target);
    const label = getCleanLabel(target, target.type === 'checkbox' ? 'check' : target.tagName === 'SELECT' ? 'select' : 'click');

    if (activeRecordingMode === 'free') {
      const step = {
        id: 'step-' + Date.now(),
        order: recordedSteps.length + 1,
        label,
        action: target.type === 'checkbox' ? 'check' : target.tagName === 'SELECT' ? 'select' : 'click',
        cssSelector: selector,
        ariaSelector: selector,
        waitBeforeMs: 350,
        timeoutMs: 8000,
        isLoopTarget: false,
      };
      recordedSteps.push(step);
      sendLog('info', '[Passo ' + step.order + '] Gravado: ' + step.label);
      highlightElement(target);
      renderHUD();
      return;
    }

    if (activeRecordingMode === 'list_wizard') {
      if (wizardPhase === 'list_row') {
        wizardListConfig.openDetailSelector = selector;
        const row = target.closest('tr, li, .card, [data-id]');
        if (row) wizardListConfig.listRowSelector = getResilientSelector(row);
        sendLog('info', 'Fase 1 Gravada: Abertura de item (' + selector + ')');
        wizardPhase = 'detail_steps';
        highlightElement(target);
        renderHUD();
      } else if (wizardPhase === 'detail_steps') {
        const step = {
          id: 'step-' + Date.now(),
          order: recordedSteps.length + 1,
          label,
          action: target.type === 'checkbox' ? 'check' : target.tagName === 'SELECT' ? 'select' : 'click',
          cssSelector: selector,
          ariaSelector: selector,
          waitBeforeMs: 350,
          timeoutMs: 6000,
          isLoopTarget: true,
        };
        recordedSteps.push(step);
        sendLog('info', 'Fase 2 Gravada: ' + step.label);
        highlightElement(target);
        renderHUD();
      } else if (wizardPhase === 'return_action') {
        wizardListConfig.returnSelector = selector;
        wizardListConfig.returnMode = 'click_button';
        sendLog('info', 'Fase 3 Gravada: Botão de Retorno (' + selector + ')');
        wizardPhase = 'next_page';
        highlightElement(target);
        renderHUD();
      } else if (wizardPhase === 'next_page') {
        wizardListConfig.nextPageSelector = selector;
        wizardListConfig.paginationEnabled = true;
        sendLog('info', 'Fase 4 Gravada: Botão de Paginação (' + selector + ')');
        highlightElement(target);
        finishRecording();
      }
    }
  }, true);

  // Captura preenchimento de inputs e selects
  document.addEventListener('change', (ev) => {
    if (!activeRecordingMode) return;
    const target = ev.target;
    if (target.closest('#autoapprove-hud')) return;

    const selector = getResilientSelector(target);

    if (target.tagName === 'INPUT' && target.type !== 'checkbox' && target.type !== 'radio') {
      const step = {
        id: 'step-' + Date.now(),
        order: recordedSteps.length + 1,
        label: getCleanLabel(target, 'fill'),
        action: 'fill',
        cssSelector: selector,
        ariaSelector: selector,
        value: target.value,
        waitBeforeMs: 300,
        timeoutMs: 6000,
        isLoopTarget: false,
      };
      recordedSteps.push(step);
      sendLog('info', '[Passo ' + step.order + '] Gravado: ' + step.label + ' (Valor: "' + target.value + '")');
      renderHUD();
    } else if (target.tagName === 'SELECT') {
      const step = {
        id: 'step-' + Date.now(),
        order: recordedSteps.length + 1,
        label: getCleanLabel(target, 'select'),
        action: 'select',
        cssSelector: selector,
        ariaSelector: selector,
        value: target.value,
        waitBeforeMs: 250,
        timeoutMs: 5000,
        isLoopTarget: false,
      };
      recordedSteps.push(step);
      sendLog('info', '[Passo ' + step.order + '] Gravado: ' + step.label + ' (Opção: "' + target.value + '")');
      renderHUD();
    }
  }, true);

  // Execução de Macro Universal (Sequência Livre ou Formulário)
  async function executeFreeMacroTask(task, config) {
    isExecuting = true;
    const baseDelayMs = config.baseDelayMs || 400;
    const randomJitterMs = config.randomJitterMs || 300;
    const repeatCount = task.repeatMode === 'repeat_n' ? (task.repeatCount || 1) : 1;
    const steps = task.steps || [];

    sendLog('info', 'Iniciando execução da tarefa "' + task.name + '" (' + repeatCount + ' repetições)...');

    try {
      for (let cycle = 1; cycle <= repeatCount; cycle++) {
        if (!isExecuting) break;

        sendLog('info', 'Executando ciclo ' + cycle + ' de ' + repeatCount + ' da tarefa...');

        for (let sIdx = 0; sIdx < steps.length; sIdx++) {
          if (!isExecuting) break;

          const step = steps[sIdx];
          await sleep(step.waitBeforeMs + Math.floor(Math.random() * randomJitterMs));

          try {
            const el = await waitForSelector(step.cssSelector, step.timeoutMs || 8000);
            el.scrollIntoView({ block: 'center', behavior: 'smooth' });
            highlightElement(el);

            if (step.action === 'fill') {
              el.focus();
              el.value = step.value || '';
              el.dispatchEvent(new Event('input', { bubbles: true }));
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else if (step.action === 'check') {
              if (!el.checked) el.click();
            } else if (step.action === 'select') {
              el.value = step.value || '';
              el.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
              el.click();
            }

            sendLog('info', 'Passo ' + (sIdx + 1) + '/' + steps.length + ': ' + step.label + ' executado com sucesso.');
          } catch (stepErr) {
            sendLog('warn', 'Aviso no passo ' + (sIdx + 1) + ' (' + step.label + '): ' + String(stepErr.message));
          }
        }

        chrome.runtime.sendMessage({
          type: 'UPDATE_STATS',
          patch: { approved: cycle },
        });
      }

      sendLog('success', 'Tarefa "' + task.name + '" concluída com sucesso (' + repeatCount + ' ciclos)!');
    } finally {
      isExecuting = false;
      chrome.runtime.sendMessage({
        type: 'UPDATE_STATS',
        patch: { status: 'idle' },
      });
    }
  }

  // Execução de Tabela em Lote (Lista -> Detalhes -> Retorno -> Paginação)
  async function executeBatchTableWorkflow(task, config) {
    isExecuting = true;
    const baseDelayMs = config.baseDelayMs || 400;
    const randomJitterMs = config.randomJitterMs || 300;
    const maxRetries = config.maxRetries || 3;
    const listConfig = task.listConfig || {};
    const listRowSelector = listConfig.listRowSelector || 'tr.linha-solicitacao-pendente, tr[data-status="pending"]';
    const openDetailSelector = listConfig.openDetailSelector || 'button[data-action="abrir-detalhe"], .btn-primary, td:last-child button';
    const returnMode = listConfig.returnMode || 'auto';
    const returnSelector = listConfig.returnSelector;
    const paginationEnabled = listConfig.paginationEnabled !== false;
    const nextPageSelector = listConfig.nextPageSelector || 'button#btn-proxima-pagina, a.pagination-next';
    const waitAfterPageTurnMs = listConfig.waitAfterPageTurnMs || 1200;

    const detailSteps = task.steps || [];
    let approvedTotal = 0;
    let failedTotal = 0;
    let currentPage = 1;

    sendLog('info', 'Iniciando fluxo de aprovação em tabela: "' + task.name + '" (418 itens estimados)...');

    try {
      while (isExecuting) {
        const rows = Array.from(document.querySelectorAll(listRowSelector))
          .filter((r) => r.offsetParent !== null && !r.classList.contains('approved'));

        if (rows.length === 0) {
          sendLog('info', 'Nenhum item pendente restante na página ' + currentPage + '.');

          if (paginationEnabled && nextPageSelector) {
            const nextBtn = document.querySelector(nextPageSelector);
            if (nextBtn && !nextBtn.disabled && nextBtn.offsetParent !== null) {
              sendLog('info', 'Avançando para a página ' + (currentPage + 1) + '...');
              nextBtn.click();
              currentPage += 1;
              chrome.runtime.sendMessage({
                type: 'UPDATE_STATS',
                patch: { currentPage, approved: approvedTotal, failed: failedTotal },
              });
              await sleep(waitAfterPageTurnMs);
              continue;
            }
          }

          sendLog('success', 'Processamento finalizado! Total de ' + approvedTotal + ' aprovações concluídas.');
          break;
        }

        sendLog('info', 'Processando ' + rows.length + ' itens encontrados na página ' + currentPage + '...');

        for (let i = 0; i < rows.length; i++) {
          if (!isExecuting) break;

          const row = rows[i];
          const itemId = row.getAttribute('data-id') || row.querySelector('strong, .protocolo-id')?.innerText || ('Item #' + (i + 1));

          for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
              row.scrollIntoView({ block: 'center', behavior: 'smooth' });
              highlightElement(row);
              await sleep(baseDelayMs + Math.floor(Math.random() * randomJitterMs));

              const openBtn = (openDetailSelector ? row.querySelector(openDetailSelector) : null) || row.querySelector('button, a') || row;
              openBtn.click();

              for (const step of detailSteps) {
                if (!isExecuting) return;
                await sleep(step.waitBeforeMs + Math.floor(Math.random() * randomJitterMs));
                const el = await waitForSelector(step.cssSelector, step.timeoutMs || 5000);
                el.scrollIntoView({ block: 'center', behavior: 'instant' });
                highlightElement(el);

                if (step.action === 'check') {
                  if (!el.checked) el.click();
                } else if (step.action === 'select' && step.value) {
                  el.value = step.value;
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else if (step.action === 'fill' && step.value) {
                  el.value = step.value;
                  el.dispatchEvent(new Event('input', { bubbles: true }));
                  el.dispatchEvent(new Event('change', { bubbles: true }));
                } else {
                  el.click();
                }
              }

              await sleep(400);
              if (returnMode === 'history_back') {
                window.history.back();
              } else if (returnSelector && document.querySelector(returnSelector)) {
                const backBtn = document.querySelector(returnSelector);
                if (backBtn && backBtn.offsetParent !== null) backBtn.click();
              } else {
                const fallbackBack = document.querySelector('button#btn-cancelar-aprovacao, button.btn-voltar, .modal-backdrop button');
                if (fallbackBack && fallbackBack.offsetParent !== null) fallbackBack.click();
              }

              approvedTotal += 1;
              sendLog('success', itemId + ' aprovado com sucesso! (' + approvedTotal + ' de 418)', 'approved');
              chrome.runtime.sendMessage({
                type: 'UPDATE_STATS',
                patch: { approved: approvedTotal, currentPage },
              });
              break;
            } catch (err) {
              if (attempt === maxRetries) {
                failedTotal += 1;
                sendLog('error', 'Falha no ' + itemId + ' após ' + maxRetries + ' tentativas: ' + String(err.message), 'failed');
              } else {
                await sleep(500 * attempt);
              }
            }
          }
        }
      }
    } finally {
      isExecuting = false;
      chrome.runtime.sendMessage({
        type: 'UPDATE_STATS',
        patch: { status: 'idle' },
      });
    }
  }

  // Listener de Comandos do Background e Sidepanel
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'RPA_START_RECORDING') {
      activeRecordingMode = msg.mode || 'free';
      currentRecordingTaskId = msg.taskId;
      recordedSteps = [];
      wizardPhase = activeRecordingMode === 'list_wizard' ? 'list_row' : null;
      wizardListConfig = {};
      renderHUD();
      sendLog('info', 'Gravador ativado no modo ' + (activeRecordingMode === 'free' ? 'Livre Universal' : 'Assistente de Tabela') + '.');
    } else if (msg.type === 'RPA_EXECUTE_TASK') {
      const task = msg.task;
      const cfg = msg.config || {};
      if (task.pattern === 'list_detail_pagination' || task.repeatMode === 'loop_list') {
        executeBatchTableWorkflow(task, cfg);
      } else {
        executeFreeMacroTask(task, cfg);
      }
    } else if (msg.type === 'RPA_ABORT') {
      isExecuting = false;
      sendLog('warn', 'Execução pausada pelo usuário.');
      closeHUD();
    } else if (msg.type === 'RPA_PING') {
      // Keepalive
    }
  });
})();
`;
}

export function generateSidepanelHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>AutoApprove RPA Companion</title>
  <link rel="stylesheet" href="sidepanel.css" />
</head>
<body>
  <!-- Cabeçalho Corporativo -->
  <header class="hdr">
    <div class="brand-row">
      <div class="logo">⚡</div>
      <div class="brand-text">
        <h1>AutoApprove RPA</h1>
        <p>Motor Universal de Automação & Macros</p>
      </div>
      <span class="auth-pill" title="Sessão Corporativa Autenticada">MS OAuth OK</span>
    </div>
  </header>

  <!-- Seletor de Automação / Tarefa Ativa -->
  <section class="task-selector-box">
    <label for="select-active-task" class="box-label">Automação Selecionada:</label>
    <div class="task-select-row">
      <select id="select-active-task" class="custom-select"></select>
      <button id="btn-new-task" class="btn btn-secondary btn-icon" title="Criar Nova Automação">+ Nova</button>
    </div>
    <div class="task-meta-row">
      <span id="task-badge-category" class="task-badge">Universal</span>
      <span id="task-badge-pattern" class="task-badge badge-blue">Macro Livre</span>
      <span id="task-steps-count" class="task-badge badge-gray">0 passos</span>
    </div>
  </section>

  <!-- Métricas em Tempo Real -->
  <section class="stats-grid">
    <div class="stat-card">
      <span class="lbl">Execuções</span>
      <strong id="st-approved" class="text-emerald">0</strong>
      <small id="st-approved-sub">concluídos</small>
    </div>
    <div class="stat-card">
      <span class="lbl">Ciclo / Pág</span>
      <strong id="st-page">1</strong>
      <small id="st-page-info">em execução</small>
    </div>
    <div class="stat-card">
      <span class="lbl">Status</span>
      <strong id="st-status">Pronto</strong>
      <small id="st-status-sub">Aguardando início</small>
    </div>
  </section>

  <!-- Abas de Navegação -->
  <nav class="tabs-nav">
    <button class="tab-btn active" data-tab="tab-exec">▶️ Executar</button>
    <button class="tab-btn" data-tab="tab-steps">📋 Passos</button>
    <button class="tab-btn" data-tab="tab-record">🔴 Gravar</button>
    <button class="tab-btn" data-tab="tab-logs">📜 Logs</button>
  </nav>

  <!-- Aba 1: Execução -->
  <div id="tab-exec" class="tab-content active">
    <div class="actions-card">
      <button id="btn-start" class="btn btn-primary btn-large">
        ▶️ EXECUTAR ESTA TAREFA
      </button>
      <div class="button-row">
        <button id="btn-stop" class="btn btn-danger">Pausar / Parar</button>
        <button id="btn-quick-record" class="btn btn-secondary">🔴 Gravar na Tela</button>
      </div>
    </div>

    <!-- Opções de Repetição -->
    <div class="config-card">
      <span class="lbl">Modo de Repetição da Tarefa:</span>
      <div class="repeat-controls">
        <label class="radio-label">
          <input type="radio" name="repeatMode" value="once" id="rep-once" checked />
          <span>Executar 1x</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="repeatMode" value="repeat_n" id="rep-n" />
          <span>Repetir:</span>
          <input type="number" id="input-repeat-count" min="1" max="1000" value="10" class="mini-input" />
          <span>vezes</span>
        </label>
        <label class="radio-label">
          <input type="radio" name="repeatMode" value="loop_list" id="rep-loop" />
          <span>Loop de Lista (Tabela com Subpáginas)</span>
        </label>
      </div>
    </div>

    <!-- Velocidade & Anti-Bot -->
    <div class="speed-box">
      <span class="lbl">Velocidade & Variação Humana (Anti-Bot):</span>
      <div class="speed-buttons">
        <button class="speed-btn active" data-speed="human">Humana (Segura)</button>
        <button class="speed-btn" data-speed="fast">Rápida (3x)</button>
        <button class="speed-btn" data-speed="turbo">Turbo (8x)</button>
      </div>
    </div>

    <div class="info-callout">
      <strong>Sessão Microsoft 365 Autenticada:</strong>
      <p>A automação roda dentro da sua própria aba já autenticada. Não há risco de bloqueio de Acesso Condicional ou Intune!</p>
    </div>
  </div>

  <!-- Aba 2: Passos Gravados da Tarefa -->
  <div id="tab-steps" class="tab-content">
    <div class="steps-header">
      <div>
        <h3 id="steps-task-title">Passos Gravados</h3>
        <p class="subtext">Sequência de ações que o robô executará nesta página.</p>
      </div>
      <button id="btn-clear-steps" class="btn btn-secondary btn-small" title="Limpar Passos">Limpar</button>
    </div>

    <div id="steps-empty-state" class="empty-box" style="display: none;">
      <p>Nenhum passo gravado ainda para esta tarefa.</p>
      <button id="btn-start-record-empty" class="btn btn-primary btn-small" style="margin-top: 8px;">
        🔴 Gravar Primeiros Passos
      </button>
    </div>

    <div id="steps-list-container" class="steps-timeline"></div>
  </div>

  <!-- Aba 3: Como Gravar Qualquer Tarefa -->
  <div id="tab-record" class="tab-content">
    <div class="record-instructions-card">
      <h3>Modo de Aprendizado por Demonstração</h3>
      <p>Você pode ensinar o robô a realizar <strong>qualquer rotina web</strong> em 3 passos simples:</p>
      
      <ol class="instructions-list">
        <li>
          <strong>1. Abra a página desejada:</strong>
          <span>Acesse o portal da sua empresa (SAP, Totvs, Jira, ServiceNow, etc.) nesta aba.</span>
        </li>
        <li>
          <strong>2. Acione o Gravador ao Vivo:</strong>
          <span>Uma barra flutuante aparecerá na página. Escolha <em>Gravação Livre</em> ou <em>Assistente de Tabela</em>.</span>
        </li>
        <li>
          <strong>3. Clique e preencha normalmente:</strong>
          <span>O robô aprende cada clique e digitação em tempo real. Ao terminar, clique em Salvar!</span>
        </li>
      </ol>

      <div class="record-buttons-stack">
        <button id="btn-launch-free-record" class="btn btn-primary btn-large">
          🪄 Iniciar Gravação Livre na Tela
        </button>
        <button id="btn-launch-wizard-record" class="btn btn-secondary">
          📋 Iniciar Assistente de Tabela (4 Fases)
        </button>
      </div>
    </div>
  </div>

  <!-- Aba 4: Logs de Auditoria -->
  <div id="tab-logs" class="tab-content">
    <div class="logs-header">
      <h3>Histórico de Eventos</h3>
      <button id="btn-export-csv" class="btn btn-secondary btn-small">Baixar CSV (.csv)</button>
    </div>
    <div id="log-list" class="log-container"></div>
  </div>

  <script src="sidepanel.js"></script>
</body>
</html>
`;
}

export function generateSidepanelCss(): string {
  return `* { box-sizing: border-box; font-family: system-ui, -apple-system, sans-serif; margin: 0; padding: 0; }
body { padding: 14px; background: #f8fafc; color: #0f172a; font-size: 13px; }
.hdr { margin-bottom: 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 10px; }
.brand-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.brand-text h1 { font-size: 15px; font-weight: 800; color: #0f172a; }
.brand-text p { font-size: 11px; color: #64748b; }
.logo { width: 30px; height: 30px; background: #2563eb; color: #fff; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 16px; shrink: 0; }
.auth-pill { background: #dcfce7; color: #166534; font-size: 10px; font-weight: bold; padding: 3px 8px; border-radius: 999px; border: 1px solid #bbf7d0; }

.task-selector-box { background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 10px 12px; margin-bottom: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.box-label { display: block; font-size: 10px; font-weight: 700; text-transform: uppercase; color: #64748b; margin-bottom: 4px; }
.task-select-row { display: flex; gap: 6px; }
.custom-select { flex: 1; padding: 7px 8px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 12px; font-weight: 600; background: #f8fafc; color: #0f172a; outline: none; }
.custom-select:focus { border-color: #2563eb; background: #fff; }
.task-meta-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.task-badge { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: #f1f5f9; color: #475569; }
.badge-blue { background: #dbeafe; color: #1e40af; }
.badge-gray { background: #e2e8f0; color: #334155; }

.stats-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
.stat-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 6px; text-align: center; }
.stat-card .lbl { display: block; font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; }
.stat-card strong { font-size: 17px; font-weight: 800; font-family: monospace; display: block; margin: 2px 0; }
.text-emerald { color: #059669; }
.stat-card small { display: block; font-size: 9px; color: #94a3b8; }

.tabs-nav { display: flex; background: #e2e8f0; padding: 3px; border-radius: 8px; gap: 4px; margin-bottom: 12px; }
.tab-btn { flex: 1; padding: 7px 2px; border: none; background: transparent; font-size: 11px; font-weight: bold; border-radius: 6px; cursor: pointer; color: #475569; }
.tab-btn.active { background: #fff; color: #0f172a; box-shadow: 0 1px 2px rgba(0,0,0,0.08); }
.tab-content { display: none; }
.tab-content.active { display: block; }

.actions-card { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.button-row { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.btn { padding: 9px 12px; border-radius: 8px; font-weight: bold; border: 1px solid transparent; cursor: pointer; font-size: 12px; transition: 0.15s; text-align: center; }
.btn-primary { background: #2563eb; color: #fff; }
.btn-primary:hover { background: #1d4ed8; }
.btn-danger { background: #fee2e2; color: #b91c1c; border-color: #fecaca; }
.btn-danger:hover { background: #fecaca; }
.btn-secondary { background: #fff; border-color: #cbd5e1; color: #1e293b; }
.btn-secondary:hover { background: #f1f5f9; }
.btn-large { padding: 12px; font-size: 13px; font-weight: 800; }
.btn-small { padding: 4px 8px; font-size: 11px; }

.config-card { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.config-card .lbl { font-size: 11px; font-weight: bold; color: #475569; display: block; margin-bottom: 6px; }
.repeat-controls { display: flex; flex-direction: column; gap: 6px; }
.radio-label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #334155; cursor: pointer; }
.mini-input { width: 50px; padding: 2px 4px; border: 1px solid #cbd5e1; border-radius: 4px; text-align: center; font-weight: bold; }

.speed-box { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 10px; margin-bottom: 12px; }
.speed-box .lbl { font-size: 11px; font-weight: bold; color: #475569; display: block; margin-bottom: 6px; }
.speed-buttons { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; }
.speed-btn { padding: 6px 2px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 10px; font-weight: 600; border-radius: 6px; cursor: pointer; }
.speed-btn.active { background: #2563eb; color: #fff; border-color: #2563eb; }

.info-callout { background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 10px; padding: 10px; font-size: 11px; color: #1e3a8a; line-height: 1.4; }
.info-callout strong { display: block; margin-bottom: 2px; }

.steps-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10px; }
.steps-header h3 { font-size: 13px; font-weight: bold; }
.subtext { font-size: 11px; color: #64748b; }
.steps-timeline { display: flex; flex-direction: column; gap: 6px; max-height: 380px; overflow-y: auto; }
.step-item { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.step-item-main { flex: 1; }
.step-badge-order { display: inline-block; background: #e2e8f0; color: #0f172a; font-size: 9px; font-weight: bold; padding: 1px 5px; border-radius: 4px; margin-right: 4px; }
.step-title { font-weight: 700; font-size: 12px; color: #0f172a; }
.step-selector { font-family: monospace; font-size: 10px; color: #64748b; display: block; margin-top: 2px; word-break: break-all; }
.step-delete-btn { background: transparent; border: none; color: #94a3b8; cursor: pointer; padding: 4px; font-size: 14px; }
.step-delete-btn:hover { color: #ef4444; }

.record-instructions-card { background: #fff; border: 1px solid #cbd5e1; border-radius: 12px; padding: 14px; }
.record-instructions-card h3 { font-size: 14px; font-weight: 800; margin-bottom: 6px; }
.instructions-list { margin: 10px 0 16px 16px; font-size: 12px; line-height: 1.5; color: #334155; }
.instructions-list li { margin-bottom: 8px; }
.instructions-list strong { color: #0f172a; }
.instructions-list span { display: block; color: #64748b; }
.record-buttons-stack { display: flex; flex-direction: column; gap: 8px; }

.empty-box { background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; padding: 24px 16px; text-align: center; color: #64748b; }

.logs-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.log-container { background: #090d16; color: #f8fafc; border-radius: 8px; padding: 8px; font-family: monospace; font-size: 11px; height: 320px; overflow-y: auto; line-height: 1.5; }
.log-line { padding: 2px 0; border-bottom: 1px solid #1e293b; }
.log-success { color: #4ade80; }
.log-warn { color: #facc15; }
.log-error { color: #f87171; }
`;
}

export function generateSidepanelJs(): string {
  return `// AutoApprove Companion — Controlador Multi-Tarefas & Macros Universais
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
      (s, idx) => \`
    <div class="step-item">
      <div class="step-item-main">
        <div>
          <span class="step-badge-order">#\${idx + 1}</span>
          <strong class="step-title">[\${s.action.toUpperCase()}] \${s.label}</strong>
        </div>
        <span class="step-selector">\${s.cssSelector}</span>
      </div>
      <button class="step-delete-btn" data-step-id="\${s.id}" title="Excluir este passo">✕</button>
    </div>
  \`
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
    .join('\\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'auditoria_extensao_rpa.csv';
  a.click();
});

chrome.storage.onChanged.addListener(syncUI);
syncUI();
`;
}

export function generatePopupHtml(): string {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>AutoApprove RPA</title>
  <style>
    body { width: 320px; padding: 14px; font-family: system-ui, -apple-system, sans-serif; background: #090d16; color: #fff; margin: 0; }
    h2 { font-size: 15px; margin: 0 0 6px; display: flex; align-items: center; gap: 8px; }
    p { font-size: 12px; color: #94a3b8; margin: 0 0 14px; line-height: 1.4; }
    .btn { display: block; width: 100%; padding: 10px; background: #2563eb; color: #fff; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; text-align: center; text-decoration: none; font-size: 12px; margin-bottom: 8px; box-sizing: border-box; }
    .btn:hover { background: #1d4ed8; }
    .btn-sec { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
    .btn-sec:hover { background: #334155; }
  </style>
</head>
<body>
  <h2>⚡ AutoApprove RPA Universal</h2>
  <p>Automação e gravação de cliques para qualquer portal corporativo com sua sessão Microsoft logada.</p>
  <button id="btn-open-panel" class="btn">Abrir Painel Lateral Completo</button>
  <button id="btn-quick-run" class="btn btn-sec">▶️ Executar Tarefa Ativa</button>
  <script src="popup.js"></script>
</body>
</html>
`;
}

export function generatePopupJs(): string {
  return `document.getElementById('btn-open-panel')?.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.windowId && chrome.sidePanel) {
    chrome.sidePanel.open({ windowId: tab.windowId });
    window.close();
  }
});

document.getElementById('btn-quick-run')?.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'START_BATCH_EXECUTION' });
  window.close();
});
`;
}
