const STORAGE_KEY = "car-savings-tracker-v2";
const DEFAULT_STATE = { saved: 0, goal: 100000 };

const elements = {
  savedAmount: document.querySelector("#savedAmount"),
  currentSavedValue: document.querySelector("#currentSavedValue"),
  goalDisplay: document.querySelector("#goalDisplay"),
  progressPercent: document.querySelector("#progressPercent"),
  revealPercent: document.querySelector("#revealPercent"),
  revealLine: document.querySelector("#revealLine"),
  openDepositButton: document.querySelector("#openDepositButton"),
  openSettingsButton: document.querySelector("#openSettingsButton"),
  openEditSavedButton: document.querySelector("#openEditSavedButton"),
  editFromDepositButton: document.querySelector("#editFromDepositButton"),
  dialogScrim: document.querySelector("#dialogScrim"),
  dialogs: [...document.querySelectorAll(".soft-dialog")],
  depositDialog: document.querySelector("#depositDialog"),
  settingsDialog: document.querySelector("#settingsDialog"),
  editSavedDialog: document.querySelector("#editSavedDialog"),
  depositForm: document.querySelector("#depositForm"),
  depositAmount: document.querySelector("#depositAmount"),
  depositError: document.querySelector("#depositError"),
  goalForm: document.querySelector("#goalForm"),
  goalAmount: document.querySelector("#goalAmount"),
  goalError: document.querySelector("#goalError"),
  editSavedForm: document.querySelector("#editSavedForm"),
  editSavedInput: document.querySelector("#editSavedInput"),
  editSavedError: document.querySelector("#editSavedError"),
  toast: document.querySelector("#toast"),
  toastText: document.querySelector("#toastText"),
};

const usesServerStorage = ["http:", "https:"].includes(window.location.protocol);

let state = loadCachedState();
let toastTimer;
let returnFocusTo = null;

function loadCachedState() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (
      Number.isFinite(stored?.saved) &&
      stored.saved >= 0 &&
      Number.isFinite(stored?.goal) &&
      stored.goal > 0
    ) {
      return stored;
    }
  } catch (error) {
    console.warn("Не удалось прочитать сохранённые данные", error);
  }
  return { ...DEFAULT_STATE };
}

function cacheState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved: state.saved, goal: state.goal }));
  } catch (error) {
    console.warn("Не удалось обновить локальный кэш", error);
  }
}

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(payload.error || "Не удалось сохранить данные");
  }

  return payload;
}

async function hydrateState() {
  if (!usesServerStorage) return;

  try {
    state = await apiRequest("/api/state");
    cacheState();
    render();
  } catch (error) {
    console.error("Не удалось загрузить общие данные", error);
    showToast("Нет связи с хранилищем — показаны последние данные");
  }
}

function setFormBusy(form, isBusy) {
  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = isBusy;
  form.setAttribute("aria-busy", String(isBusy));
}

function formatMoney(value) {
  return `${Math.round(value).toLocaleString("ru-RU")} zł`;
}

function formatInput(value) {
  return Math.round(value).toLocaleString("ru-RU");
}

function parseAmount(value) {
  const normalized = String(value).replace(/[^\d]/g, "");
  return normalized ? Number(normalized) : 0;
}

function formatPercent(value) {
  if (value >= 100) return "100%";
  if (value > 0 && value < 1) return `${value.toFixed(1).replace(".", ",")}%`;
  return `${value.toFixed(1).replace(".0", "").replace(".", ",")}%`;
}

function render() {
  const rawProgress = state.goal > 0 ? (state.saved / state.goal) * 100 : 0;
  const progress = Math.min(Math.max(rawProgress, 0), 100);
  const percentLabel = formatPercent(progress);

  document.documentElement.style.setProperty("--progress", `${progress}%`);
  elements.savedAmount.textContent = formatMoney(state.saved);
  elements.currentSavedValue.textContent = formatMoney(state.saved);
  elements.goalDisplay.textContent = formatMoney(state.goal);
  elements.progressPercent.textContent = percentLabel;
  elements.revealPercent.textContent = percentLabel;
  elements.revealLine.style.opacity = progress <= 0 ? "0" : "1";
  elements.revealLine.style.left = `${Math.min(Math.max(progress, 2.5), 97.5)}%`;
  elements.goalAmount.value = formatInput(state.goal);
}

function setFieldError(input, errorElement, message) {
  const wrap = input.closest("label");
  input.setAttribute("aria-invalid", message ? "true" : "false");
  wrap?.classList.toggle("is-invalid", Boolean(message));
  errorElement.textContent = message;
}

function clearFieldError(input, errorElement) {
  setFieldError(input, errorElement, "");
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toastText.textContent = message;
  elements.toast.classList.add("is-visible");
  toastTimer = window.setTimeout(() => elements.toast.classList.remove("is-visible"), 2400);
}

