console.log("Script loaded")

//const BASE_URL = 'http://localhost:5000'
const BASE_URL = 'https://nom2cal.onrender.com' // live backend

const calendarColors = {
  'הרצליה': '#f57c00',
  'ראש העין': '#009688',
  'ראשון לציון': '#9c27b0'
}

const templateStyles = {
  'פתיחה':   { border: 'green',   background: '#e8f5e9' },
  'מעטפת':   { border: 'purple',  background: '#cdb8d1' },
  'שוטף':    { border: 'orange',  background: '#fff3e0' },
  'סגירה':   { border: 'red',     background: '#ffebee' },
  '':         { border: 'gold',    background: '#fffde7' }
}

let calendar

// ----- CACHING -----
let _employees = null
let _employeesPromise = null
function fetchEmployees() {
  if (_employees) return Promise.resolve(_employees)
  if (_employeesPromise) return _employeesPromise
  _employeesPromise = fetch(`${BASE_URL}/get_employees`)
    .then(r => r.json())
    .then(data => {
      _employees = Array.isArray(data) ? data : (data.employees || [])
      return _employees
    }).catch(err => {
      _employeesPromise = null
      throw err
    })
  return _employeesPromise
}

let _templates = null
let _templatesPromise = null
function fetchTemplates() {
  if (_templates) return Promise.resolve(_templates)
  if (_templatesPromise) return _templatesPromise
  _templatesPromise = fetch(`${BASE_URL}/get_templates`)
    .then(r => r.json())
    .then(data => {
      _templates = data
      return _templates
    }).catch(err => {
      _templatesPromise = null
      throw err
    })
  return _templatesPromise
}

// ----- UTILITIES -----
function getFormattedManualTime(manualTime) {
  if (!manualTime || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(manualTime)) return null
  const date = new Date(manualTime)
  return date.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem' })
}
function parseManualTimeToFullISO(hhmm, baseDateStr) {
  if (!hhmm || !/^\d{1,2}:\d{2}$/.test(hhmm)) return ''
  try {
    const [h, m] = hhmm.split(':').map(Number)
    const base = new Date(baseDateStr)
    base.setHours(h, m, 0, 0)
    const jerusalemTime = new Date(base.toLocaleString("en-US", { timeZone: "Asia/Jerusalem" }))
    return jerusalemTime.toISOString()
  } catch { return '' }
}
function getTimeFromISO(isoStr) {
  const d = new Date(isoStr)
  return d.toTimeString().slice(0, 5)
}
function formatDate(isoStr) {
  const date = new Date(isoStr)
  return date.toLocaleString('he-IL', {
    year: 'numeric', month: 'short', day: 'numeric', weekday: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false
  })
}
function generateLetterId(length = 8) {
  const letters = 'abcdefghijklmnopqrstuvwxyz'
  return Array.from({ length }, () => letters[Math.floor(Math.random() * letters.length)]).join('')
}

