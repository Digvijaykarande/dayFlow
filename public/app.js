const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const state = { token: localStorage.getItem("dayflow_token"), user: null, tasks: [], view: "today", filter: "all", stats: null, editingId: null, authMode: "login", toastTimer: null };

const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
};
const dateLabel = (key, options = { weekday: "short", month: "short", day: "numeric" }) => {
  if (!key) return "";
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", options);
};
const escapeHTML = (value = "") => String(value).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
const api = async (url, options = {}) => {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...(state.token ? { Authorization: `Bearer ${state.token}` } : {}), ...(options.headers || {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && state.token) logout(false);
    throw new Error(data.message || "Request failed. Please try again.");
  }
  return data;
};
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2700);
}
function setAuthMode(mode) {
  state.authMode = mode;
  const isRegister = mode === "register";
  $("#auth-title").innerHTML = isRegister ? 'Start with a<br><span>small win.</span>' : 'Make room for<br><span>what matters.</span>';
  $("#name-wrap").classList.toggle("hidden", !isRegister);
  $("#auth-name").required = isRegister;
  $("#auth-password").autocomplete = isRegister ? "new-password" : "current-password";
  $("#auth-submit").innerHTML = isRegister ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
  $("#switch-label").textContent = isRegister ? "Already have an account?" : "New to Dayflow?";
  $("#auth-switch").textContent = isRegister ? "Sign in" : "Create an account";
  $("#auth-error").textContent = "";
}
$("#auth-switch").addEventListener("click", () => setAuthMode(state.authMode === "login" ? "register" : "login"));
$("#auth-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("#auth-error").textContent = "";
  const payload = { email: $("#auth-email").value.trim(), password: $("#auth-password").value };
  if (state.authMode === "register") payload.name = $("#auth-name").value.trim();
  const button = $("#auth-submit");
  button.disabled = true; button.textContent = "Please wait…";
  try {
    const result = await api(`/auth/${state.authMode === "register" ? "register" : "login"}`, { method: "POST", body: JSON.stringify(payload) });
    state.token = result.token; state.user = result.user;
    localStorage.setItem("dayflow_token", result.token);
    await enterApp();
  } catch (err) {
    $("#auth-error").textContent = err.message;
  } finally {
    button.disabled = false;
    button.innerHTML = state.authMode === "register" ? 'Create account <span>↗</span>' : 'Sign in <span>↗</span>';
  }
});

async function enterApp() {
  try {
    if (!state.user) {
      const result = await api("/auth/me");
      state.user = result.user;
    }
    $("#auth-screen").classList.add("hidden");
    $("#app").classList.remove("hidden");
    $("#user-name").textContent = state.user.name;
    $("#user-email").textContent = state.user.email;
    $("#avatar").textContent = state.user.name.charAt(0).toUpperCase();
    updateGreeting();
    await refreshData();
  } catch (err) {
    if (state.token) logout(false);
    else $("#auth-screen").classList.remove("hidden");
  }
}
function logout(showMessage = true) {
  state.token = null; state.user = null; state.tasks = []; state.stats = null;
  localStorage.removeItem("dayflow_token");
  $("#app").classList.add("hidden"); $("#auth-screen").classList.remove("hidden");
  $("#auth-password").value = "";
  if (showMessage) showToast("You’ve signed out.");
}
$("#logout").addEventListener("click", () => logout());
$("#mobile-logout").addEventListener("click", () => logout());

