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
  const endHour   = parseInt(free_time?.end   ?? 20, 10);

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

  // ---- 4. Compute availabilities ------------------------------------------
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

  // ---- 5. Check total required hours --------------------------------------
  const totalHoursRequired = subjects.reduce((sum, s) => sum + parseInt(s.hours, 10), 0);
  if (totalHoursRequired > totalAvailSlots) {
    return {
      success: false,
      error: `Requires ${totalHoursRequired} hours, but only ${totalAvailSlots} free study slots are available.`
    };
  }

  // ---- 6. Per-subject limits ----------------------------------------------
  const maxPerDay   = {};
  const subjectsMap = {};

  subjects.forEach(subj => {
    const name = subj.name;
    const hrs  = parseInt(subj.hours,      10);
    const diff = parseInt(subj.difficulty ?? 3, 10);
    subjectsMap[name] = { hours: hrs, difficulty: diff };
    // Rule: cap sessions-per-day so subjects spread across the week
    let val = Math.ceil(hrs / allowedDayIndices.length);
    if (hrs > 1 && allowedDayIndices.length > 1 && val === hrs) {
      val = Math.max(1, hrs - 1);
    }
    maxPerDay[name] = val;
  });

  // ---- 7. Balanced daily load targets -------------------------------------
  const avgLoad  = totalHoursRequired / allowedDayIndices.length;
  const minDaily = Math.floor(avgLoad);
  const maxDaily = Math.ceil(avgLoad);

  // Helper: enumerate every valid daily load distribution
  function generateDistributions(dayIdx, curLoads, remaining, results, balanceLevel) {
    if (dayIdx === allowedDayIndices.length) {
      if (remaining === 0) results.push([...curLoads]);
      return;
    }
    const cap = dayCapacities[allowedDayIndices[dayIdx]];
    let minLoad, maxLoad;
    if (balanceLevel === 0) {          // strict
      minLoad = Math.min(minDaily, cap);
      maxLoad = Math.min(maxDaily, cap);
    } else if (balanceLevel === 1) {   // relaxed
      minLoad = Math.max(0, Math.min(minDaily - 1, cap));
      maxLoad = Math.min(maxDaily + 1, cap);
    } else {                           // fully relaxed
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

  // ---- 8. Multi-pass backtracking -----------------------------------------
  const MIN_SPACE_RATIO = 0.30;

  const passes = [
    { prioritize: true,  balance: 0, diff: true,  spread: true,  hardestPeak: true  },
    { prioritize: true,  balance: 1, diff: true,  spread: true,  hardestPeak: true  },
    { prioritize: false, balance: 0, diff: true,  spread: true,  hardestPeak: true  },
    { prioritize: false, balance: 1, diff: true,  spread: true,  hardestPeak: true  },
    { prioritize: false, balance: 2, diff: false, spread: true,  hardestPeak: true  },
    { prioritize: false, balance: 2, diff: false, spread: false, hardestPeak: true  },
  ];

  function solvePass({ prioritize, balance, diff, spread, hardestPeak }) {
    // Days that have "lots" of free time must receive at least one subject
    const bigDays = new Set();
    allowedDayIndices.forEach(dIdx => {
      if (dayCapacities[dIdx] >= Math.ceil(MIN_SPACE_RATIO * maxHoursPerDay)) bigDays.add(dIdx);
    });

    const distributions = [];
    generateDistributions(0, [], totalHoursRequired, distributions, balance);
    if (!distributions.length) return null;

    for (const dist of distributions) {
      // ── FIX 1: build activeSlots with peak slots FIRST within each day ──────
      //
      // Original code pushed hours in raw chronological order (startHour→endHour),
      // so non-peak slots often appeared before peak ones. The backtracker fills
      // slots left-to-right, meaning easy subjects got first pick of early slots
      // and hard subjects were left with whatever remained — the opposite of what
      // we want.
      //
      // Now, for each day we split its allocated hours into two buckets:
      //   • peak slots  (hours the user marked as high-focus)
      //   • off-peak slots (everything else)
      // and push peak slots first. Hard subjects are tried first in peak slots
      // (Fix 2 below), so they claim those positions before easy subjects can.
      const activeSlots = [];
      dist.forEach((load, idx) => {
        const dIdx  = allowedDayIndices[idx];
        const avail = dayAvailHours[dIdx]; // already filtered for blocked hours

        // Partition this day's available hours into peak vs off-peak
        const peakAvail    = avail.filter(h =>  peakSet.has(h));
        const offPeakAvail = avail.filter(h => !peakSet.has(h));

        // Concatenate: peak first, then off-peak — both still in ascending hour order
        const ordered = [...peakAvail, ...offPeakAvail];

        // Take only as many as this distribution allocates to this day
        for (let i = 0; i < load; i++) activeSlots.push([dIdx, ordered[i]]);
      });

      // Derived: which slots in the active list are peak
      const slotIsPeak = activeSlots.map(([, hour]) => peakSet.has(hour));

      // Count how many peak slots exist in this distribution (used by Fix 3)
      const totalPeakSlots = slotIsPeak.filter(Boolean).length;

      // Hard-subject total hours needed (used by Fix 3 to judge overflow)
      const hardHoursTotal = subjects.reduce(
        (sum, s) => sum + (parseInt(s.difficulty ?? 3, 10) >= 4 ? parseInt(s.hours, 10) : 0), 0
      );

      const remainingHours = {};
      subjects.forEach(s => (remainingHours[s.name] = parseInt(s.hours, 10)));
      const daySubjectCounts = {};
      allowedDayIndices.forEach(d => (daySubjectCounts[d] = {}));
      const assignment = new Array(activeSlots.length).fill(null);

      function backtrack(idx) {
        if (idx === activeSlots.length) return true;
        const [day, hour] = activeSlots[idx];
        const isPeak      = slotIsPeak[idx];

        // ── FIX 2: proper difficulty-based candidate ordering ─────────────────
        //
        // Original code only promoted diff-5 on peak slots (diff-4 was ignored)
        // and applied NO ordering on non-peak slots, so easy subjects were tried
        // in arbitrary insertion order.
        //
        // New rules:
        //   • Peak slot   → sort candidates hardest-first (diff 5→1). Hard
        //                    subjects get first crack at high-focus time.
        //   • Off-peak slot → sort candidates easiest-first (diff 1→5). Easy
        //                    subjects fill non-peak time, leaving peak slots open
        //                    for hard subjects that come later in the search.
        const nameOrder = Object.keys(subjectsMap).sort((a, b) => {
          const da = subjectsMap[a].difficulty;
          const db = subjectsMap[b].difficulty;
          if (isPeak) {
            // Hardest first on peak slots
            return db - da;
          } else {
            // Easiest first on off-peak slots
            return da - db;
          }
        });

        for (const name of nameOrder) {
          if (remainingHours[name] <= 0) continue;

          // ── FIX 3: forward-looking peak-priority guard ────────────────────
          //
          // Runs FIRST, before spread and difficulty-separation, because it is
          // the highest-value constraint. If we let the other constraints reject
          // a hard subject from a peak slot before this guard runs, the guard's
          // "peak slots remaining" count becomes wrong (it still counts this slot
          // as available, but the backtracker may have already decided elsewhere
          // that the hard subject can't go here).
          //
          // Original logic did a backwards scan over ALL prior assignments and
          // blocked easy subjects from peak slots the moment ANY hard subject
          // had been placed off-peak — even as overflow. This caused cascading
          // rejections whenever hard hours exceeded peak slots, which is a
          // routine situation.
          //
          // New logic instead asks a prospective question:
          //   "If I place an easy subject here (a peak slot), will there still
          //    be enough remaining peak slots to accommodate every remaining
          //    hard-subject hour?"
          //
          // If yes → allow it (hard subjects can still get what they need).
          // If no  → block it (we must reserve this peak slot for a hard subject).
          //
          // On off-peak slots the symmetrical check applies: block hard subjects
          // from off-peak slots only while there are enough peak slots still
          // ahead to cover ALL of their remaining hours. Once hard subjects have
          // exhausted the available peak slots, they flow naturally into off-peak
          // (graceful overflow) without any solver failure.
          if (prioritize) {
            const dVal   = subjectsMap[name].difficulty;
            const isHard = dVal >= 4;

            // Peak slots remaining from this position onward (inclusive of current)
            const peakSlotsRemaining = slotIsPeak.slice(idx).filter(Boolean).length;

            // Hard-subject hours still unplaced, simulating this candidate being placed
            const hardHoursRemaining = Object.keys(subjectsMap).reduce((sum, n) => {
              if (subjectsMap[n].difficulty < 4) return sum;
              const rem = remainingHours[n] - (n === name ? 1 : 0);
              return sum + Math.max(0, rem);
            }, 0);

            if (isPeak && !isHard) {
              // Placing an easy subject in a peak slot:
              // Block only if peak slots left after this one < hard hours still needed.
              const peakSlotsAfterThis = peakSlotsRemaining - 1;
              if (peakSlotsAfterThis < hardHoursRemaining) continue;
            }

            if (!isPeak && isHard) {
              // Placing a hard subject in an off-peak slot (overflow):
              // Block while enough peak slots still exist ahead to cover all remaining
              // hard hours. Once peak slots are genuinely exhausted, let it overflow.
              if (peakSlotsRemaining >= hardHoursRemaining + 1) continue;
            }
          }

          // Spread constraint (unchanged)
          if (spread) {
            const cur = daySubjectCounts[day][name] ?? 0;
            if (cur >= maxPerDay[name]) continue;
          }

          // Difficulty-separation constraint
          // Prevents two consecutive hard subjects on the same day in adjacent hours.
          //
          // Exception: if peak-priority is active and this is a peak slot, the
          // separation rule yields when there are not enough peak slots remaining
          // to cover all hard-subject hours without using this one. The user's
          // explicit peak preferences outweigh the separation comfort heuristic.
          if (diff && subjectsMap[name].difficulty >= 4) {
            if (idx > 0) {
              const [prevDay, prevHour] = activeSlots[idx - 1];
              if (prevDay === day && prevHour === hour - 1) {
                const prevName = assignment[idx - 1];
                if (prevName && subjectsMap[prevName].difficulty >= 4) {
                  let mustUsePeakSlot = false;
                  if (prioritize && isPeak) {
                    const peakSlotsRemaining = slotIsPeak.slice(idx).filter(Boolean).length;
                    // NOTE: do NOT subtract 1 for the current candidate here.
                    // We are asking "how many hard hours still need a peak slot,
                    // INCLUDING this one we haven't placed yet?" — that is what
                    // determines whether we absolutely must use this peak slot.
                    const hardHoursNeedingPeak = Object.keys(subjectsMap).reduce((sum, n) => {
                      if (subjectsMap[n].difficulty < 4) return sum;
                      return sum + Math.max(0, remainingHours[n]);
                    }, 0);
                    mustUsePeakSlot = (peakSlotsRemaining - 1) < hardHoursNeedingPeak;
                  }
                  if (!mustUsePeakSlot) continue;
                }
              }
            }
          }

          // Assign
          assignment[idx] = name;
          remainingHours[name]--;
          daySubjectCounts[day][name] = (daySubjectCounts[day][name] ?? 0) + 1;

          if (backtrack(idx + 1)) return true;

          // Undo
          assignment[idx]  = null;
          remainingHours[name]++;
          daySubjectCounts[day][name]--;
        }
        return false;
      }

      if (backtrack(0)) {
        // Ensure every "big" day has at least one subject (unchanged)
        let bigOk = true;
        for (const dIdx of bigDays) {
          const total = Object.values(daySubjectCounts[dIdx] ?? {}).reduce((a, b) => a + b, 0);
          if (total === 0) { bigOk = false; break; }
        }
        if (!bigOk) continue;

        const schedule = {};
        DAYS_MAP.forEach(d => (schedule[d] = []));
        activeSlots.forEach(([dIdx, hr], i) => {
          const subj = assignment[i];
          schedule[DAYS_MAP[dIdx]].push({ subject: subj, hour: hr, slot_idx: dIdx * 24 + hr });
        });
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

  return {
    success: false,
    error: "Strict math constraints failed. Possible reasons:\n" +
           "1. Too many high-difficulty subjects to separate.\n" +
           "2. Subject hours cannot be evenly distributed across selected days.\n" +
           "Try adding more days or relaxing your load."
  };
}

module.exports = { solveTimetable };
