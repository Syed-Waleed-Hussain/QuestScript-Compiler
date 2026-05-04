/**
 * script.js — QuestScript Web UI
 * Handles: SSE streaming, log colorization, AST parsing & D3 rendering,
 *           game input/output, tab switching, resize handle.
 */

// ═══════════════════════════════════════════════════════
// 1. DOM REFERENCES
// ═══════════════════════════════════════════════════════
const btnRun        = document.getElementById('btn-run');
const btnStop       = document.getElementById('btn-stop');
const btnClearLogs  = document.getElementById('btn-clear-logs');
const btnZoomIn     = document.getElementById('btn-zoom-in');
const btnZoomOut    = document.getElementById('btn-zoom-out');
const btnZoomReset  = document.getElementById('btn-zoom-reset');
const btnSend       = document.getElementById('btn-send');

const statusPill    = document.getElementById('status-pill');
const statusText    = document.getElementById('status-text');

const tabLogs       = document.getElementById('tab-logs');
const tabAst        = document.getElementById('tab-ast');
const viewLogs      = document.getElementById('view-logs');
const viewAst       = document.getElementById('view-ast');

const logOutput     = document.getElementById('log-output');
const logPhaseInd   = document.getElementById('log-phase-indicator');

const astSvg        = document.getElementById('ast-svg');
const astPlaceholder= document.getElementById('ast-placeholder');
const astTooltip    = document.getElementById('ast-tooltip');

const gameOutput    = document.getElementById('game-output');
const gameInput     = document.getElementById('game-input');
const gameBadge     = document.getElementById('game-badge');
const gameStatusL   = document.getElementById('game-status-left');
const gameStatusR   = document.getElementById('game-status-right');

const resizeHandle  = document.getElementById('resize-handle');
const panelLeft     = document.getElementById('panel-left');
const workspace     = document.getElementById('workspace');

// ═══════════════════════════════════════════════════════
// 2. STATE
// ═══════════════════════════════════════════════════════
let eventSource     = null;
let astData         = null;   // parsed hierarchical AST for D3
let d3Zoom          = null;   // D3 zoom behaviour reference
let d3ZoomState     = null;   // current transform

// Which "section" of output we are accumulating
const SECTION = { NONE: 0, PHASE1: 1, PHASE2: 2, PHASE3: 3, PHASE35: 4, PHASE4: 5, GAME: 6 };
let currentSection  = SECTION.NONE;
let astLines        = [];     // raw lines from Phase 2

// ═══════════════════════════════════════════════════════
// 3. STATUS HELPERS
// ═══════════════════════════════════════════════════════
function setStatus(state, label) {
  statusPill.className = 'status-pill ' + state;
  statusText.textContent = label;
}

function setGameBadge(state) {
  gameBadge.className = 'game-header-badge ' + (state || '');
  const map = { '': 'IDLE', active: 'LIVE', over: 'FINISHED' };
  gameBadge.textContent = map[state] ?? state.toUpperCase();
}

// ═══════════════════════════════════════════════════════
// 4. TAB SWITCHING
// ═══════════════════════════════════════════════════════
function switchTab(tab) {
  if (tab === 'logs') {
    tabLogs.classList.add('active');   tabLogs.setAttribute('aria-selected','true');
    tabAst.classList.remove('active'); tabAst.setAttribute('aria-selected','false');
    viewLogs.classList.add('active');  viewLogs.removeAttribute('hidden');
    viewAst.classList.remove('active'); viewAst.setAttribute('hidden', '');
  } else {
    tabAst.classList.add('active');    tabAst.setAttribute('aria-selected','true');
    tabLogs.classList.remove('active');tabLogs.setAttribute('aria-selected','false');
    viewAst.classList.add('active');   viewAst.removeAttribute('hidden');
    viewLogs.classList.remove('active'); viewLogs.setAttribute('hidden','');
    // Re-render if data ready
    if (astData) renderAST(astData);
  }
}

tabLogs.addEventListener('click', () => switchTab('logs'));
tabAst.addEventListener('click',  () => switchTab('ast'));

