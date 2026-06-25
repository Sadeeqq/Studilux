// State
let subjects = [];
let lastScheduleData = null;

// Helper to persist subjects
function saveSubjects() {
    localStorage.setItem('studilux_subjects', JSON.stringify(subjects));
}
function loadSubjects() {
    const saved = localStorage.getItem('studilux_subjects');
    return saved ? JSON.parse(saved) : [];
}

let blockedSlots = new Set();
let peakHours = new Set([16, 17]);
let currentMinHour = 0;
let currentMaxHour = 23;
let currentDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// DOM Elements
const subjectForm = document.getElementById('subjectForm');
const subjectsList = document.getElementById('subjectsList');
const generateBtn = document.getElementById('generateBtn');
const exportPdfBtn = document.getElementById('exportPdfBtn');
const errorBanner = document.getElementById('errorBanner');
const errorMsg = document.getElementById('errorMsg');
const loadingOverlay = document.getElementById('loadingOverlay');

const timeColumn = document.getElementById('timeColumn');
const daysContainer = document.getElementById('daysContainer');
const calendarContainer = document.getElementById('calendarContainer');
const exportArea = document.getElementById('exportArea');
const peakHoursContainer = document.getElementById('peakHoursContainer');

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// ── Mobile detection helper ───────────────────────────────────────────────────
// Used to adjust row heights and disable desktop-only drag behaviour on touch.
function isMobile() {
    return window.innerWidth <= 767;
}

function loadState() {
    subjects = loadSubjects();
    lastScheduleData = null;
    blockedSlots = new Set();
    peakHours = new Set([16, 17]);

    document.getElementById('freeStart').addEventListener('change', renderPeakHoursSelector);
    document.getElementById('freeEnd').addEventListener('change', renderPeakHoursSelector);

    initGrid();
    renderSubjects();
    renderPeakHoursSelector();
}

function renderPeakHoursSelector() {
    if (!peakHoursContainer) return;
    peakHoursContainer.innerHTML = '';

    const start = parseInt(document.getElementById('freeStart').value) || 0;
    const end = parseInt(document.getElementById('freeEnd').value) || 24;

    for (let h = start; h < end; h++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        const isPeak = peakHours.has(h);

        btn.className = isPeak
            ? 'peak-btn peak-btn-active py-2 px-1 rounded-xl shadow-sm transition duration-200 focus:outline-none flex items-center justify-center'
            : 'peak-btn peak-btn-inactive py-2 px-1 rounded-xl transition duration-200 focus:outline-none flex items-center justify-center';

        btn.innerHTML = `<i class="fa-solid fa-bolt text-[0.65rem] ${isPeak ? 'peak-icon-active' : 'peak-icon-inactive'} mr-1"></i> ${h.toString().padStart(2, '0')}:00`;

        btn.addEventListener('click', () => {
            if (peakHours.has(h)) { peakHours.delete(h); } else { peakHours.add(h); }
            renderPeakHoursSelector();
        });
        peakHoursContainer.appendChild(btn);
    }
}

// ── Calendar height helper ────────────────────────────────────────────────────
function setCalendarHeight(numHours) {
    const rowPx = isMobile() ? 44 : 60;
    const minPx = isMobile() ? 260 : 300;
    calendarContainer.style.height = `max(${minPx}px, calc(${numHours} * ${rowPx}px))`;
}

