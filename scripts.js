console.log("Script loaded");

const BASE_URL = 'http://localhost:5000';

const calendarColors = {
  'הרצליה': '#f57c00',
  'ראש העין': '#009688',
  'ראשון לציון': '#9c27b0'
};

let calendar;

window.addEventListener('DOMContentLoaded', () => {
  const legend = document.getElementById('calendar-legend');
  const modal = document.getElementById('event-modal');
  const modalClose = document.getElementById('modal-close');
  const descTextarea = document.getElementById('new-desc');

  if (descTextarea) {
    descTextarea.addEventListener('input', function () {
      this.style.height = 'auto';
      this.style.height = this.scrollHeight + 'px';
    });
  }

  modalClose.addEventListener('click', () => modal.classList.add('hidden'));

  modal.addEventListener('click', (e) => {
    if (e.target.id === 'event-modal') {
      modal.classList.add('hidden');
    }
  });

  fetch(`${BASE_URL}/events`)
    .then(response => response.json())
    .then(data => {
      const events = [];
      const activeCalendars = {};

      data.forEach(calendarData => {
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
        label.textContent = name;
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
        initialView: 'dayGridMonth',
        locale: 'he',
        direction: 'rtl',
        height: 'auto',
        scrollTime: scrollTime,
        slotMinTime: "08:00:00",
        slotMaxTime: "24:00:00",
        headerToolbar: {
          start: 'title',
          center: '',
          end: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay'
        },
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
        },
        eventDidMount: (info) => {
          if (info.event.extendedProps.location) {
            const tooltip = document.createElement('div');
            tooltip.innerHTML = `<strong>${info.event.title}</strong><br>${info.event.extendedProps.location}`;
            tooltip.style.position = 'absolute';
            tooltip.style.backgroundColor = '#fff';
            tooltip.style.padding = '4px';
            tooltip.style.border = '1px solid #ccc';
            tooltip.style.fontSize = '12px';
            tooltip.style.display = 'none';
            document.body.appendChild(tooltip);

            info.el.addEventListener('mouseenter', () => {
              tooltip.style.display = 'block';
              tooltip.style.left = `${info.jsEvent.pageX + 10}px`;
              tooltip.style.top = `${info.jsEvent.pageY + 10}px`;
            });

            info.el.addEventListener('mouseleave', () => {
              tooltip.style.display = 'none';
            });
          }
        },
        eventClick: async function (info) {
          modal.classList.remove('hidden');
          document.getElementById('modal-title').textContent = info.event.title;
          const start = formatDate(info.event.start);
          const end = formatDate(info.event.end);
          document.getElementById('modal-time').textContent = `${start} ← ${end}`;
          document.getElementById('modal-location').textContent = info.event.extendedProps.location || '';
          document.getElementById('modal-description').innerHTML = info.event.extendedProps.description || '';

          const eventKey = `${info.event.title}_${info.event.startStr}`;
          const taskListEl = document.getElementById('task-list');

          const templateSelect = document.getElementById('template-select');
          templateSelect.value = "";

          // Define your templates
          const templates = {
            tasks1: [
              { desc: 'פתיחה', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
              { desc: 'ניקוי', stage: 'אמצע', priority: 'נמוך', source: 'template'  },
              { desc: 'בדיקת ציוד', stage: 'תחילה', priority: 'דחוף', source: 'template'  },
              { desc: 'סגירה', stage: 'סוף', priority: 'רגיל', source: 'template'  }
            ],
            tasks2: [
              { desc: 'הכנה מוקדמת', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
              { desc: 'שירות לקוחות', stage: 'אמצע', priority: 'רגיל', source: 'template'  },
              { desc: 'בדיקות בטיחות', stage: 'סוף', priority: 'דחוף', source: 'template'  }
            ],
            tasks3: [
              { desc: 'משהו3', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks4: [
              { desc: 'משהו4', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks5: [
              { desc: 'משהו5', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks6: [
              { desc: 'משהו6', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks7: [
              { desc: 'משהו7', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks8: [
              { desc: 'משהו8', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks9: [
              { desc: 'משהו9', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
            tasks10: [
              { desc: 'משהו10', stage: 'תחילה', priority: 'רגיל', source: 'template'  },
            ],
          };
          
          // Handle template selection
          templateSelect.onchange = () => {
            const templateKey = templateSelect.value;
            if (templateKey && templates[templateKey]) {
              const templateTasks = templates[templateKey].map(task => ({ ...task, source: 'template' }));
              storedTasks = [
                ...storedTasks.filter(task => task.source !== 'template'),
                ...templateTasks
              ];
              renderTasks(storedTasks);
              saveToServer();
            }
          };                  

          const defaultTemplates = [
            { desc: 'פתיחה', stage: 'תחילה', priority: 'רגיל' },
            { desc: 'ניקוי', stage: 'אמצע', priority: 'נמוך' },
            { desc: 'בדיקת ציוד', stage: 'תחילה', priority: 'דחוף' },
            { desc: 'סגירה', stage: 'סוף', priority: 'רגיל' }
          ];

          let storedTasks = [];
          let currentShift = 'עובד1';

          try {
            const res = await fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`);
            const data = await res.json();
            storedTasks = (data.tasks && data.tasks.length > 0) ? data.tasks : [];
            currentShift = data.shift || 'עובד1';
            const shiftSelect = document.getElementById('shift-select');
            shiftSelect.innerHTML = '';
            for (let i = 1; i <= 10; i++) {
              const option = document.createElement('option');
              option.value = `עובד${i}`;
              option.textContent = `עובד${i}`;
              shiftSelect.appendChild(option);
            }
            shiftSelect.value = currentShift;
            
            // Save initial only once both shift and tasks are ready
            if (storedTasks.length === defaultTemplates.length && !data.shift) {
              saveToServer();
            }
            
            shiftSelect.onchange = () => {
              saveToServer();
            };
            
          } catch (err) {
            storedTasks = [...defaultTemplates];
          }

          function saveToServer() {
            fetch(`${BASE_URL}/save_task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event_key: eventKey,
                tasks: storedTasks,
                shift: shiftSelect.value
              })
            }).then(res => res.json()).then(console.log);
          }

          function renderTasks(taskArray) {
            taskListEl.innerHTML = '';
            taskArray.forEach((task, index) => {
              const li = document.createElement('li');
              li.innerHTML = `
                <div class="task-card-header">
                  <button class="edit-task" data-index="${index}" title="ערוך">✏️</button>
                  <div class="task-meta">תזמון: ${task.stage}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;דחיפות: ${task.priority}</div>
                  <button class="delete-task" data-index="${index}" title="מחק">🗑️</button>
                </div>
                <div class="task-desc-text">${task.desc}</div>
              `;
              taskListEl.appendChild(li);
            });

            taskListEl.querySelectorAll('.delete-task').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                storedTasks.splice(idx, 1);
                renderTasks(storedTasks);
                saveToServer();
              });
            });

            taskListEl.querySelectorAll('.edit-task').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const task = storedTasks[idx];
                document.getElementById('new-desc').value = task.desc;
                document.getElementById('new-stage').value = task.stage;
                document.getElementById('new-priority').value = task.priority;

                document.getElementById('add-task-confirm').onclick = () => {
                  const desc = document.getElementById('new-desc').value.trim();
                  const stage = document.getElementById('new-stage').value;
                  const priority = document.getElementById('new-priority').value;
                  if (!desc) return;

                  storedTasks[idx] = { desc, stage, priority };
                  renderTasks(storedTasks);
                  document.getElementById('new-desc').value = '';
                  saveToServer();
                };
              });
            });
          }

          renderTasks(storedTasks);

          document.getElementById('add-task-confirm').onclick = () => {
            const desc = document.getElementById('new-desc').value.trim();
            const stage = document.getElementById('new-stage').value;
            const priority = document.getElementById('new-priority').value;
            if (!desc) return;

            storedTasks.push({ desc, stage, priority, source: 'manual' });
            renderTasks(storedTasks);
            document.getElementById('new-desc').value = '';
            saveToServer();
          };

          const shiftSelect = document.getElementById('shift-select');
          shiftSelect.innerHTML = '';
          for (let i = 1; i <= 10; i++) {
            const option = document.createElement('option');
            option.value = `עובד${i}`;
            option.textContent = `עובד${i}`;
            shiftSelect.appendChild(option);
          }
          shiftSelect.value = currentShift;

          shiftSelect.onchange = () => {
            saveToServer();
          };
        }
      });

      calendar.render();
    });
});

function formatDate(isoStr) {
  const date = new Date(isoStr);
  const options = {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    weekday: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  };
  return date.toLocaleString('he-IL', options);
}