// ═══════════════════════════════════════════════════════
// 5. LOG OUTPUT COLORIZATION
// ═══════════════════════════════════════════════════════
function colorizeLogLine(raw) {
  const line = document.createElement('span');
  line.className = 'log-line';

  const t = raw.trim();

  // Phase headers
  if (/^---/.test(t)) {
    line.className += ' log-phase';
    line.textContent = raw;
    return line;
  }

  // Token lines: Token(TYPE, 'value', Line: N, Col: N)
  const tokenMatch = t.match(/^Token\((\w+),\s*(.*?),\s*Line:\s*(\d+),\s*Col:\s*(\d+)\)$/);
  if (tokenMatch) {
    const [, type, val, ln, col] = tokenMatch;
    line.className += ' log-token';

    const typeEl = document.createElement('span');
    typeEl.className = 'tok-type';
    typeEl.textContent = type;

    const valEl = document.createElement('span');
    valEl.className = val.startsWith("'") ? 'tok-val' : 'tok-val';
    valEl.textContent = ' ' + val;

    const locEl = document.createElement('span');
    locEl.className = 'tok-loc';
    locEl.textContent = ` Ln:${ln} Col:${col}`;

    line.append('Token(', typeEl, ',', valEl, ',', locEl, ')');
    return line;
  }

  // Success markers
  if (/^\[?\+\]?|Semantic Analysis OK|Compilation Successful|Peephole|Dead Code/i.test(t)) {
    line.className += ' log-ok'; line.textContent = raw; return line;
  }
  if (/^\[!?\]|warning/i.test(t)) {
    line.className += ' log-warn'; line.textContent = raw; return line;
  }
  if (/error|crash|mismatch/i.test(t)) {
    line.className += ' log-error'; line.textContent = raw; return line;
  }

  // AST tree lines — colour "node:" keyword
  if (/^\s*node:/.test(t)) {
    line.innerHTML = raw.replace(/node:\s*(\w+)/, `node: <span style="color:var(--col-keyword);font-weight:600">$1</span>`);
    return line;
  }
  if (/^\s*-\s/.test(t)) {
    line.style.color = 'var(--col-id)';
    line.textContent = raw;
    return line;
  }
  if (/^\s*\[/.test(t)) {
    line.style.color = 'var(--accent-3)';
    line.textContent = raw;
    return line;
  }

  line.textContent = raw;
  return line;
}

function appendLog(raw) {
  // Remove welcome placeholder on first line
  const ph = logOutput.querySelector('.log-placeholder');
  if (ph) ph.remove();

  const el = colorizeLogLine(raw);
  logOutput.appendChild(el);
  logOutput.scrollTop = logOutput.scrollHeight;
}

// ═══════════════════════════════════════════════════════
// 6. GAME OUTPUT HELPERS
// ═══════════════════════════════════════════════════════
function clearGameWelcome() {
  const w = gameOutput.querySelector('.game-welcome');
  if (w) w.remove();
}

function appendGame(raw) {
  clearGameWelcome();
  const t = raw.trimEnd();

  let el = document.createElement('span');
  el.className = 'game-line';

  // Separator lines
  if (/^={10,}/.test(t)) {
    el.className = 'game-line-separator';
    el.textContent = t;
  }
  // Title banner lines
  else if (/🎮|LAUNCHING|GAME OVER|🛑/.test(t)) {
    el.className = 'game-line-title';
    el.textContent = t;
  }
  // Choice lines
  else if (/^\s*\[\d+\]/.test(t)) {
    el.className = 'game-choice';
    el.textContent = t;
  }
  // Prompt
  else if (/What do you do\?/i.test(t)) {
    el.className = 'game-prompt';
    el.textContent = t;
  }
  // Game Over
  else if (/GAME OVER|escaped|unlocked/i.test(t)) {
    el.className = 'game-gameover';
    el.textContent = t;
  }
  else {
    el.textContent = t;
  }

  gameOutput.appendChild(el);
  gameOutput.appendChild(document.createElement('br'));
  gameOutput.scrollTop = gameOutput.scrollHeight;
}

// ═══════════════════════════════════════════════════════
// 7. SECTION ROUTER — decides where each line goes
// ═══════════════════════════════════════════════════════
function routeLine(raw) {
  const t = raw.trim();
  const prevSection = currentSection;

  // Detect sections — Phase 3.5 MUST be checked before Phase 3
  if (/Phase 1.*Lexical/i.test(t)) {
    currentSection = SECTION.PHASE1;
    logPhaseInd.textContent = '\u25CF Phase 1: Lexical Analysis';
  } else if (/Phase 2.*Syntax/i.test(t)) {
    currentSection = SECTION.PHASE2;
    logPhaseInd.textContent = '\u25CF Phase 2: Syntax Analysis';
    astLines = [];
  } else if (/Phase 3\.5/i.test(t)) {
    currentSection = SECTION.PHASE35;
    logPhaseInd.textContent = '\u25CF Phase 3.5: Optimization';
  } else if (/Phase 3.*Semantic/i.test(t)) {
    currentSection = SECTION.PHASE3;
    logPhaseInd.textContent = '\u25CF Phase 3: Semantic Analysis';
  } else if (/Phase 4.*Code Gen/i.test(t)) {
    currentSection = SECTION.PHASE4;
    logPhaseInd.textContent = '\u25CF Phase 4: Code Generation';
  } else if (/LAUNCHING QUESTSCRIPT/i.test(t)) {
    currentSection = SECTION.GAME;
  }

  // Always send to log panel
  appendLog(raw);

  // Collect Phase 2 lines while we are in that section
  if (currentSection === SECTION.PHASE2) {
    astLines.push(raw);
  }

  // When Phase 2 just ended (we moved to Phase 3), trigger AST render immediately
  if (prevSection === SECTION.PHASE2 && currentSection !== SECTION.PHASE2 && astLines.length) {
    astData = parseASTText(astLines);
    if (astData) {
      // Render immediately if AST tab is active, otherwise it will render on tab click
      if (tabAst.classList.contains('active')) {
        renderAST(astData);
      }
      // Auto-switch to AST tab after a short delay so user sees the tree
      setTimeout(() => {
        if (tabLogs.classList.contains('active')) switchTab('ast');
      }, 800);
    }
  }

  // Send game lines to the game panel
  if (currentSection === SECTION.GAME) {
    appendGame(raw);
  }
}

// ═══════════════════════════════════════════════════════
// 8. AST TEXT PARSER → Hierarchy
// ═══════════════════════════════════════════════════════
/*
  Converts the indented text output from print_tree() into a D3-ready
  hierarchical object.  Strategy:
    - "node: X"   → new node with type X
    - "[key]"     → label for the next group of children
    - "  - k: v"  → property on the current node
    - "  - v"     → bare value child
*/
function parseASTText(lines) {
  // `astLines` is already collected only during PHASE2, so every line here
  // belongs to Phase 2. We just strip the section-header and blank lines.
  const block = lines.filter(l => {
    const t = l.trim();
    return t !== '' && !/^---/.test(t) && !/Phase 2/i.test(t);
  });

  if (!block.length) {
    console.warn('[AST] No block content to parse. astLines was:', lines);
    return null;
  }

  console.log('[AST] Parsing', block.length, 'lines');

  // Calculate indent level (each 2 spaces = 1 level)
  function indentLevel(line) {
    const m = line.match(/^(\s*)/);
    return m ? m[1].length : 0;
  }

  let root = null;
  const stack = []; // { node, ind }

  function getParent(currentInd) {
    while (stack.length > 1 && stack[stack.length - 1].ind >= currentInd) {
      stack.pop();
    }
    return stack[stack.length - 1].node;
  }

  for (const line of block) {
    const ind  = indentLevel(line);
    const text = line.trim();
    if (!text) continue;

    // "node: TypeName"
    const nodeMatch = text.match(/^node:\s*(\w+)/);
    if (nodeMatch) {
      const newNode = { name: nodeMatch[1], type: nodeMatch[1], children: [], props: {} };
      if (!root) {
        // First node becomes the root — avoids a synthetic duplicate wrapper
        root = newNode;
        stack.push({ node: root, ind: -2 }); // sentinel parent
        stack.push({ node: newNode, ind });
      } else {
        getParent(ind).children.push(newNode);
        stack.push({ node: newNode, ind });
      }
      continue;
    }

    // "[key]" section label — skip
    if (/^\[\w+\]/.test(text)) continue;

    if (!stack.length) continue;
    const parent = stack[stack.length - 1].node;

    // "  - key: value"
    const propMatch = text.match(/^-\s+(\w+):\s+(.+)/);
    if (propMatch) {
      parent.props[propMatch[1]] = propMatch[2];
      parent.children.push({ name: propMatch[1], value: propMatch[2], type: 'prop', children: [], props: {} });
      continue;
    }

    // "  - bare value"
    const bareMatch = text.match(/^-\s+(.+)/);
    if (bareMatch) {
      const label = bareMatch[1];
      parent.children.push({
        name: label.length > 16 ? label.slice(0, 15) + '\u2026' : label,
        type: 'value', children: [], props: {}
      });
    }
  }

  if (!root) { console.warn('[AST] No root found.'); return null; }
  console.log('[AST] Root:', root.name, '| Children:', root.children.length);
  return root;
}

// ═══════════════════════════════════════════════════════
// 9. D3 AST RENDERER
// ═══════════════════════════════════════════════════════
const NODE_COLORS = {
  Program:        '#7c6af7',
  VarDeclaration: '#56cfb2',
  SceneNode:      '#f7b155',
  PrintNode:      '#8be9fd',
  ChoiceNode:     '#50fa7b',
  GotoNode:       '#ffb86c',
  SetNode:        '#ff79c6',
  IfNode:         '#bd93f9',
  EndNode:        '#f06f6f',
  prop:           '#4a5470',
  value:          '#3d4560',
};

function getNodeColor(type) {
  return NODE_COLORS[type] || '#56cfb2';
}

function renderAST(hierarchyData) {
  const wrapper = document.getElementById('ast-canvas-wrapper');
  const W = wrapper.clientWidth  || 800;
  const H = wrapper.clientHeight || 600;

  // Clear previous render
  const svg = d3.select('#ast-svg');
  svg.selectAll('*').remove();
  astPlaceholder.style.display = 'none';

  // D3 hierarchy
  const root = d3.hierarchy(hierarchyData);
  const nodeCount = root.descendants().length;

  // Tree layout
  const nodeW = 130;
  const nodeH = 72;
  const treeLayout = d3.tree()
    .nodeSize([nodeW, nodeH])
    .separation((a, b) => (a.parent === b.parent ? 1.3 : 1.8));

  treeLayout(root);

  // Offset so root is near top-center
  const xs  = root.descendants().map(d => d.x);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const treeWidth = maxX - minX;

  const offsetX = W / 2 - (minX + treeWidth / 2);
  const offsetY = 60;

  // Zoom behaviour
  const zoomG = svg.append('g').attr('class', 'zoom-root');

  d3Zoom = d3.zoom()
    .scaleExtent([0.2, 3])
    .on('zoom', (event) => {
      d3ZoomState = event.transform;
      zoomG.attr('transform', event.transform);
    });

  svg.call(d3Zoom);

  // Initial transform
  const initTransform = d3.zoomIdentity.translate(offsetX, offsetY);
  svg.call(d3Zoom.transform, initTransform);

  const g = zoomG;

  // Links (curved paths)
  g.selectAll('.ast-link')
    .data(root.links())
    .enter()
    .append('path')
    .attr('class', 'ast-link')
    .attr('d', d3.linkVertical()
      .x(d => d.x)
      .y(d => d.y)
    );

  // Node groups
  const nodeGroup = g.selectAll('.ast-node-group')
    .data(root.descendants())
    .enter()
    .append('g')
    .attr('class', 'ast-node-group')
    .attr('transform', d => `translate(${d.x},${d.y})`);

  // Determine node radius based on type
  function nodeRadius(d) {
    if (d.data.type === 'prop' || d.data.type === 'value') return 18;
    if (d.data.type === 'Program') return 34;
    if (['SceneNode','VarDeclaration'].includes(d.data.type)) return 28;
    return 24;
  }

  // Outer glow ring for important nodes
  nodeGroup.filter(d => !['prop','value'].includes(d.data.type))
    .append('circle')
    .attr('r', d => nodeRadius(d) + 6)
    .attr('fill', 'none')
    .attr('stroke', d => getNodeColor(d.data.type))
    .attr('stroke-width', 0.7)
    .attr('opacity', 0.25);

  // Main circle
  nodeGroup.append('circle')
    .attr('class', 'ast-node-circle')
    .attr('r', d => nodeRadius(d))
    .attr('fill', d => {
      const col = getNodeColor(d.data.type);
      // Leaf nodes get dimmer fill
      return d.data.type === 'prop' || d.data.type === 'value'
        ? col + '30'
        : col + '22';
    })
    .attr('stroke', d => getNodeColor(d.data.type))
    .attr('stroke-width', d => d.data.type === 'Program' ? 2.5 : 1.8);

  // Node label (type)
  nodeGroup.append('text')
    .attr('class', 'ast-label')
    .attr('dy', d => {
      if (d.data.type === 'prop') return '0.1em';
      return '0em';
    })
    .text(d => {
      const n = d.data.name || d.data.type;
      // Truncate long strings
      return n.length > 12 ? n.slice(0, 11) + '…' : n;
    })
    .attr('fill', d => getNodeColor(d.data.type));

  // Sub-label for prop nodes (show value)
  nodeGroup.filter(d => d.data.type === 'prop')
    .append('text')
    .attr('class', 'ast-sublabel')
    .attr('dy', '1.4em')
    .text(d => {
      const v = String(d.data.value || '');
      return v.length > 10 ? v.slice(0, 9) + '…' : v;
    });

  // Tooltip on hover
  nodeGroup
    .on('mouseenter', (event, d) => {
      const lines = [`Type: ${d.data.type}`];
      if (d.data.value !== undefined) lines.push(`Value: ${d.data.value}`);
      Object.entries(d.data.props || {}).forEach(([k, v]) => lines.push(`${k}: ${v}`));
      astTooltip.textContent = lines.join('\n');
      astTooltip.hidden = false;
    })
    .on('mousemove', (event) => {
      const rect = wrapper.getBoundingClientRect();
      let x = event.clientX - rect.left + 14;
      let y = event.clientY - rect.top + 14;
      // Keep within wrapper
      if (x + 240 > wrapper.clientWidth)  x = event.clientX - rect.left - 250;
      if (y + 80  > wrapper.clientHeight) y = event.clientY - rect.top  - 70;
      astTooltip.style.left = x + 'px';
      astTooltip.style.top  = y + 'px';
    })
    .on('mouseleave', () => { astTooltip.hidden = true; });
}

// ═══════════════════════════════════════════════════════
// 10. ZOOM CONTROLS
// ═══════════════════════════════════════════════════════
btnZoomIn.addEventListener('click', () => {
  if (!d3Zoom) return;
  d3.select('#ast-svg').transition().call(d3Zoom.scaleBy, 1.3);
});
btnZoomOut.addEventListener('click', () => {
  if (!d3Zoom) return;
  d3.select('#ast-svg').transition().call(d3Zoom.scaleBy, 0.75);
});
btnZoomReset.addEventListener('click', () => {
  if (!d3Zoom) return;
  const wrapper = document.getElementById('ast-canvas-wrapper');
  const W = wrapper.clientWidth;
  d3.select('#ast-svg').transition().call(
    d3Zoom.transform,
    d3.zoomIdentity.translate(W / 2, 60)
  );
});

// ═══════════════════════════════════════════════════════
// 11. RUN / STOP
// ═══════════════════════════════════════════════════════
async function startRun() {
  // Reset UI
  logOutput.innerHTML = '';
  gameOutput.innerHTML = '';
  astLines = [];
  astData  = null;
  currentSection = SECTION.NONE;
  logPhaseInd.textContent = 'Compiling…';
  d3.select('#ast-svg').selectAll('*').remove();
  astPlaceholder.style.display = 'flex';
  clearGameWelcome();

  setStatus('running', 'Compiling…');
  setGameBadge('active');
  btnRun.disabled  = true;
  btnStop.disabled = false;
  gameInput.disabled = false;
  btnSend.disabled   = false;
  gameInput.focus();
  gameStatusL.textContent = 'Session active';

  // Close any old SSE
  if (eventSource) { eventSource.close(); eventSource = null; }

  // Start process
  await fetch('/api/run', { method: 'POST' });

  // Open SSE stream
  eventSource = new EventSource('/api/stream');

  eventSource.addEventListener('line', (e) => {
    const raw = e.data.replace(/\\n/g, '\n');
    // Each physical line
    raw.split('\n').forEach(l => {
      if (l !== '') routeLine(l);
    });
  });

  eventSource.addEventListener('exit', (e) => {
    const code = parseInt(e.data, 10);
    setStatus(code === 0 ? 'done' : 'error', code === 0 ? 'Done' : `Exit ${code}`);
    setGameBadge('over');
    btnRun.disabled  = false;
    btnStop.disabled = true;
    gameInput.disabled = true;
    btnSend.disabled   = true;
    gameStatusL.textContent = 'Session ended';
    logPhaseInd.textContent = code === 0 ? '✓ Compilation complete' : '✗ Error encountered';

    // Parse AST after all lines received
    if (astLines.length) {
      astData = parseASTText(astLines);
      if (astData) {
        // Auto-switch to AST tab after short delay
        setTimeout(() => {
          // Only auto-switch if still on logs tab
          if (tabLogs.classList.contains('active')) {
            switchTab('ast');
          }
        }, 1200);
      }
    }

    eventSource.close();
    eventSource = null;
  });

  eventSource.addEventListener('error', () => {
    setStatus('error', 'Stream error');
    btnRun.disabled  = false;
    btnStop.disabled = true;
  });
}

async function stopRun() {
  if (eventSource) { eventSource.close(); eventSource = null; }
  await fetch('/api/kill', { method: 'POST' });
  setStatus('', 'Stopped');
  setGameBadge('');
  btnRun.disabled  = false;
  btnStop.disabled = true;
  gameInput.disabled = true;
  btnSend.disabled   = true;
  gameStatusL.textContent = 'Stopped by user';
}

btnRun.addEventListener('click',  startRun);
btnStop.addEventListener('click', stopRun);
btnClearLogs.addEventListener('click', () => {
  logOutput.innerHTML = `<div class="log-placeholder"><p>Log cleared.</p></div>`;
});

// ═══════════════════════════════════════════════════════
// 12. GAME INPUT
// ═══════════════════════════════════════════════════════
async function sendInput() {
  const val = gameInput.value.trim();
  if (!val) return;
  gameInput.value = '';

  // Echo to game output
  clearGameWelcome();
  const echo = document.createElement('span');
  echo.className = 'game-user-input game-line';
  echo.textContent = `❯ ${val}`;
  gameOutput.appendChild(echo);
  gameOutput.appendChild(document.createElement('br'));
  gameOutput.scrollTop = gameOutput.scrollHeight;

  await fetch('/api/input', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: val }),
  });
}

btnSend.addEventListener('click', sendInput);
gameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); sendInput(); }
});

// ═══════════════════════════════════════════════════════
// 13. RESIZE HANDLE (drag left/right panel)
// ═══════════════════════════════════════════════════════
let isResizing = false;

resizeHandle.addEventListener('mousedown', (e) => {
  isResizing = true;
  resizeHandle.classList.add('dragging');
  document.body.style.cursor = 'col-resize';
  document.body.style.userSelect = 'none';
});

document.addEventListener('mousemove', (e) => {
  if (!isResizing) return;
  const rect = workspace.getBoundingClientRect();
  const newW  = e.clientX - rect.left;
  const pct   = (newW / rect.width) * 100;
  if (pct > 25 && pct < 72) {
    panelLeft.style.width = pct + '%';
  }
});

document.addEventListener('mouseup', () => {
  if (!isResizing) return;
  isResizing = false;
  resizeHandle.classList.remove('dragging');
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
  // Re-render AST on resize
  if (astData && tabAst.classList.contains('active')) renderAST(astData);
});

// Re-render AST when window resizes
window.addEventListener('resize', () => {
  if (astData && tabAst.classList.contains('active')) renderAST(astData);
});
