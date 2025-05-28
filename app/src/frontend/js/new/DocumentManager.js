//notes storage
let notes = JSON.parse(localStorage.getItem('notes')) || [];

// Add this save function
function saveNotes() {
    localStorage.setItem('notes', JSON.stringify(notes));
}

// Modify ID generation to include timestamp
function generateAlphanumericId(length = 6) {
    const timestamp = Date.now().toString(36); // Add timestamp
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let randomPart = '';
    for (let i = 0; i < length; i++) {
        randomPart += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${timestamp}-${randomPart}`; // Combine timestamp with random
}

// Document Editor
const editor = document.getElementById('content-editor');

editor.addEventListener('focus', () => {
    editor.classList.remove('show-placeholder');
    if (editor.innerHTML === "") {
        editor.innerHTML = '';
    }
});

editor.addEventListener('blur', () => {
    if (editor.innerHTML === "") {
        editor.classList.add('show-placeholder');
    }
});

// Document Management (Update these functions)
let documents = JSON.parse(localStorage.getItem('documents')) || [];
let activeDocId = null;

function createNewNote() {
    const docId = generateAlphanumericId();
    const newDoc = {
        id: docId,
        name: `New Note ${documents.length + 1}`,
        content: '',
        type: 'note',
        created: new Date().toISOString(),
        modified: new Date().toISOString()
    };

    documents.push(newDoc);
    closeModals();
    saveDocuments();
    renderDocuments();
    switchDocument(docId); // Switch to new document

}

function showCreationModal() {
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

// Update switchDocument to use topic-specific documents
function switchDocument(docId) {
    const notesScrollable = document.querySelector('.notes-scrollable');
    const pdfViewer = document.getElementById('pdf-viewer');
    const formatToolbar = document.querySelector('.format-toolbar');
    const contentEditor = document.getElementById('content-editor');

    // Save current document state
    if (activeDocId) {
        const currentDoc = documents.find(d => d.id === activeDocId);
        if (currentDoc.type === 'note') {
            currentDoc.content = contentEditor.innerHTML;
        }
        currentDoc.modified = new Date().toISOString();
        saveDocuments();
    }

    // Switch to new document
    activeDocId = docId;
    const doc = documents.find(d => d.id === docId);

    // Toggle view based on document type
    if (doc.type === 'note') {
        // Show editor for notes
        notesScrollable.style.display = 'block';
        pdfViewer.style.display = 'none';
        formatToolbar.style.display = 'flex';
        contentEditor.innerHTML = doc.content;
    } else {
        // Show viewer for PDFs/images
        notesScrollable.style.display = 'none';
        formatToolbar.style.display = 'none';
        pdfViewer.style.display = 'block';

        // Clear previous content
        pdfViewer.innerHTML = '';

        if (doc.type === 'pdf') {
            pdfViewer.innerHTML = `
                <embed src="${doc.content}" 
                       type="application/pdf" 
                       width="100%" 
                       height="100%"
                       class="pdf-embed">
            `;
        } else if (doc.type === 'image') {
            pdfViewer.innerHTML = `
                <img src="${doc.content}" 
                     alt="${doc.name}" 
                     style="max-width: 100%; height: auto;">
            `;
        }
    }

    // Update document list highlights
    renderDocuments();
}


// Enhanced renderDocuments
function renderDocuments() {
    const list = document.getElementById('documentList');
    list.innerHTML = '';

    documents.forEach(doc => {
        const item = document.createElement('div');
        item.className = `document-item ${activeDocId === doc.id ? 'active' : ''}`;

        const icon = doc.type === 'note' ? 'note' :
            doc.type === 'pdf' ? 'picture_as_pdf' :
                doc.type === 'image' ? 'image' : 'description';

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined">${icon}</span>
                ${doc.name}
            </div>
            <span class="delete-btn" onclick="deleteDocument('${doc.id}')">×</span>
        `;
        item.onclick = () => switchDocument(doc.id);
        list.appendChild(item);
    });

    // Scroll to new items
    list.lastChild?.scrollIntoView({ behavior: 'smooth' });
}

// Delete document
function deleteDocument(docId) {
    if (documents.length <= 1) {
        alert("You must keep at least one document!");
        return;
    }

    documents = documents.filter(d => d.id !== docId);
    if (activeDocId === docId) activeDocId = documents[0]?.id;
    renderDocuments();
    saveDocuments();
    switchDocument(activeDocId);
}

