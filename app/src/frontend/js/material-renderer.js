let IMMEDIATE_MODE = false;

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
    });
    //reset value
    document.getElementById('noteTitle').value = '';
    }

function showNamingModal() {
    document.getElementById('noteNamingModal').style.display = 'flex';
    const creationModal = document.getElementById('creationModal');
    creationModal.style.display = 'none';

}

function showDocNamingModal() {
    document.getElementById('documentNamingModal').style.display = 'flex';
    const creationModal = document.getElementById('creationModal');
    creationModal.style.display = 'none';

}

function showUploadModal(immediate_mode) {
    IMMEDIATE_MODE=immediate_mode;
    const creationModal = document.getElementById('creationModal');
    creationModal.style.display = 'none';
    document.getElementById('uploadModal').style.display = 'flex';
}
function showLinkModal() {
    document.getElementById('linkModal').style.display = 'flex';
}
function showCreationModal() {
    // close 1st time modal
    const getStartedModal = document.getElementById('get-started');
    getStartedModal.style.display = 'none';
    // Close topic nav if open
    const topicNav = document.getElementById('topicNav');
    if (topicNav.classList.contains('active')) {
        toggleTopicNav();
    }

    // Show creation modal
    const creationModal = document.getElementById('creationModal');
    creationModal.style.display = 'flex';
    creationModal.classList.add('active');
}

// Drag and drop handling
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('dragover');
}