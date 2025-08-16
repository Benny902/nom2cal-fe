/* ========= config ========= */
const AUTH_STORAGE_KEY = 'calendar_auth_admin';
const OTHER_KEY = 'calendar_auth_employee';
const IS_EMPLOYEE = false;
localStorage.removeItem(OTHER_KEY);

console.log("Script loaded");

// const BASE_URL = 'http://localhost:5000'; // local backend
const BASE_URL = 'https://nom2cal.onrender.com'; // live backend

const calendarColors = {
  'הרצליה': '#f57c00',
  'ראש העין': '#009688',
  'ראשון לציון': '#9c27b0',
  "ארבוקס הרצליה": "#3498db",
  "ארבוקס ראש העין": "#8d6e63",
  "ארבוקס ראשון לציון": "#e74c3c"
};

const calendarDisplayNames = {
  "ארבוקס הרצליה": "ארבוקס הרצליה",
  "ארבוקס ראש העין": "ארבוקס ראש העין",
  "ארבוקס ראשון לציון": "ארבוקס ראשון לציון"
};

let calendar;

/* ========= utils ========= */

// Small toast (optional)
function showError(msg) {
  console.error(msg);
}

// Retries + timeout to avoid “stuck” state on flaky network
async function fetchJSON(
  url,
  options = {},
  { timeoutMs = 15000, retries = 2, backoffMs = 600 } = {}
) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  // Enforce CORS mode and avoid cached intermediaries
  const opts = {
    mode: 'cors',
    cache: 'no-store',
    credentials: 'omit',
    ...options,
    signal: controller.signal
  };

  try {
    const res = await fetch(url, opts);
    if (!res.ok) {
      // surface status text but still try retries on gateway-ish failures
      const isGatewayish = res.status === 502 || res.status === 503 || res.status === 504;
      if (retries > 0 && isGatewayish) {
        await new Promise(r => setTimeout(r, backoffMs));
        return fetchJSON(url, options, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 2 });
      }
      throw new Error(`${res.status} ${res.statusText}`);
    }
    return await res.json();
  } catch (e) {
    // retry network/CORS/abort errors
    if (retries > 0) {
      await new Promise(r => setTimeout(r, backoffMs));
      return fetchJSON(url, options, { timeoutMs, retries: retries - 1, backoffMs: backoffMs * 2 });
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function getFormattedManualTime(manualTime) {
  if (!manualTime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(manualTime)) return null;
  const date = new Date(manualTime);
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem'
  });
}

// Build ISO from “HH:mm” + base date (YYYY-MM-DD) in Asia/Jerusalem
function parseManualTimeToFullISO(hhmm, baseDateStr) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
  const [H, M] = hhmm.split(':').map(Number);
  const dateOnly = (baseDateStr || '').substring(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOnly)) return '';

  // Determine the GMT offset for Asia/Jerusalem on that date
  function offsetSuffixIL(isoDate) {
    const probe = new Date(isoDate + 'T12:00:00Z'); // midday = avoid DST edges
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Jerusalem',
      timeZoneName: 'shortOffset',
      year: 'numeric', month: '2-digit', day: '2-digit'
    });
    const tz = fmt.formatToParts(probe).find(p => p.type === 'timeZoneName')?.value || 'GMT+3';
    const m = tz.match(/GMT([+-]\d{1,2})(?::(\d{2}))?/);
    const sign = (m?.[1] || '+3').startsWith('-') ? '-' : '+';
    const hh = String(Math.abs(parseInt(m?.[1] || '3', 10))).padStart(2, '0');
    const mm = m?.[2] || '00';
    return `${sign}${hh}:${mm}`;
  }

  const off = offsetSuffixIL(dateOnly); // +02:00 or +03:00
  const iso = `${dateOnly}T${String(H).padStart(2,'0')}:${String(M).padStart(2,'0')}:00${off}`;
  return new Date(iso).toISOString();   // normalize to Z
}


function getTimeFromISO(isoStr) {
  const d = new Date(isoStr);
  return d.toTimeString().slice(0, 5);
}

