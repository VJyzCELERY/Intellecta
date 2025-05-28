// calendar
const calendarGrid = document.getElementById('calendarGrid');
const monthYear = document.getElementById('monthYear');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const eventForm = document.getElementById('eventForm');
const selectedDateText = document.getElementById('selectedDateText');
const eventTitleInput = document.getElementById('eventTitleInput');
const eventTimeInput1 = document.getElementById('eventTimeInput1');
const eventTimeInput2 = document.getElementById('eventTimeInput2');
const submitEvent = document.getElementById('submitEvent');
const eventList = document.getElementById('eventList');
const openEventForm = document.getElementById('openEventForm');

let currentDate = new Date();
let events = JSON.parse(localStorage.getItem('calendarEvents')) || {};
let selectedDate = null;

function renderCalendar() {
    calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    monthYear.textContent = `${currentDate.toLocaleString('default', { month: 'long' })} ${year}`;
    const firstDay = new Date(year, month, 1);
    const lastDate = new Date(year, month + 1, 0).getDate();
    const startDay = firstDay.getDay();

    for (let i = 0; i < startDay; i++) {
        const blank = document.createElement('div');
        calendarGrid.appendChild(blank);
    }

    for (let day = 1; day <= lastDate; day++) {
        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const cell = document.createElement('div');
        cell.textContent = day;
        cell.dataset.date = dateStr;

        // Add event markers
        if (events[dateStr]) {
            cell.classList.add('has-event');
            const eventCount = document.createElement('div');
            eventCount.className = 'event-count';
            eventCount.textContent = events[dateStr].length;
            cell.appendChild(eventCount);
        }

        cell.addEventListener('click', () => {
            selectedDate = dateStr;
            selectedDateText.textContent = selectedDate;
            displayEvents(dateStr);
        });

        calendarGrid.appendChild(cell);
    }
}

// Add Event Button Handler
openEventForm.addEventListener('click', () => {
    if (!selectedDate) {
        alert("Please select a date first");
        return;
    }
    overlay.style.display = "flex";
    eventForm.style.display = 'flex';
});

document.getElementById('cancelEvent').addEventListener('click', () => {
    eventForm.style.display = 'none';
    overlay.style.display = "none";
    eventTitleInput.value = '';
    eventTimeInput1.value = '';
    eventTimeInput2.value = '';
});

submitEvent.addEventListener('click', () => {
    const title = eventTitleInput.value.trim();
    const time1 = eventTimeInput1.value;
    const time2 = eventTimeInput2.value;

    if (!title || !time1 || !time2 || !selectedDate) {
        alert("Please fill out all fields.");
        return;
    }

    if (!events[selectedDate]) events[selectedDate] = [];
    events[selectedDate].push({ title, time1, time2 });
    localStorage.setItem('calendarEvents', JSON.stringify(events));

    overlay.style.display = "none";
    eventTitleInput.value = '';
    eventTimeInput1.value = '';
    eventTimeInput2.value = '';
    eventForm.style.display = 'none';

    renderCalendar();
    displayEvents(selectedDate);
});

function displayEvents(dateStr) {
    if (!dateStr) {
        eventList.innerHTML = `<p>Select a date to view events</p>`;
        return;
    }

    const eventData = events[dateStr] || [];
    if (eventData.length === 0) {
        eventList.innerHTML = `<p>No events on ${dateStr}.</p>`;
        return;
    }

    const html = `<h4>Events on ${dateStr}:</h4><ul>` +
        eventData.map((e, index) => `
      <li>
        <div class="event-content">
          <strong>${e.time1} - ${e.time2}</strong>: 
          <p class="event-title">${e.title}</p>
        </div>
        <button class="delete-event" data-index="${index}">Delete</button>
      </li>
    `).join('') +
        `</ul>`;

    eventList.innerHTML = html;

    // Add delete event handlers
    document.querySelectorAll('.delete-event').forEach(button => {
        button.addEventListener('click', () => {
            const index = parseInt(button.dataset.index);
            events[dateStr].splice(index, 1);

            if (events[dateStr].length === 0) {
                delete events[dateStr];
            }

            localStorage.setItem('calendarEvents', JSON.stringify(events));
            renderCalendar();
            displayEvents(dateStr);
        });
    });
}

prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    selectedDate = null;
    renderCalendar();
    eventList.innerHTML = `<p>Select a date to view events</p>`;
});

nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    selectedDate = null;
    renderCalendar();
    eventList.innerHTML = `<p>Select a date to view events</p>`;
});

renderCalendar();
displayEvents(null);