const params = new URLSearchParams(window.location.search);
const courseId = params.get("id");
const notesBlocker = document.getElementById('notes-block');
const chatContainer = document.getElementById('aiChatPanel');
let currentTopicId = null;
let currentDocument = null;
let documentToEdit = null;
let topicToEdit=null;
let user={};
const editor = document.getElementById('content-editor');



document.addEventListener('DOMContentLoaded',async ()=>{
  user = await window.userAPI.getUser();
  console.log('Loaded course with id : ',courseId);
  loadCourse();
})

/**
 * Deletes a document by its ID from both the course storage and chat context.
 * 
 * This function:
 * - Retrieves the document metadata.
 * - Converts the document ID and type to arrays (if not already).
 * - Deletes the document from the courseAPI.
 * - Attempts to delete the associated file(s) via chatAPI.
 * - Resets the active document.
 * - Reloads the list of documents for the current topic.
 * 
 * @async
 * @function deleteDocument
 * @param {string} docId - The ID of the document to be deleted.
 * @returns {Promise<void>}
 */
async function deleteDocument(docId) {
  const topicId = currentTopicId;
  const doc = await getDocs(docId)
  const type = doc.type;
  console.log(type);
  const toArray = (val) => Array.isArray(val) ? val : [val];
  await window.courseAPI.deleteDocument(courseId,topicId,docId);
  try{
    await window.chatAPI.deleteFile(toArray(docId),toArray(type));

  }catch(error){
    console.log(error);
  }
  setActiveDocument(null);
  loadDocuments(topicId);
}

/**
 * Shows the rename topic modal and sets the topic to edit.
 * @param {string} topicId - The ID of the topic to rename.
 */
async function showRenameTopicModal(topicId){
    document.getElementById('topicNamingModal').style.display = 'flex';
    topicToEdit=topicId;
}

/**
 * Renames the topic based on the input field in the rename modal.
 * @returns {Promise<void>}
 */
async function renameTopic(){
  const inputContainer = document.getElementById('topicTitle');
  const value = inputContainer.value.trim();
  await window.courseAPI.renameTopic(courseId,topicToEdit,value);
  loadCourse();
  loadTopic(currentTopicId);
  inputContainer.value = '';
  closeModals();
}

/**
 * Shows the rename document modal and sets the document to edit.
 * @param {string} docId - The ID of the document to rename.
 */
function showRenameDocumentModal(docId) {
    documentToEdit = docId;
    document.getElementById('documentNamingModal').style.display = 'flex';
}

/**
 * Renames the currently selected document.
 * @returns {Promise<void>}
 */
async function renameDocument(){
  const titleInput = document.getElementById('docTitle');
  const title = titleInput.value.trim();
  await window.courseAPI.renameDocument(courseId,currentTopicId,documentToEdit,title);
  loadTopic(currentTopicId);
  titleInput.value=' ';
  closeModals();
}

/**
 * Toggles the visibility of the topic navigation sidebar.
 * @returns {void}
 */
function toggleTopicNav() {
    const topicNav = document.getElementById('topicNav');
    topicNav.classList.toggle('active');

    // Rotate chevron icon
    const toggleIcon = document.querySelector('.nav-toggle span');
    toggleIcon.style.transform = topicNav.classList.contains('active')
        ? 'rotate(180deg)'
        : 'rotate(0deg)';
}
/**
 * Creates a new unnamed topic and activates it.
 * @returns {Promise<void>}
 */
async function loadCourse() {
  const courses = await window.courseAPI.getCourses();
  const course = courses.find(c => c.id === courseId);
  if (!course) return alert("Course not found");
  const getStartedModal = document.getElementById('get-started');
  const topics = await window.courseAPI.getTopics(courseId);
  if (topics.length === 0) {
    const list = document.getElementById('topicList');
    list.innerHTML = '';
    getStartedModal.style.display = 'flex';
    currentTopicId=null;
    return;
  }else{
    getStartedModal.style.display = 'none';
  }

  renderTopicList(topics);
  console.log('Topic[0] : ',topics[0].id);
  loadTopic(topics[0].id);
}
/**
 * This renders the topics in the topic navigation bar
 * @param {Array<{id:string,title:string,createdAt:string}>} topics -
 * - `id` : the id of the topic
 * - `title` : the title of the topic 
 * - `createdAt` : the date of the topic creation
 */
async function renderTopicList(topics) {
  
  const list = document.getElementById('topicList');
  list.innerHTML = '';
  topics.forEach(topic => {
    const li = document.createElement('li');
    li.className="topic-item";
    li.id = topic.id;
    li.innerHTML = `
            <span>${topic.title} <span class="material-symbols-outlined" onclick="showRenameTopicModal('${topic.id}');event.stopPropagation();">edit</span></span>
            <span class="close-btn" onclick="deleteTopic('${topic.id}');event.stopPropagation();">&times;</span>
            `;
    li.setAttribute('data-topicid', topic.id);
    li.onclick = () => loadTopic(topic.id);
    list.appendChild(li);
  });
}
/**
 * This function is used to get a document by their id
 * @param {string} document_id - the id of the document to get
 * @return {{id:string,name:string,type:string,buffer:ArrayBuffer}}
*/
async function getDocs(document_id){
  const files = await window.courseAPI.getDocuments(courseId,currentTopicId);
  const doc = await files.find(file => file.id === document_id);
  return doc;
}

