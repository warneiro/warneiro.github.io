/* ===================================================================
   DNA# — UI logic (theme, mode toggle, code viewer, run/pause/stop)
   =================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const modeSelect     = document.getElementById("mode-select");
  const sourceEditor   = document.getElementById("source-editor");
  const inputEditor    = document.getElementById("input-editor");
  const runBtn         = document.getElementById("run-btn");
  const pauseBtn       = document.getElementById("pause-btn");
  const clearBtn       = document.getElementById("clear-btn");
  const outputArea     = document.getElementById("output-area");
  const errorArea      = document.getElementById("error-area");
  const themeToggle    = document.getElementById("theme-toggle");
  const directModeBtn  = document.getElementById("direct-mode-btn");
  const visualModeBtn  = document.getElementById("visual-mode-btn");
  const visualPanel    = document.getElementById("visual-panel");
  const codeViewer     = document.getElementById("code-viewer");
  const speedSlider    = document.getElementById("speed-slider");
  const speedLabel     = document.getElementById("speed-label");

  let runMode = "direct";
  let visualRunning = false;
  let control = null;

  // ── Theme ─────────────────────────────────────────────────

  const THEME_KEY = "dnasharp-theme";

  function getSystemTheme() {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    themeToggle.textContent = theme === "dark" ? "\u2600" : "\uD83C\uDF19";
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    localStorage.setItem(THEME_KEY, next);
    applyTheme(next);
  }

  const saved = localStorage.getItem(THEME_KEY);
  const initialTheme = saved || getSystemTheme();
  applyTheme(initialTheme);

  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    if (!localStorage.getItem(THEME_KEY)) {
      applyTheme(e.matches ? "dark" : "light");
    }
  });

  themeToggle.addEventListener("click", toggleTheme);

  // ── Run mode toggle ──────────────────────────────────────

  function setRunMode(mode) {
    if (visualRunning && mode === "direct") return;
    runMode = mode;
    directModeBtn.classList.toggle("active", mode === "direct");
    visualModeBtn.classList.toggle("active", mode === "visual");
    visualPanel.style.display = mode === "visual" ? "block" : "none";
    if (mode === "direct") {
      codeViewer.innerHTML = "";
      clearHighlights();
    }
  }

  directModeBtn.addEventListener("click", () => setRunMode("direct"));
  visualModeBtn.addEventListener("click", () => setRunMode("visual"));

  // ── Speed slider ─────────────────────────────────────────

  speedSlider.addEventListener("input", () => {
    speedLabel.textContent = speedSlider.value + "ms";
  });

  // ── Code viewer builder ──────────────────────────────────

  function buildCodeViewer(instructions, mode) {
    codeViewer.innerHTML = "";
    const frag = document.createDocumentFragment();

    if (mode === "symbol") {
      for (let i = 0; i < instructions.length; i++) {
        const span = document.createElement("span");
        span.className = "instr";
        span.dataset.pc = i;
        span.textContent = instructions[i];
        frag.appendChild(span);
      }
    } else {
      for (let i = 0; i < instructions.length; i++) {
        const span = document.createElement("span");
        span.className = "instr";
        span.dataset.pc = i;
        span.textContent = REVERSE_MAP[instructions[i]] || instructions[i];
        frag.appendChild(span);
      }
    }

    codeViewer.appendChild(frag);
  }

  function highlightInstruction(pc) {
    clearHighlights();
    const active = codeViewer.querySelector(`[data-pc="${pc}"]`);
    if (active) {
      active.classList.add("active");
      active.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }

  function clearHighlights() {
    codeViewer.querySelectorAll(".instr.active").forEach(el => el.classList.remove("active"));
  }

  // ── Error / output helpers ───────────────────────────────

  function showError(msg) {
    errorArea.textContent = msg;
    errorArea.style.display = "block";
  }
  function clearError() {
    errorArea.textContent = "";
    errorArea.style.display = "none";
  }

  // ── Enter / leave visual-running UI state ────────────────

  function enterVisualRunning() {
    visualRunning = true;
    runBtn.textContent = "Stop";
    runBtn.classList.add("btn-stop");
    runBtn.disabled = false;
    pauseBtn.style.display = "";
    pauseBtn.textContent = "Pause";
    control = createControl();
    return control;
  }

  function leaveVisualRunning() {
    visualRunning = false;
    runBtn.textContent = "Run";
    runBtn.classList.remove("btn-stop");
    runBtn.disabled = false;
    pauseBtn.style.display = "none";
    control = null;
    clearHighlights();
  }

  // ── Stop execution ───────────────────────────────────────

  function stopVisual() {
    if (control) {
      control.abort();
      control = null;
    }
    leaveVisualRunning();
  }

  // ── Pause / Resume ───────────────────────────────────────

  pauseBtn.addEventListener("click", () => {
    if (!control) return;
    if (control.paused) {
      control.resume();
      pauseBtn.textContent = "Pause";
    } else {
      control.pause();
      pauseBtn.textContent = "Resume";
    }
  });

  // ── Run ──────────────────────────────────────────────────

  function runCode() {
    if (visualRunning) {
      stopVisual();
      return;
    }

    const source = sourceEditor.value.trim();
    if (!source) { showError("Please enter DNA# source code"); return; }

    clearError();

    let parseResult;
    try {
      parseResult = parseDNA(source, modeSelect.value);
    } catch (e) {
      showError(e.message);
      outputArea.textContent = "";
      return;
    }

    const { instructions, lineFormSource } = parseResult;

    if (runMode === "direct") {
      // ── Direct mode ──────────────────────────────────────
      outputArea.textContent = "Running...";
      runBtn.disabled = true;

      setTimeout(() => {
        try {
          const result = runDNA(instructions, lineFormSource, inputEditor.value);
          if (result.error) {
            showError(result.error);
            outputArea.textContent = result.output || "";
          } else {
            clearError();
            outputArea.textContent = result.output || "(no output)";
          }
        } catch (e) {
          showError(e.message);
        }
        runBtn.disabled = false;
      }, 10);

    } else {
      // ── Visual mode ──────────────────────────────────────

      buildCodeViewer(instructions, modeSelect.value);

      outputArea.textContent = "";
      clearError();
      codeViewer.scrollTop = 0;

      const ctrl = enterVisualRunning();
      const delay = parseInt(speedSlider.value, 10);

      runDNAVisual(instructions, lineFormSource, inputEditor.value, delay,
        (currentPc, currentOutput) => {
          highlightInstruction(currentPc);
          if (currentOutput) outputArea.textContent = currentOutput;
        },
        ctrl
      ).then(result => {
        if (!visualRunning) return; // already stopped
        leaveVisualRunning();

        if (result.error && result.error !== "Execution stopped") {
          showError(result.error);
          if (result.output) outputArea.textContent = result.output;
        } else if (result.error === "Execution stopped") {
          // stopped by user; keep current output
        } else {
          clearError();
          if (!result.output) outputArea.textContent = "(no output)";
        }
        setTimeout(clearHighlights, 600);
      });
    }
  }

  function clearAll() {
    if (visualRunning) stopVisual();
    sourceEditor.value = "";
    inputEditor.value = "";
    outputArea.textContent = "";
    clearError();
    codeViewer.innerHTML = "";
    clearHighlights();
  }

  // Keyboard shortcut
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      runCode();
    }
  });

  runBtn.addEventListener("click", runCode);
  clearBtn.addEventListener("click", clearAll);
});
