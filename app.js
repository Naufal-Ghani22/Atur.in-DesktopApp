/* ==========================================================================
   ATUR.IN - Asisten Produktivitas & Manajemen Harian
   JavaScript Application Engine & Google Calendar Day View Renderer
   ========================================================================== */

const START_HOUR = 6;  // 06:00
const END_HOUR = 23;   // 23:00
const ROW_HEIGHT = 60; // 60px per hour slot

// Clean State: Empty Initial Data (No Dummy Data)
const INITIAL_TASKS = [];
const INITIAL_SCHEDULE = [];

// App State Manager
class AppState {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('fp_tasks')) || [];
        const rawSchedule = JSON.parse(localStorage.getItem('fp_schedule'));
        this.schedule = this.migrateSchedule(rawSchedule);
        
        this.focusLogs = JSON.parse(localStorage.getItem('fp_focus_logs')) || [];
        this.streakDays = parseInt(localStorage.getItem('fp_streak')) || 1;
        this.isMainPinned = false;

        // Robust Timestamp-Based Timer State
        this.timer = {
            mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
            duration: 25 * 60, // in seconds
            remaining: 25 * 60,
            isRunning: false,
            targetEndTime: null, // Wall-clock timestamp (Date.now())
            intervalId: null,
            linkedTaskId: ''
        };
    }

    migrateSchedule(rawSchedule) {
        if (!rawSchedule || !Array.isArray(rawSchedule)) {
            return [];
        }

        return rawSchedule.map((item, idx) => {
            if (item.startTime && item.endTime) return item;
            
            const h = item.hour || 9;
            const startStr = `${h < 10 ? '0' : ''}${h}:00`;
            const endStr = `${(h + 1) < 10 ? '0' : ''}${h + 1}:00`;
            return {
                id: 'tb-' + Date.now() + '-' + idx,
                startTime: startStr,
                endTime: endStr,
                title: item.title || 'Aktivitas Harian',
                color: 'indigo'
            };
        });
    }

    save() {
        localStorage.setItem('fp_tasks', JSON.stringify(this.tasks));
        localStorage.setItem('fp_schedule', JSON.stringify(this.schedule));
        localStorage.setItem('fp_focus_logs', JSON.stringify(this.focusLogs));
        localStorage.setItem('fp_streak', this.streakDays.toString());
        this.saveTimerState();
    }

    saveTimerState() {
        const timerData = {
            mode: this.timer.mode,
            duration: this.timer.duration,
            remaining: this.timer.remaining,
            isRunning: this.timer.isRunning,
            targetEndTime: this.timer.targetEndTime,
            linkedTaskId: this.timer.linkedTaskId
        };
        localStorage.setItem('fp_timer_state', JSON.stringify(timerData));
    }

    resetAllData() {
        this.tasks = [];
        this.schedule = [];
        this.focusLogs = [];
        this.streakDays = 1;
        this.save();
    }
}

const state = new AppState();

// Initialize Audio Context for Beep Sound
let audioCtx = null;
function playNotificationSound() {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.3);

        gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {
        console.log('Audio notification fallback:', e);
    }
}

// DOM Initialization
document.addEventListener('DOMContentLoaded', () => {
    initClock();
    initNavigation();
    initKanbanEvents();
    initModalEvents();
    initTimerEvents();
    initGlobalSearch();
    initAlwaysOnTopAndMiniWidget();
    restoreTimerState();
    renderAll();

    const todayBtn = document.getElementById('btn-gcal-today');
    if (todayBtn) {
        todayBtn.addEventListener('click', scrollToCurrentTimeInGCal);
    }

    const resetDataBtn = document.getElementById('btn-seed-data');
    if (resetDataBtn) {
        resetDataBtn.innerHTML = `<i class="fa-solid fa-broom"></i> Bersihkan Semua Data`;
        resetDataBtn.addEventListener('click', () => {
            if (confirm('Apakah Anda yakin ingin mengosongkan semua tugas dan jadwal?')) {
                state.resetAllData();
                renderAll();
                showNotification('Semua data berhasil dikosongkan!');
            }
        });
    }
});

