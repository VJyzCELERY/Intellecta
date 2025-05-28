// ai toggle
function toggleAIChat() {
    const aiButton = document.querySelector('.ai-toggle-btn');
    const chatPanel = document.getElementById('aiChatPanel');

    // Toggle classes
    aiButton.classList.toggle('active');
    chatPanel.classList.toggle('active');

    // Change icon
    const icon = aiButton.querySelector('.material-symbols-outlined');
    icon.textContent = chatPanel.classList.contains('active') ? 'arrow_forward' : 'smart_toy';
}

// Chat functionality
const chatMessages = document.querySelector('.chat-messages');
const chatInput = document.querySelector('.chat-input');
const sendBtn = document.querySelector('.send-btn');
let messages = [];

// Initialize chat
function initChat() {
    showWelcomeMessage();
    setTimeout(() => {
        document.querySelector('.welcome-message').style.opacity = '1';
    }, 500);
}

// Message handling
function handleSend() {
    const message = chatInput.value.trim();
    if (!message) return;

    // Add user message
    addMessage(message, true);

    // Simulate bot response
    setTimeout(() => {
        addMessage("This is a sample response from the AI.", false);
    }, 1000);

    // Clear input
    chatInput.value = '';
    chatInput.focus();
}

function addMessage(text, isUser) {
    const message = {
        text,
        isUser,
        timestamp: new Date().toISOString()
    };

    messages.push(message);
    updateChatDisplay();
}

function updateChatDisplay() {
    chatMessages.innerHTML = '';

    if (messages.length === 0) {
        showWelcomeMessage();
        document.querySelector('.input-container').classList.add('centered');
    } else {
        document.querySelector('.input-container').classList.remove('centered');
        messages.forEach(msg => createMessageElement(msg));
    }

    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function createMessageElement(message) {
    const messageDiv = document.createElement('div');
    messageDiv.classList.add('message', message.isUser ? 'user-message' : 'bot-message');
    messageDiv.textContent = message.text;
    chatMessages.appendChild(messageDiv);
}

function showWelcomeMessage() {
    const welcomeDiv = document.createElement('div');
    welcomeDiv.className = 'welcome-message';
    welcomeDiv.textContent = '👋 Hi there! How can I help you today?';
    chatMessages.appendChild(welcomeDiv);
}

// Event listeners
sendBtn.addEventListener('click', handleSend);
chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleSend();
});

// Initialize chat
initChat();