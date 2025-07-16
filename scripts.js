    console.log("Script loaded");

    const BASE_URL = 'http://localhost:5000'; // local backend
    //const BASE_URL = 'https://nom2cal.onrender.com'; // live backend

    const calendarColors = {
      'הרצליה': '#f57c00',
      'ראש העין': '#009688',
      'ראשון לציון': '#9c27b0'
    };

    let calendar;

    const templateStyles = {
      'פתיחה': {
        border: 'green',
        background: '#e8f5e9' // pale green
      },
      'מעטפת': {
        border: 'purple',
        background: '#cdb8d1' // pale purple
      },
      'שוטף': {
        border: 'orange',
        background: '#fff3e0' // pale orange
      },
      'סגירה': {
        border: 'red',
        background: '#ffebee' // pale red
      },
      '': {
        border: 'gold',
        background: '#fffde7' // pale yellow
      }
    };

    window.addEventListener('DOMContentLoaded', () => {
      const legend = document.getElementById('calendar-legend');
      const modal = document.getElementById('event-modal');
      const modalClose = document.getElementById('modal-close');
      const descTextarea = document.getElementById('new-desc');

      document.addEventListener('click', function (e) {
        const shiftToggle = document.getElementById('shift-dropdown');
        const shiftMenu = document.getElementById('shift-checkboxes');
        const templateToggle = document.getElementById('template-dropdown');
        const templateMenu = document.getElementById('template-checkboxes');
      
        if (!shiftToggle.contains(e.target)) {
          shiftMenu.classList.add('hidden');
        }
      
        if (!templateToggle.contains(e.target)) {
          templateMenu.classList.add('hidden');
        }
      });  

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
            initialView: 'timeGridWeek',
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
            buttonText: {
              today: 'היום',
              month: 'חודש',
              week: 'שבוע',
              day: 'יום'
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

                info.el.addEventListener('mouseenter', (e) => {
                  tooltip.style.display = 'block';
                  tooltip.style.left = `${e.pageX + 10}px`;
                  tooltip.style.top = `${e.pageY + 10}px`;
                });            

                info.el.addEventListener('mouseleave', () => {
                  tooltip.style.display = 'none';
                });
              }
            },
    eventClick: function (info) {
      modal.classList.remove('hidden');
      document.getElementById('modal-title').textContent = info.event.title;
      const start = formatDate(info.event.start);
      const end = formatDate(info.event.end);
      document.getElementById('modal-time').textContent = `${start} ← ${end}`;
      document.getElementById('modal-location').textContent = info.event.extendedProps.location || '';
      document.getElementById('modal-description').innerHTML = info.event.extendedProps.description || '';

      const eventKey = `${info.event.title}_${info.event.startStr}`;
      const taskListEl = document.getElementById('task-list');
      const shiftContainer = document.getElementById('shift-checkboxes');

      shiftContainer.innerHTML = '';

      let storedTasks = [];
      let currentShift = [];
      let usedTemplateName = '';
      let selectedTemplateNames = new Set();

      fetch('templates.json')
        .then(response => response.json())
        .then(async (templates) => {
          try {
            const res = await fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`);
            const data = await res.json();
            storedTasks = Array.isArray(data.tasks) ? data.tasks : [];
            
            selectedTemplateNames = new Set(
              storedTasks
                .filter(t => t.source === 'template')
                .map(t => t.template_name)
            );
            
            // Build dropdown
            const templateDropdownToggle = document.getElementById('template-dropdown-toggle');
            const templateCheckboxes = document.getElementById('template-checkboxes');
            templateCheckboxes.innerHTML = ''; // clear
            
            templateDropdownToggle.onclick = () => {
              templateCheckboxes.classList.toggle('hidden');
            };
            
            const orderedTemplateNames = ['פתיחה', 'מעטפת', 'שוטף', 'סגירה'];
            orderedTemplateNames.forEach(templateName => {
              if (!(templateName in templates)) return;          
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
              
                // If now checked, add template tasks
                if (isChecked) {
                  const tasksFromTemplate = templates[templateName].map(task => ({
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

            const templateTask = storedTasks.find(t => t.source === 'template' && t.template_name);
            if (templateTask) {
              usedTemplateName = templateTask.template_name;
            }

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
            const branch = info.event.extendedProps.calendar || '';
            fetch(`${BASE_URL}/save_task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                event_key: eventKey,
                tasks: storedTasks,
                shift: currentShift,
                branch: branch
              })
            }).then(res => res.json()).then(console.log);
          }

          function renderTasks(taskArray, eventStartStr, eventEndStr, selectedTemplateNames) {
            taskListEl.innerHTML = '';

          
            const orderedTemplateNames = ['פתיחה', 'מעטפת', 'שוטף', 'סגירה'];
            const stageOrder = { 'פתיחה': 1, 'מעטפת': 2, 'שוטף': 3, 'סגירה': 4 };
            
            const enrichedTasks = taskArray
            .filter(t => t.source === 'manual' || orderedTemplateNames.includes(t.template_name))
            .map(t => {
              if (t.source === 'manual') return t;  // keep template_name as is
              const name = t.template_name || t.task_stage || t.stage || '';
              return { ...t, template_name: name };
            });          
            
            enrichedTasks.sort((a, b) => {
              const stageA = a.template_name || a.stage || '';
              const stageB = b.template_name || b.stage || '';
              const stageDiff = (stageOrder[stageA] || 99) - (stageOrder[stageB] || 99);
              if (stageDiff !== 0) return stageDiff;
            
              // Compare todo_time
              const aTime = parseTodoTime(a.todo_time);
              const bTime = parseTodoTime(b.todo_time);
              return aTime - bTime;
            });

            function parseTodoTime(todo) {
              if (!todo || typeof todo !== 'string') return Infinity;
            
              const [prefix, timePart] = todo.split('_');
              if (!timePart || timePart === 'current') return Infinity;
            
              const [h, m] = timePart.split(':').map(Number);
              const minutes = (isNaN(h) ? 0 : h * 60) + (isNaN(m) ? 0 : m);
            
              if (prefix === 'pre') return -10000 + minutes;       // earliest
              if (prefix === 'started') return 0 + minutes;
              if (prefix === 'ended') return 10000 + minutes;      // latest
              return Infinity;
            }
            
            const taskBox = document.createElement('div');
            taskBox.className = 'template-task-box';
            taskBox.innerHTML = `<strong>רשימת המשימות:</strong>`;
            
            enrichedTasks.forEach(task => {
              const trueIndex = storedTasks.indexOf(task);
              //const trueIndex = storedTasks.findIndex(t => t.desc === task.desc && t.stage === task.stage && t.priority === task.priority);
              const executionTime = getTaskExecutionTime(task.todo_time, eventStartStr, eventEndStr, task.template_name, selectedTemplateNames);
            
              const li = document.createElement('li');
              li.innerHTML = `
                <div class="task-card-header">
                  <button class="edit-task" data-index="${trueIndex}" title="ערוך">✏️</button>
                  <div class="task-meta">
                    תזמון: ${task.stage} (${executionTime}) 
                    &nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp; דחיפות: ${task.priority}
                  </div>              
                  <button class="delete-task" data-index="${trueIndex}" title="מחק">🗑️</button>
                </div>
                <div class="task-desc-text">${task.desc}</div>
              `;
            
              const statusWrapper = document.createElement('div');
              statusWrapper.style.display = 'flex';
              statusWrapper.style.alignItems = 'center';
              statusWrapper.style.gap = '10px';
              statusWrapper.style.marginTop = '8px';
            
              const statusEl = document.createElement('div');
              const doneTimestamp = typeof task.done === 'string' && task.done !== 'false' ? formatTime(task.done) : '';
              statusEl.textContent = task.done && task.done !== false
                ? `סטאטוס: בוצע - ${doneTimestamp}`
                : `סטאטוס: לא בוצע - `;
              
              const toggleBtn = document.createElement('button');
              toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
              toggleBtn.title = 'שנה סטאטוס משימה';
            
              toggleBtn.onclick = () => {
                const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(' ', 'T');
              
                // Find and update task in storedTasks
                const trueIndex = storedTasks.findIndex(t =>
                  t.desc === task.desc &&
                  t.stage === task.stage &&
                  t.priority === task.priority &&
                  (t.template_name || '') === (task.template_name || '')
                );
              
                if (trueIndex !== -1) {
                  const updatedTask = storedTasks[trueIndex];
              
                  // Toggle value
                  if (!updatedTask.done || updatedTask.done === false) {
                    updatedTask.done = now;
                  } else {
                    updatedTask.done = false;
                  }
              
                  // Immediately re-render after change
                  renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames);
                  saveToServer();
              
                  // Send message with updated status
                  fetch(`${BASE_URL}/wa-task`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      task: updatedTask.desc,
                      event_key: eventKey,
                      done: !!updatedTask.done
                    })
                  }).then(r => r.json()).then(console.log);
                }
              };
                       
              
              function formatTime(isoStr) {
                const date = new Date(isoStr);
                return date.toLocaleTimeString('he-IL', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: false
                });
              }

              statusWrapper.appendChild(statusEl);
              statusWrapper.appendChild(toggleBtn);
              li.appendChild(statusWrapper);
            
              const template = task.template_name || '';
              const styles = templateStyles[template] || { border: 'gray', background: '#f5f5f5' };
              li.style.backgroundColor = styles.background;
              li.style.border = `3px solid ${styles.border}`;              
              li.style.borderRadius = '6px';
              li.style.padding = '10px';
              li.style.marginBottom = '10px';
            
              taskBox.appendChild(li);
            });
            
            taskListEl.appendChild(taskBox);
                       

            taskListEl.querySelectorAll('.delete-task').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                storedTasks.splice(idx, 1);
                renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);
                saveToServer();
              });
            });

            taskListEl.querySelectorAll('.edit-task').forEach(btn => {
              btn.addEventListener('click', (e) => {
                const idx = parseInt(e.target.dataset.index);
                const task = storedTasks[idx];
                const li = e.target.closest('li');
              
                const inputDesc = document.createElement('textarea');
                inputDesc.value = task.desc;
                inputDesc.rows = 2;
                inputDesc.style.width = '100%';
              
                const stageSelect = document.createElement('select');
                ['פתיחה', 'שוטף', 'סגירה'].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt;
                  option.textContent = opt;
                  if (task.stage === opt) option.selected = true;
                  stageSelect.appendChild(option);
                });
              
                const prioritySelect = document.createElement('select');
                ['נמוך', 'רגיל', 'דחוף'].forEach(opt => {
                  const option = document.createElement('option');
                  option.value = opt;
                  option.textContent = opt;
                  if (task.priority === opt) option.selected = true;
                  prioritySelect.appendChild(option);
                });
              
                const saveBtn = document.createElement('button');
                saveBtn.textContent = '💾';
                saveBtn.title = 'שמור שינויים';
                saveBtn.style.marginRight = '8px';
              
                saveBtn.onclick = () => {
                  task.desc = inputDesc.value.trim();
                  task.stage = stageSelect.value;
                  task.priority = prioritySelect.value;
                  renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);
                  saveToServer();
                };
              
                const descDiv = li.querySelector('.task-desc-text');
                const metaDiv = li.querySelector('.task-meta');
                descDiv.innerHTML = ''; // Clear original
                metaDiv.innerHTML = ''; // Clear original
              
                descDiv.appendChild(inputDesc);
                metaDiv.appendChild(stageSelect);
                metaDiv.appendChild(prioritySelect);
                metaDiv.appendChild(saveBtn);
              });
              
            });
          }

          renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);

          function getTaskExecutionTime(todoTime, startTimeStr, endTimeStr, templateName = '', selectedTemplateNames = new Set()) {
            if (!todoTime || !startTimeStr || !endTimeStr) return '';
          
            const [prefix, ...rest] = todoTime.split('_');
            const timePart = rest.join('_').trim();
          
            if (timePart === 'current') return '';
          
            let offsetMinutes = 0;
            if (timePart.includes(':')) {
              const [h, m] = timePart.split(':').map(x => Number(x.trim()));
              offsetMinutes = h * 60 + m;
            } else {
              console.warn('Invalid time format:', timePart);
              return '';
            }
          
            let baseTime;
          
            if (prefix === 'pre') {
              baseTime = new Date(startTimeStr);
          
              // ✅ Apply 105-minute offset ONLY if:
              // 1. current task is from פתיחה
              // 2. מעטפת is also selected
              const isPtichaWithMaatefet =
                templateName === 'פתיחה' && selectedTemplateNames.has('מעטפת');
          
              const baseOffset = isPtichaWithMaatefet ? 105 : 60;
              baseTime.setMinutes(baseTime.getMinutes() - baseOffset + offsetMinutes);
          
            } else if (prefix === 'started') {
              baseTime = new Date(startTimeStr);
              baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes);
          
            } else if (prefix === 'ended') {
              baseTime = new Date(endTimeStr);
              baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes);
          
            } else {
              console.warn('Unknown prefix:', prefix);
              return '';
            }
          
            const hours = baseTime.getHours().toString().padStart(2, '0');
            const minutes = baseTime.getMinutes().toString().padStart(2, '0');
            return `${hours}:${minutes}`;
          }
          
          
          document.getElementById('add-task-confirm').onclick = () => {
            const desc = document.getElementById('new-desc').value.trim();
            const stage = document.getElementById('new-stage').value;
            const priority = document.getElementById('new-priority').value;
            if (!desc) return;

            let todo_time = '';
            if (stage === 'פתיחה') todo_time = 'pre_00:00';
            else if (stage === 'שוטף') todo_time = 'started_00:00';
            else if (stage === 'סגירה') todo_time = 'ended_00:00';

            storedTasks.push({ desc, stage, priority, source: 'manual', todo_time });

            renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);
            document.getElementById('new-desc').value = '';
            document.getElementById('new-stage').value = 'פתיחה';
            document.getElementById('new-priority').value = 'גבוהה';
            saveToServer();
          };

          fetch('employees.json')
          .then(res => res.json())
          .then(employees => {
            shiftContainer.innerHTML = ''; // clear
        
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
              //label.append(` ${emp.name} (${emp.phone})`);
              label.append(`${emp.name}`);
              shiftContainer.appendChild(label);
            });
          });
        
        });
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