// ALWAYS-ON-TOP & FLOATING MINI WIDGET CONTROLLER
function initAlwaysOnTopAndMiniWidget() {
    const pinMainBtn = document.getElementById('btn-pin-main-app');
    const openMiniBtn = document.getElementById('btn-open-mini-widget');

    if (pinMainBtn) {
        pinMainBtn.addEventListener('click', () => {
            state.isMainPinned = !state.isMainPinned;
            const text = document.getElementById('pin-main-text');

            if (state.isMainPinned) {
                pinMainBtn.classList.add('btn-primary');
                pinMainBtn.classList.remove('btn-secondary');
                if (text) text.textContent = 'Ter-pin di Atas';
                showNotification('📌 Jendela utama di-PIN di lapisan teratas layar!');
            } else {
                pinMainBtn.classList.add('btn-secondary');
                pinMainBtn.classList.remove('btn-primary');
                if (text) text.textContent = 'Pin Layar';
                showNotification('📍 Jendela utama kembali normal.');
            }

            if (window.electronAPI) {
                window.electronAPI.toggleAlwaysOnTop(state.isMainPinned);
            }
        });
    }

    if (openMiniBtn) {
        openMiniBtn.addEventListener('click', () => {
            popOutFloatingTimer();
        });
    }

    // Listen for actions from Floating Mini Window
    if (window.electronAPI) {
        window.electronAPI.onTimerActionInMain((action) => {
            if (action === 'toggle-play') toggleTimer();
            if (action === 'reset') resetTimer();
        });
    }
}

function popOutFloatingTimer() {
    if (!window.electronAPI) {
        showNotification('Fitur Floating Desktop Timer membutuhkan versi aplikasi desktop Electron.');
        return;
    }

    const mins = Math.floor(state.timer.remaining / 60);
    const secs = state.timer.remaining % 60;
    const timeFormatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    
    let taskTitle = 'Sesi Fokus Mandiri';
    if (state.timer.linkedTaskId) {
        const t = state.tasks.find(tk => tk.id === state.timer.linkedTaskId);
        if (t) taskTitle = t.title;
    }

    window.electronAPI.openMiniTimer({
        clock: timeFormatted,
        taskTitle: taskTitle,
        isRunning: state.timer.isRunning,
        isPinned: true
    });
}

// Live Clock & Greeting (Realtime 1000ms)
function initClock() {
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
        const dateStr = now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

        document.getElementById('current-time').textContent = timeStr;
        document.getElementById('current-date').textContent = dateStr;

        const headingElem = document.getElementById('gcal-date-heading');
        if (headingElem) headingElem.textContent = `Jadwal Harian (${dateStr})`;

        const hour = now.getHours();
        let greeting = 'Selamat Datang di ATUR.IN! 👋';
        if (hour >= 4 && hour < 11) greeting = 'Selamat Pagi! 🌅';
        else if (hour >= 11 && hour < 15) greeting = 'Selamat Siang! ☀️';
        else if (hour >= 15 && hour < 18) greeting = 'Selamat Sore! ☕';
        else greeting = 'Selamat Malam! 🌙';

        const greetingElem = document.getElementById('greeting-title');
        if (greetingElem) greetingElem.textContent = greeting;

        updateGCalNowIndicator(now);
    }
    updateClock();
    setInterval(updateClock, 1000);
}

// Navigation Tabs
function initNavigation() {
    const navButtons = document.querySelectorAll('.nav-item');
    navButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const targetTab = btn.getAttribute('data-tab');
            switchTab(targetTab);
        });
    });
}

function switchTab(tabId) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));

    const activeNav = document.querySelector(`.nav-item[data-tab="${tabId}"]`);
    const activeView = document.getElementById(`view-${tabId}`);

    if (activeNav) activeNav.classList.add('active');
    if (activeView) activeView.classList.add('active');

    if (tabId === 'schedule') {
        renderScheduleTimeline();
        setTimeout(scrollToCurrentTimeInGCal, 100);
    }
    if (tabId === 'analytics') renderAnalytics();
    if (tabId === 'timer') updateTimerTaskDropdown();
}

// Main Render Function
function renderAll() {
    renderKanban();
    renderDashboardMetrics();
    renderDashboardPriorityTasks();
    renderDashboardUpcomingAgenda();
    renderScheduleTimeline();
    renderAnalytics();
    updateTimerTaskDropdown();
    updateSidebarStreak();
}

// Sidebar Streak
function updateSidebarStreak() {
    const streakElem = document.getElementById('streak-days');
    if (streakElem) streakElem.textContent = state.streakDays;
}