// Rename document
function renameDocument(docId) {
    const doc = documents.find(d => d.id === docId);
    const newName = prompt('Rename document:', doc.name);
    if (newName && newName.trim()) {
        doc.name = newName.trim();
        doc.modified = new Date().toISOString();
        renderDocuments();
        saveDocuments();
    }
}

// Modified handleFiles function
function handleFiles(files) {
    Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = function (e) {
            const type = file.type.startsWith('image/') ? 'image' :
                file.type === 'application/pdf' ? 'pdf' : 'document';

            const newDoc = {
                id: generateAlphanumericId(),
                name: file.name,
                content: e.target.result,
                type: type,
                created: new Date().toISOString(),
                modified: new Date().toISOString(),
                fileType: file.type
            };

            documents.push(newDoc);
            saveDocuments();
            renderDocuments();
            switchDocument(newDoc.id); // Switch to new document
        };

        file.type.startsWith('text/') ? reader.readAsText(file) : reader.readAsDataURL(file);
    });
    closeModals();
}

// Save/load documents
function saveDocuments() {
    localStorage.setItem('documents', JSON.stringify(documents));
}

function loadDocuments() {
    const saved = localStorage.getItem('documents');
    if (saved) documents = JSON.parse(saved);
}

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

// Drag and drop handling
function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.add('dragover');
}

function handleDragLeave(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('dragover');
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('dropZone').classList.remove('dragover');
    const files = e.dataTransfer.files;
    handleFiles(files);
}

// File input handling
function handleFileSelect(e) {
    const files = e.target.files;
    handleFiles(files);
}

// file handling for uploaded file in zone
let selectedFiles = [];

// Update the preview list rendering
function updatePreviewList() {
    const previewList = document.getElementById('previewList');
    previewList.innerHTML = '';

    selectedFiles.forEach((filePreview) => {
        const previewItem = document.createElement('div');
        previewItem.className = 'preview-item';
        previewItem.innerHTML = `
            <div class="preview-content">
                ${filePreview.preview && filePreview.preview !== 'document' ?
                `<img src="${filePreview.preview}" class="preview-thumbnail">` :
                `<span class="material-symbols-outlined">
                        ${filePreview.file.type === 'application/pdf' ? 'picture_as_pdf' : 'description'}
                    </span>`
            }
                <span class="preview-filename">${filePreview.file.name}</span>
            </div>
            <span class="remove-preview" onclick="removeFromPreview('${filePreview.id}')">×</span>
        `;
        previewList.appendChild(previewItem);
    });

    document.getElementById('previewSection').style.display =
        selectedFiles.length > 0 ? 'block' : 'none';
}

function removeFromPreview(fileId) {
    selectedFiles = selectedFiles.filter(file => file.id !== fileId);
    updatePreviewList();
}

function uploadFiles() {
    if (selectedFiles.length === 0) {
        alert('Please select files first!');
        return;
    }

    selectedFiles.forEach(filePreview => {
        const reader = new FileReader();

        reader.onload = function (e) {
            // Create document item with type 'document'
            const newDocument = {
                id: generateDocumentId(),
                name: filePreview.file.name,
                content: e.target.result,
                type: 'document', // Explicitly set type to 'document'
                size: filePreview.file.size,
                uploadedAt: new Date().toISOString(),
                fileType: filePreview.file.type // Preserve original file type
            };

            documents.push(newDocument);
            renderDocuments();
            saveDocuments();
        };

        if (filePreview.file.type.startsWith('text/')) {
            reader.readAsText(filePreview.file);
        } else {
            reader.readAsDataURL(filePreview.file);
        }
    });

    // Reset and close
    selectedFiles = [];
    closeModals();
}

// Modal handling functions
function showLinkModal() {
    document.getElementById('linkModal').style.display = 'flex';
}

function showUploadModal() {
    document.getElementById('uploadModal').style.display = 'flex';
}


function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(modal => {
        modal.style.display = 'none';
    });
}

// Handle clicks outside modal
window.onclick = function (event) {
    if (event.target.classList.contains('modal-overlay')) {
        closeModals();
    }
}

// Handle Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModals();
});

// When opening PDF
function showPDF(url) {
  const pdfViewer = document.getElementById('pdf-viewer');
  pdfViewer.classList.add('active');
  // Your PDF rendering logic here
}

// When closing PDF
function closePDF() {
  const pdfViewer = document.getElementById('pdf-viewer');
  pdfViewer.classList.remove('active');
}