function initGrid(minHour = 0, maxHour = 23, usedDays = DAYS) {
    currentMinHour = minHour;
    currentMaxHour = maxHour;
    currentDays = usedDays;

    const numHours = maxHour - minHour + 1;
    document.documentElement.style.setProperty('--num-hours', numHours);

    setCalendarHeight(numHours);

    // ── Time Column ──────────────────────────────────────────────────────────
    timeColumn.innerHTML = '';
    const timeSpacer = document.createElement('div');
    timeSpacer.className = 'h-[45px] w-full shrink-0 border-b border-glassborder dm-day-header backdrop-blur-xl z-30';
    timeColumn.appendChild(timeSpacer);

    const timeGridBody = document.createElement('div');
    timeGridBody.className = 'flex-1 w-full flex flex-col relative';
    for (let i = minHour; i <= maxHour; i++) {
        const timeDiv = document.createElement('div');
        timeDiv.className = 'time-slot flex justify-end pr-3 py-2.5 relative w-full';
        timeDiv.innerHTML = `<span class="text-xs text-slate-500 font-bold tracking-widest">${i.toString().padStart(2, '0')}:00</span>`;
        timeGridBody.appendChild(timeDiv);
    }
    timeColumn.appendChild(timeGridBody);

    // ── Day Columns ──────────────────────────────────────────────────────────
    daysContainer.innerHTML = '';
    usedDays.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-column flex-1 flex flex-col relative';
        dayDiv.id = `col-${day}`;

        const header = document.createElement('div');
        header.className = 'w-full text-center py-3.5 dm-day-header backdrop-blur-xl border-b border-glassborder z-30 font-bold tracking-widest dm-day-header-text text-xs uppercase shadow-sm h-[45px] flex items-center justify-center shrink-0 cursor-default';
        header.innerText = day;
        dayDiv.appendChild(header);

        const gridBody = document.createElement('div');
        gridBody.className = 'flex-1 relative w-full';
        gridBody.id = `gridbody-${day}`;

        for (let i = minHour; i <= maxHour; i++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot w-full transition-all duration-200 cursor-pointer hover:bg-slate-200/20';

            const slotKey = `${day}-${i}`;
            if (blockedSlots.has(slotKey)) {
                slot.classList.add('blocked-slot');
                slot.innerHTML = `
                    <div class="h-full flex items-center justify-center text-[0.55rem] text-slate-500/80 font-bold uppercase tracking-wider select-none pointer-events-none">
                        <i class="fa-solid fa-ban mr-1 text-[0.6rem] text-slate-400"></i> Blocked
                    </div>`;
            }

            slot.addEventListener('click', (e) => {
                if (e.target.closest('.schedule-block')) return;
                if (blockedSlots.has(slotKey)) { blockedSlots.delete(slotKey); } else { blockedSlots.add(slotKey); }
                if (lastScheduleData) { renderSchedule(lastScheduleData); } else { initGrid(currentMinHour, currentMaxHour, currentDays); }
            });

            if (!isMobile()) {
                slot.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    if (!blockedSlots.has(slotKey)) { slot.classList.add('bg-brand-400/20'); }
                });
                slot.addEventListener('dragleave', () => {
                    slot.classList.remove('bg-brand-400/20');
                });
                slot.addEventListener('drop', (e) => {
                    e.preventDefault();
                    slot.classList.remove('bg-brand-400/20');
                    if (blockedSlots.has(slotKey)) return;
                    const dataStr = e.dataTransfer.getData('text/plain');
                    if (!dataStr) return;
                    const data = JSON.parse(dataStr);
                    handleDrop(data.day, data.hour, day, i);
                });
            }

            gridBody.appendChild(slot);
        }

        dayDiv.appendChild(gridBody);
        daysContainer.appendChild(dayDiv);
    });
}

function handleDrop(oldDay, oldHour, newDay, newHour) {
    if (!lastScheduleData || !lastScheduleData[oldDay]) return;

    const eventIndex = lastScheduleData[oldDay].findIndex(e => e.hour === oldHour);
    if (eventIndex !== -1) {
        const evt = lastScheduleData[oldDay].splice(eventIndex, 1)[0];
        evt.hour = newHour;

        if (!lastScheduleData[newDay]) { lastScheduleData[newDay] = []; }

        const collisionIdx = lastScheduleData[newDay].findIndex(e => e.hour === newHour);
        if (collisionIdx !== -1) {
            const bumped = lastScheduleData[newDay].splice(collisionIdx, 1)[0];
            bumped.hour = oldHour;
            lastScheduleData[oldDay].push(bumped);
        }

        lastScheduleData[newDay].push(evt);
        renderSchedule(lastScheduleData);
    }
}