// KANBAN BOARD CONTROLLER
function renderKanban() {
    const filterPrio = document.getElementById('filter-priority').value;
    const filterCat = document.getElementById('filter-category').value;
    const searchQuery = document.getElementById('global-search').value.toLowerCase().trim();

    const columns = {
        todo: document.getElementById('col-todo'),
        'in-progress': document.getElementById('col-in-progress'),
        review: document.getElementById('col-review'),
        done: document.getElementById('col-done')
    };

    Object.values(columns).forEach(col => col.innerHTML = '');
    const counts = { todo: 0, 'in-progress': 0, review: 0, done: 0 };

    state.tasks.forEach(task => {
        if (filterPrio !== 'all' && task.priority !== filterPrio) return;
        if (filterCat !== 'all' && task.category !== filterCat) return;
        if (searchQuery && !task.title.toLowerCase().includes(searchQuery) && !(task.desc || '').toLowerCase().includes(searchQuery)) return;

        counts[task.status] = (counts[task.status] || 0) + 1;

        const card = document.createElement('div');
        card.className = 'task-card';
        card.setAttribute('draggable', 'true');
        card.dataset.id = task.id;

        const priorityLabel = task.priority === 'high' ? 'High 🔥' : task.priority === 'medium' ? 'Medium ⚡' : 'Low ☕';

        card.innerHTML = `
            <div class="card-top">
                <span class="badge-priority ${task.priority}">${priorityLabel}</span>
                <span class="badge-category"><i class="fa-solid fa-folder-open"></i> ${task.category}</span>
            </div>
            <h4>${escapeHtml(task.title)}</h4>
            ${task.desc ? `<p>${escapeHtml(task.desc)}</p>` : ''}
            <div class="card-bottom">
                <span><i class="fa-regular fa-clock"></i> ${task.estTime}m</span>
                <div class="card-actions">
                    <button class="card-action-btn" onclick="startTimerForTask('${task.id}')" title="Mulai Timer Fokus">
                        <i class="fa-solid fa-circle-play" style="color: var(--accent-cyan);"></i>
                    </button>
                    <button class="card-action-btn" onclick="editTask('${task.id}')" title="Edit Tugas">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="card-action-btn delete" onclick="deleteTask('${task.id}')" title="Hapus">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;

        card.addEventListener('dragstart', (e) => {
            card.classList.add('dragging');
            e.dataTransfer.setData('text/plain', task.id);
        });

        card.addEventListener('dragend', () => {
            card.classList.remove('dragging');
        });

        if (columns[task.status]) {
            columns[task.status].appendChild(card);
        }
    });

    document.getElementById('count-todo').textContent = counts.todo;
    document.getElementById('count-in-progress').textContent = counts['in-progress'];
    document.getElementById('count-review').textContent = counts.review;
    document.getElementById('count-done').textContent = counts.done;
    document.getElementById('badge-pending').textContent = counts.todo + counts['in-progress'];
}

function initKanbanEvents() {
    const taskLists = document.querySelectorAll('.task-list');

    taskLists.forEach(list => {
        list.addEventListener('dragover', (e) => {
            e.preventDefault();
            list.style.background = 'rgba(99, 102, 241, 0.08)';
        });

        list.addEventListener('dragleave', () => {
            list.style.background = 'transparent';
        });

        list.addEventListener('drop', (e) => {
            e.preventDefault();
            list.style.background = 'transparent';
            const taskId = e.dataTransfer.getData('text/plain');
            const targetStatus = list.getAttribute('data-status');

            const task = state.tasks.find(t => t.id === taskId);
            if (task && task.status !== targetStatus) {
                task.status = targetStatus;
                state.save();
                renderAll();
                showNotification(`Status tugas dipindahkan ke: ${targetStatus.toUpperCase()}`);
            }
        });
    });

    document.getElementById('filter-priority').addEventListener('change', renderKanban);
    document.getElementById('filter-category').addEventListener('change', renderKanban);
}

// DASHBOARD RENDERERS
function renderDashboardMetrics() {
    const total = state.tasks.length;
    const completed = state.tasks.filter(t => t.status === 'done').length;
    const inProgress = state.tasks.filter(t => t.status === 'in-progress').length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const todayFocus = state.focusLogs.reduce((acc, log) => acc + log.minutes, 0);

    document.getElementById('stat-total-tasks').textContent = total;
    document.getElementById('stat-completed-tasks').textContent = `${completed} Selesai`;
    document.getElementById('stat-focus-time').textContent = `${todayFocus}m`;
    document.getElementById('stat-sessions-count').textContent = `${state.focusLogs.length} Sesi Selesai`;
    document.getElementById('stat-completion-rate').textContent = `${rate}%`;
    document.getElementById('stat-in-progress').textContent = inProgress;
}

function renderDashboardPriorityTasks() {
    const container = document.getElementById('dashboard-priority-list');
    container.innerHTML = '';

    const priorityTasks = state.tasks
        .filter(t => t.status !== 'done')
        .sort((a, b) => (a.priority === 'high' ? -1 : 1))
        .slice(0, 4);

    if (priorityTasks.length === 0) {
        container.innerHTML = `<p style="font-size: 13px; color: var(--text-dim); text-align: center; padding: 20px;">Belum ada tugas. Tambahkan tugas baru!</p>`;
        return;
    }

    priorityTasks.forEach(task => {
        const item = document.createElement('div');
        item.className = 'priority-task-item';
        item.innerHTML = `
            <div class="pt-left">
                <div class="pt-checkbox" onclick="quickCompleteTask('${task.id}')" title="Tandai Selesai">
                    <i class="fa-solid fa-check" style="font-size: 10px; display: none;"></i>
                </div>
                <div>
                    <div class="pt-title">${escapeHtml(task.title)}</div>
                    <div class="pt-meta">
                        <span class="badge-priority ${task.priority}">${task.priority}</span>
                        <span><i class="fa-regular fa-clock"></i> ${task.estTime}m</span>
                    </div>
                </div>
            </div>
            <button class="btn-secondary btn-sm" onclick="startTimerForTask('${task.id}')">
                <i class="fa-solid fa-play"></i> Fokus
            </button>
        `;
        container.appendChild(item);
    });
}

function renderDashboardUpcomingAgenda() {
    const container = document.getElementById('dashboard-agenda-list');
    container.innerHTML = '';

    const sortedSchedule = [...state.schedule].sort((a, b) => a.startTime.localeCompare(b.startTime)).slice(0, 4);

    if (sortedSchedule.length === 0) {
        container.innerHTML = `<p style="font-size: 12px; color: var(--text-dim); text-align: center;">Belum ada agenda hari ini.</p>`;
        return;
    }

    sortedSchedule.forEach(slot => {
        const item = document.createElement('div');
        item.className = 'agenda-item';
        item.innerHTML = `
            <span class="agenda-time">${slot.startTime} - ${slot.endTime}</span>
            <span class="agenda-text">${escapeHtml(slot.title)}</span>
        `;
        container.appendChild(item);
    });
}

// GOOGLE CALENDAR STYLE DAY VIEW ENGINE
function renderScheduleTimeline() {
    const timeCol = document.getElementById('gcal-time-column');
    const gridRows = document.getElementById('gcal-grid-rows');
    const overlay = document.getElementById('gcal-events-overlay');

    if (!timeCol || !gridRows || !overlay) return;

    timeCol.innerHTML = '';
    gridRows.innerHTML = '';
    overlay.innerHTML = '';

    for (let h = START_HOUR; h <= END_HOUR; h++) {
        const hourFormatted = `${h < 10 ? '0' : ''}${h}:00`;

        const label = document.createElement('div');
        label.className = 'gcal-hour-label';
        label.textContent = hourFormatted;
        timeCol.appendChild(label);

        const row = document.createElement('div');
        row.className = 'gcal-hour-row';
        row.dataset.hour = h;
        row.title = `Klik untuk tambah jadwal jam ${hourFormatted}`;
        row.addEventListener('click', () => {
            const startStr = `${h < 10 ? '0' : ''}${h}:00`;
            const nextH = h + 1 <= 23 ? h + 1 : 23;
            const endStr = `${nextH < 10 ? '0' : ''}${nextH}:00`;
            openAddTimeblockModalWithRange(startStr, endStr);
        });
        gridRows.appendChild(row);
    }

    state.schedule.forEach(item => {
        const [startH, startM] = item.startTime.split(':').map(Number);
        const [endH, endM] = item.endTime.split(':').map(Number);

        const startTotalHours = (startH - START_HOUR) + (startM / 60);
        const endTotalHours = (endH - START_HOUR) + (endM / 60);

        if (startTotalHours < 0 && endTotalHours < 0) return;

        const topPos = startTotalHours * ROW_HEIGHT;
        let heightVal = (endTotalHours - startTotalHours) * ROW_HEIGHT;
        if (heightVal < 36) heightVal = 36;

        const colorClass = item.color || 'indigo';

        const card = document.createElement('div');
        card.className = `gcal-event-card ${colorClass}`;
        card.style.top = `${topPos}px`;
        card.style.height = `${heightVal}px`;

        card.innerHTML = `
            <div class="gcal-event-header">
                <div>
                    <div class="gcal-event-title">${escapeHtml(item.title)}</div>
                    <div class="gcal-event-time">${item.startTime} - ${item.endTime}</div>
                </div>
                <div class="gcal-event-actions">
                    <button class="card-action-btn" onclick="event.stopPropagation(); editTimeblock('${item.id}');" title="Edit">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="card-action-btn delete" onclick="event.stopPropagation(); deleteTimeblock('${item.id}');" title="Hapus">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;

        overlay.appendChild(card);
    });

    updateGCalNowIndicator(new Date());
}

