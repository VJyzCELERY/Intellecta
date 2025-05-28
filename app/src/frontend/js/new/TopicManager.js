// TOPIC
let topics = [];
let activeTopicId = null;

function generateTopicId() {
    return crypto.randomUUID();
}

function addNewSession() {
    const topicId = generateAlphanumericId();
    const newTopic = {
        id: topicId,
        title: `Topic ${topics.length + 1}`,
        content: ''
    };

    topics.push(newTopic);
    renderTopics();
    switchTopic(topicId);
}

function renderTopics() {
    const topicList = document.getElementById('topicList');
    topicList.innerHTML = '';

    topics.forEach(topic => {
        const li = document.createElement('li');
        li.className = `topic-item ${activeTopicId === topic.id ? 'active' : ''}`;
        li.innerHTML = `
            <span>${topic.title}</span>
            <span class="close-btn" onclick="deleteTopic(event, '${topic.id}')">&times;</span>
        `;
        li.setAttribute('data-topicid', topic.id);
        li.onclick = (e) => !e.target.classList.contains('close-btn') && switchTopic(topic.id);
        li.ondblclick = (e) => startRenamingTopic(topic.id);
        topicList.appendChild(li);
    });
}

function switchTopic(topicId) {
    if (activeTopicId) {
        const currentTopic = topics.find(t => t.id === activeTopicId);
        currentTopic.content = document.getElementById('content-editor').innerHTML;
    }

    activeTopicId = topicId;
    const topic = topics.find(t => t.id === topicId);
    const editor = document.getElementById('content-editor');
    editor.innerHTML = topic.content || '';

    if (!topic.content) {
        editor.innerHTML = '<p class="paragraph"></p>';
        editor.focus();
    }

    // Handle placeholder state
    if (!topic.content) {
        editor.classList.add('show-placeholder');
    } else {
        editor.classList.remove('show-placeholder');
    }
    renderTopics();
}

function toggleTopicNav() {
    const topicNav = document.getElementById('topicNav');
    topicNav.classList.toggle('active');

    // Rotate chevron icon
    const toggleIcon = document.querySelector('.nav-toggle span');
    toggleIcon.style.transform = topicNav.classList.contains('active')
        ? 'rotate(180deg)'
        : 'rotate(0deg)';
}

function deleteTopic(event, topicId) {
    event.stopPropagation();
    if (topics.length === 1) return;

    const index = topics.findIndex(t => t.id === topicId);
    topics.splice(index, 1);

    if (activeTopicId === topicId) {
        activeTopicId = topics[Math.max(0, index - 1)]?.id;
    }

    renderTopics();
    if (activeTopicId) switchTopic(activeTopicId);
}

function startRenamingTopic(topicId) {
    const topicItem = document.querySelector(`[data-topicid="${topicId}"]`);
    const titleSpan = topicItem.querySelector('span:first-child');
    const currentTitle = titleSpan.textContent;

    const input = document.createElement('input');
    input.value = currentTitle;
    input.style.width = '150px';
    input.onblur = () => finishRenaming(topicId, input.value);
    input.onkeydown = (e) => {
        if (e.key === 'Enter') input.blur();
        if (e.key === 'Escape') input.value = currentTitle;
    };

    titleSpan.replaceWith(input);
    input.focus();
}

function finishRenaming(topicId, newTitle) {
    const topic = topics.find(t => t.id === topicId);
    topic.title = newTitle.trim() || `Topic ${topics.findIndex(t => t.id === topicId) + 1}`;
    renderTopics();
}

window.onload = () => {
    addNewSession()
};
