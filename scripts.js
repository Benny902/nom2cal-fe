const AUTH_STORAGE_KEY = 'calendar_auth_employee';
const OTHER_KEY = 'calendar_auth_admin';
const IS_EMPLOYEE = true;
localStorage.removeItem(OTHER_KEY); // Clear admin cache if present
    
    
    console.log("Script loaded");

   //const BASE_URL = 'http://localhost:5000'; // local backend
   const BASE_URL = 'https://nom2cal.onrender.com'; // live backend

    const calendarColors = {
      'הרצליה': '#f57c00',
      'ראש העין': '#009688',
      'ראשון לציון': '#9c27b0',
      
        // Arbox
      "ארבוקס הרצליה": "#3498db",   // Blue
      "ארבוקס ראש העין": "#8d6e63",   // Brown
      "ארבוקס ראשון לציון": "#e74c3c"      // Red
    };

    const calendarDisplayNames = { // not needed for now, lets see if asked to change name.
      "ארבוקס הרצליה": "ארבוקס הרצליה",
      "ארבוקס ראש העין": "ארבוקס ראש העין",
      "ארבוקס ראשון לציון": "ארבוקס ראשון לציון"
    };
    
    let calendar;

    function getFormattedManualTime(manualTime) {
      if (!manualTime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(manualTime)) return null;
    
      const date = new Date(manualTime);
      return date.toLocaleTimeString('he-IL', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
        timeZone: 'Asia/Jerusalem'
      });
    }    

    function parseManualTimeToFullISO(hhmm, baseDateStr) {
      if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return '';
      try {
        const [h, m] = hhmm.split(':').map(Number);
        const base = new Date(baseDateStr);
        base.setHours(h, m, 0, 0);
    
        // Convert to Asia/Jerusalem ISO
        const jerusalemTime = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }));
        return jerusalemTime.toISOString();
      } catch {
        return '';
      }
    }    

    function getTimeFromISO(isoStr) {
      const d = new Date(isoStr);
      return d.toTimeString().slice(0, 5); // "HH:MM"
    }

    function generateLetterId(length = 8) {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
    }

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

// Show login modal until authenticated
let AUTHENTICATED = false;

