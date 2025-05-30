let user = {};
let events = [];
let today = [];
let upcoming = [];



async function updateView(){
    loadGreeting();
    events =await getEventsForDate(new Date());
    events.sort((a, b) => new Date(a.end) - new Date(b.end));
    updateEventBanner(events);
    [today,upcoming] = splitEvents(events);
    today.sort((a, b) => new Date(a.end) - new Date(b.end));
    upcoming.sort((a, b) => new Date(a.end) - new Date(b.end));
    updateList(document.getElementById('todayList'),today);
    updateList(document.getElementById('upcomingList'),upcoming);
    loadCourses();
}

document.addEventListener('DOMContentLoaded', async () => {
    user = await window.userAPI.getUser();
    updateView();
});

function updateEventBanner(events) {
  const titleEl = document.getElementById('event-banner-title');
  const timeEl = document.getElementById('event-banner-time');

  if (!events || events.length === 0) {
    titleEl.textContent = 'No upcoming session';
    timeEl.textContent = '';
    return;
  }

  const event = events[0];
  titleEl.textContent = event.title;

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  const isMultiDay = startDate.toDateString() !== endDate.toDateString();

  if (isMultiDay) {
    // Multiple day event: time is "end_date - end_time"
    const endDateStr = endDate.toLocaleDateString();
    const endTimeStr = endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    timeEl.textContent = `${endDateStr} - ${endTimeStr}`;
  } else {
    // Single day event: time is "start_time - end_time"
    const startTimeStr = startDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    const endTimeStr = endDate.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    timeEl.textContent = `${startTimeStr} - ${endTimeStr}`;
  }
}

function openCourse(courseId) {
  window.location.href = `material.html?id=${courseId}`;
}

function createQuickAccess(course){
    const container = document.createElement('a');
    container.classList.add('card');
    container.style.animation="animation-delay: 0.5s";
    container.textContent = course.title;
    container.onclick = () => openCourse(course.id);
    return container;

}

function loadCourses() {
    const container = document.getElementById('quick-access-container');
    container.innerHTML='';
    window.courseAPI.getCourses().then(courses => {
        courses.forEach(course => {
            container.appendChild(createQuickAccess(course));
    });
  });
}

setInterval(() => {
  updateView().catch(console.error);
}, 60000);

function createEventDiv(event) {
  const start = new Date(event.start);
  const end = new Date(event.end);

  // Helpers
  function formatDate(date) {
    return date.toISOString().slice(0, 10);
  }
  function formatTime(date) {
    return date.toTimeString().slice(0, 5);
  }

  const isMultiDay = formatDate(start) !== formatDate(end);

  // Create container div
  const div = document.createElement('div');
  div.classList.add('session-card', 'today');

  // Title
  const titleP = document.createElement('p');
  titleP.className = 'title';
  titleP.textContent = event.title;
  div.appendChild(titleP);

  // Description(s)
  if (isMultiDay) {
    const startP = document.createElement('p');
    startP.className = 'desc';
    startP.innerHTML = `Start : <b>${formatDate(start)}</b>`;
    div.appendChild(startP);

    const endP = document.createElement('p');
    endP.className = 'desc';
    endP.innerHTML = `End : <b>${formatDate(end)}</b>`;
    div.appendChild(endP);
  } else {
    const dateP = document.createElement('p');
    dateP.className = 'desc';
    dateP.innerHTML = `Date : <b>${formatDate(start)}</b>`;
    div.appendChild(dateP);

    const timeP = document.createElement('p');
    timeP.className = 'desc';
    timeP.innerHTML = `Time : <b>${formatTime(start)} - ${formatTime(end)}</b>`;
    div.appendChild(timeP);
  }

  return div;
}


function splitEvents(events) {
    const now = new Date();

    const ongoingEvents = [];
    const upcomingEvents = [];

    for (const event of events) {
        const start = new Date(event.start);
        const end = new Date(event.end);

        if (start <= now && end > now) {
            // Currently ongoing
            ongoingEvents.push(event);
        } else if (start > now) {
            // Upcoming in future
            upcomingEvents.push(event);
        }
        // Past events (end <= now) are ignored
    }

    return  [ongoingEvents, upcomingEvents] ;
}


function loadGreeting(){
    const hour = new Date().getHours();

    let greeting;
    if (hour < 12) {
        greeting = "Good Morning";
    } else if (hour < 18) {
        greeting = "Good Afternoon";
    } else {
        greeting = "Good Evening";
    }
    document.getElementById("Greeting").innerHTML = `${greeting},<br>${user.name}`;

}

// Dynamic Clock
function updateClock() {
    const clock = document.getElementById('clock');
    const now = new Date();
    let hours = now.getHours();
    const minutes = now.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
    clock.textContent = `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
}
setInterval(updateClock, 1000);

async function getEventsForDate(selectedDate) {
    return await window.eventAPI.getUpcomingEvent(user.id,selectedDate.toISOString(),15);
}

// Sessions Logic
function updateList(container,events_data){
    events_data.forEach((item)=>{
        container.appendChild(createEventDiv(item));
    })
}