function renderSubjects() {
    subjectsList.innerHTML = '';
    subjects.forEach((subj, idx) => {
        const el = document.createElement('div');
        el.className = 'bg-white/60 backdrop-blur-xl p-4 rounded-2xl border border-glassborder shadow-sm flex justify-between items-center fade-in hover:bg-white/80 transition duration-300 group cursor-default';
        el.innerHTML = `
            <div>
                <p class="font-bold text-darkblue text-sm tracking-wide">${subj.name}</p>
                <div class="mt-2 flex items-center space-x-3">
                    <span class="text-[0.6rem] py-1 px-3 rounded-full diff-${subj.difficulty} uppercase font-bold tracking-widest shadow-sm">Level ${subj.difficulty}</span>
                    <span class="text-xs text-slate-500 font-bold tracking-wide"><i class="fa-regular fa-clock mr-1 text-brand-500"></i> ${subj.hours} hrs</span>
                </div>
            </div>
            <button onclick="removeSubject(${idx})" class="text-slate-400 hover:text-rose-500 bg-black/5 w-8 h-8 rounded-full flex items-center justify-center transition-all transform hover:scale-110 hover:bg-black/10 opacity-0 group-hover:opacity-100"><i class="fa-solid fa-xmark"></i></button>
        `;
        subjectsList.appendChild(el);
    });
}

function removeSubject(idx) {
    subjects.splice(idx, 1);
    renderSubjects();
    saveSubjects();
}
window.removeSubject = removeSubject;

function showError(msg) {
    errorMsg.innerText = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => { errorBanner.classList.add('hidden'); }, 5000);
}

// ── Event Listeners ───────────────────────────────────────────────────────────
// ── Subject name: allow only letters, numbers and spaces ─────────────────────
document.getElementById('subjName').addEventListener('input', function () {
    const clean = this.value.replace(/[^a-zA-Z0-9 ]/g, '');
    if (this.value !== clean) this.value = clean;
    updateAddBtn();
});

subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name       = document.getElementById('subjName').value.trim();
    const difficulty = parseInt(document.getElementById('subjDiff').value);
    const hours      = parseInt(document.getElementById('subjHours').value);

    if (!name) return;

    // Duplicate check — case-insensitive
    const isDuplicate = subjects.some(s => s.name.toLowerCase() === name.toLowerCase());
    if (isDuplicate) {
        showError(`"${name}" has already been added.`);
        return;
    }

    subjects.push({ name, difficulty, hours });
    renderSubjects();
    saveSubjects();
    subjectForm.reset();
    updateAddBtn();
    document.getElementById('subjName').focus();
});

// ── Add Subject button: disabled until name field has content ─────────────────
const addSubjectBtn = document.getElementById('addSubjectBtn');

function updateAddBtn() {
    const hasName = document.getElementById('subjName').value.trim().length > 0;
    if (hasName) {
        addSubjectBtn.disabled = false;
        addSubjectBtn.classList.remove('add-btn-inactive');
        addSubjectBtn.classList.add('add-btn-active');
    } else {
        addSubjectBtn.disabled = true;
        addSubjectBtn.classList.remove('add-btn-active');
        addSubjectBtn.classList.add('add-btn-inactive');
    }
}

updateAddBtn(); // set correct state on page load

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT SYSTEM — Clean Vector PDF Implementation
// ══════════════════════════════════════════════════════════════════════════════

function savePdf(pdf, filename) {
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    if (isIOS) {
        const blob    = pdf.output('blob');
        const blobUrl = URL.createObjectURL(blob);
        window.open(blobUrl, '_blank');
        setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
    } else {
        pdf.save(filename);
    }
}

