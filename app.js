/* ==========================================================================
   ATUR.IN - Asisten Produktivitas & Manajemen Harian
   JavaScript Application Engine
   ========================================================================== */

// Default Seed Data for New Users
const INITIAL_TASKS = [
    {
        id: 'task-1',
        title: 'Menyusun Laporan Kinerja Mingguan',
        desc: 'Rekapitulasi pencapaian KPI dan evaluasi kendala operasional minggu ini.',
        status: 'in-progress',
        priority: 'high',
        category: 'Work',
        estTime: 45,
        createdAt: new Date().toISOString()
    },
    {
        id: 'task-2',
        title: 'Review Proposal Project Web Client',
        desc: 'Periksa spesifikasi teknis dan estimasi budget proyek perancangan website.',
        status: 'todo',
        priority: 'high',
        category: 'Project',
        estTime: 30,
        createdAt: new Date().toISOString()
    },
    {
        id: 'task-3',
        title: 'Meeting Koordinasi Tim Desain',
        desc: 'Sinkronisasi UI/UX komponen aplikasi produktivitas versi terbaru.',
        status: 'review',
        priority: 'medium',
        category: 'Work',
        estTime: 60,
        createdAt: new Date().toISOString()
    },
    {
        id: 'task-4',
        title: 'Olahraga & Stretching Sore',
        desc: 'Jogging ringan 20 menit untuk menjaga kebugaran tubuh.',
        status: 'done',
        priority: 'low',
        category: 'Personal',
        estTime: 20,
        createdAt: new Date().toISOString()
    }
];

const INITIAL_SCHEDULE = [
    { id: 'tb-1', startTime: '08:00', endTime: '08:30', title: 'Morning Coffee & Review To-Do List', color: 'amber' },
    { id: 'tb-2', startTime: '09:00', endTime: '11:30', title: 'Deep Work Sesi 1: Coding & Task Execution', color: 'indigo' },
    { id: 'tb-3', startTime: '11:30', endTime: '12:30', title: 'Meeting Koordinasi Tim', color: 'blue' },
    { id: 'tb-4', startTime: '12:30', endTime: '13:30', title: 'Istirahat & Makan Siang', color: 'emerald' },
    { id: 'tb-5', startTime: '14:00', endTime: '16:30', title: 'Deep Work Sesi 2: Review Proposal', color: 'rose' }
];

// App State Manager
class AppState {
    constructor() {
        this.tasks = JSON.parse(localStorage.getItem('fp_tasks')) || INITIAL_TASKS;
        
        // Migrate or load schedule
        const rawSchedule = JSON.parse(localStorage.getItem('fp_schedule'));
        this.schedule = this.migrateSchedule(rawSchedule);
        
        this.focusLogs = JSON.parse(localStorage.getItem('fp_focus_logs')) || [
            { date: new Date().toLocaleDateString('id-ID'), minutes: 25, taskTitle: 'Menyusun Laporan Kinerja Mingguan' }
        ];
        this.streakDays = parseInt(localStorage.getItem('fp_streak')) || 3;

        // Timer State
        this.timer = {
            mode: 'focus', // 'focus', 'shortBreak', 'longBreak'
            duration: 25 * 60, // in seconds
            remaining: 25 * 60,
            isRunning: false,
            intervalId: null,
            linkedTaskId: ''
        };
    }