function updateGCalNowIndicator(now) {
    const indicator = document.getElementById('gcal-now-line');
    if (!indicator) return;

    const currentH = now.getHours();
    const currentM = now.getMinutes();

    if (currentH < START_HOUR || currentH > END_HOUR) {
        indicator.style.display = 'none';
        return;
    }

    indicator.style.display = 'flex';
    const totalHours = (currentH - START_HOUR) + (currentM / 60);
    const topPos = totalHours * ROW_HEIGHT;
    indicator.style.top = `${topPos}px`;
}

function scrollToCurrentTimeInGCal() {
    const wrapper = document.querySelector('.gcal-grid-wrapper');
    const indicator = document.getElementById('gcal-now-line');

    if (wrapper && indicator && indicator.style.display !== 'none') {
        const topPos = parseInt(indicator.style.top) || 0;
        wrapper.scrollTo({ top: Math.max(0, topPos - 120), behavior: 'smooth' });
    }
}

function openAddTimeblockModalWithRange(startStr = '09:00', endStr = '10:30') {
    document.getElementById('timeblock-form').reset();
    document.getElementById('tb-id').value = '';
    document.getElementById('tb-start-time').value = startStr;
    document.getElementById('tb-end-time').value = endStr;
    document.getElementById('timeblock-modal-title').textContent = 'Tambah Blok Waktu Jadwal';
    document.getElementById('timeblock-modal').classList.add('active');
}

