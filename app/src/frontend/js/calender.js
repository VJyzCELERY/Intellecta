// calendar
const calendarGrid = document.getElementById('calendarGrid');
const monthYear = document.getElementById('monthYear');
const prevMonthBtn = document.getElementById('prevMonth');
const nextMonthBtn = document.getElementById('nextMonth');
const eventForm = document.getElementById('eventForm');
const selectedDateText = document.getElementById('selectedDateText');
const eventList = document.getElementById('eventList');
const submitEvent = document.getElementById('submitEvent');
let currentDate = new Date();
let eventsList = [];
let currentActivatedDate = null;
const userId='testuser';


async function renderCalendar() {
    calendarGrid.innerHTML = '';
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    await updateEventList();

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
        cell.onclick = () => activateDate(dateStr);

        // 🟡 Call your existing logic
        const dayEvents = getEventsForDate(dateStr);
        if (dayEvents.length > 0) {
            cell.classList.add('has-event');
            const eventCount = document.createElement('div');
            eventCount.className = 'event-count';
            eventCount.textContent = dayEvents.length;
            cell.appendChild(eventCount);
        }

        calendarGrid.appendChild(cell);
    }
    renderActiveDate();
}


// Helper function to format date as local YYYY-MM-DD (avoid timezone issues)
function formatDateLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}


function getEventsForDate(dateStr) {
    // Convert dateStr to a Date at midnight UTC (or local, just be consistent)
    const selectedDate = new Date(dateStr + 'T00:00:00');

    // Filter events where selectedDate is >= startDate and <= endDate (consider only the date part)
    return eventsList.filter(event => {
        const startDate = new Date(event.start);
        const endDate = new Date(event.end);

        // Normalize times to midnight for date-only comparison
        const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate());

        // Check if selectedDate is within the range [startDay, endDay]
        return selectedDate >= startDay && selectedDate <= endDay;
    });
}

function renderActiveDate(){
    const dateDiv = document.querySelector(`div[data-date="${currentActivatedDate}"]`);
    if(!dateDiv){
        return;
    }
    console.log(dateDiv);
    dateDiv.classList.add('active_date');
    
}

function removeActivateDateRender(){
    const dateDiv = document.querySelector(`div[data-date="${currentActivatedDate}"]`);
    if(!dateDiv){
        return;
    }
    dateDiv.classList.remove('active_date');
}

function activateDate(dateStr){
    console.log(`Activate ${dateStr}`);
    removeActivateDateRender();
    currentActivatedDate=dateStr;
    renderActiveDate();
    displayEvents(dateStr);
}

function showInputModal(){
    overlay.style.display = "flex";
    eventForm.style.display = 'flex';
}

function closeInputModal(){
    overlay.style.display = "none";
    eventForm.style.display = 'none';
}

function resetEventInput(){
    const eventTitleInput = document.getElementById('eventTitleInput');
    const eventDescriptionInput = document.getElementById('eventDescInput');
    const eventTimeInputStart = document.getElementById('eventTimeInputStart');
    const eventTimeInputEnd = document.getElementById('eventTimeInputEnd');
    const eventDateInputStart = document.getElementById('eventDateInputStart');
    const eventDateInputEnd = document.getElementById('eventDateInputEnd');
    const repeatInterval = document.getElementById('repeat-event-interval');
    const repeatCheck = document.getElementById('repeat-check');
    const repeatSelect = document.getElementById('repeat-type-select');
    const eventRepeatDateUntilInput = document.getElementById('eventRepeatEndDate');
    eventTitleInput.value = '';
    eventDescriptionInput.value='';
    eventTimeInputStart.value = '';
    eventTimeInputEnd.value = '';
    eventDateInputStart.value='';
    eventDateInputEnd.value='';
    eventRepeatDateUntilInput.value='';
    repeatCheck.checked=false;
    repeatInterval.value = 1;
    repeatSelect.selectedIndex=0;
    toggleRepeatDetailView();
}

