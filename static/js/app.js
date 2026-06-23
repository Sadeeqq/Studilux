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
            ? 'py-2 px-1 rounded-xl bg-amber-500/15 border-2 border-amber-500 text-amber-700 shadow-sm transition duration-200 focus:outline-none flex items-center justify-center'
            : 'py-2 px-1 rounded-xl bg-white/40 border border-glassborder text-slate-500 hover:bg-white/60 hover:text-slate-700 transition duration-200 focus:outline-none flex items-center justify-center';

        btn.innerHTML = `<i class="fa-solid fa-bolt text-[0.65rem] ${isPeak ? 'text-amber-500' : 'text-slate-300'} mr-1"></i> ${h.toString().padStart(2, '0')}:00`;

        btn.addEventListener('click', () => {
            if (peakHours.has(h)) { peakHours.delete(h); } else { peakHours.add(h); }
            renderPeakHoursSelector();
        });
        peakHoursContainer.appendChild(btn);
    }
}

// ── Calendar height helper ────────────────────────────────────────────────────
// FIX: the original code always applied a fixed inline style using 60px/row.
// On mobile the CSS overrides this via !important, but we also set a sensible
// value directly so there is no flash of the wrong height on first render.
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

    // FIX: use the mobile-aware height helper instead of a hard-coded 60px.
    setCalendarHeight(numHours);

    // ── Time Column ──────────────────────────────────────────────────────────
    timeColumn.innerHTML = '';
    const timeSpacer = document.createElement('div');
    timeSpacer.className = 'h-[45px] w-full shrink-0 border-b border-glassborder bg-white/60 backdrop-blur-xl z-30';
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
        header.className = 'w-full text-center py-3.5 bg-white/60 backdrop-blur-xl border-b border-glassborder z-30 font-bold tracking-widest text-darkblue text-xs uppercase shadow-sm h-[45px] flex items-center justify-center shrink-0 cursor-default';
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

            // Toggle blocked on click / tap
            slot.addEventListener('click', (e) => {
                if (e.target.closest('.schedule-block')) return;
                if (blockedSlots.has(slotKey)) { blockedSlots.delete(slotKey); } else { blockedSlots.add(slotKey); }
                if (lastScheduleData) { renderSchedule(lastScheduleData); } else { initGrid(currentMinHour, currentMaxHour, currentDays); }
            });

            // ── Desktop drag-and-drop (unchanged) ───────────────────────────
            // Guarded by isMobile() so we never attach pointless event listeners
            // on touch devices (avoids passive-listener warnings and saves memory).
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
subjectForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('subjName').value.trim();
    const difficulty = parseInt(document.getElementById('subjDiff').value);
    const hours = parseInt(document.getElementById('subjHours').value);

    if (name) {
        subjects.push({ name, difficulty, hours });
        renderSubjects();
        saveSubjects();
        subjectForm.reset();
        document.getElementById('subjName').focus();
    }
});

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT SYSTEM — three independent methods, user picks via modal
//
//  Option A: Screenshot → PDF  (html-to-image + jsPDF)
//            Captures the exact on-screen look. Works on desktop and Android.
//            On iOS, opens as a blob URL in a new tab for the user to save.
//
//  Option B: Programmatic PDF  (jsPDF drawing API, reads lastScheduleData)
//            Draws the timetable as clean vector shapes — no canvas, no CORS
//            taint risk, works on every browser and device reliably.
//
//  Option C: Print / Save as PDF  (window.print())
//            Uses the browser's native print dialog. On mobile this opens the
//            system share sheet; the user saves as PDF from there.
//            Zero dependencies, always works, no async download issues.
// ══════════════════════════════════════════════════════════════════════════════

// ── Export modal open/close ───────────────────────────────────────────────────
function openExportModal() {
    if (!lastScheduleData) {
        showError("Generate a timetable first before exporting!");
        return;
    }
    document.getElementById('exportModal').classList.remove('hidden');
    document.getElementById('exportModal').classList.add('flex');
}
function closeExportModal() {
    document.getElementById('exportModal').classList.add('hidden');
    document.getElementById('exportModal').classList.remove('flex');
}

exportPdfBtn.addEventListener('click', openExportModal);

document.getElementById('exportModalClose').addEventListener('click', closeExportModal);
document.getElementById('exportModal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('exportModal')) closeExportModal();
});