function updateGreeting() {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  $("#page-title").innerHTML = `${greeting}<span class="heading-period">.</span>`;
  $("#header-date").textContent = new Date().toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  $("#task-date-label").textContent = dateLabel(todayKey(), { month: "short", day: "numeric", year: "numeric" });
}
async function refreshData() {
  const [tasksResult, stats] = await Promise.all([
    api("/tasks"),
    api("/tasks/stats/summary?date=" + todayKey())
  ]);
  state.tasks = tasksResult.tasks;
  state.stats = stats;
  renderAll();
}
function renderAll() {
  renderToday();
  renderStats();
  renderWeek();
  renderHistory();
  renderSecondary();
  $("#today-count").textContent = state.tasks.filter(t => t.dueDate === todayKey() && !t.completed).length;
}
function renderToday() {
  const todayTasks = state.tasks.filter(t => t.dueDate === todayKey());
  const visible = todayTasks.filter(t => state.filter === "active" ? !t.completed : state.filter === "done" ? t.completed : true);
  $("#task-heading-count").textContent = todayTasks.length;
  $("#task-list").innerHTML = visible.map(taskMarkup).join("");
  $("#empty-state").classList.toggle("hidden", visible.length > 0);
  $("#task-list").classList.toggle("hidden", visible.length === 0);
  if (!todayTasks.length) {
    $("#empty-title").textContent = "A clear space to begin.";
    $("#empty-copy").textContent = "Add your first task and make today count.";
  } else if (!visible.length) {
    $("#empty-title").textContent = state.filter === "active" ? "Nothing left in progress." : "No completed tasks yet.";
    $("#empty-copy").textContent = state.filter === "active" ? "You’ve cleared your active list. Nice work." : "Finish a task and your win will show up here.";
  }
}
function taskMarkup(task) {
  const safeId = escapeHTML(task._id);
  const title = escapeHTML(task.title);
  const notes = escapeHTML(task.notes || "");
  const category = escapeHTML(task.category);
  const priority = escapeHTML(task.priority);
  const due = task.dueDate === todayKey() ? "Today" : dateLabel(task.dueDate, { month: "short", day: "numeric" });
  return `<article class="task-row ${task.completed ? "is-done" : ""}" data-task-id="${safeId}">
    <input class="task-check" type="checkbox" aria-label="Mark ${title} as completed" ${task.completed ? "checked" : ""} data-action="toggle" data-id="${safeId}">
    <div class="task-main"><div class="task-title">${title}</div>${notes ? `<div class="task-notes">${notes}</div>` : ""}
      <div class="task-meta"><span class="tag category-${category}">${category}</span><span class="priority ${priority}">${priority} priority</span>${state.view !== "today" ? `<span class="small-muted">${due}</span>` : ""}</div>
    </div>
    <div class="task-actions"><button class="task-action" title="Edit task" aria-label="Edit task" data-action="edit" data-id="${safeId}">✎</button><button class="task-action" title="Delete task" aria-label="Delete task" data-action="delete" data-id="${safeId}">×</button></div>
  </article>`;
}
function renderStats() {
  const s = state.stats; if (!s) return;
  $("#today-rate").textContent = `${s.today.rate}%`;
  $("#ring-progress").style.strokeDashoffset = 307.88 * (1 - s.today.rate / 100);
  $("#progress-headline").textContent = s.today.rate === 100 && s.today.total ? "You did it. Brilliant." : s.today.completed ? "Look at you go." : "A fresh start.";
  $("#progress-message").textContent = s.today.rate === 100 && s.today.total ? "You showed up for every task today." : s.today.completed ? "You’re building real momentum." : "Choose a task and build some momentum.";
  $("#mini-progress-fill").style.width = `${s.today.rate}%`;
  $("#progress-count").textContent = `${s.today.completed} of ${s.today.total} tasks done`;
  $("#stat-completed").textContent = s.today.completed;
  $("#stat-remaining").textContent = s.today.remaining;
  $("#all-total").textContent = s.overall.total;
  $("#all-completed").textContent = s.overall.completed;
  $("#all-rate").textContent = `${s.overall.rate}%`;
  $("#week-rate").textContent = `${s.week.rate}%`;
  $("#week-total").textContent = `${s.week.completed} completed`;
}
function renderWeek() {
  const days = state.stats?.week.daily || [];
  $("#week-bars").innerHTML = days.map(d => {
    const pct = d.total ? d.completed / d.total * 100 : 0;
    return `<div class="week-day ${d.date === todayKey() ? "today" : ""}"><div class="bar-stack" title="${d.completed} of ${d.total} completed"><div class="bar-fill" style="height:${pct}%"></div></div><span>${d.label}</span></div>`;
  }).join("");
}
function renderHistory() {
  const days = state.stats?.week.daily || [];
  $("#history-chart").innerHTML = days.map(d => {
    const pct = d.total ? d.completed / d.total * 100 : 0;
    return `<div class="history-column ${d.date === todayKey() ? "today" : ""}"><span class="history-number">${d.completed}/${d.total}</span><div class="history-track" title="${d.completed} completed, ${d.total - d.completed} remaining"><div class="history-fill" style="height:${pct}%"></div></div><span class="history-label">${d.label}</span></div>`;
  }).join("");
}
function renderSecondary() {
  const all = state.tasks;
  let list = [], title = "", subtitle = "";
  if (state.view === "upcoming") {
    list = all.filter(t => t.dueDate > todayKey() && !t.completed).sort((a,b) => a.dueDate.localeCompare(b.dueDate));
    title = "Coming up"; subtitle = "A little preview of what’s next.";
  } else {
    list = all.filter(t => t.completed).sort((a,b) => (b.completedAt || b.updatedAt || "").localeCompare(a.completedAt || a.updatedAt || ""));
    title = "Completed tasks"; subtitle = "Every finished task is progress.";
  }
  $("#list-view-title").textContent = title;
  $("#list-view-subtitle").textContent = subtitle;
  $("#secondary-task-list").innerHTML = list.map(taskMarkup).join("");
  $("#secondary-empty").classList.toggle("hidden", list.length > 0);
  $("#secondary-task-list").classList.toggle("hidden", list.length === 0);
}
function setView(view) {
  state.view = view;
  $$(".nav-item").forEach(b => b.classList.toggle("active", b.dataset.view === view));
  $("#today-view").classList.toggle("hidden", view !== "today");
  $("#list-view").classList.toggle("hidden", !["upcoming","completed"].includes(view));
  $("#progress-view").classList.toggle("hidden", view !== "progress");
  const names = { today: "My day", upcoming: "Upcoming", completed: "Completed", progress: "Progress" };
  $("#breadcrumb-current").textContent = names[view];
  $("#page-subtitle").textContent = ({ today: "Here’s your focus for today.", upcoming: "Give your future self a head start.", completed: "Look at everything you’ve followed through on.", progress: "Your effort, collected over time." })[view];
  $("#add-task-top").classList.toggle("hidden", view === "completed" || view === "progress");
  if (view === "progress") renderHistory();
}
$$(".nav-item").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
$("#task-filters").addEventListener("click", e => {
  const button = e.target.closest("[data-filter]"); if (!button) return;
  state.filter = button.dataset.filter;
  $$(".filter-tab").forEach(b => b.classList.toggle("active", b === button));
  renderToday();
});

