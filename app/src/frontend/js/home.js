let user = {};
let upcoming_events = []
document.addEventListener('DOMContentLoaded', async () => {
    user = await window.userAPI.getUser();
    loadGreeting();
    upcoming_events =await getEventsForDate(new Date());
    upcoming_events.sort((a, b) => new Date(a.end) - new Date(b.end));
    console.log(upcoming_events);
});

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
    document.getElementById("Greeting").textContent = `${greeting}, ${user.name}`;
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
const todayList = document.getElementById('todayList');

const todayData = [
    { title: "A", start: "09:00 AM", end: "11:00 AM"},
    { title: "B", start: "09:00 AM", end: "11:00 AM"},
    { title: "C", start: "09:00 AM", end: "11:00 AM"},
    { title: "D", start: "09:00 AM", end: "11:00 AM"},
    { title: "E", start: "09:00 AM", end: "11:00 AM"}
];

todayData.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'session-card today';
    div.innerHTML = `<div class="session-card today">
                        <p class="title">${item.title}</p>
                        <p class="desc">Start : <b>${item.start}</b></p>
                        <p class="desc">End : <b>${item.end}</b></p>
                    </div>`;
    sessionList.appendChild(div);
});

const upcomingList = document.getElementById('upcomingList');

const upcomingData = [
    { title: "A", dateStart: "09:00 AM", dateEnd: "11:00 AM"},
    { title: "B", dateStart: "09:00 AM", dateEnd: "11:00 AM"},
    { title: "C", dateStart: "09:00 AM", dateEnd: "11:00 AM"},
    { title: "D", dateStart: "09:00 AM", dateEnd: "11:00 AM"},
    { title: "E", dateStart: "09:00 AM", dateEnd: "11:00 AM"}
];

upcomingData.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'session-card upcoming';
    div.innerHTML = `<div class="session-card today">
                        <p class="title">${item.title}</p>
                        <p class="desc">Start : <b>${item.dateStart}</b></p>
                        <p class="desc">End : <b>${item.dateEnd}</b></p>
                    </div>`;
    sessionList.appendChild(div);
});