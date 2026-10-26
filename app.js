(() => {
  'use strict';

  const STORAGE_KEY = 'mygym-data';
  const SCHEMA_VERSION = 1;
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const FOCUS_COLORS = { Chest: '#ff637f', Back: '#65d9dc', Shoulders: '#ddfa48', Triceps: '#ff9e5e', Biceps: '#c1a4ff', Legs: '#65d9dc', Core: '#ff9e5e', Cardio: '#ff637f', Other: '#a5a7a9' };
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  function emptyData() {
    return { schemaVersion: SCHEMA_VERSION, exercises: [], plan: [], sessions: [] };
  }

  function loadData() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION || !Array.isArray(parsed.exercises) || !Array.isArray(parsed.plan) || !Array.isArray(parsed.sessions)) return emptyData();
      return parsed;
    } catch {
      return emptyData();
    }
  }

  let data = loadData();
  let selectedDate = new Date();
  let toastTimeout;

  function saveData() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      $('#saveState').innerHTML = '<span class="save-dot"></span> Saved on this device';
    } catch {
      showToast('Could not save. Browser storage may be full or unavailable.');
    }
  }

  function id() {
    return globalThis.crypto?.randomUUID?.() ?? `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function dateKey(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function mondayIndex(date) {
    return (date.getDay() + 6) % 7;
  }

  function mondayOf(date) {
    const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    result.setDate(result.getDate() - mondayIndex(result));
    return result;
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove('is-visible'), 2800);
  }

  function sessionFor(day, date = dateKey(selectedDate)) {
    return data.sessions.find(session => session.date === date && session.weekday === day);
  }

  function planFor(day) {
    return data.plan.filter(entry => entry.weekday === day).map(entry => ({ entry, exercise: data.exercises.find(item => item.id === entry.exerciseId) })).filter(item => item.exercise);
  }

  function sortedSessions() {
    return [...data.sessions].sort((a, b) => a.date.localeCompare(b.date));
  }

  function latestCompleted(exerciseId, weekday, beforeDate) {
    return sortedSessions().filter(session => session.weekday === weekday && session.date < beforeDate)
      .flatMap(session => session.exercises.filter(item => item.exerciseId === exerciseId && item.status === 'completed').map(item => ({ date: session.date, exercise: item })))
      .at(-1)?.exercise;
  }

  function priorSkips(exerciseId, weekday, beforeDate) {
    let count = 0;
    const sessions = sortedSessions().filter(session => session.weekday === weekday && session.date < beforeDate);
    for (let index = sessions.length - 1; index >= 0; index -= 1) {
      const record = sessions[index].exercises.find(item => item.exerciseId === exerciseId);
      if (!record || record.status === 'skipped' || sessions[index].status === 'missed') count += 1;
      else if (record.status === 'completed') break;
    }
    return count;
  }

  function makeWorkoutExercise(exercise, entry) {
    const previous = latestCompleted(exercise.id, entry.weekday, dateKey(selectedDate));
    const skips = priorSkips(exercise.id, entry.weekday, dateKey(selectedDate));
    const sets = Array.from({ length: entry.setCount }, (_, index) => {
      const oldSet = previous?.sets?.[index];
      let weight = oldSet?.weight ?? '';
      if (weight !== '' && Number.isFinite(Number(weight))) {
        const adjustment = skips >= 2 ? -2.5 : skips === 1 ? 0 : 2.5;
        weight = Math.max(0, Number(weight) + adjustment);
      }
      return { reps: oldSet?.reps ?? '', weight, done: false };
    });
    return { exerciseId: exercise.id, name: exercise.name, focus: exercise.focus, description: exercise.description, status: 'in-progress', sets };
  }

  function ensureSession(day) {
    let session = sessionFor(day);
    if (session) return session;
    const planned = planFor(day);
    if (!planned.length) return null;
    session = { id: id(), date: dateKey(selectedDate), weekday: day, status: 'in-progress', exercises: planned.map(({ entry, exercise }) => makeWorkoutExercise(exercise, entry)) };
    data.sessions.push(session);
    saveData();
    return session;
  }

  function renderWeek() {
    const monday = mondayOf(selectedDate);
    $('#weekStrip').innerHTML = WEEKDAYS.map((day, index) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + index);
      const planned = data.plan.some(entry => entry.weekday === index);
      const selected = index === mondayIndex(selectedDate);
      return `<button type="button" class="day-button${selected ? ' is-selected' : ''}" data-day="${index}" aria-pressed="${selected}"><span class="day-short">${day.slice(0, 3).toUpperCase()}</span><span class="day-marker${planned ? ' has-plan' : ''}" aria-label="${planned ? 'Workout planned' : 'No workout planned'}"></span></button>`;
    }).join('');
    $$('#weekStrip .day-button').forEach(button => button.addEventListener('click', () => {
      const next = new Date(mondayOf(selectedDate));
      next.setDate(next.getDate() + Number(button.dataset.day));
      selectedDate = next;
      $('#workoutDate').value = dateKey(next);
      renderWorkout();
    }));
  }

  function renderWorkout() {
    const day = mondayIndex(selectedDate);
    const planned = planFor(day);
    const session = sessionFor(day);
    const today = dateKey(new Date()) === dateKey(selectedDate);
    $('#workoutDate').value = dateKey(selectedDate);
    $('#todayLabel').textContent = today ? 'TODAY' : selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase();
    $('#sessionDateLabel').textContent = `${WEEKDAYS[day].toUpperCase()} · ${selectedDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }).toUpperCase()}`;
    $('#dayTitle').textContent = planned.length ? `${WEEKDAYS[day]} session` : (today ? 'A day to reset.' : 'Nothing on the schedule.');
    $('#daySubtitle').textContent = planned.length ? 'One set at a time. You have got this.' : 'No exercises planned for this day. Rest is training, too.';
    $('#exerciseCount').textContent = String(planned.length).padStart(2, '0');
    $('#listCount').textContent = planned.length;
    renderWeek();

    if (!planned.length) {
      $('#exerciseList').innerHTML = `<div class="empty-state"><span class="empty-mark" aria-hidden="true">↗</span><h3>${data.exercises.length ? 'Keep this day open.' : 'Start with your first exercise.'}</h3><p>${data.exercises.length ? 'This is an unscheduled rest day. Your progression only moves when a workout is scheduled.' : 'Add an exercise and place it on any day of your week.'}</p>${data.exercises.length ? '' : '<button class="button button-primary" type="button" data-go-admin>Set up your plan <span aria-hidden="true">↗</span></button>'}</div>`;
      $('#workoutActions').hidden = true;
      $$('[data-go-admin]').forEach(button => button.addEventListener('click', () => switchView('admin')));
      return;
    }

    const current = session ?? (sessionFor(day) ? session : null);
    const records = current?.exercises ?? planned.map(({ entry, exercise }) => makeWorkoutExercise(exercise, entry));
    $('#exerciseList').innerHTML = records.map((item, exerciseIndex) => renderExerciseCard(item, exerciseIndex, current)).join('');
    $('#workoutActions').hidden = Boolean(current?.status === 'completed' || current?.status === 'missed');
    wireExerciseActions(day);
  }

  function renderExerciseCard(item, exerciseIndex, session) {
    const isSkipped = item.status === 'skipped';
    const isComplete = item.status === 'completed';
    const canEdit = !isSkipped && !isComplete && session?.status !== 'completed' && session?.status !== 'missed';
    const allSetsDone = item.sets.length > 0 && item.sets.every(set => set.done === true);
    const doneCount = item.sets.filter(set => set.done === true).length;
    const setsHtml = item.sets.map((set, setIndex) => `<tr class="${set.done ? 'is-set-done' : ''}"><td><span class="set-number">${String(setIndex + 1).padStart(2, '0')}</span></td><td><label class="sr-only" for="reps-${exerciseIndex}-${setIndex}">${escapeHtml(item.name)} set ${setIndex + 1} reps</label><input class="set-input" id="reps-${exerciseIndex}-${setIndex}" type="number" min="0" max="999" inputmode="numeric" placeholder="—" value="${escapeHtml(set.reps)}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="reps" ${canEdit ? '' : 'disabled'}></td><td><label class="sr-only" for="weight-${exerciseIndex}-${setIndex}">${escapeHtml(item.name)} set ${setIndex + 1} weight in kilograms</label><input class="set-input" id="weight-${exerciseIndex}-${setIndex}" type="number" min="0" max="9999" step="0.5" inputmode="decimal" placeholder="—" value="${escapeHtml(set.weight)}" data-exercise="${exerciseIndex}" data-set="${setIndex}" data-field="weight" ${canEdit ? '' : 'disabled'}><span class="unit-label">KG</span></td><td>${canEdit ? `<button class="set-done-button${set.done ? ' is-done' : ''}" type="button" data-toggle-set="${exerciseIndex}" data-set="${setIndex}" aria-pressed="${set.done === true}" aria-label="${set.done ? 'Mark set ' + (setIndex + 1) + ' not done' : 'Mark set ' + (setIndex + 1) + ' done'}">${set.done ? '✓ Done' : '✓ Done?'}</button>` : set.done ? '<span class="set-done-label">✓ DONE</span>' : ''}</td><td>${canEdit ? `<button class="remove-set" type="button" data-remove-set="${exerciseIndex}" data-set="${setIndex}" title="Remove set" aria-label="Remove set ${setIndex + 1}">×</button>` : ''}</td></tr>`).join('');
    const statusText = isSkipped ? 'SKIPPED' : isComplete ? 'COMPLETE' : `${item.sets.length} SETS`;
    return `<article class="exercise-card${isSkipped ? ' is-skipped' : ''}${isComplete ? ' is-complete' : ''}" data-card="${exerciseIndex}">
      <div class="exercise-top"><span class="focus-tag" style="border-color:${FOCUS_COLORS[item.focus] ?? FOCUS_COLORS.Other}">${escapeHtml(item.focus)}</span><div class="exercise-identity"><h4>${escapeHtml(item.name)}</h4><p>${escapeHtml(item.description || 'Log your reps and working weight.')}</p></div><span class="exercise-meta">${item.sets.length} SET${item.sets.length === 1 ? '' : 'S'}</span><span class="exercise-status${isSkipped ? ' skipped' : ''}">${statusText}</span></div>
      ${!isSkipped ? `<div class="set-table-wrap"><table class="set-table"><thead><tr><th>SET</th><th>REPS</th><th>WEIGHT</th><th>DONE</th><th></th></tr></thead><tbody>${setsHtml}</tbody></table></div>` : ''}
      ${canEdit ? `<div class="exercise-controls"><button class="small-action" type="button" data-add-set="${exerciseIndex}">＋ Add set</button><span class="set-progress">${doneCount}/${item.sets.length} SETS DONE</span><button class="small-action" type="button" data-complete-exercise="${exerciseIndex}" ${allSetsDone ? '' : 'disabled'}>✓ Complete exercise</button><button class="small-action danger" type="button" data-skip-exercise="${exerciseIndex}">Skip</button></div>` : ''}
    </article>`;
  }

  function persistExerciseInput(input) {
    const day = mondayIndex(selectedDate);
    const session = ensureSession(day);
    if (!session) return;
    const set = session.exercises[Number(input.dataset.exercise)]?.sets[Number(input.dataset.set)];
    if (!set) return;
    const value = input.value === '' ? '' : Number(input.value);
    if (value !== '' && (!Number.isFinite(value) || value < 0)) {
      input.setCustomValidity('Enter a non-negative number.');
      input.reportValidity();
      return;
    }
    input.setCustomValidity('');
    set[input.dataset.field] = value;
    saveData();
  }

  function wireExerciseActions(day) {
    $$('.set-input').forEach(input => input.addEventListener('input', () => persistExerciseInput(input)));
    $$('[data-toggle-set]').forEach(button => button.addEventListener('click', () => {
      const session = ensureSession(day);
      if (!session) return;
      const set = session.exercises[Number(button.dataset.toggleSet)]?.sets[Number(button.dataset.set)];
      if (!set) return;
      set.done = set.done !== true;
      saveData();
      renderWorkout();
    }));
    $$('[data-add-set]').forEach(button => button.addEventListener('click', () => {
      const session = ensureSession(day);
      if (!session) return;
      session.exercises[Number(button.dataset.addSet)].sets.push({ reps: '', weight: '' });
      saveData();
      renderWorkout();
    }));
    $$('[data-remove-set]').forEach(button => button.addEventListener('click', () => {
      const session = ensureSession(day);
      if (!session) return;
      const exerciseIndex = Number(button.dataset.removeSet);
      session.exercises[exerciseIndex].sets.splice(Number(button.dataset.set), 1);
      saveData();
      renderWorkout();
    }));
    $$('[data-complete-exercise]').forEach(button => button.addEventListener('click', () => {
      const session = ensureSession(day);
      if (!session) return;
      const item = session.exercises[Number(button.dataset.completeExercise)];
      if (!item.sets.length || !item.sets.every(set => set.done === true)) return;
      item.status = 'completed';
      saveData();
      renderWorkout();
    }));
    $$('[data-skip-exercise]').forEach(button => button.addEventListener('click', () => {
      const session = ensureSession(day);
      if (!session) return;
      const item = session.exercises[Number(button.dataset.skipExercise)];
      item.status = 'skipped';
      saveData();
      renderWorkout();
    }));
  }

  function renderAdmin() {
    $('#libraryList').innerHTML = data.exercises.length ? data.exercises.map(exercise => `<div class="library-item"><span class="library-focus" style="background:${FOCUS_COLORS[exercise.focus] ?? FOCUS_COLORS.Other}"></span><div class="library-name"><strong>${escapeHtml(exercise.name)}</strong><span>${escapeHtml(exercise.focus)}${exercise.description ? ` · ${escapeHtml(exercise.description)}` : ''}</span></div><button type="button" data-edit-exercise="${escapeHtml(exercise.id)}" title="Edit ${escapeHtml(exercise.name)}" aria-label="Edit ${escapeHtml(exercise.name)}">✎</button><button class="delete-exercise" type="button" data-delete-exercise="${escapeHtml(exercise.id)}" title="Remove ${escapeHtml(exercise.name)}" aria-label="Remove ${escapeHtml(exercise.name)}">×</button></div>`).join('') : '<p class="admin-empty">Your library is empty. Add an exercise above to start building.</p>';
    $('#scheduleExercise').innerHTML = `<option value="">${data.exercises.length ? 'Choose from your library' : 'Add an exercise first'}</option>${data.exercises.map(item => `<option value="${escapeHtml(item.id)}">${escapeHtml(item.name)}</option>`).join('')}`;
    $('#scheduleExercise').disabled = !data.exercises.length;
    $('#scheduleWeek').innerHTML = WEEKDAYS.map((day, weekday) => {
      const entries = data.plan.filter(entry => entry.weekday === weekday);
      return `<div class="schedule-day"><span class="schedule-day-name">${day.slice(0, 3).toUpperCase()}</span><div class="schedule-entries">${entries.length ? entries.map(entry => {
        const exercise = data.exercises.find(item => item.id === entry.exerciseId);
        if (!exercise) return '';
        return `<div class="schedule-entry"><span class="schedule-entry-name">${escapeHtml(exercise.name)}</span><label class="sr-only" for="plan-${escapeHtml(entry.id)}">Sets for ${escapeHtml(exercise.name)} on ${day}</label><input id="plan-${escapeHtml(entry.id)}" type="number" min="1" max="20" value="${entry.setCount}" data-plan-sets="${escapeHtml(entry.id)}"><span class="schedule-entry-sets">SETS</span><button type="button" data-remove-plan="${escapeHtml(entry.id)}" title="Remove from ${day}" aria-label="Remove ${escapeHtml(exercise.name)} from ${day}">×</button></div>`;
      }).join('') : '<span class="schedule-empty">Rest day</span>'}</div></div>`;
    }).join('');
    renderHistory();
    wireAdminActions();
  }

  function renderHistory() {
    const sessions = [...data.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
    $('#historyCount').textContent = data.sessions.length;
    $('#historyList').innerHTML = sessions.length ? sessions.map(session => {
      const completed = session.exercises.filter(item => item.status === 'completed').length;
      const skipped = session.exercises.filter(item => item.status === 'skipped').length;
      const missed = session.status === 'missed';
      const state = missed ? 'Missed' : session.status === 'completed' ? 'Finished' : 'In progress';
      return `<div class="history-item"><span class="history-symbol${missed ? ' missed' : ''}" aria-hidden="true">${missed ? '×' : '✓'}</span><div class="history-main"><strong>${WEEKDAYS[session.weekday]} · ${new Date(`${session.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</strong><span>${completed} completed${skipped ? ` · ${skipped} skipped` : ''}</span></div><span class="history-status">${state}</span></div>`;
    }).join('') : '<p class="admin-empty">Completed and missed workouts will appear here.</p>';
  }

  function wireAdminActions() {
    $$('[data-edit-exercise]').forEach(button => button.addEventListener('click', () => {
      const exercise = data.exercises.find(item => item.id === button.dataset.editExercise);
      if (!exercise) return;
      $('#exerciseId').value = exercise.id;
      $('#exerciseName').value = exercise.name;
      $('#exerciseFocus').value = exercise.focus;
      $('#exerciseDescription').value = exercise.description;
      $('#saveExerciseButton').innerHTML = 'Save changes <span aria-hidden="true">✓</span>';
      $('#cancelEditButton').hidden = false;
      $('#exerciseName').focus();
    }));
    $$('[data-delete-exercise]').forEach(button => button.addEventListener('click', () => {
      const exercise = data.exercises.find(item => item.id === button.dataset.deleteExercise);
      if (!exercise || !confirm(`Remove ${exercise.name} from your library and weekly plan? Past sessions will remain in your history.`)) return;
      data.exercises = data.exercises.filter(item => item.id !== exercise.id);
      data.plan = data.plan.filter(item => item.exerciseId !== exercise.id);
      saveData();
      renderAdmin();
      renderWorkout();
      showToast('Exercise removed. Past sessions are unchanged.');
    }));
    $$('[data-remove-plan]').forEach(button => button.addEventListener('click', () => {
      data.plan = data.plan.filter(item => item.id !== button.dataset.removePlan);
      saveData();
      renderAdmin();
      renderWorkout();
    }));
    $$('[data-plan-sets]').forEach(input => input.addEventListener('change', () => {
      const count = Number(input.value);
      if (!Number.isInteger(count) || count < 1 || count > 20) {
        input.value = data.plan.find(item => item.id === input.dataset.planSets)?.setCount ?? 3;
        showToast('Planned sets must be between 1 and 20.');
        return;
      }
      const entry = data.plan.find(item => item.id === input.dataset.planSets);
      if (entry) entry.setCount = count;
      saveData();
      renderWorkout();
    }));
  }

  function switchView(view) {
    const isWorkout = view === 'workout';
    $('#workoutView').hidden = !isWorkout;
    $('#adminView').hidden = isWorkout;
    $('#workoutView').classList.toggle('is-visible', isWorkout);
    $('#adminView').classList.toggle('is-visible', !isWorkout);
    $$('.nav-button').forEach(button => button.classList.toggle('is-active', button.dataset.view === view));
    if (!isWorkout) renderAdmin();
    else renderWorkout();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `mygym-backup-${dateKey(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    showToast('Backup exported. Keep it somewhere safe.');
  }

  function validateImport(value) {
    return value && value.schemaVersion === SCHEMA_VERSION && Array.isArray(value.exercises) && Array.isArray(value.plan) && Array.isArray(value.sessions)
      && value.exercises.every(item => item && typeof item.id === 'string' && typeof item.name === 'string' && typeof item.focus === 'string')
      && value.plan.every(item => item && Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 && Number.isInteger(item.setCount) && item.setCount >= 1 && item.setCount <= 20)
      && value.sessions.every(item => item && typeof item.date === 'string' && Number.isInteger(item.weekday) && Array.isArray(item.exercises));
  }

  $('#exerciseForm').addEventListener('submit', event => {
    event.preventDefault();
    const exerciseId = $('#exerciseId').value;
    const exercise = { id: exerciseId || id(), name: $('#exerciseName').value.trim(), focus: $('#exerciseFocus').value, description: $('#exerciseDescription').value.trim() };
    if (!exercise.name) return;
    const existingIndex = data.exercises.findIndex(item => item.id === exerciseId);
    if (existingIndex >= 0) data.exercises[existingIndex] = exercise;
    else data.exercises.push(exercise);
    clearExerciseForm();
    saveData();
    renderAdmin();
    renderWorkout();
    showToast(existingIndex >= 0 ? 'Exercise details updated.' : 'Exercise added to your library.');
  });

  function clearExerciseForm() {
    $('#exerciseForm').reset();
    $('#exerciseId').value = '';
    $('#saveExerciseButton').innerHTML = 'Add to library <span aria-hidden="true">＋</span>';
    $('#cancelEditButton').hidden = true;
  }

  $('#cancelEditButton').addEventListener('click', clearExerciseForm);
  $('#scheduleForm').addEventListener('submit', event => {
    event.preventDefault();
    const exerciseId = $('#scheduleExercise').value;
    const weekday = Number($('#scheduleDay').value);
    const setCount = Number($('#scheduleSets').value);
    if (!exerciseId || !Number.isInteger(setCount) || setCount < 1 || setCount > 20) return;
    const existing = data.plan.find(entry => entry.exerciseId === exerciseId && entry.weekday === weekday);
    if (existing) existing.setCount = setCount;
    else data.plan.push({ id: id(), weekday, exerciseId, setCount });
    saveData();
    renderAdmin();
    renderWorkout();
    showToast(existing ? 'Schedule updated for that day.' : `Added to ${WEEKDAYS[weekday]}.`);
  });

  $('#workoutDate').addEventListener('change', () => {
    const [year, month, day] = $('#workoutDate').value.split('-').map(Number);
    if (!year || !month || !day) return;
    selectedDate = new Date(year, month - 1, day);
    renderWorkout();
  });
  $('#finishDayButton').addEventListener('click', () => {
    const session = ensureSession(mondayIndex(selectedDate));
    if (!session) return;
    if (session.exercises.some(item => item.status === 'in-progress')) {
      showToast('Mark every set done and complete each exercise first.');
      return;
    }
    session.status = 'completed';
    saveData();
    renderWorkout();
    showToast('Workout finished. Nice work.');
  });
  $('#missDayButton').addEventListener('click', () => {
    const session = ensureSession(mondayIndex(selectedDate));
    if (!session || !confirm(`Mark this ${WEEKDAYS[session.weekday]} workout as missed? It will count as a skipped occurrence for progression.`)) return;
    session.exercises.forEach(item => { item.status = 'skipped'; });
    session.status = 'missed';
    saveData();
    renderWorkout();
    showToast('Workout marked as missed.');
  });
  $('#exportButton').addEventListener('click', exportData);
  $('#noteExportButton').addEventListener('click', exportData);
  $('#exportDataButton').addEventListener('click', exportData);
  $('#importFile').addEventListener('change', async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = JSON.parse(await file.text());
      if (!validateImport(imported)) throw new Error('This backup is not a supported MyGym data file.');
      if (!confirm('Replace the data saved in this browser with the selected backup?')) return;
      data = imported;
      saveData();
      renderAdmin();
      renderWorkout();
      showToast('Backup restored.');
    } catch (error) {
      showToast(error instanceof SyntaxError ? 'The selected file is not valid JSON.' : error.message);
    } finally {
      event.target.value = '';
    }
  });
  $$('.nav-button').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }

  renderWorkout();
})();