// Directly execute Vector PDF conversion on click
exportPdfBtn.addEventListener('click', () => {
    if (!lastScheduleData || !subjects.length) {
        showError("Generate a timetable first before exporting!");
        return;
    }

    // ── Theme palette lookup ─────────────────────────────────────────────────
    // Each theme defines: bg (page), gridBg (cell area), headerBg, headerText,
    // titleText, timeText, gridLine, footerText, and per-diff block colours.
    const theme = document.documentElement.getAttribute('data-theme') || 'light';

    const THEME_PALETTES = {
        light: {
            bg:         [240, 244, 248],
            gridBg:     [255, 255, 255],
            headerBg:   [255, 255, 255],
            headerBdr:  [220, 230, 245],
            headerText: [30,  58,  138],
            titleText:  [30,  58,  138],
            timeText:   [100, 116, 139],
            gridLine:   [210, 220, 235],
            footerText: [148, 163, 184],
            diff: {
                1: { bg: [219,234,254], border: [56, 189,248], text: [12, 74,110]  },
                2: { bg: [186,230,253], border: [14, 165,233], text: [12, 74,110]  },
                3: { bg: [147,197,253], border: [2,  132,199], text: [240,249,255] },
                4: { bg: [165,180,252], border: [30,  58,138], text: [240,249,255] },
                5: { bg: [254,202,202], border: [239, 68, 68], text: [239, 68, 68] },
            },
        },
        dark: {
            bg:         [20,  20,  24 ],
            gridBg:     [28,  28,  34 ],
            headerBg:   [34,  34,  42 ],
            headerBdr:  [255,255,255, 0.07],
            headerText: [200, 210, 240],
            titleText:  [200, 214, 240],
            timeText:   [74,  96, 112 ],
            gridLine:   [50,  55,  65 ],
            footerText: [70,  85, 100 ],
            diff: {
                1: { bg: [20, 80,120], border: [56,189,248], text: [144,200,224] },
                2: { bg: [10, 70,110], border: [14,165,233], text: [128,184,216] },
                3: { bg: [5,  55, 95], border: [2, 132,199], text: [184,218,240] },
                4: { bg: [15, 30, 80], border: [30, 58,138], text: [144,170,208] },
                5: { bg: [90, 15, 15], border: [239,68, 68], text: [224,112,112] },
            },
        },
        cafe: {
            bg:         [245, 239, 230],
            gridBg:     [255, 248, 238],
            headerBg:   [240, 228, 210],
            headerBdr:  [180, 140, 100],
            headerText: [90,  51,  24 ],
            titleText:  [59,  31,  10 ],
            timeText:   [138, 104,  72],
            gridLine:   [200, 165, 130],
            footerText: [184, 152, 120],
            diff: {
                1: { bg: [230,205,170], border: [196,120, 48], text: [59, 31, 10] },
                2: { bg: [220,188,148], border: [168, 90, 32], text: [59, 31, 10] },
                3: { bg: [205,168,120], border: [138, 64, 16], text: [255,248,238] },
                4: { bg: [185,140, 90], border: [106, 40,  8], text: [255,240,220] },
                5: { bg: [220,140,120], border: [180, 60, 30], text: [140, 30, 10] },
            },
        },
        neon: {
            bg:         [26,  10,  46 ],
            gridBg:     [38,  14,  62 ],
            headerBg:   [48,  16,  72 ],
            headerBdr:  [200, 80, 255 ],
            headerText: [240, 168, 255],
            titleText:  [240, 168, 255],
            timeText:   [128,  64, 184],
            gridLine:   [80,  30, 120 ],
            footerText: [100,  48, 160],
            diff: {
                1: { bg: [100, 30,160], border: [192, 80,255], text: [240,168,255] },
                2: { bg: [120, 20,180], border: [208, 60,255], text: [248,176,255] },
                3: { bg: [140, 10,200], border: [224, 40,255], text: [255,208,255] },
                4: { bg: [160,  0,200], border: [240,  0,255], text: [255,224,255] },
                5: { bg: [200,  0,100], border: [255, 20,120], text: [255,128,184] },
            },
        },
        aqua: {
            bg:         [13,  43,  38 ],
            gridBg:     [16,  48,  40 ],
            headerBg:   [20,  58,  48 ],
            headerBdr:  [52, 211, 153 ],
            headerText: [110, 231, 183],
            titleText:  [110, 231, 183],
            timeText:   [42,  128,  96],
            gridLine:   [28,  90,  66 ],
            footerText: [40,  110,  80],
            diff: {
                1: { bg: [20,100, 72], border: [52,211,153], text: [110,231,183] },
                2: { bg: [16,118, 82], border: [40,190,130], text: [134,239,202] },
                3: { bg: [10,130, 88], border: [30,170,110], text: [167,243,208] },
                4: { bg: [6, 100, 68], border: [20,150, 95], text: [200,248,228] },
                5: { bg: [180, 60,40], border: [220, 80,50], text: [252,160,138] },
            },
        },
    };

    const P = THEME_PALETTES[theme] || THEME_PALETTES.light;

    const { jsPDF } = window.jspdf;

    // ── Orientation: portrait for ≤4 days (taller blocks), landscape for 5–7 ──
    const activeDays = DAYS.filter(d => lastScheduleData[d]?.length > 0);
    if (!activeDays.length) { showError("No sessions to export."); return; }

    const orientation = activeDays.length <= 4 ? 'p' : 'l';
    const pdf  = new jsPDF(orientation, 'mm', 'a4');
    const PW   = pdf.internal.pageSize.getWidth();
    const PH   = pdf.internal.pageSize.getHeight();
    const MARGIN      = 16;
    const TIME_COL_W  = 20;   // wider → more room for HH:00 labels
    const HEADER_H    = 14;   // taller day-name pills

    let minH = 24, maxH = 0;
    activeDays.forEach(d => lastScheduleData[d].forEach(e => {
        if (e.hour < minH) minH = e.hour;
        if (e.hour > maxH) maxH = e.hour;
    }));
    const numHours = maxH - minH + 1;

    const usableW  = PW - MARGIN * 2 - TIME_COL_W;
    const DAY_COL_W = usableW / activeDays.length;
    const usableH  = PH - MARGIN * 2 - HEADER_H - 8; // 8mm title area
    const ROW_H    = usableH / numHours;
    const gridTop  = MARGIN + HEADER_H + 8;
    const gridLeft = MARGIN + TIME_COL_W;

    // Background
    pdf.setFillColor(...P.bg);
    pdf.rect(0, 0, PW, PH, 'F');

    // Grid cell background
    pdf.setFillColor(...P.gridBg);
    pdf.roundedRect(gridLeft, gridTop, usableW, usableH, 2, 2, 'F');

    // Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(18);
    pdf.setTextColor(...P.titleText);
    pdf.text('Studilux Reading Timetable', PW / 2, MARGIN + 4, { align: 'center' });

    // Day headers
    pdf.setFontSize(10);
    pdf.setFont('helvetica', 'bold');
    activeDays.forEach((day, i) => {
        const x = gridLeft + i * DAY_COL_W;
        pdf.setFillColor(...P.headerBg);
        pdf.setDrawColor(...P.headerBdr);
        pdf.roundedRect(x + 1, MARGIN + 8, DAY_COL_W - 2, HEADER_H - 1, 2, 2, 'FD');
        pdf.setTextColor(...P.headerText);
        pdf.text(day.substring(0, 3).toUpperCase(), x + DAY_COL_W / 2, MARGIN + 8 + 9, { align: 'center' });
    });

    // Vertical column dividers
    pdf.setDrawColor(...P.gridLine);
    pdf.setLineWidth(0.2);
    activeDays.forEach((_, i) => {
        const x = gridLeft + i * DAY_COL_W;
        pdf.line(x, gridTop, x, gridTop + usableH);
    });
    pdf.line(gridLeft + usableW, gridTop, gridLeft + usableW, gridTop + usableH);

    // Time labels + horizontal hour lines
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(...P.timeText);
    for (let h = 0; h <= numHours; h++) {
        const y = gridTop + h * ROW_H;
        pdf.setDrawColor(...P.gridLine);
        pdf.setLineWidth(0.15);
        pdf.line(MARGIN + TIME_COL_W, y, MARGIN + TIME_COL_W + usableW, y);
        if (h < numHours) {
            const label = String(minH + h).padStart(2, '0') + ':00';
            pdf.text(label, MARGIN + TIME_COL_W - 1, y + ROW_H * 0.45 + 1, { align: 'right' });
        }
    }

    // Session blocks
    activeDays.forEach((day, colIdx) => {
        const events = lastScheduleData[day] || [];
        events.forEach(evt => {
            const subj   = subjects.find(s => s.name === evt.subject) || { difficulty: 1 };
            const diff   = Math.min(5, Math.max(1, subj.difficulty));
            const colors = P.diff[diff];
            const x      = gridLeft + colIdx * DAY_COL_W + 1.5;
            const y      = gridTop + (evt.hour - minH) * ROW_H + 1;
            const bw     = DAY_COL_W - 3;
            const bh     = ROW_H - 2;

            pdf.setFillColor(...colors.bg);
            pdf.setDrawColor(...colors.border);
            pdf.setLineWidth(0.4);
            pdf.roundedRect(x, y, bw, bh, 1.5, 1.5, 'FD');

            // Accent left bar
            pdf.setFillColor(...colors.border);
            pdf.rect(x, y, 1.5, bh, 'F');

            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(Math.min(9, bh > 8 ? 9 : bh * 0.65));
            pdf.setTextColor(...colors.text);
            const maxChars  = Math.floor(bw / 1.8);
            const nameLabel = evt.subject.length > maxChars
                ? evt.subject.substring(0, maxChars - 1) + '…'
                : evt.subject;
            pdf.text(nameLabel, x + 4, y + Math.min(bh * 0.42, 6));

            if (bh > 10) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(7);
                pdf.setTextColor(...colors.text);
                const timeLabel = String(evt.hour).padStart(2,'0') + ':00–' + String(evt.hour + 1).padStart(2,'0') + ':00';
                pdf.text(timeLabel, x + 4, y + bh * 0.72);
            }
        });
    });

    // Footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(7);
    pdf.setTextColor(...P.footerText);
    const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    pdf.text(`Generated by Studilux · ${now}`, PW / 2, PH - 4, { align: 'center' });

    savePdf(pdf, 'Studilux_Timetable.pdf');
});