function openAddTimeblockModal() {
    openAddTimeblockModalWithRange('09:00', '10:30');
}

function editTimeblock(timeblockId) {
    const item = state.schedule.find(s => s.id === timeblockId);
    if (!item) return;

    document.getElementById('tb-id').value = item.id;
    document.getElementById('tb-title').value = item.title;
    document.getElementById('tb-start-time').value = item.startTime;
    document.getElementById('tb-end-time').value = item.endTime;
    document.getElementById('tb-color').value = item.color || 'indigo';

    document.getElementById('timeblock-modal-title').textContent = 'Edit Blok Waktu Jadwal';
    document.getElementById('timeblock-modal').classList.add('active');
}

function deleteTimeblock(timeblockId) {
    if (confirm('Apakah Anda yakin ingin menghapus blok waktu ini?')) {
        state.schedule = state.schedule.filter(s => s.id !== timeblockId);
        state.save();
        renderAll();
        showNotification('Blok jadwal berhasil dihapus.');
    }
}

// ROBUST TIMESTAMP-BASED POMODORO TIMER ENGINE & AUTO POP-OUT MINI DESKTOP WIDGET
function initTimerEvents() {
    const toggleBtn = document.getElementById('btn-timer-toggle');
    const resetBtn = document.getElementById('btn-timer-reset');
    const skipBtn = document.getElementById('btn-timer-skip');
    const quickToggleBtn = document.getElementById('btn-quick-timer-toggle');

    toggleBtn.addEventListener('click', toggleTimer);
    if (quickToggleBtn) quickToggleBtn.addEventListener('click', toggleTimer);
    resetBtn.addEventListener('click', resetTimer);
    skipBtn.addEventListener('click', skipTimerMode);

    document.querySelectorAll('.timer-mode-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const mode = btn.getAttribute('data-mode');
            setTimerMode(mode);
        });
    });

    document.getElementById('timer-select-task').addEventListener('change', (e) => {
        state.timer.linkedTaskId = e.target.value;
        const task = state.tasks.find(t => t.id === e.target.value);
        document.getElementById('timer-linked-task').textContent = task ? task.title : 'Tidak ada tugas terpilih';
        state.saveTimerState();
        syncStateToMiniWidget();
    });
}

function restoreTimerState() {
    const savedTimer = JSON.parse(localStorage.getItem('fp_timer_state'));
    if (!savedTimer) return;

    state.timer.mode = savedTimer.mode || 'focus';
    state.timer.duration = savedTimer.duration || 25 * 60;
    state.timer.linkedTaskId = savedTimer.linkedTaskId || '';

    document.querySelectorAll('.timer-mode-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === state.timer.mode);
    });

    if (savedTimer.isRunning && savedTimer.targetEndTime) {
        const now = Date.now();
        const remainingMs = savedTimer.targetEndTime - now;

        if (remainingMs <= 0) {
            state.timer.remaining = 0;
            state.timer.isRunning = false;
            state.timer.targetEndTime = null;
            state.saveTimerState();
            updateTimerUI();
            onTimerComplete();
        } else {
            state.timer.targetEndTime = savedTimer.targetEndTime;
            state.timer.remaining = Math.ceil(remainingMs / 1000);
            startTimer(false);
        }
    } else {
        state.timer.remaining = savedTimer.remaining !== undefined ? savedTimer.remaining : state.timer.duration;
        state.timer.isRunning = false;
        state.timer.targetEndTime = null;
        updateTimerUI();
    }
}