// ----- DOM READY -----
window.addEventListener('DOMContentLoaded', () => {
  const legend = document.getElementById('calendar-legend')
  const eventModal = document.getElementById('event-modal')
  const dailyTaskModal = document.getElementById('daily-task-modal')
  const eventModalClose = document.getElementById('modal-close')
  const descTextarea = document.getElementById('new-desc')
  let activeCalendars = {}

  eventModalClose?.addEventListener('click', () => eventModal.classList.add('hidden'))
  eventModal?.addEventListener('click', e => {
    if (e.target.id === 'event-modal') eventModal.classList.add('hidden')
  })
  document.addEventListener('click', function (e) {
    ;[
      ['shift-dropdown', 'shift-checkboxes'],
      ['template-dropdown', 'template-checkboxes'],
      ['daily-template-dropdown-toggle', 'daily-template-options']
    ].forEach(([toggleId, menuId]) => {
      const toggle = document.getElementById(toggleId)
      const menu = document.getElementById(menuId)
      if (toggle && menu && !toggle.contains(e.target) && !menu.contains(e.target))
        menu.classList.add('hidden')
    })
    if (
      !dailyTaskModal.classList.contains('hidden') &&
      !document.getElementById('daily-task-modal-content').contains(e.target) &&
      !e.target.closest('.daily-task-btn') &&
      !e.target.closest('.fc-event')
    ) {
      dailyTaskModal.classList.add('hidden')
    }
  })

  fetch(`${BASE_URL}/events`)
    .then(response => response.json())
    .then(data => {
      const events = []
      activeCalendars = {}

      data.forEach(calendarData => {
        const name = calendarData.calendar
        const color = calendarColors[name] || '#039be5'
        activeCalendars[name] = true

        const checkboxWrapper = document.createElement('div')
        checkboxWrapper.className = 'legend-item'
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.id = `toggle-${name}`
        checkbox.checked = true
        checkbox.addEventListener('change', (e) => {
          activeCalendars[name] = e.target.checked
          calendar.refetchEvents()
        })
        const label = document.createElement('label')
        label.htmlFor = checkbox.id
        label.textContent = name
        label.style.color = color
        label.style.fontWeight = 'bold'
        checkboxWrapper.appendChild(checkbox)
        checkboxWrapper.appendChild(label)
        legend.appendChild(checkboxWrapper)

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
          })
        })
      })

      fetch(`${BASE_URL}/get_daily_tasks`)
        .then(res => res.json())
        .then(dailyTasks => {
          dailyTasks.forEach(task => {
            if (!task.manual_todo_time || !task.desc || !task.branch) return
            const start = new Date(task.manual_todo_time)
            const end = new Date(start.getTime() + 60 * 60 * 1000)
            const color = calendarColors[task.branch] || '#607d8b'
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
            })
          })
          calendar.refetchEvents()
        })

      const calendarEl = document.getElementById('calendar')
      let scrollTime = '08:00:00'
      const sortedEvents = [...events].sort((a, b) => new Date(a.start) - new Date(b.start))
      if (sortedEvents.length > 0) {
        const firstHour = new Date(sortedEvents[0].start).getHours()
        scrollTime = `${Math.max(firstHour - 1, 8)}:00:00`
      }
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
          successCallback(events.filter(e => activeCalendars[e.extendedProps.calendar]))
        },
        datesSet: (viewInfo) => {
          if (['timeGridDay', 'timeGridWeek'].includes(viewInfo.view.type)) {
            const sorted = calendar.getEvents().filter(e => e.start)
              .sort((a, b) => new Date(a.start) - new Date(b.start))
            const hour = sorted.length ? new Date(sorted[0].start).getHours() : 8
            calendar.setOption('scrollTime', `${Math.max(hour - 1, 8)}:00:00`)
          }
          if (['timeGridWeek', 'timeGridDay'].includes(viewInfo.view.type)) {
            setTimeout(() => {
              const dayHeaders = document.querySelectorAll('.fc-col-header-cell')
              dayHeaders.forEach(header => {
                if (!header.querySelector('.daily-task-btn')) {
                  const btn = document.createElement('button')
                  btn.textContent = '+ משימה יומית'
                  btn.className = 'daily-task-btn'
                  btn.onclick = () => openDailyTaskModal(header.getAttribute('data-date'))
                  header.appendChild(btn)
                }
              })
            }, 0)
          }
        },
        eventDidMount: (info) => {
          if (info.event.extendedProps.location) {
            const tooltip = document.createElement('div')
            tooltip.innerHTML = `<strong>${info.event.title}</strong><br>${info.event.extendedProps.location}`
            tooltip.style.position = 'absolute'
            tooltip.style.backgroundColor = '#fff'
            tooltip.style.padding = '4px'
            tooltip.style.border = '1px solid #ccc'
            tooltip.style.fontSize = '12px'
            tooltip.style.display = 'none'
            document.body.appendChild(tooltip)
            info.el.addEventListener('mouseenter', (e) => {
              tooltip.style.display = 'block'
              tooltip.style.left = `${e.pageX + 10}px`
              tooltip.style.top = `${e.pageY + 10}px`
            })
            info.el.addEventListener('mouseleave', () => {
              tooltip.style.display = 'none'
            })
          }
        },
        eventClick: handleEventClick
      })
      calendar.render()
    })

  window.openDailyTaskModal = function (dateStr) {
    const modal = document.getElementById('daily-task-modal')
    document.getElementById('daily-task-edit-key').value = ''
    document.getElementById('daily-task-desc').value = ''
    document.getElementById('daily-task-hour').value = ''
    document.getElementById('daily-task-minute').value = ''
    document.getElementById('daily-task-priority').value = 'רגיל'
    document.getElementById('daily-task-stage').value = 'פתיחה'
    document.getElementById('daily-task-branch').value = ''
    document.getElementById('daily-task-modal-title').textContent = 'הוספת משימה יומית'
    modal.dataset.date = dateStr
    modal.classList.remove('hidden')
    updateDailyTaskShiftDropdown([])
    updateDailyTaskTemplateDropdown()
  }

  document.getElementById('daily-task-save').onclick = () => {
    const date = document.getElementById('daily-task-modal').dataset.date
    const desc = document.getElementById('daily-task-desc').value.trim()
    const hh = parseInt(document.getElementById('daily-task-hour').value, 10)
    const mm = parseInt(document.getElementById('daily-task-minute').value, 10)
    const isoTime = parseManualTimeToFullISO(`${hh}:${mm}`, date)
    const priority = document.getElementById('daily-task-priority').value
    const branch = document.getElementById('daily-task-branch').value
    const stage = document.getElementById('daily-task-stage').value
    const existingKey = document.getElementById('daily-task-edit-key').value

    if (!desc || !branch) {
      alert("תיאור המשימה וסניף הם שדות חובה")
      return
    }
    if (
      isNaN(hh) || hh < 0 || hh > 23 ||
      isNaN(mm) || mm < 0 || mm > 59
    ) {
      return alert("נא הזן שעה חוקית בין 0–23 ודקה חוקית בין 0–59")
    }
    const uuid = generateLetterId(8)
    const eventKey = existingKey || `DAILY_${date}_${branch}_${uuid}`

    const shiftSelected = [
      ...document.querySelectorAll('#daily-shift-checkboxes input:checked')
    ].map(cb => cb.value)
    const finalShift = shiftSelected.length ? shiftSelected : ['none']

    fetch(`${BASE_URL}/save_task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_key: eventKey,
        tasks: [{
          desc, stage, priority, source: 'manual',
          manual_todo_time: isoTime,
          todo_time: isoTime,
          template_name: '', done: false
        }],
        shift: finalShift, branch
      })
    }).then(() => location.reload())
  }
  document.getElementById('daily-task-delete').onclick = () => {
    const existingKey = document.getElementById('daily-task-edit-key').value
    if (!existingKey) {
      alert("לא ניתן למחוק משימה שלא קיימת")
      return
    }
    const confirmed = confirm("האם אתה בטוח שברצונך למחוק את המשימה?")
    if (!confirmed) return
    const branch = document.getElementById('daily-task-branch').value || 'ראשון לציון'
    fetch(`${BASE_URL}/save_task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_key: existingKey, tasks: [], shift: ['none'], branch })
    }).then(() => {
      alert("המשימה נמחקה")
      location.reload()
    }).catch(() => alert("שגיאה במחיקת המשימה"))
  }

  descTextarea?.addEventListener('input', function () {
    this.style.height = 'auto'
    this.style.height = this.scrollHeight + 'px'
  })

  function updateDailyTaskShiftDropdown(selected) {
    fetchEmployees().then(employees => {
      const shiftContainer = document.getElementById('daily-shift-checkboxes')
      const toggle = document.getElementById('daily-shift-dropdown-toggle')
      shiftContainer.innerHTML = ''
      toggle.onclick = () => shiftContainer.classList.toggle('hidden')
      employees.forEach(emp => {
        const label = document.createElement('label')
        const checkbox = document.createElement('input')
        checkbox.type = 'checkbox'
        checkbox.value = emp.name
        checkbox.checked = selected.includes(emp.name)
        label.appendChild(checkbox)
        label.append(` ${emp.name}`)
        shiftContainer.appendChild(label)
      })
    })
  }
  function updateDailyTaskTemplateDropdown() {
    fetchTemplates().then(allTemplates => {
      const tplToggle = document.getElementById('daily-template-dropdown-toggle')
      const tplContainer = document.getElementById('daily-template-options')
      tplContainer.innerHTML = ''
      tplToggle.onclick = () => tplContainer.classList.toggle('hidden')
      Object.keys(allTemplates)
        .filter(name => /^daily\d+$/.test(name))
        .forEach(key => {
          const label = document.createElement('label')
          label.textContent = key
          label.style.cursor = 'pointer'
          label.addEventListener('click', () => {
            const descEl = document.getElementById('daily-task-desc')
            const templates = allTemplates[key] || []
            const templateDesc = templates[0]?.desc
            if (!templateDesc) return
            descEl.value += (descEl.value ? ' ' : '') + templateDesc + '\n'
            descEl.style.height = 'auto'
            descEl.style.height = descEl.scrollHeight + 'px'
            tplContainer.classList.add('hidden')
          })
          tplContainer.appendChild(label)
        })
    })
  }

  function handleEventClick(info) {
    const isDaily = info.event.title.startsWith('[משימה יומית]')
    const eventKey = isDaily
      ? info.event.extendedProps.event_key
      : `${info.event.title}_${info.event.startStr}`
    if (isDaily) {
      info.jsEvent.stopPropagation()
      openEditDailyTaskModal(eventKey, info.event)
      return
    }
    openEventTaskModal(eventKey, info)
  }

  function openEditDailyTaskModal(eventKey, eventObj) {
    fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`)
      .then(res => res.json())
      .then(data => {
        const task = data.tasks?.[0]
        if (!task) return
        const modal = document.getElementById('daily-task-modal')
        modal.classList.remove('hidden')
        document.getElementById('daily-task-modal-title').textContent = 'עריכת משימה'
        document.getElementById('daily-task-edit-key').value = eventKey
        document.getElementById('daily-task-desc').value = task.desc || ''
        if (task.manual_todo_time) {
          const [hh, mm] = getTimeFromISO(task.manual_todo_time).split(':')
          document.getElementById('daily-task-hour').value = hh
          document.getElementById('daily-task-minute').value = mm
        } else {
          document.getElementById('daily-task-hour').value = ''
          document.getElementById('daily-task-minute').value = ''
        }
        document.getElementById('daily-task-priority').value = task.priority || 'רגיל'
        document.getElementById('daily-task-stage').value = task.stage || 'פתיחה'
        document.getElementById('daily-task-branch').value = eventObj.extendedProps.calendar || ''
        updateDailyTaskShiftDropdown(Array.isArray(data.shift) ? data.shift : [])
        updateDailyTaskTemplateDropdown()
      })
  }

  // ----- FULL EVENT TASK MODAL LOGIC -----
  function openEventTaskModal(eventKey, info) {
    const modal = document.getElementById('event-modal')
    modal.classList.remove('hidden')
    document.getElementById('modal-title').textContent = info.event.title
    document.getElementById('modal-time').textContent = `${formatDate(info.event.start)} ← ${formatDate(info.event.end)}`
    document.getElementById('modal-location').textContent = info.event.extendedProps.location || ''
    document.getElementById('modal-description').innerHTML = info.event.extendedProps.description || ''

    const taskListEl = document.getElementById('task-list')
    const shiftContainer = document.getElementById('shift-checkboxes')
    taskListEl.innerHTML = ''
    shiftContainer.innerHTML = ''
    let storedTasks = []
    let currentShift = []
    let selectedTemplateNames = new Set()

    // Load templates and task data, then build UI
    Promise.all([fetchTemplates(), fetch(`${BASE_URL}/get_task?event_key=${encodeURIComponent(eventKey)}`).then(r=>r.json())])
      .then(([templates, data]) => {
        storedTasks = Array.isArray(data.tasks) ? data.tasks : []
        selectedTemplateNames = new Set(
          storedTasks.filter(t => t.source === 'template').map(t => t.template_name)
        )
        // Build template dropdown
        const templateDropdownToggle = document.getElementById('template-dropdown-toggle')
        const templateCheckboxes = document.getElementById('template-checkboxes')
        templateCheckboxes.innerHTML = ''
        templateDropdownToggle.onclick = () => {
          templateCheckboxes.classList.toggle('hidden')
        }
        const orderedTemplateNames = ['פתיחה', 'מעטפת', 'שוטף', 'סגירה']
        orderedTemplateNames.forEach(templateName => {
          if (!(templateName in templates)) return
          const label = document.createElement('label')
          const checkbox = document.createElement('input')
          checkbox.type = 'checkbox'
          checkbox.value = templateName
          checkbox.checked = selectedTemplateNames.has(templateName)
          checkbox.addEventListener('change', () => {
            // Remove old tasks from this template
            storedTasks = storedTasks.filter(t => !(t.source === 'template' && t.template_name === templateName))
            selectedTemplateNames.delete(templateName)
            // If checked, add
            if (checkbox.checked) {
              const tasksFromTemplate = templates[templateName].map(task => ({
                ...task,
                source: 'template',
                template_name: templateName,
                todo_time: task.todo_time || generateTodoTime(task.stage),
                done: false
              }))
              storedTasks = [...storedTasks, ...tasksFromTemplate]
              selectedTemplateNames.add(templateName)
            }
            renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames)
            saveToServer()
          })
          label.appendChild(checkbox)
          label.append(` ${templateName}`)
          templateCheckboxes.appendChild(label)
        })
        currentShift = Array.isArray(data.shift) ? data.shift : []
        renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames)
        // Shift dropdown
        fetchEmployees().then(employees => {
          shiftContainer.innerHTML = ''
          const shiftDropdownToggle = document.getElementById('shift-dropdown-toggle')
          shiftDropdownToggle.onclick = () => {
            shiftContainer.classList.toggle('hidden')
          }
          employees.forEach(emp => {
            const label = document.createElement('label')
            const checkbox = document.createElement('input')
            checkbox.type = 'checkbox'
            checkbox.value = emp.name
            checkbox.checked = currentShift.includes(emp.name)
            checkbox.addEventListener('change', () => {
              const checked = [...shiftContainer.querySelectorAll('input:checked')].map(c => c.value)
              currentShift = checked.length ? checked : ['none']
              saveToServer()
            })
            label.appendChild(checkbox)
            label.append(`${emp.name}`)
            shiftContainer.appendChild(label)
          })
        })
      })

    // --- Task list logic (render, edit, delete, toggle done) ---
    function renderTasks(taskArray, eventStartStr, eventEndStr, selectedTemplateNames) {
      taskListEl.innerHTML = ''
      const orderedTemplateNames = ['פתיחה', 'מעטפת', 'שוטף', 'סגירה']
      const stageOrder = { 'פתיחה': 1, 'מעטפת': 2, 'שוטף': 3, 'סגירה': 4 }
      const enrichedTasks = taskArray
        .filter(t => t.source === 'manual' || orderedTemplateNames.includes(t.template_name))
        .map(t => {
          if (t.source === 'manual') return t
          const name = t.template_name || t.task_stage || t.stage || ''
          return { ...t, template_name: name }
        })
      enrichedTasks.sort((a, b) => {
        const stageA = a.template_name || a.stage || ''
        const stageB = b.template_name || b.stage || ''
        const stageDiff = (stageOrder[stageA] || 99) - (stageOrder[stageB] || 99)
        if (stageDiff !== 0) return stageDiff
        const aTime = parseTodoTime(a.manual_todo_time || a.todo_time)
        const bTime = parseTodoTime(b.manual_todo_time || b.todo_time)
        return aTime - bTime
      })
      function parseTodoTime(todo) {
        if (!todo || typeof todo !== 'string') return Infinity
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(todo)) {
          const date = new Date(todo)
          return date.getHours() * 60 + date.getMinutes()
        }
        const [prefix, timePart] = todo.split('_')
        if (!timePart || timePart === 'current') return Infinity
        const [h, m] = timePart.split(':').map(Number)
        const minutes = (isNaN(h) ? 0 : h * 60) + (isNaN(m) ? 0 : m)
        if (prefix === 'pre') return -10000 + minutes
        if (prefix === 'started') return 0 + minutes
        if (prefix === 'ended') return 10000 + minutes
        return Infinity
      }
      const taskBox = document.createElement('div')
      taskBox.className = 'template-task-box'
      taskBox.innerHTML = `<strong>רשימת המשימות:</strong>`
      enrichedTasks.forEach(task => {
        const trueIndex = storedTasks.findIndex(t =>
          t.desc === task.desc &&
          t.stage === task.stage &&
          t.priority === task.priority &&
          t.todo_time === task.todo_time &&
          t.manual_todo_time === task.manual_todo_time
        )
        const manualTimeStr = getFormattedManualTime(task.manual_todo_time)
        const executionTime = manualTimeStr || getTaskExecutionTime(task.todo_time, eventStartStr, eventEndStr, task.template_name, selectedTemplateNames, '')
        const li = document.createElement('li')
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
        `
        const statusWrapper = document.createElement('div')
        statusWrapper.style.display = 'flex'
        statusWrapper.style.alignItems = 'center'
        statusWrapper.style.gap = '10px'
        statusWrapper.style.marginTop = '8px'
        const statusEl = document.createElement('div')
        const doneTimestamp = typeof task.done === 'string' && task.done !== 'false' ? formatTime(task.done) : ''
        statusEl.textContent = task.done && task.done !== false
          ? `סטאטוס: בוצע - ${doneTimestamp}`
          : `סטאטוס: לא בוצע - `
        const toggleBtn = document.createElement('button')
        toggleBtn.textContent = task.done ? 'לחץ להחזיר ללא בוצע' : 'לחץ אם בוצע'
        toggleBtn.title = 'שנה סטאטוס משימה'
        toggleBtn.onclick = () => {
          const now = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Jerusalem' }).replace(' ', 'T')
          const trueIndex = storedTasks.findIndex(t =>
            t.desc === task.desc &&
            t.stage === task.stage &&
            t.priority === task.priority &&
            (t.template_name || '') === (task.template_name || '')
          )
          if (trueIndex !== -1) {
            const updatedTask = storedTasks[trueIndex]
            updatedTask.done = (!updatedTask.done || updatedTask.done === false) ? now : false
            renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames)
            saveToServer()
            fetch(`${BASE_URL}/wa-task`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                task: updatedTask.desc,
                event_key: eventKey,
                done: !!updatedTask.done
              })
            }).then(r => r.json()).then(console.log)
          }
        }
        function formatTime(isoStr) {
          const date = new Date(isoStr)
          return date.toLocaleTimeString('he-IL', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
          })
        }
        statusWrapper.appendChild(statusEl)
        statusWrapper.appendChild(toggleBtn)
        li.appendChild(statusWrapper)
        const template = task.template_name || ''
        const styles = templateStyles[template] || { border: 'gray', background: '#f5f5f5' }
        li.style.backgroundColor = styles.background
        li.style.border = `3px solid ${styles.border}`
        li.style.borderRadius = '6px'
        li.style.padding = '10px'
        li.style.marginBottom = '10px'
        taskBox.appendChild(li)
      })
      taskListEl.appendChild(taskBox)
      taskListEl.querySelectorAll('.delete-task').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.index)
          const confirmDelete = confirm("האם אתה בטוח שברצונך למחוק את המשימה?")
          if (!confirmDelete) return
          storedTasks.splice(idx, 1)
          renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames)
          saveToServer()
        })
      })
      taskListEl.querySelectorAll('.edit-task').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const idx = parseInt(e.target.dataset.index)
          const task = storedTasks[idx]
          const li = e.target.closest('li')
          const inputDesc = document.createElement('textarea')
          inputDesc.value = task.desc
          inputDesc.rows = 2
          inputDesc.style.width = '100%'
          const stageSelect = document.createElement('select')
          ;['פתיחה', 'שוטף', 'סגירה'].forEach(opt => {
            const option = document.createElement('option')
            option.value = opt
            option.textContent = opt
            if (task.stage === opt) option.selected = true
            stageSelect.appendChild(option)
          })
          const prioritySelect = document.createElement('select')
          ;['נמוך', 'רגיל', 'דחוף'].forEach(opt => {
            const option = document.createElement('option')
            option.value = opt
            option.textContent = opt
            if (task.priority === opt) option.selected = true
            prioritySelect.appendChild(option)
          })
          const manualTimeInput = document.createElement('input')
          manualTimeInput.type = 'text'
          manualTimeInput.placeholder = 'תזמון ידני (לדוג׳ 17:00)'
          manualTimeInput.value = task.manual_todo_time
            ? new Date(task.manual_todo_time).toLocaleTimeString('he-IL', {
                hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Jerusalem'
              })
            : ''
          manualTimeInput.style.marginTop = '6px'
          manualTimeInput.style.width = '100%'
          const saveBtn = document.createElement('button')
          saveBtn.textContent = '💾'
          saveBtn.title = 'שמור שינויים'
          saveBtn.style.marginRight = '8px'
          saveBtn.onclick = () => {
            task.desc = inputDesc.value.trim()
            task.stage = stageSelect.value
            task.priority = prioritySelect.value
            const timeStr = manualTimeInput.value.trim()
            task.manual_todo_time = parseManualTimeToFullISO(timeStr, eventStartStr)
            renderTasks(storedTasks, eventStartStr, eventEndStr, selectedTemplateNames)
            saveToServer()
          }
          const descDiv = li.querySelector('.task-desc-text')
          const metaDiv = li.querySelector('.task-meta')
          descDiv.innerHTML = ''
          metaDiv.innerHTML = ''
          descDiv.appendChild(inputDesc)
          metaDiv.appendChild(stageSelect)
          metaDiv.appendChild(manualTimeInput)
          metaDiv.appendChild(prioritySelect)
          metaDiv.appendChild(saveBtn)
        })
      })
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
          )
          const fullIso = parseManualTimeToFullISO(execTimeStr, info.event.startStr)
          return { ...task, manual_todo_time: fullIso }
        }
        return task
      })
      const branch = info.event.extendedProps.calendar || ''
      fetch(`${BASE_URL}/save_task`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event_key: eventKey,
          tasks: storedTasks,
          shift: currentShift,
          branch: branch
        })
      }).then(res => res.json()).then(console.log)
    }

    function getTaskExecutionTime(todoTime, startTimeStr, endTimeStr, templateName = '', selectedTemplateNames = new Set(), manualTime = '') {
      const timeSource = (manualTime && manualTime.trim() !== '') ? manualTime.trim() : (todoTime || '').trim()
      if (!timeSource || !startTimeStr || !endTimeStr) return ''
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(timeSource)) {
        const date = new Date(timeSource)
        const hours = date.getHours().toString().padStart(2, '0')
        const minutes = date.getMinutes().toString().padStart(2, '0')
        return `${hours}:${minutes}`
      }
      const [prefix, ...rest] = timeSource.split('_')
      const timePart = rest.join('_').trim()
      if (!prefix || !timePart || timePart === 'current') return ''
      let offsetMinutes = 0
      if (timePart.includes(':')) {
        const [h, m] = timePart.split(':').map(x => Number(x.trim()))
        offsetMinutes = h * 60 + m
      } else {
        return ''
      }
      let baseTime
      if (prefix === 'pre') {
        baseTime = new Date(startTimeStr)
        const isPtichaWithMaatefet =
          templateName === 'פתיחה' && selectedTemplateNames.has('מעטפת')
        const baseOffset = isPtichaWithMaatefet ? 105 : 60
        baseTime.setMinutes(baseTime.getMinutes() - baseOffset + offsetMinutes)
      } else if (prefix === 'started') {
        baseTime = new Date(startTimeStr)
        baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes)
      } else if (prefix === 'ended') {
        baseTime = new Date(endTimeStr)
        baseTime.setMinutes(baseTime.getMinutes() + offsetMinutes)
      } else {
        return ''
      }
      const hours = baseTime.getHours().toString().padStart(2, '0')
      const minutes = baseTime.getMinutes().toString().padStart(2, '0')
      return `${hours}:${minutes}`
    }

    function generateTodoTime(stage) {
      if (stage === 'פתיחה') return 'pre_00:00'
      if (stage === 'שוטף') return 'started_00:00'
      if (stage === 'סגירה') return 'ended_00:00'
      return 'unknown_00:00'
    }

    document.getElementById('add-task-confirm').onclick = () => {
      const desc = document.getElementById('new-desc').value.trim()
      const stage = document.getElementById('new-stage').value
      const priority = document.getElementById('new-priority').value
      const manualTimeInput = document.getElementById('new-manual-time').value.trim()
      let manual_todo_time = parseManualTimeToFullISO(manualTimeInput, info.event.startStr)
      let todo_time = ''
      if (stage === 'פתיחה') todo_time = 'pre_00:00'
      else if (stage === 'שוטף') todo_time = 'started_00:00'
      else if (stage === 'סגירה') todo_time = 'ended_00:00'
      if (!manual_todo_time) {
        const calculatedTimeStr = getTaskExecutionTime(
          todo_time,
          info.event.startStr,
          info.event.endStr,
          '', new Set(), ''
        )
        manual_todo_time = parseManualTimeToFullISO(calculatedTimeStr, info.event.startStr)
      }
   
      if (!desc) return

      storedTasks.push({
        desc,
        stage,
        priority,
        source: 'manual',
        todo_time: manual_todo_time || generateTodoTime(stage),
        manual_todo_time,
        done: false
      })

      renderTasks(storedTasks, info.event.startStr, info.event.endStr, selectedTemplateNames)
      document.getElementById('new-desc').value = ''
      document.getElementById('new-manual-time').value = ''
      document.getElementById('new-stage').value = 'פתיחה'
      document.getElementById('new-priority').value = 'גבוהה'
      saveToServer()
    }
  }

})
