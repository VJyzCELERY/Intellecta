let sessionId = null;
let currentCourse = '';
let currentTopic = '';
const chatPanel = document.getElementById('aiChatPanel');
const chatLayout=`
<div class="chat-body">
    <div class="chat-container">
        <div class="chat-header">
            <h1>Intellecta</h1>
        </div>
        <div class="chat-messages">
            
        </div>
    </div>
    <div class="input-container centered">
        <input type="text" class="chat-input" id="chat_in" placeholder="Type your message...">
        <div class="button-group">
            <div class="left-button">
            <button class="btn icon-btn" title="Upload file" onclick="showUploadModal(false)"><span
                class="material-symbols-outlined">attach_file</span></button>
            </div>
            <button class="btn send-btn"><span class="material-symbols-outlined" onclick="sendPrompt()">arrow_upward</span></button>
        </div>
    </div>
</div>
`

chatPanel.innerHTML=chatLayout;

async function upload(){
    
}

async function loadChatSession(userId,courseId,topicId){
    console.log(courseId);
    currentCourse=courseId;
    if(topicId === null){
        return;
    }
    currentTopic=topicId;
    await window.chatAPI.loadSession(userId,courseId,topicId);
}
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

async function loadChat(userId,courseId,topicId){
    const history = await window.chatAPI.loadHistory(courseId,topicId);
    const chatMessages = document.querySelector('.chat-messages');
    chatMessages.innerHTML = '';
    history.forEach(msg => {
        const messageBubble = document.createElement('div');
        messageBubble.classList.add('message',msg.sender);
        const markdownBuffer = msg.message;
        console.log(`Markdown buffer ${markdownBuffer}`);
        const renderedHTML = window.markdownAPI.render(markdownBuffer);
        messageBubble.innerHTML=renderedHTML;
        chatMessages.appendChild(messageBubble);
    });
}

async function handlePrompt(prompt){
    const chatMessages = document.querySelector('.chat-messages');
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message','bot-message');
    messageBubble.innerHTML = '';
    chatMessages.appendChild(messageBubble);
    
    let markdownBuffer = '';
    
    window.chatAPI.sendPrompt(prompt);
    
    // Create unique handlers for this specific message
    const streamHandler = (chunk) => {
        const data = JSON.parse(chunk);
        markdownBuffer += data.text;
        const renderedHTML = window.markdownAPI.render(markdownBuffer);
        messageBubble.innerHTML = renderedHTML;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    };
    
    const endHandler = () => {
        console.log("Stream finished.");
        // Remove listeners after stream ends
        window.chatAPI.removeStreamListeners();
        // Save the complete message to history if needed
        window.chatAPI.saveChat(prompt, 'user-message',currentCourse,currentTopic);
        window.chatAPI.saveChat(markdownBuffer, 'bot-message',currentCourse,currentTopic);
        
    };
    
    const errorHandler = (err) => {
        console.error("Streaming error:", err);
        messageBubble.innerHTML += "\n[Error: " + err + "]";
        // Remove listeners after error
        window.chatAPI.removeStreamListeners();
    };
    
    // Set up listeners for this message
    window.chatAPI.onStream(streamHandler);
    window.chatAPI.onStreamEnd(endHandler);
        
    window.chatAPI.onStreamError(errorHandler);
    return markdownBuffer;
}

async function sendPrompt(){
    const chatMessages = document.querySelector('.chat-messages');
    const input = document.getElementById('chat_in');
    const value = input.value.trim();
    
    if (!value) return; // Don't send empty messages
    
    // Add user message
    const messageBubble = document.createElement('div');
    messageBubble.classList.add('message','user-message');
    const renderedHTML = window.markdownAPI.render(value);
    messageBubble.innerHTML = renderedHTML;
    chatMessages.appendChild(messageBubble);
    
    
    // Clear input after sending
    input.value = '';
    
    // Save user message
    
    // Handle the prompt
    try{
        await handlePrompt(value);
        console.log(`User message : ${value}`);
        
    }catch(error){
        console.log(`Error on sending message ${error}`);
    }
}
