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

function loadState() {
    // Load persisted subjects or start empty
    subjects = loadSubjects();
    lastScheduleData = null;
    
    blockedSlots = new Set();
    peakHours = new Set([16, 17]);

    // Set up listeners for free time hours to update the peak hours selector
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
            if (peakHours.has(h)) {
                peakHours.delete(h);
            } else {
                peakHours.add(h);
            }
            renderPeakHoursSelector();
        });
        peakHoursContainer.appendChild(btn);
    }
}

function initGrid(minHour = 0, maxHour = 23, usedDays = DAYS) {
    currentMinHour = minHour;
    currentMaxHour = maxHour;
    currentDays = usedDays;
    
    const numHours = maxHour - minHour + 1;
    document.documentElement.style.setProperty('--num-hours', numHours);

    // Layout Time Column
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

    // Layout Days
    daysContainer.innerHTML = '';
    usedDays.forEach(day => {
        const dayDiv = document.createElement('div');
        dayDiv.className = 'day-column flex-1 flex flex-col relative';
        dayDiv.id = `col-${day}`;

        // Header (Day Name)
        const header = document.createElement('div');
        header.className = 'w-full text-center py-3.5 bg-white/60 backdrop-blur-xl border-b border-glassborder z-30 font-bold tracking-widest text-darkblue text-xs uppercase shadow-sm h-[45px] flex items-center justify-center shrink-0 cursor-default';
        header.innerText = day;
        dayDiv.appendChild(header);

        const gridBody = document.createElement('div');
        gridBody.className = 'flex-1 relative w-full';
        gridBody.id = `gridbody-${day}`;

        // Render empty slots for the grid background with DRAG & DROP zones
        for (let i = minHour; i <= maxHour; i++) {
            const slot = document.createElement('div');
            slot.className = 'time-slot w-full transition-all duration-200 cursor-pointer hover:bg-slate-200/20';

            const slotKey = `${day}-${i}`;
            if (blockedSlots.has(slotKey)) {
                slot.classList.add('blocked-slot');
                slot.innerHTML = `
                    <div class="h-full flex items-center justify-center text-[0.55rem] text-slate-500/80 font-bold uppercase tracking-wider select-none pointer-events-none">
                        <i class="fa-solid fa-ban mr-1 text-[0.6rem] text-slate-400"></i> Blocked
                    </div>
                `;
            }

            // Click cell to toggle Busy Window / Blocked slot
            slot.addEventListener('click', (e) => {
                if (e.target.closest('.schedule-block')) return;
                if (blockedSlots.has(slotKey)) {
                    blockedSlots.delete(slotKey);
                } else {
                    blockedSlots.add(slotKey);
                }
                
                if (lastScheduleData) {
                    renderSchedule(lastScheduleData);
                } else {
                    initGrid(currentMinHour, currentMaxHour, currentDays);
                }
            });

            // Drag and Drop Logic
            slot.addEventListener('dragover', (e) => {
                e.preventDefault();
                if (!blockedSlots.has(slotKey)) {
                    slot.classList.add('bg-brand-400/20');
                }
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
        evt.hour = newHour; // Update to the newly dropped hour

        if (!lastScheduleData[newDay]) {
            lastScheduleData[newDay] = [];
        }

        // Handle Overlaps using a Simple Swap mechanics
        const collisionIdx = lastScheduleData[newDay].findIndex(e => e.hour === newHour);
        if (collisionIdx !== -1) {
            const bumped = lastScheduleData[newDay].splice(collisionIdx, 1)[0];
            bumped.hour = oldHour;
            lastScheduleData[oldDay].push(bumped); // Push back to the old slot
        }

        lastScheduleData[newDay].push(evt);
        renderSchedule(lastScheduleData);
    }
}

function renderSubjects() {
    subjectsList.innerHTML = '';
    subjects.forEach((subj, idx) => {
        const el = document.createElement('div');
        // Bright glass card update
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

// Ensure the function is in the global scope if rendering as string
window.removeSubject = removeSubject;

function showError(msg) {
    errorMsg.innerText = msg;
    errorBanner.classList.remove('hidden');
    setTimeout(() => {
        errorBanner.classList.add('hidden');
    }, 5000);
}

// Event Listeners
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

exportPdfBtn.addEventListener('click', () => {
    if (!lastScheduleData) {
        showError("Generate a timetable first before exporting!");
        return;
    }

    // UI Feedback
    const originalContent = exportPdfBtn.innerHTML;
    exportPdfBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Capturing...';
    exportPdfBtn.disabled = true;

    // We use a high pixel ratio (4x) to ensure the image is crisp like a vector
    const options = {
        quality: 1.0,
        pixelRatio: 4,
        backgroundColor: '#f0f4f8',
        style: {
            transform: 'scale(1)',
            transformOrigin: 'top left'
        }
    };

    htmlToImage.toPng(exportArea, options)
        .then(function (dataUrl) {
            const { jsPDF } = window.jspdf;
            const pdf = new jsPDF('l', 'mm', 'a4'); // Landscape A4

            const pageWidth = pdf.internal.pageSize.getWidth();
            const pageHeight = pdf.internal.pageSize.getHeight();
            const margin = 10;
            const targetWidth = pageWidth - (margin * 2);

            // Calculate height to maintain aspect ratio
            const img = new Image();
            img.src = dataUrl;
            img.onload = function () {
                const imgRatio = this.height / this.width;
                const targetHeight = targetWidth * imgRatio;

                // Center vertically if it fits, otherwise cap at page height
                const yPos = Math.max(margin, (pageHeight - targetHeight) / 2);

                pdf.addImage(dataUrl, 'PNG', margin, yPos, targetWidth, targetHeight, undefined, 'FAST');
                pdf.save("Studilux_Timetable.pdf");

                exportPdfBtn.innerHTML = originalContent;
                exportPdfBtn.disabled = false;
            };
        })
        .catch(function (error) {
            console.error('oops, something went wrong!', error);
            showError("High-res export failed.");
            exportPdfBtn.innerHTML = originalContent;
            exportPdfBtn.disabled = false;
        });
});

generateBtn.addEventListener('click', async () => {
    if (subjects.length === 0) {
        showError("Please add at least one subject.");
        return;
    }

    loadingOverlay.classList.remove('hidden');

    try {
        const start = parseInt(document.getElementById('freeStart').value);
        const end = parseInt(document.getElementById('freeEnd').value);
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

        const response = await fetch('https://localhost:5000/api/generate_schedule', {
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
    // Clear old visual blocks
    document.querySelectorAll('.schedule-block').forEach(e => e.remove());

    // Determine min and max hours used to crop the timetable
    let minHour = 24;
    let maxHour = -1;
    let usedDays = new Set();

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

    // Fallback if no valid schedule found
    if (minHour > maxHour) {
        minHour = 0; maxHour = 23;
    }

    // Identify days with events, ensuring all 7 days are ALWAYS visible
    const daysToRender = [...DAYS];

    // Redraw the grid to fit the scheduled frames exactly
    initGrid(minHour, maxHour, daysToRender);

    const numHours = maxHour - minHour + 1;
    const blockHeightPct = 100 / numHours;

    daysToRender.forEach(day => {
        const gridBody = document.getElementById(`gridbody-${day}`);
        if (!gridBody) return;
        const events = scheduleData[day] || [];

        events.forEach((evt, i) => {
            // Find subject config to get difficulty
            const subjConfig = subjects.find(s => s.name === evt.subject) || { difficulty: 1 };

            const block = document.createElement('div');
            // Basic styles + variable background class
            block.className = `schedule-block diff-${subjConfig.difficulty} fade-in cursor-grab active:cursor-grabbing`;
            block.style.animationDelay = `${i * 0.05}s`;

            // Allow drag and drop
            block.draggable = true;
            block.addEventListener('dragstart', (e) => {
                // Store unique identity of this block
                e.dataTransfer.setData('text/plain', JSON.stringify({ day, hour: evt.hour }));
                // Visual feedback during drag
                setTimeout(() => block.classList.add('opacity-30'), 0);
            });
            block.addEventListener('dragend', () => {
                block.classList.remove('opacity-30');
            });

            const positionIdx = evt.hour - minHour;
            // Positioning height with gaps to feel floating
            block.style.top = `calc(${positionIdx} * ${blockHeightPct}% + 4px)`;
            block.style.height = `calc(${blockHeightPct}% - 8px)`;

            block.innerHTML = `
                <div class="h-full flex flex-col justify-center overflow-hidden pointer-events-none">
                    <span class="font-bold text-[0.7rem] uppercase tracking-[0.1em] block truncate mb-1">${evt.subject}</span>
                    <span class="text-[0.65rem] opacity-75 font-mono tracking-wider">${evt.hour.toString().padStart(2, '0')}:00 - ${(evt.hour + 1).toString().padStart(2, '0')}:00</span>
                </div>
            `;

            gridBody.appendChild(block);
        });
    });
}

// Initial Setup
loadState();
