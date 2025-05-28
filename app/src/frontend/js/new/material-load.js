// ================== main.js ==================
// Initialize all components after DOM loads
document.addEventListener('DOMContentLoaded', () => {
    // Expose managers to global scope for HTML event handlers
    window.DocumentManager = DocumentManager;
    window.TopicManager = TopicManager;
    window.UploadManager = UploadManager;

    // Initialize document system
    DocumentManager.init();
    
    // Initialize topic system
    TopicManager.init();
    
    // Load initial data
    if(DocumentManager.documents.length === 0) {
        const newDocId = DocumentManager.createNewNote();
        DocumentManager.switchDocument(newDocId);
    }
});