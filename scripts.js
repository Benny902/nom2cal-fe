console.log("Script loaded");

const calendarColors = {
    'הרצליה': '#f57c00',      // orange
    'ראש העין': '#009688',    // green
    'ראשון לציון': '#9c27b0'  // purple
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

    // Close modal on X
    modalClose.addEventListener('click', () => {
      modal.classList.add('hidden');
    });
  
    // Close modal on background click
    modal.addEventListener('click', (e) => {
      if (e.target.id === 'event-modal') {
        modal.classList.add('hidden');
      }
    });
  
    fetch('http://localhost:5000/events')
      .then(response => response.json())
      .then(data => {
        const events = [];
        const activeCalendars = {};
  
        data.forEach(calendarData => {
          const name = calendarData.calendar;
          const color = calendarColors[name] || '#039be5';
          activeCalendars[name] = true;
  
          // Legend checkbox UI
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
  
          // Add events
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
  
        // Init FullCalendar
        
        // Determine scrollTime before initializing calendar
        let scrollTime = '08:00:00';
        const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start));
        if (sortedEvents.length > 0) {
        const firstHour = new Date(sortedEvents[0].start).getHours();
        const scrollHour = Math.max(firstHour - 1, 8);
        scrollTime = `${scrollHour}:00:00`;
        }
        
        const calendarEl = document.getElementById('calendar');
        calendar = new FullCalendar.Calendar(calendarEl, {
            initialView: 'dayGridMonth',
            locale: 'he',
            direction: 'rtl',
            height: 'auto',
            scrollTime: scrollTime, // Used when switching to timeGridDay/week
            slotMinTime: "08:00:00",
            slotMaxTime: "24:00:00",
            headerToolbar: {
                start: 'title',
                center: '',
                end: 'today prev,next dayGridMonth,timeGridWeek,timeGridDay'
            },
            events: function (fetchInfo, successCallback) {
                const filtered = events.filter(e => activeCalendars[e.extendedProps.calendar]);
                successCallback(filtered);
            },
            datesSet: function(viewInfo) {
                if (viewInfo.view.type === 'timeGridDay' || viewInfo.view.type === 'timeGridWeek') {
                const sorted = calendar.getEvents()
                    .filter(e => e.start)
                    .sort((a, b) => new Date(a.start) - new Date(b.start));
                if (sorted.length > 0) {
                    const hour = new Date(sorted[0].start).getHours();
                    const scrollHour = Math.max(hour - 1, 8);
                    calendar.setOption('scrollTime', `${scrollHour}:00:00`);
                } else {
                    calendar.setOption('scrollTime', '08:00:00');
                }
                }
            },
          eventDidMount: function(info) {
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
          eventClick: function(info) {
            modal.classList.remove('hidden');
          
            document.getElementById('modal-title').textContent = info.event.title;
          
            const start = formatDate(info.event.start);
            const end = formatDate(info.event.end);
            document.getElementById('modal-time').textContent = `${start} ← ${end}`;
          
            document.getElementById('modal-location').textContent =
              info.event.extendedProps.location || '';
          
            document.getElementById('modal-description').innerHTML =
              info.event.extendedProps.description || '';
          
              const eventKey = `${info.event.title}_${info.event.startStr}`;
              const taskListEl = document.getElementById('task-list');
              
              const defaultTemplates = [
                { desc: 'פתיחה', stage: 'תחילה', priority: 'רגיל' },
                { desc: 'ניקוי', stage: 'אמצע', priority: 'נמוך' },
                { desc: 'בדיקת ציוד', stage: 'תחילה', priority: 'דחוף' },
                { desc: 'סגירה', stage: 'סוף', priority: 'רגיל' }
              ];
              
              // STEP 1: Initialize if not present
              let storedTasks = JSON.parse(localStorage.getItem(eventKey));
              if (!storedTasks || storedTasks.length === 0) {
                storedTasks = [...defaultTemplates];
                localStorage.setItem(eventKey, JSON.stringify(storedTasks));
              }
              
              // STEP 2: Render tasks
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
              
                // Delete
                taskListEl.querySelectorAll('.delete-task').forEach(btn => {
                  btn.addEventListener('click', (e) => {
                    const idx = parseInt(e.target.dataset.index);
                    storedTasks.splice(idx, 1);
                    localStorage.setItem(eventKey, JSON.stringify(storedTasks));
                    renderTasks(storedTasks);
                  });
                });
              
                // Edit
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
                      localStorage.setItem(eventKey, JSON.stringify(storedTasks));
                      renderTasks(storedTasks);
                      document.getElementById('new-desc').value = '';
                    };
                  });
                });
              }
              
              renderTasks(storedTasks);
              
              // STEP 3: Add new task (individually)
              document.getElementById('add-task-confirm').onclick = () => {
                const desc = document.getElementById('new-desc').value.trim();
                const stage = document.getElementById('new-stage').value;
                const priority = document.getElementById('new-priority').value;
              
                if (!desc) return;
              
                storedTasks.push({ desc, stage, priority });
                localStorage.setItem(eventKey, JSON.stringify(storedTasks));
                renderTasks(storedTasks);
              
                document.getElementById('new-desc').value = '';
              };
              
              // Shift assignment
              const shiftSelect = document.getElementById('shift-select');
              const shiftLabel = document.getElementById('shift-label');

              // Create dropdown options dynamically
              shiftSelect.innerHTML = '';
              for (let i = 1; i <= 10; i++) {
                const option = document.createElement('option');
                option.value = `עובד${i}`;
                option.textContent = `עובד${i}`;
                shiftSelect.appendChild(option);
              }

              // Load existing shift from localStorage
              let shiftAssignments = JSON.parse(localStorage.getItem('shiftAssignments') || '{}');
              shiftSelect.value = shiftAssignments[eventKey] || 'עובד1';

              // Save on change
              shiftSelect.addEventListener('change', () => {
                shiftAssignments[eventKey] = shiftSelect.value;
                localStorage.setItem('shiftAssignments', JSON.stringify(shiftAssignments));
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