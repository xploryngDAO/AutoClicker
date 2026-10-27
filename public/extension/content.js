// AutoApprove RPA — Motor Universal de Automação & Gravação Livre
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
    if (el.id && !/\d{4,}/.test(el.id)) return '#' + CSS.escape(el.id);
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

    hud.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; border-bottom: 1px solid #1e293b; padding-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: #ef4444; box-shadow: 0 0 10px #ef4444;"></span>
          <strong style="font-size: 13px; color: #fff;">Robô Gravando em Tempo Real</strong>
          <span style="background: #1e293b; color: #93c5fd; padding: 2px 8px; border-radius: 6px; font-size: 11px; font-weight: bold;">
            ${stepCount} passo${stepCount === 1 ? '' : 's'} capturado${stepCount === 1 ? '' : 's'}
          </span>
        </div>
        <div style="display: flex; gap: 6px;">
          <button id="hud-mode-free" style="padding: 4px 10px; border-radius: 6px; border: 1px solid ${isFree ? '#3b82f6' : '#334155'}; background: ${isFree ? '#1e3a8a' : '#0f172a'}; color: #fff; font-size: 11px; font-weight: bold; cursor: pointer;">
            🪄 Gravação Livre (Qualquer Ação)
          </button>
          <button id="hud-mode-wizard" style="padding: 4px 10px; border-radius: 6px; border: 1px solid ${!isFree ? '#3b82f6' : '#334155'}; background: ${!isFree ? '#1e3a8a' : '#0f172a'}; color: #fff; font-size: 11px; font-weight: bold; cursor: pointer;">
            📋 Assistente de Tabela
          </button>
        </div>
      </div>

      <div style="color: #cbd5e1; font-size: 12px; line-height: 1.4;">
        ${subMsg}
      </div>

      ${stepsPreviewHtml}

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 4px;">
        <div style="display: flex; gap: 6px;">
          ${
            stepCount > 0
              ? '<button id="hud-btn-undo" style="padding: 6px 12px; background: #334155; color: #e2e8f0; border: none; border-radius: 8px; font-size: 11px; font-weight: bold; cursor: pointer;">⎌ Desfazer Último Passo</button>'
              : ''
          }
          ${
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
    `;

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