document.addEventListener('DOMContentLoaded', function() {
  const loginModal = document.getElementById('login-modal');
  const loginBtn = document.getElementById('login-btn');
  const passwordInput = document.getElementById('admin-password');
  const loginError = document.getElementById('login-error');

  // Prevent showing the app if not authenticated
  window.startApp = function() {
    const legend = document.getElementById('calendar-legend');
    const modal = document.getElementById('event-modal');
    const modalClose = document.getElementById('modal-close');
    const descTextarea = document.getElementById('new-desc');

    document.addEventListener('click', (e) => {
      const shiftMenu = document.getElementById('shift-checkboxes');
      const shiftToggle = document.getElementById('shift-dropdown');
      if (shiftMenu && shiftToggle && !shiftToggle.contains(e.target)) {
        shiftMenu.classList.add('hidden');
      }

      const templateMenu = document.getElementById('template-checkboxes');
      const templateToggle = document.getElementById('template-dropdown');
      if (templateMenu && templateToggle && !templateToggle.contains(e.target)) {
        templateMenu.classList.add('hidden');
      }

      const dailyTplMenu = document.getElementById('daily-template-options');
      const dailyTplToggle = document.getElementById('daily-template-dropdown-toggle');
      if (dailyTplMenu && dailyTplToggle && !dailyTplToggle.contains(e.target) && !dailyTplMenu.contains(e.target)) {
        dailyTplMenu.classList.add('hidden');
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
          scrollTime: scrollTime,
          slotMinTime: "08:00:00",
          slotMaxTime: "26:00:00",
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

            if (['timeGridWeek', 'timeGridDay'].includes(viewInfo.view.type)) {
              setTimeout(() => {
                const dayHeaders = document.querySelectorAll('.fc-col-header-cell');
                dayHeaders.forEach(header => {
                  const btn = document.createElement('button');
                  btn.textContent = '+ משימה יומית';
                  btn.className = 'daily-task-btn';
                  btn.style.opacity = 0.4;
                  btn.title = "הרשאה רק לאדמין";
                  btn.disabled = true; // for <button>, this works in all modern browsers
                  btn.onclick = null;  // removes any previous handler
                  if (!header.querySelector('.daily-task-btn')) {
                    header.appendChild(btn);
                  }
                });
              }, 0);
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
            const isDaily = info.event.title.startsWith('[משימה יומית]');
            const eventKey = isDaily
              ? `DAILY_${info.event.startStr.substring(0, 10)}_${info.event.extendedProps.calendar}`
              : `${info.event.title}_${info.event.startStr}_${info.event.extendedProps.calendar}`;
          
              if (isDaily) {
                info.jsEvent.stopPropagation();
                const eventKey = info.event.extendedProps.event_key;  // use stored key
                const dateStr = info.event.startStr.substring(0, 10);
                const branch = info.event.extendedProps.calendar || '';
          
                // Prepare the modal for editing
                const modal = document.getElementById('daily-task-modal');
                document.getElementById('daily-task-modal-title').textContent = 'משימה יומית';
                modal.dataset.date = dateStr;
                document.getElementById('daily-task-edit-key').value = eventKey;
                document.getElementById('daily-task-branch').value = branch;
                modal.classList.remove('hidden');
              
                function formatTime(isoStr) {
                  const date = new Date(isoStr);
                  return date.toLocaleTimeString('he-IL', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });
                }

                // Fetch the existing task
                fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`)
                  .then(res => res.json())
                  .then(data => {
                    const task = data.tasks?.[0];
                    if (!task) return;
              
                    document.getElementById('daily-task-desc').value = task.desc || '';
                    const descEl = document.getElementById('daily-task-desc');
                    descEl.style.height = "auto"; // Reset height first!
                    descEl.style.height = descEl.scrollHeight + "px";
                    const [hh, mm] = getTimeFromISO(task.manual_todo_time || task.todo_time).split(':');
                    document.getElementById('daily-task-hour').value   = hh;
                    document.getElementById('daily-task-minute').value = mm;
                    document.getElementById('daily-task-priority').value = task.priority || 'רגיל';
                    document.getElementById('daily-task-stage').value = task.stage || 'פתיחה';
                    document.getElementById('daily-task-branch').value = branch;


                    // 1. Find or create the container for the toggle
                    let statusRow = document.getElementById('daily-task-status-row');
                    if (!statusRow) {
                      statusRow = document.createElement('div');
                      statusRow.id = 'daily-task-status-row';
                      statusRow.style.margin = '12px 0';
                      // Insert just after the desc textarea (or wherever you want)
                      descEl.parentNode.insertBefore(statusRow, descEl.nextSibling);
                    }

                    // 2. Create the toggle button and status label
                    statusRow.innerHTML = ''; // clear previous
                    const statusBtn = document.createElement('button');
                    const statusLabel = document.createElement('span');
                    statusLabel.style.marginRight = '10px';

                    // 3. Set button text and label based on current status
                    const doneNow = task.done && task.done !== "false";
                    const doneTimestamp = typeof task.done === 'string' && task.done !== 'false'
                      ? formatTime(task.done)
                      : '';

                    statusLabel.textContent = task.done && task.done !== false
                      ? `סטאטוס: בוצע - ${doneTimestamp}`
                      : `סטאטוס: לא בוצע - `;

                    statusBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';

                    // 4. Button logic: toggle and update server
                    statusBtn.onclick = function() {
                      const newDone = !doneNow;
                      const updatedTask = { ...task, done: newDone ? new Date().toISOString() : false };

                      fetch(`${BASE_URL}/save_task`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          event_key: eventKey,
                          tasks: [updatedTask],
                          shift: task.shift || ['none'],
                          branch: branch
                        })
                      }).then(() => {
                        // Update UI immediately
                        statusLabel.textContent = updatedTask.done && updatedTask.done !== false
                          ? `סטאטוס: בוצע - ${formatTime(updatedTask.done)}`
                          : `סטאטוס: לא בוצע - `;
                        
                        statusBtn.textContent = updatedTask.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
                        

                        fetch(`${BASE_URL}/wa-task`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            task: updatedTask.desc,
                            event_key: eventKey,
                            done: !!updatedTask.done
                          })
                        }).then(r => r.json()).then(console.log);
                        // Optionally: location.reload();
                      });
                    };

                    // 5. Add to modal
                    statusRow.appendChild(statusLabel);
                    statusRow.appendChild(statusBtn);


                    fetch(`${BASE_URL}/get_employees`)
                    .then(res => res.json())
                    .then(data => {
                      const employees = Array.isArray(data) ? data : (data.employees || []);
                      const shiftContainer = document.getElementById('daily-shift-checkboxes');
                      const toggle = document.getElementById('daily-shift-dropdown-toggle');
                      if (toggle) {
                        toggle.style.opacity = 0.4;
                        toggle.title = "הרשאה רק לאדמין";
                        toggle.onclick = null;
                      }

                      document.addEventListener('click', function (e) {
                        const toggle = document.getElementById('daily-shift-dropdown-toggle');
                        const menu = document.getElementById('daily-shift-checkboxes');
                      
                        if (toggle && menu && !toggle.contains(e.target) && !menu.contains(e.target)) {
                          menu.classList.add('hidden');
                        }
                      });

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
                    });

                // —— Template dropdown setup ——
                  const tplToggle    = document.getElementById('daily-template-dropdown-toggle');
                  const tplContainer = document.getElementById('daily-template-options');

                  tplToggle.onclick = () => tplContainer.classList.toggle('hidden');
                  tplContainer.innerHTML = '';

                  fetch(`${BASE_URL}/get_templates`)
                    .then(r => r.json())
                    .then(allTemplates => {
                      Object.keys(allTemplates)
                        .filter(name => /^daily\d+$/.test(name))   // daily1…daily99
                        .forEach(key => {
                          const label = document.createElement('label');
                          label.textContent = key;
                          label.style.cursor = 'pointer';

                          label.addEventListener('click', () => {
                            const descEl      = document.getElementById('daily-task-desc');
                            descEl.style.height = "auto"; // Reset height first!
                            descEl.style.height = descEl.scrollHeight + "px";
                            const templates   = allTemplates[key] || [];
                            const templateDesc= templates[0]?.desc;

                            if (!templateDesc) {
                              console.warn('no desc for', key);
                              return;
                            }

                            // 1) append into the textarea
                            descEl.value += (descEl.value ? ' ' : '') + templateDesc +'\n';

                            // 2) auto-resize it so you actually see it
                            descEl.style.height = 'auto';
                            descEl.style.height = descEl.scrollHeight + 'px';

                            // 3) hide the dropdown
                            tplContainer.classList.add('hidden');
                          });

                          tplContainer.appendChild(label);
                        });
                    })
                    .catch(console.error);

                  });  
                return;
              }      
              
            modal.classList.remove('hidden');
            document.getElementById('modal-title').textContent = info.event.title;
            const start = formatDate(info.event.start);
            const end = formatDate(info.event.end);
            document.getElementById('modal-time').textContent = `${start} ← ${end}`;
            document.getElementById('modal-location').textContent = info.event.extendedProps.location || '';
            const pre = document.getElementById('modal-description');
            pre.textContent = info.event.extendedProps.description || '';

            const taskListEl = document.getElementById('task-list');
            const shiftContainer = document.getElementById('shift-checkboxes');

            shiftContainer.innerHTML = '';

            let storedTasks = [];
            let currentShift = [];
            let usedTemplateName = '';
            let selectedTemplateNames = new Set();

            fetch(`${BASE_URL}/get_templates`)
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
                  
                  if (templateDropdownToggle) {
                    templateDropdownToggle.style.opacity = 0.4;
                    templateDropdownToggle.title = "הרשאה רק לאדמין";
                    templateDropdownToggle.onclick = null;
                  }
                  
                  // Dynamically get unique template names from the templates object, ordered as they appear
                  const orderedTemplateNames = Object.keys(templates).filter(
                    name => !name.includes('daily') && !name.includes('יומית')  && !name.includes('יומי')
                  );

                  orderedTemplateNames.forEach(templateName => {
                    //if (!(templateName in templates)) return;          
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
                  storedTasks = storedTasks.map(task => {
                    if (
                      task.source === 'template' &&
                      (!task.manual_todo_time || task.manual_todo_time === '')
                    ) {
                      const execTimeStr = getTaskExecutionTime(
                        task.todo_time,
                        info.event.startStr,
                        info.event.endStr,
                        task.template_name,
                        selectedTemplateNames,
                        ''
                      );
                      const fullIso = parseManualTimeToFullISO(execTimeStr, info.event.startStr);
                      return { ...task, manual_todo_time: fullIso };
                    }
                    return task;
                  });
                
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

                
                  // Dynamically get all unique template names from taskArray
                  const orderedTemplateNames = Array.from(
                    new Set(
                      taskArray
                        .map(t => t.template_name)
                        .filter(name => !!name && !name.includes('daily') && !name.includes('יומית'))
                    )
                  );

                  const stageOrder = { 'פתיחה': 1, 'מעטפת': 2, 'שוטף': 3, 'סגירה': 4 };
                  
                  const enrichedTasks = taskArray
                  .filter(t => t.source === 'manual' || orderedTemplateNames.includes(t.template_name))
                  .map(t => {
                    if (t.source === 'manual') return t;  // keep template_name as is
                    const name = t.template_name || t.task_stage || t.stage || '';
                    return { ...t, template_name: name };
                  });          
                  
                  enrichedTasks.sort((a, b) => {
                    const stageA = a.stage || '';
                    const stageB = b.stage || '';
                    const stageDiff = (stageOrder[stageA] || 99) - (stageOrder[stageB] || 99);
                    if (stageDiff !== 0) return stageDiff;
                  
                    // Use manual_todo_time if available
                    const aTime = parseTodoTime(a.manual_todo_time || a.todo_time);
                    const bTime = parseTodoTime(b.manual_todo_time || b.todo_time);
                    return aTime - bTime;
                  });            

                  function parseTodoTime(todo) {
                    if (!todo || typeof todo !== 'string') return Infinity;
                  
                    // If it's an ISO datetime string, treat it as manual
                    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(todo)) {
                      const date = new Date(todo);
                      return date.getHours() * 60 + date.getMinutes();
                    }
                  
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
                    const trueIndex = storedTasks.findIndex(t =>
                      t.desc === task.desc &&
                      t.stage === task.stage &&
                      t.priority === task.priority &&
                      t.todo_time === task.todo_time &&
                      t.manual_todo_time === task.manual_todo_time
                    );              
                    //const trueIndex = storedTasks.indexOf(task);
                    //const trueIndex = storedTasks.findIndex(t => t.desc === task.desc && t.stage === task.stage && t.priority === task.priority);
                    const manualTimeStr = getFormattedManualTime(task.manual_todo_time);
                    const executionTime = manualTimeStr || getTaskExecutionTime(task.todo_time, eventStartStr, eventEndStr, task.template_name, selectedTemplateNames, '');              
                  
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
                  
                    // Color by stage (always)
                    const stageColors = {
                      'פתיחה':   { border: 'green',   background: '#e8f5e9' },
                      'מעטפת':   { border: 'purple',  background: '#cdb8d1' },
                      'שוטף':    { border: 'orange',  background: '#fff3e0' },
                      'סגירה':   { border: 'red',     background: '#ffebee' }
                    };
                    const stageVal = task.stage || '';
                    const colors = stageColors[stageVal] || { border: 'gray', background: '#f5f5f5' };
                    li.style.backgroundColor = colors.background;
                    li.style.border = `3px solid ${colors.border}`;
                    li.style.borderRadius = '6px';
                    li.style.padding = '10px';
                    li.style.marginBottom = '10px';
                  
                    taskBox.appendChild(li);
                  });
                  
                  taskListEl.appendChild(taskBox);
                            
                  // Disable delete and edit for employees
                  taskListEl.querySelectorAll('.delete-task').forEach(btn => {
                    btn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      return false;
                    };
                    btn.disabled = true; // visually disables (optional)
                    btn.style.opacity = 0.4; // faded look
                    btn.title = "הרשאה רק לאדמין";
                  });
                  taskListEl.querySelectorAll('.edit-task').forEach(btn => {
                    btn.onclick = (e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      return false;
                    };
                    btn.disabled = true; // visually disables (optional)
                    btn.style.opacity = 0.4;
                    btn.title = "הרשאה רק לאדמין";
                  });

                }

                renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames);

                function getTaskExecutionTime(todoTime, startTimeStr, endTimeStr, templateName = '', selectedTemplateNames = new Set(), manualTime = '') {
                  const timeSource = (manualTime && manualTime.trim() !== '') ? manualTime.trim() : (todoTime || '').trim();
                
                  if (!timeSource || !startTimeStr || !endTimeStr) return '';
                
                  // Case 1: full ISO format (manual_todo_time)
                  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timeSource)) {
                    const date = new Date(timeSource);
                    const hours = date.getHours().toString().padStart(2, '0');
                    const minutes = date.getMinutes().toString().padStart(2, '0');
                    return `${hours}:${minutes}`;
                  }
                
                  // Case 2: todo_time format with prefix
                  const [prefix, ...rest] = timeSource.split('_');
                  const timePart = rest.join('_').trim();
                  if (!prefix || !timePart || timePart === 'current') return '';
                
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
                
                    // Apply 105-minute offset ONLY if:
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
                
                
                const addBtn = document.getElementById('add-task-confirm');
                if (addBtn) {
                  addBtn.disabled = true;
                  addBtn.style.opacity = 0.4;
                  addBtn.title = "הרשאה רק לאדמין";
                  // Optionally, remove any click handler:
                  addBtn.onclick = null;
                }

                fetch(`${BASE_URL}/get_employees`)
                .then(res => res.json())
                .then(data => {
                  const employees = Array.isArray(data) ? data : (data.employees || []);
                  shiftContainer.innerHTML = ''; // clear
              
                  const shiftDropdownToggle = document.getElementById('shift-dropdown-toggle');
                  if (shiftDropdownToggle) {
                    shiftDropdownToggle.style.opacity = 0.4;
                    shiftDropdownToggle.title = "הרשאה רק לאדמין";
                    shiftDropdownToggle.onclick = null;
                  }
              
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

        fetch(`${BASE_URL}/get_daily_tasks`)
          .then(res => res.json())
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
                extendedProps: { calendar: task.branch, description: `משימה יומית לסניף ${task.branch}`, event_key: task.event_key }
              });
            });
            calendar.refetchEvents();
          })
          .catch(e => console.error(`Daily tasks failed: ${e.message}`));

        document.addEventListener('click', function (event) {
          const modal = document.getElementById('daily-task-modal');
          const content = document.getElementById('daily-task-modal-content');
        
          if (!modal.classList.contains('hidden') &&
              !content.contains(event.target) &&
              !event.target.closest('.daily-task-btn') &&
              !event.target.closest('.fc-event')) {
            modal.classList.add('hidden');
          }
        });

        function openDailyTaskModal(dateStr) {
          const modal = document.getElementById('daily-task-modal');

          document.getElementById('daily-task-edit-key').value = '';
          document.getElementById('daily-task-desc').value     = '';
          const descEl = document.getElementById('daily-task-desc');
          descEl.style.height = "auto"; // Reset height first!
          descEl.style.height = descEl.scrollHeight + "px";
          document.getElementById('daily-task-hour').value   = '';
          document.getElementById('daily-task-minute').value = '';            
          document.getElementById('daily-task-priority').value = 'רגיל';
          document.getElementById('daily-task-stage').value    = 'פתיחה';
          document.getElementById('daily-task-branch').value   = '';

          document.getElementById('daily-task-modal-title').textContent = 'הוספת משימה יומית';

          modal.dataset.date = dateStr;
          modal.classList.remove('hidden');

          fetch(`${BASE_URL}/get_employees`)
          .then(res => res.json())
          .then(data => {
            const employees = Array.isArray(data) ? data : (data.employees || []);
            const shiftContainer = document.getElementById('daily-shift-checkboxes');
            const toggle = document.getElementById('daily-shift-dropdown-toggle');
            if (toggle) {
              toggle.style.opacity = 0.4;
              toggle.title = "הרשאה רק לאדמין";
              toggle.onclick = null;
            }

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
          });

      // —— Template dropdown setup ——
      const tplToggle    = document.getElementById('daily-template-dropdown-toggle');
      const tplContainer = document.getElementById('daily-template-options');

      tplToggle.onclick = () => tplContainer.classList.toggle('hidden');
      tplContainer.innerHTML = '';

      fetch(`${BASE_URL}/get_templates`)
        .then(r => r.json())
        .then(allTemplates => {
          Object.keys(allTemplates)
            .filter(name => /^daily\d+$/.test(name))   // daily1…daily99
            .forEach(key => {
              const label = document.createElement('label');
              label.textContent = key;
              label.style.cursor = 'pointer';

              label.addEventListener('click', () => {
                const descEl      = document.getElementById('daily-task-desc');
                descEl.style.height = "auto"; // Reset height first!
                descEl.style.height = descEl.scrollHeight + "px";
                const templates   = allTemplates[key] || [];
                const templateDesc= templates[0]?.desc;

                if (!templateDesc) {
                  console.warn('no desc for', key);
                  return;
                }

                // 1) append into the textarea
                descEl.value += (descEl.value ? ' ' : '') + templateDesc +'\n';

                // 2) auto-resize it so you actually see it
                descEl.style.height = 'auto';
                descEl.style.height = descEl.scrollHeight + 'px';

                // 3) hide the dropdown
                tplContainer.classList.add('hidden');
              });

              tplContainer.appendChild(label);
            });
        })
        .catch(console.error);


        }
        
        // When saving a daily task (add or edit)
        document.getElementById('daily-task-save').onclick = () => {
          document.getElementById('daily-task-save').onclick = function(e) {
            e.preventDefault();
            return false;
          };
          document.getElementById('daily-task-save').disabled = true;
          document.getElementById('daily-task-save').style.opacity = 0.4;
          document.getElementById('daily-task-save').title = "הרשאה רק לאדמין";
        };

        document.getElementById('daily-task-delete').onclick = function(e) {
          e.preventDefault();
          return false;
        };
        document.getElementById('daily-task-delete').disabled = true;
        document.getElementById('daily-task-delete').style.opacity = 0.4;
        document.getElementById('daily-task-delete').title = "הרשאה רק לאדמין";        
        
      });
  };

  // --- Auto-login using cache ---
  const cache = localStorage.getItem(AUTH_STORAGE_KEY);
  let cached = null;
  if (cache) {
    try { cached = JSON.parse(cache); } catch {}
  }
  if (cached && cached.password && cached.expires && cached.expires > Date.now()) {
    fetch(`${BASE_URL}/employee_auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: cached.password })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
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
        localStorage.removeItem(AUTH_STORAGE_KEY);
        // show login modal as usual
      }
    })
    .catch(() => {
      localStorage.removeItem(AUTH_STORAGE_KEY);
    });
    return; // Don't show login modal while trying auto-login
  }
  // --- End auto-login logic ---

  function tryLogin() {
    const password = passwordInput.value.trim();
    if (!password) {
      loginError.textContent = 'נא להזין סיסמה';
      loginError.style.display = 'block';
      return;
    }
    fetch(`${BASE_URL}/employee_auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
      if (data.ok) {
        // Cache for 10 minutes
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
          password: password,
          expires: Date.now() + 10 * 60 * 1000
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
  passwordInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') tryLogin();
  });


});