generateBtn.addEventListener('click', async () => {
    if (subjects.length === 0) {
        showError("Please add at least one subject.");
        return;
    }

    loadingOverlay.classList.remove('hidden');

    try {
        const start = parseInt(document.getElementById('freeStart').value);
        const end   = parseInt(document.getElementById('freeEnd').value);
        if (start >= end) {
            showError("Start hour must be less than end hour.");
            loadingOverlay.classList.add('hidden');
            return;
        }

        const allowedDays = Array.from(document.querySelectorAll('#daysCheckboxes input:checked')).map(cb => cb.value);
        if (allowedDays.length === 0) {
            showError("Studilux requires at least one active study day.");
            loadingOverlay.classList.add('hidden');
            return;
        }

        const activePeakHours = Array.from(peakHours).filter(h => h >= start && h < end);

        const response = await fetch('https://personal-timetable.onrender.com/api/generate_schedule', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                subjects,
                free_time: { start, end },
                allowed_days: allowedDays,
                blocked_slots: Array.from(blockedSlots),
                peak_hours: activePeakHours
            })
        });

        const result = await response.json();

        if (result.success) {
            lastScheduleData = result.schedule;
            renderSchedule(result.schedule);
            saveToHistory(result.schedule);
        } else {
            showError(result.error || "Constraint resolution failed. Try adjusting rules.");
        }
    } catch (err) {
        showError("Failed to communicate with server.");
    } finally {
        loadingOverlay.classList.add('hidden');
    }
});