function openModal(task = null) {
  state.editingId = task?._id || null;
  $("#task-form").reset();
  $("#task-error").textContent = "";
  $("#modal-title").textContent = task ? "Edit task" : "Add a task";
  $("#save-task").innerHTML = task ? "Save changes <span>↗</span>" : "Save task <span>↗</span>";
  $("#task-title").value = task?.title || "";
  $("#task-notes").value = task?.notes || "";
  $("#task-category").value = task?.category || "Study";
  $("#task-priority").value = task?.priority || "Medium";
  $("#task-date").value = task?.dueDate || todayKey();
  $("#task-modal").classList.remove("hidden");
  document.body.style.overflow = "hidden";
  setTimeout(() => $("#task-title").focus(), 50);
}
function closeModal() { $("#task-modal").classList.add("hidden"); document.body.style.overflow = ""; state.editingId = null; }
$("#add-task-top").addEventListener("click", () => openModal());
$("#add-task-inline").addEventListener("click", () => openModal());
$("#empty-add").addEventListener("click", () => openModal());
$("#list-add").addEventListener("click", () => openModal());
$("#secondary-add").addEventListener("click", () => openModal());
$("#modal-close").addEventListener("click", closeModal);
$("#modal-cancel").addEventListener("click", closeModal);
$("#task-modal").addEventListener("click", e => { if (e.target === $("#task-modal")) closeModal(); });
document.addEventListener("keydown", e => { if (e.key === "Escape" && !$("#task-modal").classList.contains("hidden")) closeModal(); });
$("#task-form").addEventListener("submit", async e => {
  e.preventDefault();
  $("#task-error").textContent = "";
  const payload = {
    title: $("#task-title").value.trim(), notes: $("#task-notes").value.trim(),
    category: $("#task-category").value, priority: $("#task-priority").value, dueDate: $("#task-date").value
  };
  const button = $("#save-task"); const wasEditing = Boolean(state.editingId); button.disabled = true; button.textContent = "Saving…";
  try {
    await api(state.editingId ? `/tasks/${state.editingId}` : "/tasks", { method: state.editingId ? "PATCH" : "POST", body: JSON.stringify(payload) });
    closeModal(); await refreshData(); showToast(wasEditing ? "Task updated." : "Task added to your day.");
  } catch (err) { $("#task-error").textContent = err.message; }
  finally { button.disabled = false; button.innerHTML = wasEditing ? "Save changes <span>↗</span>" : "Save task <span>↗</span>"; }
});
document.addEventListener("click", async e => {
  const control = e.target.closest("[data-action]"); if (!control) return;
  const { action, id } = control.dataset;
  const task = state.tasks.find(t => t._id === id);
  if (!task) return;
  if (action === "edit") return openModal(task);
  if (action === "delete") {
    if (!confirm(`Delete “${task.title}”? This can’t be undone.`)) return;
    try { await api(`/tasks/${id}`, { method: "DELETE" }); await refreshData(); showToast("Task deleted."); }
    catch (err) { showToast(err.message); }
  }
});
document.addEventListener("change", async e => {
  const control = e.target.closest('[data-action="toggle"]'); if (!control) return;
  try {
    await api(`/tasks/${control.dataset.id}`, { method: "PATCH", body: JSON.stringify({ completed: control.checked }) });
    await refreshData();
    showToast(control.checked ? "One small win, collected ✨" : "Task moved back to in progress.");
  } catch (err) { control.checked = !control.checked; showToast(err.message); }
});

(async function init() {
  if (state.token) await enterApp();
  else setAuthMode("login");
})();