function setTimerMode(mode) {
    pauseTimer();
    state.timer.mode = mode;
    document.querySelectorAll('.timer-mode-btn').forEach(b => {
        b.classList.toggle('active', b.getAttribute('data-mode') === mode);
    });

    if (mode === 'focus') state.timer.duration = 25 * 60;
    else if (mode === 'shortBreak') state.timer.duration = 5 * 60;
    else if (mode === 'longBreak') state.timer.duration = 15 * 60;

    resetTimer();

    const labelElem = document.getElementById('timer-mode-label');
    if (labelElem) {
        labelElem.textContent = mode === 'focus' ? 'Mode Fokus' : mode === 'shortBreak' ? 'Istirahat Pendek' : 'Istirahat Panjang';
    }
}

function toggleTimer() {
    if (state.timer.isRunning) {
        pauseTimer();
    } else {
        startTimer(true);
    }
}

function startTimer(isNewStart = true) {
    if (isNewStart || !state.timer.targetEndTime) {
        state.timer.targetEndTime = Date.now() + (state.timer.remaining * 1000);
    }

    state.timer.isRunning = true;
    state.saveTimerState();
    updateTimerUI();

    document.getElementById('timer-active-dot').classList.remove('hidden');

    clearInterval(state.timer.intervalId);
    state.timer.intervalId = setInterval(tickTimer, 400);

    // AUTO POP-OUT FLOATING MINI TIMER DESKTOP WIDGET WHEN TIMER STARTS!
    popOutFloatingTimer();
}

function tickTimer() {
    if (!state.timer.isRunning || !state.timer.targetEndTime) return;

    const now = Date.now();
    const remainingMs = state.timer.targetEndTime - now;

    if (remainingMs <= 0) {
        state.timer.remaining = 0;
        state.timer.targetEndTime = null;
        state.timer.isRunning = false;
        clearInterval(state.timer.intervalId);
        state.saveTimerState();
        updateTimerUI();
        onTimerComplete();
    } else {
        const newRemainingSec = Math.ceil(remainingMs / 1000);
        if (newRemainingSec !== state.timer.remaining) {
            state.timer.remaining = newRemainingSec;
            updateTimerUI();
        }
    }
}

function pauseTimer() {
    state.timer.isRunning = false;
    clearInterval(state.timer.intervalId);

    if (state.timer.targetEndTime) {
        const remainingMs = Math.max(0, state.timer.targetEndTime - Date.now());
        state.timer.remaining = Math.ceil(remainingMs / 1000);
        state.timer.targetEndTime = null;
    }

    state.saveTimerState();
    updateTimerUI();
    document.getElementById('timer-active-dot').classList.add('hidden');
}

function resetTimer() {
    pauseTimer();
    state.timer.remaining = state.timer.duration;
    state.timer.targetEndTime = null;
    state.saveTimerState();
    updateTimerUI();
}

function skipTimerMode() {
    if (state.timer.mode === 'focus') setTimerMode('shortBreak');
    else setTimerMode('focus');
}

function onTimerComplete() {
    pauseTimer();
    playNotificationSound();

    if (state.timer.mode === 'focus') {
        const minutesLogged = Math.round(state.timer.duration / 60);
        let taskTitle = 'Sesi Fokus Mandiri';

        if (state.timer.linkedTaskId) {
            const task = state.tasks.find(t => t.id === state.timer.linkedTaskId);
            if (task) {
                taskTitle = task.title;
                if (task.status === 'todo') {
                    task.status = 'in-progress';
                }
            }
        }

        state.focusLogs.push({
            date: new Date().toLocaleDateString('id-ID'),
            minutes: minutesLogged,
            taskTitle: taskTitle
        });

        state.save();
        renderAll();

        showNotification(`🎉 Sesi Fokus Selesai! Kamu hebat! Terhubung: ${taskTitle}`);
        setTimerMode('shortBreak');
    } else {
        showNotification('⏰ Waktu Istirahat Selesai! Siap kembali fokus?');
        setTimerMode('focus');
    }
}

function updateTimerUI() {
    const mins = Math.floor(state.timer.remaining / 60);
    const secs = state.timer.remaining % 60;
    const timeFormatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

    document.getElementById('timer-clock').textContent = timeFormatted;
    const quickTimerClock = document.getElementById('quick-timer-clock');
    if (quickTimerClock) quickTimerClock.textContent = timeFormatted;

    const mainIcon = document.getElementById('main-timer-icon');
    const mainBtnText = document.getElementById('main-timer-btn-text');
    const quickIcon = document.getElementById('quick-timer-icon');
    const quickStatus = document.getElementById('quick-timer-status');

    if (state.timer.isRunning) {
        if (mainIcon) mainIcon.className = 'fa-solid fa-pause';
        if (mainBtnText) mainBtnText.textContent = 'Jeda Timer';
        if (quickIcon) quickIcon.className = 'fa-solid fa-pause';
        if (quickStatus) quickStatus.textContent = 'Running';
    } else {
        if (mainIcon) mainIcon.className = 'fa-solid fa-play';
        if (mainBtnText) mainBtnText.textContent = state.timer.mode === 'focus' ? 'Mulai Fokus' : 'Mulai Istirahat';
        if (quickIcon) quickIcon.className = 'fa-solid fa-play';
        if (quickStatus) quickStatus.textContent = 'Ready';
    }

    const progressCircle = document.getElementById('timer-progress-bar');
    if (progressCircle) {
        const total = state.timer.duration;
        const offset = 553 - (state.timer.remaining / total) * 553;
        progressCircle.style.strokeDashoffset = offset;
    }

    syncStateToMiniWidget();
}