function renderSchedule(scheduleData) {
    document.querySelectorAll('.schedule-block').forEach(e => e.remove());

    let minHour = 24;
    let maxHour = -1;
    const usedDays = new Set();

    DAYS.forEach(day => {
        const events = scheduleData[day] || [];
        if (events.length > 0) {
            usedDays.add(day);
            events.forEach(evt => {
                if (evt.hour < minHour) minHour = evt.hour;
                if (evt.hour > maxHour) maxHour = evt.hour;
            });
        }
    });

    if (minHour > maxHour) { minHour = 0; maxHour = 23; }

    const daysToRender = [...DAYS];
    initGrid(minHour, maxHour, daysToRender);

    const numHours = maxHour - minHour + 1;
    const blockHeightPct = 100 / numHours;

    daysToRender.forEach(day => {
        const gridBody = document.getElementById(`gridbody-${day}`);
        if (!gridBody) return;
        const events = scheduleData[day] || [];

        events.forEach((evt, i) => {
            const subjConfig = subjects.find(s => s.name === evt.subject) || { difficulty: 1 };

            const block = document.createElement('div');
            block.className = isMobile()
                ? `schedule-block diff-${subjConfig.difficulty} fade-in`
                : `schedule-block diff-${subjConfig.difficulty} fade-in cursor-grab active:cursor-grabbing`;
            block.style.animationDelay = `${i * 0.05}s`;

            if (!isMobile()) {
                block.draggable = true;
                block.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', JSON.stringify({ day, hour: evt.hour }));
                    setTimeout(() => block.classList.add('opacity-30'), 0);
                });
                block.addEventListener('dragend', () => {
                    block.classList.remove('opacity-30');
                });
            }

            const positionIdx = evt.hour - minHour;
            block.style.top = `calc(${positionIdx} * ${blockHeightPct}% + 4px)`;
            block.style.height = `calc(${blockHeightPct}% - 8px)`;

            block.innerHTML = `
                <div class="h-full flex flex-col justify-center overflow-hidden pointer-events-none">
                    <span class="font-bold text-[0.7rem] uppercase tracking-[0.1em] block truncate mb-1">${evt.subject}</span>
                    <span class="text-[0.65rem] opacity-75 font-mono tracking-wider">${evt.hour.toString().padStart(2,'0')}:00 - ${(evt.hour+1).toString().padStart(2,'0')}:00</span>
                </div>
            `;

            gridBody.appendChild(block);
        });
    });
}