// ── Helper: restore calendarContainer styles (used by Option A) ───────────────
function restoreContainerStyle(container, saved) {
    container.style.height     = saved.height;
    container.style.width      = saved.width;
    container.style.maxWidth   = saved.maxWidth;
    container.style.overflowX  = saved.overflowX;
    container.style.overflowY  = saved.overflowY;
    container.style.transition = saved.transition;
}

// ── Helper: mobile-safe PDF download ─────────────────────────────────────────
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

// ── Option A: Screenshot → PDF ────────────────────────────────────────────────
// Captures the live DOM as a PNG then embeds it in a landscape A4 PDF.
// All five issues from the audit are fixed here:
//   1. Container transition disabled before measuring so scrollWidth is accurate
//   2. Both calendarContainer AND exportArea overflow expanded before capture
//   3. pixelRatio capped at devicePixelRatio (max 2 on mobile) to avoid GPU limit
//   4. tempImg.onerror handler added so the button never gets stuck disabled
//   5. iOS uses blob URL instead of pdf.save() to stay in the gesture chain
document.getElementById('exportOptionA').addEventListener('click', () => {
    closeExportModal();

    const originalContent = exportPdfBtn.innerHTML;
    exportPdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Capturing...';
    exportPdfBtn.disabled  = true;

    const container = calendarContainer;
    const outer     = exportArea;

    // Save current inline styles for both elements
    const savedContainer = {
        height:     container.style.height,
        width:      container.style.width,
        maxWidth:   container.style.maxWidth,
        overflowX:  container.style.overflowX,
        overflowY:  container.style.overflowY,
        transition: container.style.transition,
    };
    const savedOuter = {
        overflowX: outer.style.overflowX,
        overflowY: outer.style.overflowY,
    };

    // FIX: disable transition before measuring
    container.style.transition = 'none';

    // FIX: Instead of scrollWidth, force layout to look like a desktop grid container to stop viewport-truncation on mobile
    container.style.width     = '1200px';
    container.style.maxWidth  = 'none';
    container.style.overflowX = 'visible';
    container.style.overflowY = 'visible';
    outer.style.overflowX     = 'visible';
    outer.style.overflowY     = 'visible';

    const pixelRatio = isMobile() ? Math.min(window.devicePixelRatio || 2, 2) : 3;

    // 150ms settle so the layout engine reflow completes reliably before taking the canvas snapshot
    setTimeout(() => {
        htmlToImage.toPng(outer, {
            quality: 1.0,
            pixelRatio,
            backgroundColor: '#f0f4f8',
            fetchRequestInit: { mode: 'cors', cache: 'force-cache' },
        })
        .then(dataUrl => {
            // Restore immediately after capture, before building the PDF
            restoreContainerStyle(container, savedContainer);
            outer.style.overflowX = savedOuter.overflowX;
            outer.style.overflowY = savedOuter.overflowY;

            const { jsPDF } = window.jspdf;
            const pdf        = new jsPDF('l', 'mm', 'a4');
            const pageWidth  = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin     = 10;
            const targetW    = pageWidth - margin * 2;

            const tempImg   = new Image();
            tempImg.onerror = () => {
                showError("Capture failed — try Option B or Option C instead.");
                exportPdfBtn.innerHTML = originalContent;
                exportPdfBtn.disabled  = false;
            };
            tempImg.onload = function () {
                const ratio   = this.height / this.width;
                const targetH = targetW * ratio;
                const yPos    = Math.max(margin, (pageHeight - targetH) / 2);
                pdf.addImage(dataUrl, 'PNG', margin, yPos, targetW, targetH, undefined, 'FAST');
                savePdf(pdf, 'Studilux_Timetable.pdf');
                exportPdfBtn.innerHTML = originalContent;
                exportPdfBtn.disabled  = false;
            };
            tempImg.src = dataUrl;
        })
        .catch(err => {
            restoreContainerStyle(container, savedContainer);
            outer.style.overflowX = savedOuter.overflowX;
            outer.style.overflowY = savedOuter.overflowY;
            console.error('Option A export error:', err);
            showError("Screenshot capture failed. Try Option B or Option C.");
            exportPdfBtn.innerHTML = originalContent;
            exportPdfBtn.disabled  = false;
        });
    }, 150);
});