function animateSavedAmount(from, to, duration = 800) {
  const started = performance.now();
  const delta = to - from;

  function frame(now) {
    const elapsed = Math.min((now - started) / duration, 1);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    elements.savedAmount.textContent = formatMoney(from + delta * eased);
    if (elapsed < 1) requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
}

function hideAllDialogs() {
  elements.dialogs.forEach((dialog) => {
    dialog.hidden = true;
  });
}

function openDialog(dialog, focusTarget, focusReturn = document.activeElement) {
  returnFocusTo = focusReturn;
  hideAllDialogs();
  dialog.hidden = false;
  elements.dialogScrim.hidden = false;
  document.body.classList.add("dialog-is-open");
  requestAnimationFrame(() => elements.dialogScrim.classList.add("is-open"));
  window.setTimeout(() => focusTarget?.focus(), 90);
}

function closeDialog() {
  elements.dialogScrim.classList.remove("is-open");
  document.body.classList.remove("dialog-is-open");
  window.setTimeout(() => {
    hideAllDialogs();
    elements.dialogScrim.hidden = true;
    returnFocusTo?.focus();
  }, 220);
}

function normalizeLiveInput(event) {
  const rawValue = event.currentTarget.value;
  const hasDigits = /\d/.test(rawValue);
  event.currentTarget.value = hasDigits ? formatInput(parseAmount(rawValue)) : "";
}

elements.openDepositButton.addEventListener("click", () => {
  elements.depositAmount.value = "";
  clearFieldError(elements.depositAmount, elements.depositError);
  openDialog(elements.depositDialog, elements.depositAmount);
});

elements.openSettingsButton.addEventListener("click", () => {
  elements.goalAmount.value = formatInput(state.goal);
  clearFieldError(elements.goalAmount, elements.goalError);
  openDialog(elements.settingsDialog, elements.goalAmount);
  window.setTimeout(() => elements.goalAmount.select(), 100);
});

elements.openEditSavedButton.addEventListener("click", () => {
  elements.editSavedInput.value = formatInput(state.saved);
  clearFieldError(elements.editSavedInput, elements.editSavedError);
  openDialog(elements.editSavedDialog, elements.editSavedInput);
  window.setTimeout(() => elements.editSavedInput.select(), 100);
});

elements.editFromDepositButton.addEventListener("click", () => {
  elements.editSavedInput.value = formatInput(state.saved);
  clearFieldError(elements.editSavedInput, elements.editSavedError);
  openDialog(elements.editSavedDialog, elements.editSavedInput, elements.openDepositButton);
  window.setTimeout(() => elements.editSavedInput.select(), 100);
});

elements.depositForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.depositAmount.value);

  if (amount <= 0) {
    setFieldError(elements.depositAmount, elements.depositError, "Введите сумму больше нуля");
    elements.depositAmount.focus();
    return;
  }

  const previous = state.saved;
  setFormBusy(elements.depositForm, true);

  try {
    state = usesServerStorage
      ? await apiRequest("/api/state/add", {
          method: "POST",
          body: JSON.stringify({ amount }),
        })
      : { ...state, saved: state.saved + amount };

    cacheState();
    render();
    animateSavedAmount(previous, state.saved);
    closeDialog();
    showToast(`Добавлено ${formatMoney(amount)}`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Не удалось сохранить пополнение");
  } finally {
    setFormBusy(elements.depositForm, false);
  }
});

document.querySelectorAll("[data-amount]").forEach((button) => {
  button.addEventListener("click", () => {
    const current = parseAmount(elements.depositAmount.value);
    elements.depositAmount.value = formatInput(current + Number(button.dataset.amount));
    clearFieldError(elements.depositAmount, elements.depositError);
    elements.depositAmount.focus();
  });
});

elements.goalForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const goal = parseAmount(elements.goalAmount.value);

  if (goal <= 0) {
    setFieldError(elements.goalAmount, elements.goalError, "Введите стоимость больше нуля");
    elements.goalAmount.focus();
    return;
  }

  setFormBusy(elements.goalForm, true);

  try {
    state = usesServerStorage
      ? await apiRequest("/api/state", {
          method: "PUT",
          body: JSON.stringify({ goal }),
        })
      : { ...state, goal };

    cacheState();
    render();
    closeDialog();
    showToast("Стоимость автомобиля обновлена");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Не удалось сохранить стоимость");
  } finally {
    setFormBusy(elements.goalForm, false);
  }
});

elements.editSavedForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = parseAmount(elements.editSavedInput.value);

  if (elements.editSavedInput.value.trim() === "") {
    setFieldError(elements.editSavedInput, elements.editSavedError, "Введите текущую сумму накоплений");
    elements.editSavedInput.focus();
    return;
  }

  setFormBusy(elements.editSavedForm, true);

  try {
    state = usesServerStorage
      ? await apiRequest("/api/state", {
          method: "PUT",
          body: JSON.stringify({ saved: amount }),
        })
      : { ...state, saved: amount };

    cacheState();
    render();
    closeDialog();
    showToast("Текущая сумма обновлена");
  } catch (error) {
    console.error(error);
    showToast(error.message || "Не удалось сохранить текущую сумму");
  } finally {
    setFormBusy(elements.editSavedForm, false);
  }
});

document.querySelectorAll("[data-close-dialog]").forEach((button) => {
  button.addEventListener("click", closeDialog);
});

elements.dialogScrim.addEventListener("click", (event) => {
  if (event.target === elements.dialogScrim) closeDialog();
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !elements.dialogScrim.hidden) closeDialog();
});

[elements.depositAmount, elements.goalAmount, elements.editSavedInput].forEach((input) => {
  input.addEventListener("input", normalizeLiveInput);
});

elements.depositAmount.addEventListener("input", () => clearFieldError(elements.depositAmount, elements.depositError));
elements.goalAmount.addEventListener("input", () => clearFieldError(elements.goalAmount, elements.goalError));
elements.editSavedInput.addEventListener("input", () => clearFieldError(elements.editSavedInput, elements.editSavedError));

render();
hydrateState();