    migrateSchedule(rawSchedule) {
        if (!rawSchedule || !Array.isArray(rawSchedule) || rawSchedule.length === 0) {
            return INITIAL_SCHEDULE;
        }

        return rawSchedule.map((item, idx) => {
            if (item.startTime && item.endTime) return item;
            
            // Legacy migration from { hour, title }
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
    }

    resetToDemo() {
        this.tasks = [...INITIAL_TASKS];
        this.schedule = [...INITIAL_SCHEDULE];
        this.focusLogs = [
            { date: new Date().toLocaleDateString('id-ID'), minutes: 25, taskTitle: 'Menyusun Laporan Kinerja Mingguan' }
        ];
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
    renderAll();

    document.getElementById('btn-seed-data').addEventListener('click', () => {
        if (confirm('Apakah Anda ingin memuat ulang data contoh? Data yang ada akan diperbarui.')) {
            state.resetToDemo();
            renderAll();
            showNotification('Data contoh berhasil dimuat!');
        }
    });
});

// Live Clock & Greeting
function initClock() {
    function updateClock() {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('id-ID', { hour12: false });
        const dateStr = now.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });

        document.getElementById('current-time').textContent = timeStr;
        document.getElementById('current-date').textContent = dateStr;

        const hour = now.getHours();
        let greeting = 'Selamat Datang di ATUR.IN! 👋';
        if (hour >= 4 && hour < 11) greeting = 'Selamat Pagi! 🌅';
        else if (hour >= 11 && hour < 15) greeting = 'Selamat Siang! ☀️';
        else if (hour >= 15 && hour < 18) greeting = 'Selamat Sore! ☕';
        else greeting = 'Selamat Malam! 🌙';

        const greetingElem = document.getElementById('greeting-title');
        if (greetingElem) greetingElem.textContent = greeting;
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

    if (tabId === 'schedule') renderScheduleTimeline();
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
        container.innerHTML = `<p style="font-size: 13px; color: var(--text-dim); text-align: center; padding: 20px;">Belum ada tugas prioritas aktif. Tambahkan tugas baru!</p>`;
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

// DAILY SCHEDULE TIMELINE & DURATION COMPUTATION
function calculateDurationText(startTime, endTime) {
    const [startH, startM] = startTime.split(':').map(Number);
    const [endH, endM] = endTime.split(':').map(Number);

    const startTotal = startH * 60 + startM;
    const endTotal = endH * 60 + endM;

    let diff = endTotal - startTotal;
    if (diff <= 0) diff += 24 * 60; // crossover midnight fallback

    const hours = Math.floor(diff / 60);
    const mins = diff % 60;

    if (hours > 0 && mins > 0) return `${hours} jam ${mins}m`;
    if (hours > 0) return `${hours} jam`;
    return `${mins}m`;
}

function renderScheduleTimeline() {
    const container = document.getElementById('timeline-slots');
    if (!container) return;
    container.innerHTML = '';

    const sortedSchedule = [...state.schedule].sort((a, b) => a.startTime.localeCompare(b.startTime));

    if (sortedSchedule.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                <i class="fa-solid fa-calendar-xmark" style="font-size: 32px; color: var(--text-dim); margin-bottom: 12px;"></i>
                <p>Belum ada blok waktu aktivitas harian. Klik tombol <strong>+ Tambah Blok Waktu</strong> di atas!</p>
            </div>
        `;
        return;
    }

    sortedSchedule.forEach(item => {
        const card = document.createElement('div');
        const colorClass = item.color || 'indigo';
        card.className = `timeblock-card ${colorClass}`;

        const durationStr = calculateDurationText(item.startTime, item.endTime);

        card.innerHTML = `
            <div class="tb-time-range">
                <span class="tb-time-text">${item.startTime} - ${item.endTime}</span>
                <span class="tb-duration-badge"><i class="fa-regular fa-clock"></i> ${durationStr}</span>
            </div>
            <div class="tb-content">
                <span class="tb-title">${escapeHtml(item.title)}</span>
                <div class="tb-actions">
                    <button class="card-action-btn" onclick="editTimeblock('${item.id}')" title="Edit Jam/Aktivitas">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="card-action-btn delete" onclick="deleteTimeblock('${item.id}')" title="Hapus Blok">
                        <i class="fa-solid fa-trash-can"></i>
                    </button>
                </div>
            </div>
        `;

        container.appendChild(card);
    });
}

function openAddTimeblockModal() {
    document.getElementById('timeblock-form').reset();
    document.getElementById('tb-id').value = '';
    document.getElementById('tb-start-time').value = '09:00';
    document.getElementById('tb-end-time').value = '10:30';
    document.getElementById('timeblock-modal-title').textContent = 'Tambah Blok Waktu Jadwal';
    document.getElementById('timeblock-modal').classList.add('active');
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

// FOCUS POMODORO TIMER ENGINE
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
    });
}

function setTimerMode(mode) {
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
        startTimer();
    }
}

function startTimer() {
    state.timer.isRunning = true;
    updateTimerUI();

    document.getElementById('timer-active-dot').classList.remove('hidden');

    state.timer.intervalId = setInterval(() => {
        if (state.timer.remaining > 0) {
            state.timer.remaining--;
            updateTimerUI();
        } else {
            onTimerComplete();
        }
    }, 1000);
}

function pauseTimer() {
    state.timer.isRunning = false;
    clearInterval(state.timer.intervalId);
    updateTimerUI();
    document.getElementById('timer-active-dot').classList.add('hidden');
}

function resetTimer() {
    pauseTimer();
    state.timer.remaining = state.timer.duration;
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
    startTimer();
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
            <span style="font-family: 'JetBrains Mono'; font-weight: 700; color: var(--accent-cyan);">${log.minutes} Min</span>
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
            // Edit existing timeblock
            const block = state.schedule.find(s => s.id === id);
            if (block) {
                block.title = title;
                block.startTime = startTime;
                block.endTime = endTime;
                block.color = color;
            }
        } else {
            // Create new timeblock
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
        showNotification(id ? 'Blok waktu berhasil diperbarui!' : 'Blok waktu baru berhasil ditambahkan!');
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

// TOAST NOTIFICATIONS
function showNotification(msg) {
    const existing = document.querySelector('.toast-notification');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notification';
    toast.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
        color: #fff;
        padding: 12px 20px;
        border-radius: var(--radius-sm);
        font-size: 13px;
        font-weight: 700;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        z-index: 200;
        animation: slideUp 0.3s ease;
    `;
    toast.textContent = msg;
    document.body.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

function escapeHtml(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
