/* Full JavaScript port of the original Python solver */
const DAYS_MAP = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/**
 * Solve the timetable.
 * @param {Array} subjects - List of {name, hours, difficulty}
 * @param {Object} free_time - {start, end}
 * @param {Array|null} allowed_days - optional list of day names
 * @param {Array|null} blocked_slots - optional list like "Monday-16"
 * @param {Array|null} peak_hours - optional list of hour numbers
 * @returns {Object} {success: bool, schedule?: Object, error?: string}
 */
function solveTimetable(subjects, free_time, allowed_days = null, blocked_slots = null, peak_hours = null) {
  // ---- 1. Parse inputs ----------------------------------------------------
  const startHour = parseInt(free_time?.start ?? 16, 10);
  const endHour = parseInt(free_time?.end ?? 20, 10);

  const allowedDayIndices = allowed_days && allowed_days.length
    ? allowed_days.map(d => DAYS_MAP.indexOf(d)).filter(i => i >= 0)
    : DAYS_MAP.map((_, i) => i);

  if (allowedDayIndices.length === 0) {
    return { success: false, error: "No study days selected." };
  }

  // ---- 2. Blocked slots ---------------------------------------------------
  const blockedSet = new Set();
  if (blocked_slots) {
    blocked_slots.forEach(slot => {
      const parts = slot.split("-");
      if (parts.length === 2 && DAYS_MAP.includes(parts[0])) {
        const dIdx = DAYS_MAP.indexOf(parts[0]);
        const hour = parseInt(parts[1], 10);
        if (!Number.isNaN(hour)) blockedSet.add(`${dIdx}-${hour}`);
      }
    });
  }

  // ---- 3. Peak hours ------------------------------------------------------
  const peakSet = new Set(peak_hours ?? []);

  // ---- 4. Compute availabilities -------------------------------------------
  const dayAvailHours = {};
  const dayCapacities = {};
  let totalAvailSlots = 0;
  const maxHoursPerDay = endHour - startHour;

  allowedDayIndices.forEach(dIdx => {
    const avail = [];
    for (let h = startHour; h < endHour; h++) {
      if (!blockedSet.has(`${dIdx}-${h}`)) avail.push(h);
    }
    dayAvailHours[dIdx] = avail;
    dayCapacities[dIdx] = avail.length;
    totalAvailSlots += avail.length;
  });

  // ---- 5. Check total required hours ---------------------------------------
  const totalHoursRequired = subjects.reduce((sum, s) => sum + parseInt(s.hours, 10), 0);
  if (totalHoursRequired > totalAvailSlots) {
    return {
      success: false,
      error: `Requires ${totalHoursRequired} hours, but only ${totalAvailSlots} free study slots are available.`
    };
  }

  // ---- 6. Per‑subject limits -----------------------------------------------
  const maxPerDay = {};
  const subjectsMap = {};

  subjects.forEach(subj => {
    const name = subj.name;
    const hrs = parseInt(subj.hours, 10);
    const diff = parseInt(subj.difficulty ?? 3, 10);
    subjectsMap[name] = { hours: hrs, difficulty: diff };
    // Rule #2 – max sessions per day
    let val = Math.ceil(hrs / allowedDayIndices.length);
    if (hrs > 1 && allowedDayIndices.length > 1 && val === hrs) {
      val = Math.max(1, hrs - 1);
    }
    maxPerDay[name] = val;
  });

  // ---- 7. Balanced daily load targets --------------------------------------
  const avgLoad = totalHoursRequired / allowedDayIndices.length;
  const minDaily = Math.floor(avgLoad);
  const maxDaily = Math.ceil(avgLoad);

  // ---- 8. Multi‑pass backtracking ------------------------------------------
  const passes = [
    { prioritize: true,  balance: 0, diff: true,  spread: true },
    { prioritize: true,  balance: 1, diff: true,  spread: true },
    { prioritize: false, balance: 0, diff: true,  spread: true },
    { prioritize: false, balance: 1, diff: true,  spread: true },
    { prioritize: false, balance: 2, diff: true,  spread: true },
    { prioritize: false, balance: 2, diff: false, spread: true },
    { prioritize: false, balance: 2, diff: false, spread: false }
  ];

  // Helper: generate all daily load distributions for a given balance level
  function generateDistributions(dayIdx, curLoads, remaining, results, balanceLevel) {
    if (dayIdx === allowedDayIndices.length) {
      if (remaining === 0) results.push([...curLoads]);
      return;
    }
    const cap = dayCapacities[allowedDayIndices[dayIdx]];
    let minLoad, maxLoad;
    if (balanceLevel === 0) { // strict
      minLoad = Math.min(minDaily, cap);
      maxLoad = Math.min(maxDaily, cap);
    } else if (balanceLevel === 1) { // relaxed
      minLoad = Math.max(0, Math.min(minDaily - 1, cap));
      maxLoad = Math.min(maxDaily + 1, cap);
    } else { // fully relaxed
      minLoad = 0;
      maxLoad = Math.min(maxHoursPerDay, cap);
    }
    for (let load = minLoad; load <= maxLoad; load++) {
      if (load <= remaining) {
        curLoads.push(load);
        generateDistributions(dayIdx + 1, curLoads, remaining - load, results, balanceLevel);
        curLoads.pop();
      }
    }
  }

  // Core solver for a single pass configuration
  function solvePass({ prioritize, balance, diff, spread }) {
    const distributions = [];
    generateDistributions(0, [], totalHoursRequired, distributions, balance);
    if (!distributions.length) return null;

    // Try each distribution
    for (const dist of distributions) {
      const activeSlots = [];
      dist.forEach((load, idx) => {
        const dIdx = allowedDayIndices[idx];
        const avail = dayAvailHours[dIdx];
        for (let i = 0; i < load; i++) activeSlots.push([dIdx, avail[i]]);
      });

      const slotIsPeak = activeSlots.map(([, hour]) => peakSet.has(hour));

      const remainingHours = {};
      subjects.forEach(s => (remainingHours[s.name] = parseInt(s.hours, 10)));
      const daySubjectCounts = {};
      allowedDayIndices.forEach(d => (daySubjectCounts[d] = {}));
      const assignment = new Array(activeSlots.length).fill(null);

      function backtrack(idx) {
        if (idx === activeSlots.length) return true;
        const [day, hour] = activeSlots[idx];
        const isPeak = slotIsPeak[idx];

        for (const name of Object.keys(subjectsMap)) {
          if (remainingHours[name] <= 0) continue;

          // Spread constraint
          if (spread) {
            const cur = daySubjectCounts[day][name] ?? 0;
            if (cur >= maxPerDay[name]) continue;
          }

          // Difficulty separation constraint
          if (diff && subjectsMap[name].difficulty >= 4) {
            if (idx > 0) {
              const [prevDay, prevHour] = activeSlots[idx - 1];
              if (prevDay === day && prevHour === hour - 1) {
                const prevName = assignment[idx - 1];
                if (prevName && subjectsMap[prevName].difficulty >= 4) continue;
              }
            }
          }

          // Focus‑hour priority
          if (prioritize) {
            const dVal = subjectsMap[name].difficulty;
            if (isPeak && dVal < 4) {
              // ensure no high‑diff earlier in non‑peak slots
              let conflict = false;
              for (let p = 0; p < idx; p++) {
                if (!slotIsPeak[p] && subjectsMap[assignment[p]]?.difficulty >= 4) { conflict = true; break; }
              }
              if (conflict) continue;
            }
            if (!isPeak && dVal >= 4) {
              let conflict = false;
              for (let p = 0; p < idx; p++) {
                if (slotIsPeak[p] && subjectsMap[assignment[p]]?.difficulty < 4) { conflict = true; break; }
              }
              if (conflict) continue;
            }
          }

          // Assign
          assignment[idx] = name;
          remainingHours[name]--;
          daySubjectCounts[day][name] = (daySubjectCounts[day][name] ?? 0) + 1;

          if (backtrack(idx + 1)) return true;

          // Undo
          assignment[idx] = null;
          remainingHours[name]++;
          daySubjectCounts[day][name]--;
        }
        return false;
      }

      if (backtrack(0)) {
        const schedule = {};
        DAYS_MAP.forEach(d => (schedule[d] = []));
        activeSlots.forEach(([dIdx, hr], i) => {
          const subj = assignment[i];
          schedule[DAYS_MAP[dIdx]].push({ subject: subj, hour: hr, slot_idx: dIdx * 24 + hr });
        });
        // Sort each day by hour
        Object.values(schedule).forEach(arr => arr.sort((a, b) => a.hour - b.hour));
        return { success: true, schedule };
      }
    }
    return null;
  }

  // Run passes in order
  for (const p of passes) {
    const res = solvePass(p);
    if (res) return res;
  }

  // If all passes failed, return error
  return {
    success: false,
    error: "Strict math constraints failed. Possible reasons:\n" +
           "1. Too many high‑difficulty subjects to separate.\n" +
           "2. Subject hours cannot be evenly distributed across selected days.\n" +
           "Try adding more days or relaxing your load."
  };
}

module.exports = { solveTimetable };
