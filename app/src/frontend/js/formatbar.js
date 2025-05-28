// formating button
// Update button states
function updateActiveButtons() {
    document.querySelectorAll('.format-button').forEach(btn => {
        btn.classList.remove('active');
    });

    if (document.queryCommandState('bold')) {
        document.querySelector('[onclick="toggleFormat(\'bold\')"]').classList.add('active');
    }
    if (document.queryCommandState('italic')) {
        document.querySelector('[onclick="toggleFormat(\'italic\')"]').classList.add('active');
    }
    if (document.queryCommandState('underline')) {
        document.querySelector('[onclick="toggleFormat(\'underline\')"]').classList.add('active');
    }
}

// Event listeners
document.getElementById('content-editor').addEventListener('input', updateActiveButtons);
document.getElementById('content-editor').addEventListener('mouseup', updateActiveButtons);
document.getElementById('content-editor').addEventListener('keyup', updateActiveButtons);

// Toggle character formats
function toggleFormat(format) {
    document.execCommand(format);
    updateActiveButtons();
}

// Toggle lists
function toggleList(type) {
    const command = type === 'unordered' ? 'insertUnorderedList' : 'insertOrderedList';
    document.execCommand(command);
    updateActiveButtons();
}

// Link insertion
function insertLink(e) {
    e.preventDefault();
    const url = e.target.querySelector('input[type="url"]').value;
    const text = e.target.querySelector('input[type="text"]').value;

    if (url && text) {
        const link = document.createElement('a');
        link.href = url;
        link.textContent = text;
        link.target = '_blank';
        document.execCommand('insertHTML', false, link.outerHTML);
    }

    closeModals();
}