// ── Re-calculate calendar height on window resize ─────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const numHours = currentMaxHour - currentMinHour + 1;
        setCalendarHeight(numHours);
    }, 150);
}, { passive: true });

// ── Theme selector (Light / Dark / Cafe Brown / Neon Purple / Aqua Marine) ────
(function initTheme() {
    const html   = document.documentElement;
    const select = document.getElementById('themeSelect');
    const KEY    = 'studilux_theme';

    function applyTheme(theme) {
        html.setAttribute('data-theme', theme);
        if (select) select.value = theme;
        try { localStorage.setItem(KEY, theme); } catch (_) {}
    }

    const saved = (() => { try { return localStorage.getItem(KEY); } catch (_) { return null; } })();
    applyTheme(['light','dark','cafe','neon','aqua'].includes(saved) ? saved : 'light');

    if (select) {
        select.addEventListener('change', () => applyTheme(select.value));
    }
})();

// ── Initial setup ─────────────────────────────────────────────────────────────
loadState();

// ── Mobile sticky action bar ──────────────────────────────────────────────────
const exportPdfBtnMobile = document.getElementById('exportPdfBtnMobile');
const generateBtnMobile  = document.getElementById('generateBtnMobile');

if (exportPdfBtnMobile) {
    exportPdfBtnMobile.addEventListener('click', () => exportPdfBtn.click());
}
if (generateBtnMobile) {
    generateBtnMobile.addEventListener('click', () => generateBtn.click());
}

// ══════════════════════════════════════════════════════════════════════════════
// HISTORY SYSTEM
// Stores up to 15 timetable snapshots in localStorage.
// Each entry: { id, timestamp, subjects, schedule }
// ══════════════════════════════════════════════════════════════════════════════

const HISTORY_KEY = 'studilux_history';
const HISTORY_MAX = 15;

function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
    catch (_) { return []; }
}

function saveHistory(history) {
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)); } catch (_) {}
}

function saveToHistory(schedule) {
    const history = loadHistory();
    const entry = {
        id:        Date.now(),
        timestamp: new Date().toISOString(),
        subjects:  JSON.parse(JSON.stringify(subjects)),   // snapshot
        schedule:  JSON.parse(JSON.stringify(schedule)),
    };
    history.unshift(entry);                                // newest first
    if (history.length > HISTORY_MAX) history.splice(HISTORY_MAX);
    saveHistory(history);
}

function formatHistoryDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
        + ' · ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