function syncStateToMiniWidget() {
    if (!window.electronAPI) return;

    const mins = Math.floor(state.timer.remaining / 60);
    const secs = state.timer.remaining % 60;
    const timeFormatted = `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;

    let taskTitle = 'Sesi Fokus Mandiri';
    if (state.timer.linkedTaskId) {
        const t = state.tasks.find(tk => tk.id === state.timer.linkedTaskId);
        if (t) taskTitle = t.title;
    }

    window.electronAPI.syncTimerToMini({
        clock: timeFormatted,
        taskTitle: taskTitle,
        isRunning: state.timer.isRunning
    });
}

function startTimerForTask(taskId) {
    state.timer.linkedTaskId = taskId;
    document.getElementById('timer-select-task').value = taskId;

    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        document.getElementById('timer-linked-task').textContent = task.title;
    }

    switchTab('timer');
    setTimerMode('focus');
    startTimer(true);
}

function updateTimerTaskDropdown() {
    const select = document.getElementById('timer-select-task');
    if (!select) return;

    select.innerHTML = `<option value="">-- Pilih Tugas untuk Dikerjakan --</option>`;
    state.tasks.filter(t => t.status !== 'done').forEach(t => {
        const opt = document.createElement('option');
        opt.value = t.id;
        opt.textContent = `[${t.priority.toUpperCase()}] ${t.title}`;
        if (t.id === state.timer.linkedTaskId) opt.selected = true;
        select.appendChild(opt);
    });
}

// ANALYTICS CONTROLLER
function renderAnalytics() {
    const barsContainer = document.getElementById('status-distribution-bars');
    if (!barsContainer) return;
    barsContainer.innerHTML = '';

    const statuses = [
        { key: 'todo', label: 'To Do', color: 'var(--status-todo)' },
        { key: 'in-progress', label: 'In Progress', color: 'var(--status-in-progress)' },
        { key: 'review', label: 'Review', color: 'var(--status-review)' },
        { key: 'done', label: 'Done', color: 'var(--status-done)' }
    ];

    const total = state.tasks.length || 1;

    statuses.forEach(s => {
        const count = state.tasks.filter(t => t.status === s.key).length;
        const pct = Math.round((count / total) * 100);

        const group = document.createElement('div');
        group.className = 'chart-bar-group';
        group.innerHTML = `
            <div class="bar-info">
                <span>${s.label} (${count})</span>
                <span>${pct}%</span>
            </div>
            <div class="bar-track">
                <div class="bar-fill" style="width: ${pct}%; background: ${s.color};"></div>
            </div>
        `;
        barsContainer.appendChild(group);
    });

    const logContainer = document.getElementById('focus-history-log');
    if (!logContainer) return;
    logContainer.innerHTML = '';

    if (state.focusLogs.length === 0) {
        logContainer.innerHTML = `<p style="font-size: 12px; color: var(--text-dim); text-align: center;">Belum ada sesi fokus tercatat.</p>`;
        return;
    }

    [...state.focusLogs].reverse().forEach(log => {
        const item = document.createElement('div');
        item.className = 'log-item';
        item.innerHTML = `
            <div>
                <strong>${escapeHtml(log.taskTitle || 'Sesi Fokus')}</strong>
                <div style="font-size: 11px; color: var(--text-dim);">${log.date}</div>
            </div>
            <span style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-cyan);">${log.minutes} Min</span>
        `;
        logContainer.appendChild(item);
    });
}

// TASK & TIMEBLOCK MODAL CONTROLLER
function initModalEvents() {
    const taskModal = document.getElementById('task-modal');
    const timeblockModal = document.getElementById('timeblock-modal');
    const openTaskBtn = document.getElementById('btn-open-task-modal');
    const openTimeblockBtn = document.getElementById('btn-add-timeblock');
    const closeTaskBtn = document.getElementById('btn-close-task-modal');
    const cancelTaskBtn = document.getElementById('btn-cancel-task');
    const closeTbBtn = document.getElementById('btn-close-timeblock-modal');
    const cancelTbBtn = document.getElementById('btn-cancel-timeblock');

    openTaskBtn.addEventListener('click', () => openAddTaskModal('todo'));
    openTimeblockBtn.addEventListener('click', openAddTimeblockModal);
    
    closeTaskBtn.addEventListener('click', () => taskModal.classList.remove('active'));
    cancelTaskBtn.addEventListener('click', () => taskModal.classList.remove('active'));

    closeTbBtn.addEventListener('click', () => timeblockModal.classList.remove('active'));
    cancelTbBtn.addEventListener('click', () => timeblockModal.classList.remove('active'));

    // Task Form Submit
    document.getElementById('task-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('task-id').value;
        const title = document.getElementById('task-title').value.trim();
        const desc = document.getElementById('task-desc').value.trim();
        const status = document.getElementById('task-status').value;
        const priority = document.getElementById('task-priority').value;
        const category = document.getElementById('task-category').value;
        const estTime = parseInt(document.getElementById('task-est-time').value) || 30;

        if (!title) return;

        if (id) {
            const task = state.tasks.find(t => t.id === id);
            if (task) {
                task.title = title;
                task.desc = desc;
                task.status = status;
                task.priority = priority;
                task.category = category;
                task.estTime = estTime;
            }
        } else {
            const newTask = {
                id: 'task-' + Date.now(),
                title, desc, status, priority, category, estTime,
                createdAt: new Date().toISOString()
            };
            state.tasks.push(newTask);
        }

        state.save();
        renderAll();
        taskModal.classList.remove('active');
        showNotification(id ? 'Tugas berhasil diperbarui!' : 'Tugas baru berhasil ditambahkan!');
    });

    // Timeblock Form Submit (Custom Start Time & End Time)
    document.getElementById('timeblock-form').addEventListener('submit', (e) => {
        e.preventDefault();
        const id = document.getElementById('tb-id').value;
        const title = document.getElementById('tb-title').value.trim();
        const startTime = document.getElementById('tb-start-time').value;
        const endTime = document.getElementById('tb-end-time').value;
        const color = document.getElementById('tb-color').value;

        if (!title || !startTime || !endTime) return;

        if (id) {
            const block = state.schedule.find(s => s.id === id);
            if (block) {
                block.title = title;
                block.startTime = startTime;
                block.endTime = endTime;
                block.color = color;
            }
        } else {
            const newBlock = {
                id: 'tb-' + Date.now(),
                title,
                startTime,
                endTime,
                color
            };
            state.schedule.push(newBlock);
        }

        state.save();
        renderAll();
        timeblockModal.classList.remove('active');
        showNotification(id ? 'Jadwal berhasil diperbarui!' : 'Jadwal baru berhasil ditambahkan!');
    });
}

function openAddTaskModal(defaultStatus = 'todo') {
    document.getElementById('task-form').reset();
    document.getElementById('task-id').value = '';
    document.getElementById('task-status').value = defaultStatus;
    document.getElementById('task-modal-title').textContent = 'Tambah Tugas Baru';
    document.getElementById('task-modal').classList.add('active');
}

function editTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (!task) return;

    document.getElementById('task-id').value = task.id;
    document.getElementById('task-title').value = task.title;
    document.getElementById('task-desc').value = task.desc || '';
    document.getElementById('task-status').value = task.status;
    document.getElementById('task-priority').value = task.priority;
    document.getElementById('task-category').value = task.category;
    document.getElementById('task-est-time').value = task.estTime;

    document.getElementById('task-modal-title').textContent = 'Edit Tugas';
    document.getElementById('task-modal').classList.add('active');
}

function deleteTask(taskId) {
    if (confirm('Apakah Anda yakin ingin menghapus tugas ini?')) {
        state.tasks = state.tasks.filter(t => t.id !== taskId);
        if (state.timer.linkedTaskId === taskId) {
            state.timer.linkedTaskId = '';
            document.getElementById('timer-linked-task').textContent = 'Tidak ada tugas terpilih';
        }
        state.save();
        renderAll();
        showNotification('Tugas berhasil dihapus.');
    }
}

function quickCompleteTask(taskId) {
    const task = state.tasks.find(t => t.id === taskId);
    if (task) {
        task.status = 'done';
        state.save();
        renderAll();
        showNotification('🎉 Tugas ditandai Selesai!');
    }
}

// GLOBAL SEARCH
function initGlobalSearch() {
    document.getElementById('global-search').addEventListener('input', () => {
        renderKanban();
    });
}

// SLEEK TOP-CENTER DESKTOP BUBBLE NOTIFICATION
function showNotification(msg) {
    const existing = document.querySelectorAll('.toast-notification');
    existing.forEach(el => el.remove());

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.innerHTML = `
        <i class="fa-solid fa-bell" style="color: var(--accent-cyan); font-size: 16px;"></i>
        <span>${escapeHtml(msg)}</span>
    `;

    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -20px) scale(0.95)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
