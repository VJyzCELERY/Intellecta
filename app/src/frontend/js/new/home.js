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

// Sessions Logic
const sessionList = document.getElementById('sessionList');

const scheduleData = [
    { subject: "Discrete Math", time: "09:00 AM – 11:00 AM", type: "discrete" },
    { subject: "Biology", time: "13:00 PM – 14:00 PM", type: "bio" },
    { subject: "Physics", time: "16:00 PM – 17:00 PM", type: "physics" },
];

const randomColor = () => {
    const colors = ["#f87171", "#34d399", "#60a5fa", "#fbbf24", "#a78bfa", "#fb7185"];
    return colors[Math.floor(Math.random() * colors.length)];
};

scheduleData.forEach((item, index) => {
    const div = document.createElement('div');
    div.className = 'session-card';
    div.style.borderLeft = `5px solid ${randomColor()}`;
    div.style.animation = `fadeInUp 0.5s ease forwards`;
    div.style.animationDelay = `${index * 0.2 + 0.2}s`;
    div.innerHTML = `${item.subject}<br><small>${item.time}</small>`;
    sessionList.appendChild(div);
});