function renderHistoryList() {
    const list    = document.getElementById('historyList');
    const history = loadHistory();

    if (!history.length) {
        list.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full py-16 text-center">
                <i class="fa-solid fa-clock-rotate-left text-3xl mb-4" style="color:var(--text-muted)"></i>
                <p class="text-sm font-bold" style="color:var(--text-secondary)">No history yet</p>
                <p class="text-xs mt-1" style="color:var(--text-muted)">Generated timetables will appear here</p>
            </div>`;
        return;
    }

    list.innerHTML = '';
    history.forEach((entry, idx) => {
        const totalSessions = Object.values(entry.schedule)
            .reduce((sum, arr) => sum + (arr?.length || 0), 0);
        const activeDays = Object.values(entry.schedule)
            .filter(arr => arr?.length > 0).length;
        const subjectNames = entry.subjects.map(s => s.name).join(', ');

        const card = document.createElement('div');
        card.className = 'history-card rounded-2xl border p-4 transition-all duration-200 cursor-default';
        card.style.cssText = 'background:var(--bg-card);border-color:var(--border-glass)';

        card.innerHTML = `
            <div class="flex items-start justify-between gap-2 mb-3">
                <div>
                    <p class="text-[0.6rem] font-bold uppercase tracking-widest mb-1" style="color:var(--text-muted)">
                        <i class="fa-solid fa-clock mr-1"></i>${formatHistoryDate(entry.timestamp)}
                    </p>
                    <p class="text-xs font-bold truncate max-w-[220px]" style="color:var(--text-primary)" title="${subjectNames}">
                        ${subjectNames || 'No subjects'}
                    </p>
                </div>
                <button class="history-delete shrink-0 w-7 h-7 rounded-full flex items-center justify-center transition hover:scale-110" 
                        style="background:var(--error-bg);color:var(--error-text)" data-id="${entry.id}" title="Delete">
                    <i class="fa-solid fa-trash-can text-[0.6rem] pointer-events-none"></i>
                </button>
            </div>
            <div class="flex items-center gap-3 mb-3">
                <span class="text-[0.6rem] font-bold px-2.5 py-1 rounded-full" style="background:var(--bg-input);color:var(--text-secondary)">
                    <i class="fa-solid fa-calendar-days mr-1"></i>${activeDays} day${activeDays !== 1 ? 's' : ''}
                </span>
                <span class="text-[0.6rem] font-bold px-2.5 py-1 rounded-full" style="background:var(--bg-input);color:var(--text-secondary)">
                    <i class="fa-solid fa-book-open mr-1"></i>${totalSessions} session${totalSessions !== 1 ? 's' : ''}
                </span>
                <span class="text-[0.6rem] font-bold px-2.5 py-1 rounded-full" style="background:var(--bg-input);color:var(--text-secondary)">
                    <i class="fa-solid fa-layer-group mr-1"></i>${entry.subjects.length} subject${entry.subjects.length !== 1 ? 's' : ''}
                </span>
            </div>
            <button class="history-restore w-full py-2 rounded-xl text-xs font-bold transition-all active:scale-95" 
                    style="background:var(--peak-active-bg);color:var(--peak-active-text);border:1px solid var(--peak-active-border)" 
                    data-idx="${idx}">
                <i class="fa-solid fa-rotate-left mr-1.5"></i>Restore This Timetable
            </button>
        `;
        list.appendChild(card);
    });

    // Restore handler
    list.querySelectorAll('.history-restore').forEach(btn => {
        btn.addEventListener('click', () => {
            const entry = loadHistory()[parseInt(btn.dataset.idx)];
            if (!entry) return;
            // Restore subjects + schedule
            subjects = entry.subjects;
            saveSubjects();
            renderSubjects();
            lastScheduleData = entry.schedule;
            renderSchedule(entry.schedule);
            closeHistoryDrawer();
        });
    });

    // Delete handler
    list.querySelectorAll('.history-delete').forEach(btn => {
        btn.addEventListener('click', () => {
            const history = loadHistory().filter(e => e.id !== parseInt(btn.dataset.id));
            saveHistory(history);
            renderHistoryList();
        });
    });
}

// ── Drawer open / close ───────────────────────────────────────────────────────
const historyDrawer  = document.getElementById('historyDrawer');
const historyOverlay = document.getElementById('historyOverlay');

function openHistoryDrawer() {
    renderHistoryList();
    historyDrawer.classList.remove('translate-x-full');
    historyOverlay.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function closeHistoryDrawer() {
    historyDrawer.classList.add('translate-x-full');
    historyOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

document.getElementById('historyBtn')?.addEventListener('click', openHistoryDrawer);
document.getElementById('historyClose')?.addEventListener('click', closeHistoryDrawer);
historyOverlay?.addEventListener('click', closeHistoryDrawer);

document.getElementById('historyClearAll')?.addEventListener('click', () => {
    saveHistory([]);
    renderHistoryList();
});

// Mobile history button
const historyBtnMobile = document.getElementById('historyBtnMobile');
if (historyBtnMobile) {
    historyBtnMobile.addEventListener('click', openHistoryDrawer);
}