document.getElementById('cancelEvent').addEventListener('click', () => {
    eventForm.style.display = 'none';
    overlay.style.display = "none";
    resetEventInput();
});

function convertToISO(date, time) {
  const dateTimeStr = `${date}T${time}`;
  const localDate = new Date(dateTimeStr);
  return localDate.toISOString();
}

async function updateEventList(){
    console.log(userId,currentDate.getFullYear(),currentDate.getMonth()+1);
    eventsList = await window.eventAPI.getMonthEvent(userId,currentDate.getFullYear(),currentDate.getMonth()+1);
    console.log(eventsList);
}

async function createEventSchedule(){
    const eventTitleInput = document.getElementById('eventTitleInput');
    const eventDescriptionInput = document.getElementById('eventDescInput');
    const eventTimeInputStart = document.getElementById('eventTimeInputStart');
    const eventTimeInputEnd = document.getElementById('eventTimeInputEnd');
    const eventDateInputStart = document.getElementById('eventDateInputStart');
    const eventDateInputEnd = document.getElementById('eventDateInputEnd');
    const repeatCheck = document.getElementById('repeat-check');
    const repeatSelect = document.getElementById('repeat-type-select');
    const repeatInterval = document.getElementById('repeat-event-interval');
    const eventRepeatDateUntilInput = document.getElementById('eventRepeatEndDate');
    
    //VALIDATION
    const inputMap = {
        "Event Title": eventTitleInput,
        "Event Description": eventDescriptionInput,
        "Start Time": eventTimeInputStart,
        "End Time": eventTimeInputEnd,
        "Start Date": eventDateInputStart,
        "End Date": eventDateInputEnd
    };

    const missingFields = [];

    for (const [name, input] of Object.entries(inputMap)) {
        if (input.value.trim() === "") {
            missingFields.push(name);
        }
    }

    if (missingFields.length > 0) {
        alert("Please fill in the following fields:\n" + missingFields.join("\n"));
        return;
    } else {
        console.log("All required inputs are filled.");
    }

    
    let repeatUntil=null;
    if(repeatCheck.checked){
        if(repeatSelect.value.trim() === ""){
            alert('Please select the repeat type');
            return;
        }else if(repeatInterval.value <= 0){
            alert('Repeat interval must be greater than 0');
            return;
        }
        else{
            if(eventRepeatDateUntilInput.value == ""){
                repeatUntil=null;
            }else{
                repeatUntil = convertToISO(eventRepeatDateUntilInput.value,"23:59");
            }
        }
    }
    const title=eventTitleInput.value.trim();
    const desc=eventDescriptionInput.value.trim();
    const start=convertToISO(eventDateInputStart.value,eventTimeInputStart.value);
    const end=convertToISO(eventDateInputEnd.value,eventTimeInputEnd.value);
    const eventid = crypto.randomUUID();
    let repeat = null;
    if(start >= end){
        alert('Start time must be before the end time');
        return;
    }
    if(repeatCheck.checked){
        repeat={
            type:repeatSelect.value.trim(),
            interval:repeatInterval.value,
            until:repeatUntil
        }
    }
    const event_data = {
        event_id:eventid,
        title:title,
        description:desc,
        repeat:repeat,
        instances:[
            {
                start:start,
                end:end,
                continue:null
            }
        ]
    }

    await window.eventAPI.createEvent(userId,event_data);
    renderCalendar();
    closeInputModal();
    
}