function generateLetterId(length = 8) {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

function formatDate(isoStr) {
  const date = new Date(isoStr);
  return date.toLocaleString('he-IL', {
    year: 'numeric', month: 'short', day: 'numeric',
    weekday: 'long', hour: '2-digit', minute: '2-digit', hour12: false
  });
}

/* ========= auth + app ========= */

let AUTHENTICATED = false;

// One global outside-click closer for dropdowns and modals
document.addEventListener('click', (e) => {
  // Shift dropdowns
  const shiftMenu = document.getElementById('shift-checkboxes');
  const shiftToggle = document.getElementById('shift-dropdown');
  if (shiftMenu && shiftToggle && !shiftToggle.contains(e.target)) shiftMenu.classList.add('hidden');

  const templateMenu = document.getElementById('template-checkboxes');
  const templateToggle = document.getElementById('template-dropdown');
  if (templateMenu && templateToggle && !templateToggle.contains(e.target)) templateMenu.classList.add('hidden');

  const dailyTplMenu = document.getElementById('daily-template-options');
  const dailyTplToggle = document.getElementById('daily-template-dropdown-toggle');
  if (dailyTplMenu && dailyTplToggle && !dailyTplToggle.contains(e.target) && !dailyTplMenu.contains(e.target)) {
    dailyTplMenu.classList.add('hidden');
  }

  // Daily modal outside click
  const dailyModal = document.getElementById('daily-task-modal');
  const dailyContent = document.getElementById('daily-task-modal-content');
  if (dailyModal && !dailyModal.classList.contains('hidden') &&
      dailyContent && !dailyContent.contains(e.target) &&
      !e.target.closest('.daily-task-btn') && !e.target.closest('.fc-event')) {
    dailyModal.classList.add('hidden');
  }
});

document.addEventListener('DOMContentLoaded', function () {
  const loginModal   = document.getElementById('login-modal');
  const loginBtn     = document.getElementById('login-btn');
  const passwordInput= document.getElementById('admin-password');
  const loginError   = document.getElementById('login-error');

  window.startApp = function () {
    const legend        = document.getElementById('calendar-legend');
    const modal         = document.getElementById('event-modal');
    const modalClose    = document.getElementById('modal-close');
    const descTextarea  = document.getElementById('new-desc');

    // Auto-resize manual input textarea
    if (descTextarea) {
      descTextarea.addEventListener('input', function () {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
      });
    }

    modalClose?.addEventListener('click', () => modal.classList.add('hidden'));
    modal?.addEventListener('click', (e) => {
      if (e.target.id === 'event-modal') modal.classList.add('hidden');
    });

    // Load events
    fetchJSON(`${BASE_URL}/events`, {}, { retries: 2 })
      .then(data => {
        const events = [];
        const activeCalendars = {};
        legend.innerHTML = '';

        (data || []).forEach(calendarData => {
          if (!calendarData || !Array.isArray(calendarData.events)) return;
          const name = calendarData.calendar;
          const color = calendarColors[name] || '#039be5';
          activeCalendars[name] = true;

          const checkboxWrapper = document.createElement('div');
          checkboxWrapper.className = 'legend-item';

          const checkbox = document.createElement('input');
          checkbox.type = 'checkbox';
          checkbox.id = `toggle-${name}`;
          checkbox.checked = true;
          checkbox.addEventListener('change', (e) => {
            activeCalendars[name] = e.target.checked;
            calendar.refetchEvents();
          });

          const label = document.createElement('label');
          label.htmlFor = checkbox.id;
          label.textContent = calendarDisplayNames[name] || name;
          label.style.color = color;
          label.style.fontWeight = 'bold';

          checkboxWrapper.appendChild(checkbox);
          checkboxWrapper.appendChild(label);
          legend.appendChild(checkboxWrapper);

          calendarData.events.forEach(ev => {
            events.push({
              title: ev.summary,
              start: ev.start,
              end: ev.end,
              extendedProps: {
                calendar: name,
                location: ev.location,
                description: ev.description
              },
              backgroundColor: color,
              borderColor: color
            });
          });
        });

        let scrollTime = '08:00:00';
        const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
        if (sortedEvents.length > 0) {
          const firstHour = new Date(sortedEvents[0].start).getHours();
          scrollTime = `${Math.max(firstHour - 1, 8)}:00:00`;
        }

        const calendarEl = document.getElementById('calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
          initialView: 'timeGridWeek',
          locale: 'he',
          direction: 'rtl',
          height: 'auto',
          timeZone: 'Asia/Jerusalem',
          scrollTime: scrollTime,
          slotMinTime: "08:00:00",
          slotMaxTime: "26:00:00",
          headerToolbar: {
            start: 'title',
            center: '',
            end: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay'
          },
          buttonText: { today: 'היום', month: 'חודש', week: 'שבוע', day: 'יום' },
          events: (fetchInfo, successCallback) => {
            const filtered = events.filter(e => activeCalendars[e.extendedProps.calendar]);
            successCallback(filtered);
          },
          datesSet: (viewInfo) => {
            if (['timeGridDay', 'timeGridWeek'].includes(viewInfo.view.type)) {
              const sorted = calendar.getEvents().filter(e => e.start)
                .sort((a, b) => new Date(a.start) - new Date(b.start));
              const hour = sorted.length ? new Date(sorted[0].start).getHours() : 8;
              calendar.setOption('scrollTime', `${Math.max(hour - 1, 8)}:00:00`);
            }
            // Add "+ משימה יומית" buttons
            requestAnimationFrame(() => {
              const dayHeaders = document.querySelectorAll('.fc-col-header-cell');
              dayHeaders.forEach(header => {
                if (!header.querySelector('.daily-task-btn')) {
                  const btn = document.createElement('button');
                  btn.textContent = '+ משימה יומית';
                  btn.className = 'daily-task-btn';
                  btn.onclick = () => openDailyTaskModal(header.getAttribute('data-date'));
                  header.appendChild(btn);
                }
              });
            });
          },
          eventDidMount: (info) => {
            if (info.event.extendedProps.location) {
              const tooltip = document.createElement('div');
              tooltip.textContent = `${info.event.title} — ${info.event.extendedProps.location}`;
              tooltip.style.position = 'absolute';
              tooltip.style.backgroundColor = '#fff';
              tooltip.style.padding = '4px';
              tooltip.style.border = '1px solid #ccc';
              tooltip.style.fontSize = '12px';
              tooltip.style.display = 'none';
              document.body.appendChild(tooltip);

              const enter = (e) => {
                tooltip.style.display = 'block';
                tooltip.style.left = `${e.pageX + 10}px`;
                tooltip.style.top = `${e.pageY + 10}px`;
              };
              const move = (e) => {
                tooltip.style.left = `${e.pageX + 10}px`;
                tooltip.style.top = `${e.pageY + 10}px`;
              };
              const leave = () => { tooltip.remove(); };

              info.el.addEventListener('mouseenter', enter);
              info.el.addEventListener('mousemove', move);
              info.el.addEventListener('mouseleave', leave);
            }
          },
          // Optional: clean tooltip on unmount
          eventWillUnmount: (info) => { /* tooltips removed on mouseleave */ },
          eventClick: handleEventClick()
        });

        calendar.render();

        // Load daily tasks and add them to the same events array
        fetchJSON(`${BASE_URL}/get_daily_tasks`, {}, { retries: 2 })
          .then(dailyTasks => {
            (dailyTasks || []).forEach(task => {
              if (!task.manual_todo_time || !task.desc || !task.branch) return;
              const start = new Date(task.manual_todo_time);
              const end = new Date(start.getTime() + 60 * 60 * 1000);
              const color = calendarColors[task.branch] || '#607d8b';
              events.push({
                title: `[משימה יומית] ${task.desc}`,
                start: start.toISOString(),
                end: end.toISOString(),
                backgroundColor: color,
                borderColor: color,
                extendedProps: {
                  calendar: task.branch,
                  description: `משימה יומית לסניף ${task.branch}`,
                  event_key: task.event_key
                }
              });
            });
            calendar.refetchEvents();
          })
          .catch((e) => showError(`Daily tasks failed: ${e.message}`));

        // Daily modal helpers (defined inside startApp to keep scope tight)
        function openDailyTaskModal(dateStr) {
          const modal = document.getElementById('daily-task-modal');
          document.getElementById('daily-task-edit-key').value = '';
          const descEl = document.getElementById('daily-task-desc');
          descEl.value = '';
          descEl.style.height = 'auto';
          document.getElementById('daily-task-hour').value = '';
          document.getElementById('daily-task-minute').value = '';
          document.getElementById('daily-task-priority').value = 'רגיל';
          document.getElementById('daily-task-stage').value = 'פתיחה';
          document.getElementById('daily-task-branch').value = '';
          document.getElementById('daily-task-modal-title').textContent = 'הוספת משימה יומית';
          modal.dataset.date = dateStr;
          modal.classList.remove('hidden');

          // Employees
          fetchJSON(`${BASE_URL}/get_employees`, {}, { retries: 2 })
            .then(data => {
              const employees = Array.isArray(data) ? data : (data.employees || []);
              const shiftContainer = document.getElementById('daily-shift-checkboxes');
              const toggle = document.getElementById('daily-shift-dropdown-toggle');
              toggle.onclick = () => shiftContainer.classList.toggle('hidden');
              shiftContainer.innerHTML = '';
              employees.forEach(emp => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = emp.name;
                label.appendChild(checkbox);
                label.append(` ${emp.name}`);
                shiftContainer.appendChild(label);
              });
            })
            .catch((e) => showError(`get_employees failed: ${e.message}`));

          // Daily templates
          const tplToggle    = document.getElementById('daily-template-dropdown-toggle');
          const tplContainer = document.getElementById('daily-template-options');
          tplContainer.innerHTML = '';
          tplToggle.onclick = () => tplContainer.classList.toggle('hidden');

          fetchJSON(`${BASE_URL}/get_templates`, {}, { retries: 2 })
            .then(allTemplates => {
              Object.keys(allTemplates)
                .filter(name => /daily\d+/i.test(name) || name.includes('יומי') || name.includes('יומית'))
                .forEach(key => {
                  const label = document.createElement('label');
                  label.textContent = key;
                  label.style.cursor = 'pointer';
                  label.addEventListener('click', () => {
                    const templates = allTemplates[key] || [];
                    const templateDesc = templates[0]?.desc;
                    if (!templateDesc) return;
                    descEl.value += (descEl.value ? ' ' : '') + templateDesc + '\n';
                    descEl.style.height = 'auto';
                    descEl.style.height = descEl.scrollHeight + 'px';
                    tplContainer.classList.add('hidden');
                  });
                  tplContainer.appendChild(label);
                });
            })
            .catch((e) => showError(`get_templates failed: ${e.message}`));
        }

        document.getElementById('daily-task-cancel')?.addEventListener('click', () => {
          document.getElementById('daily-task-modal').classList.add('hidden');
        });

        document.getElementById('daily-task-save').onclick = () => {
          const date = document.getElementById('daily-task-modal').dataset.date;
          const descEl = document.getElementById('daily-task-desc');
          const desc = descEl.value.trim();
          descEl.style.height = 'auto';
          descEl.style.height = (descEl.scrollHeight + 40) + 'px';
          const hh = Number(document.getElementById('daily-task-hour').value);
          const mm = Number(document.getElementById('daily-task-minute').value);
          const isoTime = parseManualTimeToFullISO(`${hh}:${String(mm).padStart(2,'0')}`, date);
          const priority = document.getElementById('daily-task-priority').value;
          const branch = document.getElementById('daily-task-branch').value;
          const stage = document.getElementById('daily-task-stage').value;
          const existingKey = document.getElementById('daily-task-edit-key').value;

          if (!desc || !branch) return alert("תיאור המשימה וסניף הם שדות חובה");
          if (Number.isNaN(hh) || hh < 0 || hh > 23 || Number.isNaN(mm) || mm < 0 || mm > 59) {
            return alert("נא הזן שעה חוקית בין 0–23 ודקה חוקית בין 0–59");
          }

          const uuid = generateLetterId(8);
          const eventKey = existingKey || `DAILY_${date}_${branch}_${uuid}`;
          const shiftSelected = [...document.querySelectorAll('#daily-shift-checkboxes input:checked')].map(cb => cb.value);
          const finalShift = shiftSelected.length ? shiftSelected : ['none'];

          fetchJSON(`${BASE_URL}/save_task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_key: eventKey,
              tasks: [{
                desc, stage, priority, source: 'manual',
                manual_todo_time: isoTime, todo_time: isoTime,
                template_name: '', done: false
              }],
              shift: finalShift, branch
            })
          }, { retries: 1 })
          .then(() => {
            // Update UI without full reload:
            const start = new Date(isoTime);
            const end = new Date(start.getTime() + 60 * 60 * 1000);
            const color = calendarColors[branch] || '#607d8b';
            const newEvt = {
              title: `[משימה יומית] ${desc}`,
              start: start.toISOString(),
              end: end.toISOString(),
              backgroundColor: color,
              borderColor: color,
              extendedProps: { calendar: branch, description: `משימה יומית לסניף ${branch}`, event_key: eventKey }
            };
            // Inject into current source and refetch
            calendar.addEvent(newEvt);
            calendar.refetchEvents();
            document.getElementById('daily-task-modal').classList.add('hidden');

            // If you prefer old behavior, uncomment:
            // location.reload();
          })
          .catch(e => showError(`save_task failed: ${e.message}`));
        };

        document.getElementById('daily-task-delete').onclick = () => {
          const existingKey = document.getElementById('daily-task-edit-key').value;
          if (!existingKey) return alert("לא ניתן למחוק משימה שלא קיימת");
          if (!confirm("האם אתה בטוח שברצונך למחוק את המשימה?")) return;
          const branch = document.getElementById('daily-task-branch').value || 'ראשון לציון';

          fetchJSON(`${BASE_URL}/save_task`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event_key: existingKey, tasks: [], shift: ['none'], branch
            })
          }, { retries: 1 })
          .then(() => {
            // Remove from calendar view
            calendar.getEvents().forEach(e => {
              if (e.extendedProps?.event_key === existingKey) e.remove();
            });
            calendar.refetchEvents();
            console.log("המשימה נמחקה");
            // Or fallback: location.reload();
          })
          .catch(e => alert("שגיאה במחיקת המשימה: " + e.message));
        };

      })
      .catch(e => showError(`Loading /events failed: ${e.message}`));
  }; // end startApp

  // Helper that returns the eventClick handler (closure over nothing scary)
  function handleEventClick() {
    return function (info) {
      const isDaily = info.event.title.startsWith('[משימה יומית]');
      const regularKey = `${info.event.title}_${info.event.startStr}_${info.event.extendedProps.calendar}`;
      const dailyKey = info.event.extendedProps.event_key;
      const eventKey = isDaily ? dailyKey : regularKey;

      if (isDaily) {
        info.jsEvent.stopPropagation();
        const dateStr = info.event.startStr.substring(0, 10);
        const branch = info.event.extendedProps.calendar || '';
        const modal = document.getElementById('daily-task-modal');
        document.getElementById('daily-task-modal-title').textContent = 'עריכת משימה';
        modal.dataset.date = dateStr;
        document.getElementById('daily-task-edit-key').value = dailyKey || '';
        document.getElementById('daily-task-branch').value = branch;
        modal.classList.remove('hidden');

        fetchJSON(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`, {}, { retries: 1 })
          .then(data => {
            const task = data.tasks?.[0];
            if (!task) return;

            const descEl = document.getElementById('daily-task-desc');
            descEl.value = task.desc || '';
            descEl.style.height = 'auto';
            descEl.style.height = Math.max(descEl.scrollHeight, 40) + 'px';

            const t = getTimeFromISO(task.manual_todo_time || task.todo_time);
            const [hh, mm] = t.split(':');
            document.getElementById('daily-task-hour').value = hh;
            document.getElementById('daily-task-minute').value = mm;
            document.getElementById('daily-task-priority').value = task.priority || 'רגיל';
            document.getElementById('daily-task-stage').value = task.stage || 'פתיחה';
            document.getElementById('daily-task-branch').value = branch;

            // Employees for daily edit
            fetchJSON(`${BASE_URL}/get_employees`, {}, { retries: 1 })
              .then(empData => {
                const employees = Array.isArray(empData) ? empData : (empData.employees || []);
                const shiftContainer = document.getElementById('daily-shift-checkboxes');
                const toggle = document.getElementById('daily-shift-dropdown-toggle');
                toggle.onclick = () => shiftContainer.classList.toggle('hidden');

                shiftContainer.innerHTML = '';
                const selectedShift = Array.isArray(data.shift)
                  ? data.shift
                  : (typeof data.shift === 'string' && data.shift !== 'none' ? [data.shift] : []);
                employees.forEach(emp => {
                  const label = document.createElement('label');
                  const checkbox = document.createElement('input');
                  checkbox.type = 'checkbox';
                  checkbox.value = emp.name;
                  checkbox.checked = selectedShift.includes(emp.name);
                  label.appendChild(checkbox);
                  label.append(` ${emp.name}`);
                  shiftContainer.appendChild(label);
                });
              })
              .catch(e => showError(`get_employees failed: ${e.message}`));

            // Daily template dropdown
            const tplToggle    = document.getElementById('daily-template-dropdown-toggle');
            const tplContainer = document.getElementById('daily-template-options');
            tplContainer.innerHTML = '';
            tplToggle.onclick = () => tplContainer.classList.toggle('hidden');

            fetchJSON(`${BASE_URL}/get_templates`, {}, { retries: 1 })
              .then(allTemplates => {
                Object.keys(allTemplates)
                  .filter(name => /daily\d+/i.test(name) || name.includes('יומי') || name.includes('יומית'))
                  .forEach(key => {
                    const label = document.createElement('label');
                    label.textContent = key;
                    label.style.cursor = 'pointer';
                    label.addEventListener('click', () => {
                      const templates = allTemplates[key] || [];
                      const templateDesc = templates[0]?.desc;
                      if (!templateDesc) return;
                      descEl.value += (descEl.value ? ' ' : '') + templateDesc + '\n';
                      descEl.style.height = 'auto';
                      descEl.style.height = descEl.scrollHeight + 'px';
                      tplContainer.classList.add('hidden');
                    });
                    tplContainer.appendChild(label);
                  });
              })
              .catch(e => showError(`get_templates failed: ${e.message}`));
          })
          .catch(e => showError(`get_task failed: ${e.message}`));

        return;
      }

      // Regular event modal
      const modal = document.getElementById('event-modal');
      modal.classList.remove('hidden');
      document.getElementById('modal-title').textContent = info.event.title;
      const start = formatDate(info.event.start);
      const end = formatDate(info.event.end);
      document.getElementById('modal-time').textContent = `${start} ← ${end}`;
      document.getElementById('modal-location').textContent = info.event.extendedProps.location || '';
      // safer than innerHTML:
      const pre = document.getElementById('modal-description');
      pre.textContent = info.event.extendedProps.description || '';

      const taskListEl = document.getElementById('task-list');
      const shiftContainer = document.getElementById('shift-checkboxes');
      shiftContainer.innerHTML = '';

      let storedTasks = [];
      let currentShift = [];
      let selectedTemplateNames = new Set();

      fetchJSON(`${BASE_URL}/get_templates`, {}, { retries: 1 })
        .then(async (templates) => {
          try {
            const data = await fetchJSON(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`, {}, { retries: 1 });
            storedTasks = Array.isArray(data.tasks) ? data.tasks : [];
            selectedTemplateNames = new Set(
              storedTasks.filter(t => t.source === 'template').map(t => t.template_name)
            );
            // Build template dropdown
            const templateDropdownToggle = document.getElementById('template-dropdown-toggle');
            const templateCheckboxes = document.getElementById('template-checkboxes');
            templateCheckboxes.innerHTML = '';
            templateDropdownToggle.onclick = () => templateCheckboxes.classList.toggle('hidden');

            const orderedTemplateNames = Object.keys(templates).filter(
              name => !name.includes('daily') && !name.includes('יומית') && !name.includes('יומי')
            );

            orderedTemplateNames.forEach(templateName => {
              const label = document.createElement('label');
              const checkbox = document.createElement('input');
              checkbox.type = 'checkbox';
              checkbox.value = templateName;
              checkbox.checked = selectedTemplateNames.has(templateName);

              checkbox.addEventListener('change', () => {
                const isChecked = checkbox.checked;
                // Remove old tasks from this template
                storedTasks = storedTasks.filter(t => !(t.source === 'template' && t.template_name === templateName));
                selectedTemplateNames.delete(templateName);

                if (isChecked) {
                  const tasksFromTemplate = (templates[templateName] || []).map(task => ({
                    ...task,
                    source: 'template',
                    template_name: templateName,
                    todo_time: task.todo_time || generateTodoTime(task.stage),
                    done: false
                  }));
                  storedTasks = [...storedTasks, ...tasksFromTemplate];
                  selectedTemplateNames.add(templateName);
                }

                renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);
                saveToServer();
              });

              label.appendChild(checkbox);
              label.append(` ${templateName}`);
              templateCheckboxes.appendChild(label);
            });

            currentShift = Array.isArray(data.shift) ? data.shift :
              (typeof data.shift === 'string' && data.shift !== 'none') ? [data.shift] : [];

          } catch (err) {
            storedTasks = [];
            currentShift = [];
          }

          function generateTodoTime(stage) {
            if (stage === 'פתיחה') return 'pre_00:00';
            if (stage === 'שוטף') return 'started_00:00';
            if (stage === 'סגירה') return 'ended_00:00';
            return 'unknown_00:00';
          }

          function saveToServer() {
            storedTasks = storedTasks.map(task => {
              if (task.source === 'template' && (!task.manual_todo_time || task.manual_todo_time === '')) {
                // keep empty for "started_current" (only set when "אירוע התחיל")
                if ((task.todo_time || '').trim() === 'started_current') {
                  return task;
                }
                const execTimeStr = getTaskExecutionTime(
                  task.todo_time, info.event.startStr, info.event.endStr, task.template_name, selectedTemplateNames, ''
                );
                const fullIso = parseManualTimeToFullISO(execTimeStr, info.event.startStr);
                return { ...task, manual_todo_time: fullIso };
              }
              return task;
            });

            const branch = info.event.extendedProps.calendar || '';
            fetchJSON(`${BASE_URL}/save_task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event_key: eventKey,
                tasks: storedTasks,
                shift: currentShift.length ? currentShift : ['none'],
                branch
              })
            }).catch(e => showError(`save_task failed: ${e.message}`));
          }

          function renderTasks(taskArray, eventStartStr, eventEndStr, selectedTemplateNames) {
            taskListEl.innerHTML = '';
            const orderedTemplateNames = Array.from(new Set(
              taskArray.map(t => t.template_name).filter(name => !!name && !name.includes('daily') && !name.includes('יומית'))
            ));
            const stageOrder = { 'פתיחה': 1, 'מעטפת': 2, 'שוטף': 3, 'סגירה': 4 };

            const enrichedTasks = taskArray
              .filter(t => t.source === 'manual' || orderedTemplateNames.includes(t.template_name))
              .map(t => {
                if (t.source === 'manual') return t;
                const name = t.template_name || t.task_stage || t.stage || '';
                return { ...t, template_name: name };
              });

            enrichedTasks.sort((a, b) => {
              const stageA = a.stage || ''; const stageB = b.stage || '';
              const stageDiff = (stageOrder[stageA] || 99) - (stageOrder[stageB] || 99);
              if (stageDiff !== 0) return stageDiff;
              const aTime = parseTodoTime(a.manual_todo_time || a.todo_time);
              const bTime = parseTodoTime(b.manual_todo_time || b.todo_time);
              return aTime - bTime;
            });

            function parseTodoTime(todo) {
              if (!todo || typeof todo !== 'string') return Infinity;
              if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(todo)) {
                const date = new Date(todo);
                return date.getHours() * 60 + date.getMinutes();
              }
              const [prefix, timePart] = todo.split('_');
              if (!timePart || timePart === 'current') return Infinity;
              const [h, m] = timePart.split(':').map(Number);
              const minutes = (isNaN(h) ? 0 : h * 60) + (isNaN(m) ? 0 : m);
              if (prefix === 'pre') return -10000 + minutes;
              if (prefix === 'started') return 0 + minutes;
              if (prefix === 'ended') return 10000 + minutes;
              return Infinity;
            }

            const taskBox = document.createElement('div');
            taskBox.className = 'template-task-box';
            taskBox.innerHTML = `<strong>רשימת המשימות:</strong>`;

            if (!taskArray || taskArray.length === 0) {
              const p = document.createElement('p');
              p.style.marginTop = '8px';
              p.style.opacity = '0.8';
              p.textContent = 'אין משימות לאירוע הזה (עדיין).';
              taskBox.appendChild(p);
              taskListEl.appendChild(taskBox);
              return;
            }

            enrichedTasks.forEach((task, idx) => {
              const trueIndex = (function () {
                return (storedTasks || []).findIndex(t =>
                  t.desc === task.desc &&
                  t.stage === task.stage &&
                  t.priority === task.priority &&
                  t.todo_time === task.todo_time &&
                  t.manual_todo_time === task.manual_todo_time
                );
              })();

              const manualTimeStr = getFormattedManualTime(task.manual_todo_time);
              const executionTime = manualTimeStr || getTaskExecutionTime(
                task.todo_time, eventStartStr, eventEndStr, task.template_name, selectedTemplateNames, ''
              );

              const li = document.createElement('li');

              // Header (edit/delete)
              const headerDiv = document.createElement('div');
              headerDiv.className = 'task-card-header';

              const editBtn = document.createElement('button');
              editBtn.className = 'edit-task';
              editBtn.title = 'ערוך';
              editBtn.textContent = '✏️';
              editBtn.dataset.index = String(trueIndex);

              const metaDiv = document.createElement('div');
              metaDiv.className = 'task-meta';
              metaDiv.textContent = `תזמון: ${task.stage} (${executionTime})  |  דחיפות: ${task.priority}`;

              const delBtn = document.createElement('button');
              delBtn.className = 'delete-task';
              delBtn.title = 'מחק';
              delBtn.textContent = '🗑️';
              delBtn.dataset.index = String(trueIndex);

              headerDiv.appendChild(editBtn);
              headerDiv.appendChild(metaDiv);
              headerDiv.appendChild(delBtn);

              // Description
              const descDiv = document.createElement('div');
              descDiv.className = 'task-desc-text';
              descDiv.textContent = task.desc;

              // Status line
              const statusWrapper = document.createElement('div');
              statusWrapper.style.display = 'flex';
              statusWrapper.style.alignItems = 'center';
              statusWrapper.style.gap = '10px';
              statusWrapper.style.marginTop = '8px';

              const statusEl = document.createElement('div');
              const doneTimestamp = typeof task.done === 'string' && task.done !== 'false'
                ? new Date(task.done).toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false })
                : '';
              statusEl.textContent = task.done && task.done !== false
                ? `סטאטוס: בוצע - ${doneTimestamp}`
                : `סטאטוס: לא בוצע - `;

              const toggleBtn = document.createElement('button');
              toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
              toggleBtn.title = 'שנה סטאטוס משימה';
              toggleBtn.onclick = () => {
                const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(' ', 'T');
                const idx = storedTasks.findIndex(t =>
                  t.desc === task.desc && t.stage === task.stage &&
                  t.priority === task.priority && (t.template_name || '') === (task.template_name || '')
                );
                if (idx !== -1) {
                  const updatedTask = storedTasks[idx];
                  updatedTask.done = (!updatedTask.done || updatedTask.done === false) ? now : false;
                  renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames);
                  saveToServer();

                  fetchJSON(`${BASE_URL}/wa-task`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ task: updatedTask.desc, event_key: eventKey, done: !!updatedTask.done })
                  }).catch(e => console.log('wa-task failed', e.message));
                }
              };

              statusWrapper.appendChild(statusEl);
              statusWrapper.appendChild(toggleBtn);

              // Colors
              const stageColors = {
                'פתיחה': { border: 'green', background: '#e8f5e9' },
                'מעטפת': { border: 'purple', background: '#cdb8d1' },
                'שוטף': { border: 'orange', background: '#fff3e0' },
                'סגירה': { border: 'red', background: '#ffebee' }
              };
              const colors = stageColors[task.stage || ''] || { border: 'gray', background: '#f5f5f5' };
              li.style.backgroundColor = colors.background;
              li.style.border = `3px solid ${colors.border}`;
              li.style.borderRadius = '6px';
              li.style.padding = '10px';
              li.style.marginBottom = '10px';

              li.appendChild(headerDiv);
              li.appendChild(descDiv);
              li.appendChild(statusWrapper);

              taskBox.appendChild(li);

              // Delete handler
              delBtn.addEventListener('click', () => {
                if (!confirm("האם אתה בטוח שברצונך למחוק את המשימה?")) return;
                if (trueIndex !== -1) {
                  storedTasks.splice(trueIndex, 1);
                  renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames);
                  saveToServer();
                }
              });

              // Edit handler
              editBtn.addEventListener('click', () => {
                const idx = parseInt(editBtn.dataset.index, 10);
                const task = storedTasks[idx];
                const inputDesc = document.createElement('textarea');
                inputDesc.value = task.desc;
                inputDesc.rows = 2;
                inputDesc.style.width = '100%';

                const stageSelect = document.createElement('select');
                ['פתיחה', 'שוטף', 'סגירה'].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt; option.textContent = opt;
                  if (task.stage === opt) option.selected = true;
                  stageSelect.appendChild(option);
                });

                const prioritySelect = document.createElement('select');
                ['נמוך', 'רגיל', 'דחוף'].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt; option.textContent = opt;
                  if (task.priority === opt) option.selected = true;
                  prioritySelect.appendChild(option);
                });

                const manualTimeInput = document.createElement('input');
                manualTimeInput.type = 'text';
                manualTimeInput.placeholder = 'תזמון ידני (לדוג׳ 17:00)';
                manualTimeInput.value = task.manual_todo_time
                  ? new Date(task.manual_todo_time).toLocaleTimeString('he-IL', {
                      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem'
                    })
                  : '';
                manualTimeInput.style.marginTop = '6px';
                manualTimeInput.style.width = '100%';

                const saveBtn = document.createElement('button');
                saveBtn.textContent = '💾';
                saveBtn.title = 'שמור שינויים';
                saveBtn.style.marginRight = '8px';

                saveBtn.onclick = () => {
                  task.desc = inputDesc.value.trim();
                  task.stage = stageSelect.value;
                  task.priority = prioritySelect.value;
                  const timeStr = manualTimeInput.value.trim();
                  task.manual_todo_time = parseManualTimeToFullISO(timeStr, eventStartStr);
                  renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames);
                  saveToServer();
                };

                // Swap UI
                descDiv.innerHTML = '';
                metaDiv.innerHTML = '';
                descDiv.appendChild(inputDesc);
                metaDiv.appendChild(stageSelect);
                metaDiv.appendChild(manualTimeInput);
                metaDiv.appendChild(prioritySelect);
                metaDiv.appendChild(saveBtn);
              });
            }); // end forEach task

            taskListEl.appendChild(taskBox);
          } // end renderTasks

          renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);

          function getTaskExecutionTime(todoTime, startTimeStr, endTimeStr, templateName = '', selectedTemplateNames = new Set(), manualTime = '') {
            const timeSource = (manualTime && manualTime.trim() !== '') ? manualTime.trim() : (todoTime || '').trim();
            if (!timeSource || !startTimeStr || !endTimeStr) return '';

            if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timeSource)) {
              const date = new Date(timeSource);
              return `${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
            }

            const [prefix, ...rest] = timeSource.split('_');
            const timePart = rest.join('_').trim();
            if (!prefix || !timePart || timePart === 'current') return '';

            let offsetMinutes = 0;
            if (timePart.includes(':')) {
              const [h, m] = timePart.split(':').map(x => Number(x.trim()));
              offsetMinutes = h * 60 + m;
            } else {
              return '';
            }

            let baseTime;
            if (prefix === 'pre') {
              baseTime = new Date(startTimeStr);
              const isPtichaWithMaatefet = templateName === 'פתיחה' && selectedTemplateNames.has('מעטפת');
              const baseOffset = isPtichaWithMaatefet ? 105 : 60;
              baseTime.setMinutes(baseTime.getMinutes() - baseOffset + offsetMinutes);
            } else if (prefix === 'started') {
              baseTime = new Date(startTimeStr);
              baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes);
            } else if (prefix === 'ended') {
              baseTime = new Date(endTimeStr);
              baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes);
            } else {
              return '';
            }

            const hours = String(baseTime.getHours()).padStart(2, '0');
            const minutes = String(baseTime.getMinutes()).padStart(2, '0');
            return `${hours}:${minutes}`;
          }

          // Add single-task add
          document.getElementById('add-task-confirm').onclick = () => {
            const desc = document.getElementById('new-desc').value.trim();
            const stage = document.getElementById('new-stage').value;
            const priority = document.getElementById('new-priority').value;
            const manualTimeInput = document.getElementById('new-manual-time').value.trim();

            if (!desc) return;

            let manual_todo_time = parseManualTimeToFullISO(manualTimeInput, info.event.startStr);
            let todo_time = '';
            if (stage === 'פתיחה') todo_time = 'pre_00:00';
            else if (stage === 'שוטף') todo_time = 'started_00:00';
            else if (stage === 'סגירה') todo_time = 'ended_00:00';

            if (!manual_todo_time) {
              const calculatedTimeStr = getTaskExecutionTime(todo_time, info.event.startStr, info.event.endStr, '', new Set(), '');
              manual_todo_time = parseManualTimeToFullISO(calculatedTimeStr, info.event.startStr);
            }

            storedTasks.push({ desc, stage, priority, source: 'manual', todo_time: manual_todo_time || todo_time, manual_todo_time });
            renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);

            // reset inputs
            document.getElementById('new-desc').value = '';
            document.getElementById('new-manual-time').value = '';
            document.getElementById('new-stage').value = 'פתיחה';
            document.getElementById('new-priority').value = 'רגיל';
            saveToServer();
          };

          // Employees for regular event
          fetchJSON(`${BASE_URL}/get_employees`, {}, { retries: 1 })
            .then(data => {
              const employees = Array.isArray(data) ? data : (data.employees || []);
              shiftContainer.innerHTML = '';
              const shiftDropdownToggle = document.getElementById('shift-dropdown-toggle');
              shiftDropdownToggle.onclick = () => {
                shiftContainer.classList.toggle('hidden');
              };
              employees.forEach(emp => {
                const label = document.createElement('label');
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.value = emp.name;
                checkbox.checked = currentShift.includes(emp.name);
                checkbox.addEventListener('change', () => {
                  const checked = [...shiftContainer.querySelectorAll('input:checked')].map(c => c.value);
                  currentShift = checked.length ? checked : ['none'];
                  saveToServer();
                });
                label.appendChild(checkbox);
                label.append(`${emp.name}`);
                shiftContainer.appendChild(label);
              });
            })
            .catch(e => showError(`get_employees failed: ${e.message}`));

        }); // end get_templates then
    }; // end handler
  } // end handleEventClick

  /* ---- Auto-login using cache ---- */
  const cache = localStorage.getItem(AUTH_STORAGE_KEY);
  let cached = null;
  if (cache) { try { cached = JSON.parse(cache); } catch {} }
  if (cached && cached.password && cached.expires && cached.expires > Date.now()) {
    fetchJSON(`${BASE_URL}/admin_auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cached.password })
    }, { retries: 0 })
    .then(data => {
      if (data.ok) {
        document.getElementById('login-modal').style.display = 'none';
        AUTHENTICATED = true;
        if (typeof startApp === 'function') {
          startApp();
          // Keep-alive ping every 2 minutes while the admin page is open
          setInterval(() => {
            fetch(`${BASE_URL}/health`, { mode: 'cors', cache: 'no-store' }).catch(() => {});
          }, 120000);
        }
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    })
    .catch(() => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    });
    return; // don't show login modal while trying auto login
  }

  function tryLogin() {
    const password = passwordInput.value.trim();
    if (!password) {
      loginError.textContent = 'נא להזין סיסמה';
      loginError.style.display = 'block';
      return;
    }
    fetchJSON(`${BASE_URL}/admin_auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    }, { retries: 0 })
      .then(data => {
        if (data.ok) {
          localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
            password, expires: Date.now() + 10 * 60 * 1000
          }));
          loginModal.style.display = 'none';
          AUTHENTICATED = true;
          if (typeof startApp === 'function') {
            startApp();
            // Keep-alive ping every 2 minutes while the admin page is open
            setInterval(() => {
              fetch(`${BASE_URL}/health`, { mode: 'cors', cache: 'no-store' }).catch(() => {});
            }, 120000);
          }
        } else {
          loginError.textContent = data.reason === 'Wrong password' ? 'סיסמה שגויה' : 'שגיאה לא ידועה';
          loginError.style.display = 'block';
          passwordInput.value = '';
          localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      })
      .catch(() => {
        loginError.textContent = 'שגיאת רשת';
        loginError.style.display = 'block';
        localStorage.removeItem(AUTH_STORAGE_KEY);
      });
  }

  loginBtn.onclick = tryLogin;
  passwordInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') tryLogin();
  });
});


// Keep-alive ping every 2 minutes while the admin page is open
setInterval(() => {
  fetch(`${BASE_URL}/health`, { mode: 'cors', cache: 'no-store' }).catch(() => {});
}, 120000);