// ── Option B: Programmatic PDF ────────────────────────────────────────────────
// Reads lastScheduleData and subjects directly — no DOM screenshot, no canvas,
// no CORS taint risk. Draws a clean timetable grid using jsPDF's drawing API.
// Works on every browser and device without any async download issues.
document.getElementById('exportOptionB').addEventListener('click', () => {
    closeExportModal();

    if (!lastScheduleData || !subjects.length) {
        showError("No timetable data to export.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const pdf        = new jsPDF('l', 'mm', 'a4');
    const PW         = pdf.internal.pageSize.getWidth();   // 297mm
    const PH         = pdf.internal.pageSize.getHeight();  // 210mm
    const MARGIN     = 12;

    // Colour palette (matches the app's diff-1…diff-5 theme)
    const DIFF_COLORS = {
        1: { bg: [219, 234, 254], border: [56,  189, 248], text: [12, 74, 110]  },
        2: { bg: [186, 230, 253], border: [14,  165, 233], text: [12, 74, 110]  },
        3: { bg: [147, 197, 253], border: [2,   132, 199], text: [240,249,255]  },
        4: { bg: [165, 180, 252], border: [30,  58,  138], text: [240,249,255]  },
        5: { bg: [254, 202, 202], border: [239, 68,  68 ], text: [239, 68,  68] },
    };

    // Determine which days actually have sessions
    const activeDays = DAYS.filter(d => lastScheduleData[d]?.length > 0);
    if (!activeDays.length) { showError("No sessions to export."); return; }

    // Determine hour range
    let minH = 24, maxH = 0;
    activeDays.forEach(d => lastScheduleData[d].forEach(e => {
        if (e.hour < minH) minH = e.hour;
        if (e.hour > maxH) maxH = e.hour;
    }));
    const numHours = maxH - minH + 1;

    // Layout constants
    const TIME_COL_W  = 14;
    const usableW     = PW - MARGIN * 2 - TIME_COL_W;
    const DAY_COL_W   = usableW / activeDays.length;
    const HEADER_H    = 10;
    const usableH     = PH - MARGIN * 2 - HEADER_H;
    const ROW_H       = usableH / numHours;
    const gridTop     = MARGIN + HEADER_H;
    const gridLeft    = MARGIN + TIME_COL_W;

    // ── Background
    pdf.setFillColor(240, 244, 248);
    pdf.rect(0, 0, PW, PH, 'F');

    // ── Title
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.setTextColor(30, 58, 138);
    pdf.text('Studilux Reading Timetable', PW / 2, MARGIN - 2, { align: 'center' });

    // ── Day headers
    pdf.setFontSize(7);
    pdf.setFont('helvetica', 'bold');
    activeDays.forEach((day, i) => {
        const x = gridLeft + i * DAY_COL_W;
        // Header background
        pdf.setFillColor(255, 255, 255);
        pdf.setDrawColor(220, 230, 245);
        pdf.roundedRect(x + 1, MARGIN, DAY_COL_W - 2, HEADER_H - 1, 1.5, 1.5, 'FD');
        pdf.setTextColor(30, 58, 138);
        pdf.text(day.substring(0, 3).toUpperCase(), x + DAY_COL_W / 2, MARGIN + 6.5, { align: 'center' });
    });

    // ── Vertical column dividers
    pdf.setDrawColor(200, 215, 235);
    pdf.setLineWidth(0.2);
    activeDays.forEach((_, i) => {
        const x = gridLeft + i * DAY_COL_W;
        pdf.line(x, gridTop, x, gridTop + usableH);
    });
    // Right edge
    pdf.line(gridLeft + usableW, gridTop, gridLeft + usableW, gridTop + usableH);

    // ── Time labels + horizontal hour lines
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5.5);
    pdf.setTextColor(100, 116, 139);
    for (let h = 0; h <= numHours; h++) {
        const y = gridTop + h * ROW_H;
        pdf.setDrawColor(210, 220, 235);
        pdf.setLineWidth(0.15);
        pdf.line(MARGIN + TIME_COL_W, y, MARGIN + TIME_COL_W + usableW, y);
        if (h < numHours) {
            const label = String(minH + h).padStart(2, '0') + ':00';
            pdf.text(label, MARGIN + TIME_COL_W - 1, y + ROW_H * 0.45 + 1, { align: 'right' });
        }
    }

    // ── Session blocks
    activeDays.forEach((day, colIdx) => {
        const events = lastScheduleData[day] || [];
        events.forEach(evt => {
            const subj   = subjects.find(s => s.name === evt.subject) || { difficulty: 1 };
            const diff   = Math.min(5, Math.max(1, subj.difficulty));
            const colors = DIFF_COLORS[diff];
            const x      = gridLeft + colIdx * DAY_COL_W + 1.5;
            const y      = gridTop + (evt.hour - minH) * ROW_H + 1;
            const bw     = DAY_COL_W - 3;
            const bh     = ROW_H - 2;

            // Block fill
            pdf.setFillColor(...colors.bg);
            pdf.setDrawColor(...colors.border);
            pdf.setLineWidth(0.4);
            pdf.roundedRect(x, y, bw, bh, 1.5, 1.5, 'FD');

            // Left accent bar (mirrors the CSS border-left)
            pdf.setFillColor(...colors.border);
            pdf.rect(x, y, 1.5, bh, 'F');

            // Subject name
            pdf.setFont('helvetica', 'bold');
            pdf.setFontSize(Math.min(6.5, bh > 6 ? 6.5 : bh * 0.55));
            pdf.setTextColor(...colors.text);
            const maxChars  = Math.floor(bw / 2.1);
            const nameLabel = evt.subject.length > maxChars
                ? evt.subject.substring(0, maxChars - 1) + '…'
                : evt.subject;
            pdf.text(nameLabel, x + 3.5, y + Math.min(bh * 0.45, 4.5));

            // Time label (only if block is tall enough)
            if (bh > 7) {
                pdf.setFont('helvetica', 'normal');
                pdf.setFontSize(4.5);
                pdf.setTextColor(...colors.text);
                const timeLabel = String(evt.hour).padStart(2,'0') + ':00–' + String(evt.hour + 1).padStart(2,'0') + ':00';
                pdf.text(timeLabel, x + 3.5, y + bh * 0.72);
            }
        });
    });

    // ── Footer
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(5);
    pdf.setTextColor(148, 163, 184);
    const now = new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
    pdf.text(`Generated by Studilux · ${now}`, PW / 2, PH - 4, { align: 'center' });

    savePdf(pdf, 'Studilux_Timetable.pdf');
});

// ── Option C: Print / Save as PDF ────────────────────────────────────────────
// Uses the browser's native print pipeline. A dedicated @media print stylesheet
// (in style.css) hides everything except the timetable, formats it for paper,
// and removes all interactive UI. On mobile this opens the system share sheet
// where the user can save as PDF — no async issues, no canvas, no dependencies.
document.getElementById('exportOptionC').addEventListener('click', () => {
    closeExportModal();
    if (!lastScheduleData) {
        showError("Generate a timetable first before printing!");
        return;
    }
    window.print();
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
            // FIX: remove cursor-grab on mobile — drag is desktop-only
            block.className = isMobile()
                ? `schedule-block diff-${subjConfig.difficulty} fade-in`
                : `schedule-block diff-${subjConfig.difficulty} fade-in cursor-grab active:cursor-grabbing`;
            block.style.animationDelay = `${i * 0.05}s`;

            // ── Desktop drag-and-drop only ───────────────────────────────────
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
// This ensures the height is correct if the user rotates their phone or resizes
// a browser window between mobile and desktop breakpoints.
let resizeTimer;
window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
        const numHours = currentMaxHour - currentMinHour + 1;
        setCalendarHeight(numHours);
    }, 150);
}, { passive: true });

// ── Initial setup ─────────────────────────────────────────────────────────────
loadState();

// ── Mobile sticky action bar ──────────────────────────────────────────────────
// The mobile bar duplicates the navbar buttons. Rather than duplicating the
// full event-handler logic, we simply forward each mobile button's click to
// the corresponding navbar button so all existing logic runs exactly once.
const exportPdfBtnMobile = document.getElementById('exportPdfBtnMobile');
const generateBtnMobile  = document.getElementById('generateBtnMobile');

if (exportPdfBtnMobile) {
    exportPdfBtnMobile.addEventListener('click', () => exportPdfBtn.click());
}
if (generateBtnMobile) {
    generateBtnMobile.addEventListener('click', () => generateBtn.click());
}