function displayEvents(dateStr) {
    if (!dateStr) {
        eventList.innerHTML = `<p>Select a date to view events</p>`;
        return;
    }

    const eventData = getEventsForDate(dateStr);
    if (eventData.length === 0) {
        eventList.innerHTML = `<p>No events on ${dateStr}.</p>`;
        return;
    }

    const html = `<h4>Events on ${dateStr}:</h4><ul>` +
        eventData.map((e, index) => {
            const start = new Date(e.start);
            const end = new Date(e.end);

            const time1 = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const time2 = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

            return `
                <li class="event-item" onclick="viewEventDetail('${e.event_id}', '${e.start}')">
                    <div class="event-content">
                        <strong class="event-title">${e.title}</strong>
                        <p>${e.description}</p>
                    </div>
                </li>
            `;
        }).join('') +
        `</ul>`;

    eventList.innerHTML = html;

}

function showDeleteEventModal(){
    document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteEventModal(){
    document.getElementById('deleteModal').classList.add('hidden');
}

async function viewEventDetail(eventId, startTime) {
    const matched = eventsList.find(e => e.event_id === eventId && e.start === startTime);

    if (!matched) {
        alert('Event not found.');
        return;
    }

    const deleteInstanceButton = document.getElementById('deleteInstance');
    const deleteFutureInstanceButton= document.getElementById('deleteFuture');
    const deleteEventButton= document.getElementById('deleteAll');

    deleteInstanceButton.onclick = () => deleteSingleInstance(matched.event_id,matched.start);
    deleteFutureInstanceButton.onclick = () => deleteFutureInstance(matched.event_id,matched.start);
    deleteEventButton.onclick = () => deleteEvent(matched.event_id);


    const start = new Date(matched.start);
    const end = new Date(matched.end);
    const startDateStr = start.toLocaleDateString();
    const endDateStr = end.toLocaleDateString();
    const time1 = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    const time2 = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });

    const modalContent = `
        <h3>${matched.title}</h3>
        <p><strong>Start:</strong> ${startDateStr} ${time1}</p>
        <p><strong>End:</strong> ${endDateStr} ${time2}</p>
        <p><strong>Description:</strong><br>${matched.description || 'No description.'}</p>

        <div class="modal-actions">
            <button id="deleteEventBtn" onclick="showDeleteEventModal()">Delete</button>
        </div>
    `;

    document.getElementById('modalEventDetails').innerHTML = modalContent;
    showEventDetailModal();
}


function closeEventDetailModal(){
    const modal = document.getElementById('eventDetailModal');
    modal.classList.add('hidden');
    closeDeleteEventModal();
}

function showEventDetailModal(){
    const modal = document.getElementById('eventDetailModal');
    modal.classList.remove('hidden');
}

async function deleteSingleInstance(eventId,startTime){
    await window.eventAPI.deleteInstance(userId,eventId,startTime);
    renderCalendar();
    closeEventDetailModal();
    await updateEventList();
    displayEvents(currentActivatedDate);
}

async function deleteFutureInstance(eventId,startTime){
    await window.eventAPI.deleteUpcomingInstance(userId,eventId,startTime);
    renderCalendar();
    closeEventDetailModal();
    await updateEventList();
    displayEvents(currentActivatedDate);
}

async function deleteEvent(eventId){
    await window.eventAPI.deleteEvent(userId,eventId);
    renderCalendar();
    closeEventDetailModal();
    await updateEventList();
    displayEvents(currentActivatedDate);
}


prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    currentActivatedDate = null;
    renderCalendar();
    displayEvents(currentActivatedDate);
});

nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    currentActivatedDate = null;
    renderCalendar();
    displayEvents(currentActivatedDate);
});

function toggleRepeatDetailView(){
    const repeatCheck = document.getElementById('repeat-check');
    const repeatDetailViewer = document.getElementById('repeat-detail-viewer');
    if(repeatCheck.checked){
        repeatDetailViewer.style.display='flex';
    }else{
        repeatDetailViewer.style.display='none';
    }
}

renderCalendar();
displayEvents(null);

document.addEventListener('DOMContentLoaded', function() { 
    currentCourse='schedule';
    const chatuploadbutton = document.getElementById('chat-file-upload-btn');
    if (chatuploadbutton) {
        chatuploadbutton.remove();
    }
});