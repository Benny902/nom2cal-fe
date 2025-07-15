console.log("Script loaded");

//const BASE_URL = 'http://localhost:5000'; // local backend
const BASE_URL = 'https://nom2cal.onrender.com'; // live backend

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

  document.addEventListener('click', function (e) {
    const dropdown = document.getElementById('shift-dropdown');
    const menu = document.getElementById('shift-checkboxes');
    if (!dropdown.contains(e.target)) {
      menu.classList.add('hidden');
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

  fetch('templates.json')
    .then(response => response.json())
    .then(async (templates) => {
      try {
        const res = await fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`);
        const data = await res.json();
        storedTasks = (data.tasks && data.tasks.length > 0) ? data.tasks : [];

        const templateTask = storedTasks.find(t => t.source === 'template' && t.template_name);
        if (templateTask) {
          usedTemplateName = templateTask.template_name;
        }

        if (storedTasks.length === 0) {
          const defaultTemplate = 'standard';
          const selectedTasks = templates[defaultTemplate].map(task => ({
            ...task,
            source: 'template',
            template_name: defaultTemplate
          }));
          storedTasks = [...storedTasks, ...selectedTasks];
          usedTemplateName = defaultTemplate;
          saveToServer();
        }

        currentShift = Array.isArray(data.shift) ? data.shift :
          (typeof data.shift === 'string' && data.shift !== 'none') ? [data.shift] : [];

      } catch (err) {
        storedTasks = [];
        currentShift = [];
      }

      const templateSelect = document.getElementById('template-select');
      templateSelect.innerHTML = `
        <option value="standard">תבנית רגילה</option>
        <option value="standard_with_maatefet">תבנית עם מעטפת</option>
      `;
      templateSelect.value = usedTemplateName || 'standard';

      templateSelect.onchange = () => {
        const templateKey = templateSelect.value;
        if (templateKey && templates[templateKey]) {
          storedTasks = storedTasks.filter(t => t.source !== 'template');
      
          const selectedTasks = templates[templateKey].map(task => ({
            ...task,
            source: 'template',
            template_name: templateKey,
            todo_time: task.todo_time || generateTodoTime(task.stage),
            done: false
          }));
      
          storedTasks = [...storedTasks, ...selectedTasks];
          renderTasks(storedTasks);
          saveToServer();
        }
      };
      
      function generateTodoTime(stage) {
        if (stage === 'תחילה') return 'pre_00:00';
        if (stage === 'אמצע') return 'started_00:00';
        if (stage === 'סוף') return 'ended_00:00';
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

      function renderTasks(taskArray) {
        taskListEl.innerHTML = '';
        const templateTasks = taskArray.filter(t => t.source === 'template');
        const manualTasks = taskArray.filter(t => t.source === 'manual');

        if (templateTasks.length) {
          const templateBox = document.createElement('div');
          templateBox.className = 'template-task-box';
          templateBox.innerHTML = `<strong>משימות מהתבנית:</strong>`;
        
          templateTasks.forEach((task) => {
            const li = document.createElement('li');
            li.innerHTML = `
              <div class="task-card-header">
                <div class="task-meta">תזמון: ${task.stage}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;דחיפות: ${task.priority}</div>
              </div>
              <div class="task-desc-text">${task.desc}</div>
            `;
        
            const statusWrapper = document.createElement('div');
            statusWrapper.style.display = 'flex';
            statusWrapper.style.alignItems = 'center';
            statusWrapper.style.gap = '10px'; // space between status and button
            statusWrapper.style.marginTop = '8px';
            
            const statusEl = document.createElement('div');
            statusEl.textContent = `סטאטוס: ${task.done ? 'בוצע - ' : 'לא בוצע - '}`;
            
            const toggleBtn = document.createElement('button');
            toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
            toggleBtn.title = 'שנה סטאטוס משימה';
            
            toggleBtn.onclick = () => {
              task.done = !task.done;
              statusEl.textContent = `סטאטוס: ${task.done ? 'בוצע - ' : 'לא בוצע - '}`;
              toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
              saveToServer();
            
              // Send WhatsApp message on click
              fetch(`${BASE_URL}/wa-task`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  task: task.desc,
                  event_key: eventKey,
                  undone: !task.done // ← use this to switch between בוצע and לא בוצע
                })
              }).then(r => r.json()).then(console.log);
            };
            
            statusWrapper.appendChild(statusEl);
            statusWrapper.appendChild(toggleBtn);
            li.appendChild(statusWrapper);
            templateBox.appendChild(li);
          });
        
          taskListEl.appendChild(templateBox);
        }        

        manualTasks.forEach((task) => {
          const trueIndex = storedTasks.indexOf(task);
          const li = document.createElement('li');
        
          li.innerHTML = `
            <div class="task-card-header">
              <button class="edit-task" data-index="${trueIndex}" title="ערוך">✏️</button>
              <div class="task-meta">תזמון: ${task.stage}&nbsp;&nbsp;&nbsp;|&nbsp;&nbsp;&nbsp;דחיפות: ${task.priority}</div>
              <button class="delete-task" data-index="${trueIndex}" title="מחק">🗑️</button>
            </div>
            <div class="task-desc-text">${task.desc}</div>
          `;
        
          // add done button to manual tasks
          const statusWrapper = document.createElement('div');
          statusWrapper.style.display = 'flex';
          statusWrapper.style.alignItems = 'center';
          statusWrapper.style.gap = '10px'; // space between status and button
          statusWrapper.style.marginTop = '8px';
          
          const statusEl = document.createElement('div');
          statusEl.textContent = `סטאטוס: ${task.done ? 'בוצע - ' : 'לא בוצע - '}`;
          
          const toggleBtn = document.createElement('button');
          toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
          toggleBtn.title = 'שנה סטאטוס משימה';
          
          toggleBtn.onclick = () => {
            task.done = !task.done;
            statusEl.textContent = `סטאטוס: ${task.done ? 'בוצע - ' : 'לא בוצע - '}`;
            toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע';
            saveToServer();
          
            // Send WhatsApp message on click
            fetch(`${BASE_URL}/wa-task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task: task.desc,
                event_key: eventKey,
                undone: !task.done // ← use this to switch between בוצע and לא בוצע
              })
            }).then(r => r.json()).then(console.log);
          };
          
          statusWrapper.appendChild(statusEl);
          statusWrapper.appendChild(toggleBtn);
          li.appendChild(statusWrapper);
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
            const li = e.target.closest('li');
          
            const inputDesc = document.createElement('textarea');
            inputDesc.value = task.desc;
            inputDesc.rows = 2;
            inputDesc.style.width = '100%';
          
            const stageSelect = document.createElement('select');
            ['תחילה', 'אמצע', 'סוף'].forEach(opt => {
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
              renderTasks(storedTasks);
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

      renderTasks(storedTasks);

      document.getElementById('add-task-confirm').onclick = () => {
        const desc = document.getElementById('new-desc').value.trim();
        const stage = document.getElementById('new-stage').value;
        const priority = document.getElementById('new-priority').value;
        if (!desc) return;

        let todo_time = '';
        if (stage === 'תחילה') todo_time = 'pre_00:00';
        else if (stage === 'אמצע') todo_time = 'started_00:00';
        else if (stage === 'סוף') todo_time = 'ended_00:00';

        storedTasks.push({ desc, stage, priority, source: 'manual', todo_time });

        renderTasks(storedTasks);
        document.getElementById('new-desc').value = '';
        document.getElementById('new-stage').value = 'תחילה';
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