/**
 * This function load all the document file including notes in a topic
 * @param {string} topicId - The id of the loaded topic
 */
async function loadDocuments(topicId) {
  window.courseAPI.getDocuments(courseId,topicId).then(documents =>{
    const list = document.getElementById("documentList");
    list.innerHTML='';
    if(currentDocument !== null){
      setActiveDocument(currentDocument);
    }else if(currentDocument===null && documents.length > 0){
      setActiveDocument(documents[0].id);
    }else{
      setActiveDocument(null);
    }

    documents.forEach(doc => {
        const item = document.createElement('div');
        item.className = `document-item ${currentDocument === doc.id ? 'active' : ''}`;

        const icon = doc.type === 'notes' ? 'note' :
            doc.type === 'pdf' ? 'picture_as_pdf' :
                doc.type === 'image' ? 'image' : 'description';

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 10px;">
                <span class="material-symbols-outlined">${icon}</span>
                ${doc.name}
                <span class="material-symbols-outlined" onclick="event.stopPropagation(); showRenameDocumentModal('${doc.id}')">edit</span>
            </div>
            <span class="delete-btn" onclick="deleteDocument('${doc.id}');event.stopPropagation();">×</span>
        `;
        item.onclick = () => setActiveDocument(doc.id);
        list.appendChild(item);
    });
  });
}
/**
 * This function set the selected container to add viewer for pdf
 * @param {HTMLElement} container - The container for putting the document item
 * @param {{name:string,buffer:ArrayBuffer,type:string}} item -
 * -`name` : this is the file name
 * -`buffer` : this is the file content in ArrayBuffer
 * -`type` : this is the file extension type pdf
 */
function viewPDF(container,item){
    console.log("Printing pdf",item.name);
    const blob = new Blob([item.buffer], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    console.log(url);
    container.innerHTML = `
        <embed src="${url}" 
               type="application/pdf" 
               width="100%" 
               height="100%"
               class="pdf-embed">
    `;
}
/**
 * This function set the selected container to add viewer for image
 * @param {HTMLElement} container - The container for putting the document item
 * @param {{name:string,buffer:ArrayBuffer,type:string}} item -
 * -`name` : this is the file name
 * -`buffer` : this is the file content in ArrayBuffer
 * -`type` : this is the file extension type ['jpg','png','jpeg','webp','gif','bmp']
 */
function viewImage(container,item){
  console.log("Printing image",item.name);
    const blob = new Blob([item.buffer], { type: `image/${item.type}` });
    const url = URL.createObjectURL(blob);
    console.log(url);
    container.innerHTML = `
      <img src="${url}" 
           alt="${item.name}" 
           style="max-width: 100%; height: auto;">
    `;
}

/**
 * This function set the document selected into active state and display them in the content viewer
 * @param {string} documentId - The id of document to activate
 * @returns {void}
 */
async function setActiveDocument(documentId){
  console.log('Activating',documentId);
  currentDocument=documentId;
  const notesScrollable = document.querySelector('.notes-scrollable');
  const contentViewer = document.getElementById('content-viewer');
  const formatToolbar = document.querySelector('.format-toolbar');
  const contentEditor = document.getElementById('content-editor');
  if(currentDocument===null){
    console.log('null document');
    notesScrollable.style.display = 'block';
    contentViewer.style.display = 'none';
    formatToolbar.style.display = 'flex';
    contentEditor.innerHTML = '';
    notesBlocker.style.display='flex';
    return;
  }
  notesBlocker.style.display='none';
  const doc = await getDocs(documentId);
  console.log(doc);
  if (doc.type === 'notes') {
        // Show editor for notes
        notesScrollable.style.display = 'block';
        contentViewer.style.display = 'none';
        formatToolbar.style.display = 'flex';
        contentEditor.innerHTML = doc.buffer;
    } else {
        // Show viewer for PDFs/images
        notesScrollable.style.display = 'none';
        formatToolbar.style.display = 'none';
        contentViewer.style.display = 'block';

        // Clear previous content
        contentViewer.innerHTML = '';

        if (doc.type === 'pdf') {
          viewPDF(contentViewer,doc);
        } else if (['jpg','png','jpeg','webp','gif','bmp'].includes(doc.type)) {
          viewImage(contentViewer,doc);
        }
    }
}

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


/**
 * This function set the a topic into active state then load the documents
 * inside the topic
 * @param {string} topicId - The id of topic to activate
 * @returns {void}
 */
async function loadTopic(topicId) {
  const li = document.getElementById(topicId);
  console.log(topicId);
  currentDocument=null;
  if(currentTopicId){
    
    console.log(currentTopicId);
    const prev= document.getElementById(currentTopicId);
    prev.className='topic-item';
  }
  currentTopicId=topicId;
  li.className='topic-item active'
  try{
    await loadChatSession(user.id,courseId,currentTopicId);
  }catch(error){
    console.log(error);
  }
  console.log(user.id,courseId,currentTopicId);
  loadChat(user.id,courseId,currentTopicId);
  await loadDocuments(topicId);
}

/**
 * Creates a new unnamed topic and activates it.
 * @returns {Promise<void>}
 */
async function createNewTopic(){
  const title = "Unnamed";
  const topic = await window.courseAPI.createTopic(courseId,title);
  await loadCourse();
  console.log(topic);
  await loadTopic(topic.id);
}

/**
 * Deletes the selected topic and its related chat session.
 * @param {string} topicId - The ID of the topic to delete.
 * @returns {Promise<void>}
 */
async function deleteTopic(topicId){
  console.log('Deleting ',topicId);
  await window.courseAPI.deleteTopic(courseId,topicId);
  if(topicId === currentTopicId){
    currentTopicId=null;
    console.log(currentTopicId);
  }
  
  try{
    console.log("Attempt Delete");
    window.chatAPI.deleteSession(user.id,courseId,topicId);
  }catch(error){
    console.log(error);
  }
  loadCourse();
  if(!currentTopicId){
    return;
  }
  loadTopic(currentTopicId);

  
}

/**
 * This function upload files to save in the storage
 * @param {Array<{name:string,arrayBuffer:ArrayBuffer}>} selectedFiles -
 * - `id` : The unique file identifier
 * - `name` : The name of the file
 * - `arrayBuffer` : The file's data in ArrayBuffer format
 * @returns {void}
 */
async function storeFiles(selectedFiles) {

  if (!selectedFiles.length) return;
  
  const topicId = currentTopicId;
  if(!topicId){
    console.log('Invalid TopicId!');
    return
  }
  await window.courseAPI.uploadDocuments(courseId, topicId, selectedFiles);
  try{
    window.chatAPI.uploadFile(selectedFiles,IMMEDIATE_MODE);
  }catch(error){
    console.log(error);
  }
  loadDocuments(topicId);
  closeModals();
}
/**
 * Handles drag-and-drop file uploads into the drop zone.
 * @param {DragEvent} e - The drag event containing the files.
 * @returns {Promise<void>}
 */
async function handleDrop(e) {
  e.preventDefault();
  document.getElementById('dropZone').classList.remove('dragover');

  const files = e.dataTransfer.files;
  for(let i =0;i < files.length;i++){
    const id = crypto.randomUUID();
    const file = files[i];
    const arrayBuffer = await file.arrayBuffer();
    console.log(arrayBuffer);
    storeFiles([{id:id,name:file.name,arrayBuffer:arrayBuffer}]);
  }
  
}

/**
 * Handles file input selection from file picker.
 * @param {Event} e - The change event from the file input.
 * @returns {Promise<void>}
 */
async function handleFileSelect(e) {
  const files = e.target.files;
  for (const file of files){
    const id = crypto.randomUUID();
    const arrayBuffer = await file.arrayBuffer(); 
    storeFiles([{id:id,name:file.name,arrayBuffer:arrayBuffer}]);
  }
}
/**
 * Creates a new note in the current topic.
 * @returns {Promise<void>}
 */
async function createNewNote(){
  const topicId = currentTopicId;
  const titleInput = document.getElementById('noteTitle');
  const title = titleInput.value.trim();
  if(!title){
    alert('please input a title');
    return;
  }
  const noteid =crypto.randomUUID();
  await window.courseAPI.uploadDocuments(courseId,currentTopicId,[{id:noteid,name:`${title}.notes`,content:''}]);
  loadDocuments(topicId);
  closeModals();
}


/**
 * Saves the current active note content to both course and chat context.
 * @returns {Promise<void>}
 */
async function saveNotes(){
  const input_field = document.getElementById('content-editor');
  const content = input_field.innerHTML;
  await window.courseAPI.saveNotes(courseId,currentTopicId,currentDocument,content);
  const toArray = (val) => Array.isArray(val) ? val : [val];
  const doc=await getDocs(currentDocument);
  console.log(doc);
  const encoder = new TextEncoder();
  const uint8Array = encoder.encode(doc.buffer);
  const arrayBuffer = uint8Array.buffer;
  try{
    console.log([{id:currentDocument,name:doc.name,arrayBuffer:arrayBuffer}]);
    await window.chatAPI.deleteFile(toArray(currentDocument),toArray('notes'));
    window.chatAPI.uploadFile([{id:currentDocument,name:doc.name,arrayBuffer:arrayBuffer}],true);
  }catch(error){
    console.log(error);
  }
}