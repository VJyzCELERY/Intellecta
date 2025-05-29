// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts
const { contextBridge, ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');
const katex = require('katex');
const { marked } = require('marked');
const sanitizeHtml = require('sanitize-html');
// Needed to make DOMPurify work in Node

function renderMath(text) {
  // Helper function to safely render KaTeX with error handling
  function safeKatexRender(math, options) {
    try {
      return katex.renderToString(math.trim(), options);
    } catch (error) {
      console.warn('KaTeX parsing error:', error.message, 'for expression:', math);
      return `<code class="katex-error" title="${error.message}">${math}</code>`;
    }
  }

  return text
    // Handle block math: \[...\]
    .replace(/\\\[(.+?)\\\]/gs, (_, math) => 
      safeKatexRender(math, { displayMode: true, output: 'mathml' })
    )
    // Handle inline math: \(...\) 
    .replace(/\\\((.+?)\\\)/gs, (_, math) => 
      safeKatexRender(math, { displayMode: false, output: 'mathml' })
    )
    // Block math: $$...$$
    .replace(/\$\$([^$]+?)\$\$/g, (_, math) =>
      safeKatexRender(math, { displayMode: true, output: 'mathml' })
    )
    // Inline math: $...$ 
    .replace(/(?<!\$)\$([^$\n]+?)\$(?!\$)/g, (_, math) =>
      safeKatexRender(math, { displayMode: false, output: 'mathml' })
    )
    // Your custom style: [\math...]
    .replace(/\[(\\\w[^\]]*)\]/g, (_, math) =>
      safeKatexRender(math, { displayMode: true, output: 'mathml' })
    )
    // Your custom style: (\math...)
    .replace(/\((\\\w[^)]*)\)/g, (_, math) =>
      safeKatexRender(math, { displayMode: false, output: 'mathml' })
    );
}


// Main render function
function renderMarkdown(mdText) {
  const withMath = renderMath(mdText);
  const html = marked(withMath);
  return sanitizeHtml(html, {
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      // KaTeX span/div classes
      'span', 'div',
      // MathML tags
      'math', 'mrow', 'mi', 'mo', 'mn', 'msup', 'msub', 'mfrac', 
      'msqrt', 'mroot', 'mtext', 'mspace', 'mtable', 'mtr', 'mtd',
      'mover', 'munder', 'munderover', 'mfenced', 'menclose'
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      'span': ['class', 'style', 'aria-hidden'],
      'div': ['class', 'style'],
      // MathML attributes
      'math': ['xmlns', 'display'],
      'mo': ['stretchy', 'fence', 'separator'],
      'mspace': ['width'],
      'mtable': ['columnalign', 'rowspacing', 'columnspacing'],
      'mtr': ['columnalign'],
      'mtd': ['columnalign']
    }
  });
}

contextBridge.exposeInMainWorld('markdownAPI', {
  render: renderMarkdown
});

contextBridge.exposeInMainWorld('courseAPI',
  {
    
    getCourses: () => ipcRenderer.invoke('get-courses'),
    createCourse: (data) => ipcRenderer.invoke('create-course', data),
    deleteCourse: (courseId) => ipcRenderer.invoke('delete-course',courseId),
    createTopic: (courseId,topicTitle) => {return ipcRenderer.invoke('create-topic',{courseId,topicTitle})},
    deleteTopic : (courseId,topicId) => ipcRenderer.invoke('delete-topic',{courseId,topicId}),
    renameTopic : (courseId,topicId,topicTitle) => ipcRenderer.invoke('rename-topic',{courseId,topicId,topicTitle}),
    getTopics: (courseId) => ipcRenderer.invoke('get-topics', courseId),
    getNotes: (courseId, topicId) => ipcRenderer.invoke('get-notes', { courseId, topicId }),
    saveNotes: (courseId, topicId, noteId,content) => ipcRenderer.invoke('save-notes', { courseId, topicId, noteId,content }),
    getDocuments : (courseId,topicId) => ipcRenderer.invoke('get-documents',{courseId,topicId}),
    uploadDocuments : (courseId,topicId,files) => ipcRenderer.invoke('upload-documents',{courseId,topicId,files}),
    deleteDocument : (courseId,topicId,fileid) => ipcRenderer.invoke('delete-document',{courseId,topicId,fileid}),
    renameDocument : (courseId,topicId,documentId,newTitle) => ipcRenderer.invoke('rename-document',{courseId,topicId,documentId,newTitle}),
  }
);

contextBridge.exposeInMainWorld('chatAPI', {
  sendPrompt: (prompt,mode) => ipcRenderer.send("ChatManager:sendRequest",{prompt,mode}),
  onStream: (callback) => {
    // Remove existing listeners first
    ipcRenderer.removeAllListeners("ChatManager:stream");
    ipcRenderer.on("ChatManager:stream", (event, chunk) => callback(chunk));
  },
  onStreamEnd: (callback) => {
    // Remove existing listeners first
    ipcRenderer.removeAllListeners("ChatManager:stream:end");
    ipcRenderer.on("ChatManager:stream:end", callback);
  },
  onStreamError: (callback) => {
    // Remove existing listeners first
    ipcRenderer.removeAllListeners("ChatManager:stream:error");
    ipcRenderer.on("ChatManager:stream:error", (event, error) => callback(error));
  },
  removeStreamListeners: () => {
    ipcRenderer.removeAllListeners("ChatManager:stream");
    ipcRenderer.removeAllListeners("ChatManager:stream:end");
    ipcRenderer.removeAllListeners("ChatManager:stream:error");
  },
  loadSession: (userId,courseId,topicId) => ipcRenderer.invoke('load-session',{userId,courseId,topicId}),
  loadHistory: (courseId,topicId) => ipcRenderer.invoke('load-history',{courseId,topicId}),
  saveChat: (message,sender,courseId,topicId) => ipcRenderer.invoke('save-chat',{message,sender,courseId,topicId}),
  uploadFile: (files,immediate) => ipcRenderer.invoke('chat-file-upload',{files,immediate}),
  deleteFile:(ids,types) => ipcRenderer.invoke('chat-file-delete',{ids,types}),
  deleteSession: (userId,courseId,topicId) => ipcRenderer.invoke('delete-session',{userId,courseId,topicId})
});

contextBridge.exposeInMainWorld('eventAPI',{
  createEvent: (userId,eventData) => ipcRenderer.invoke('create-event',{userId,eventData}),
  deleteEvent: (userId,eventId) => ipcRenderer.invoke('delete-event',{userId,eventId}),
  deleteInstance: (userId,eventId,startTime) => ipcRenderer.invoke('delete-instance',{userId,eventId,startTime}),
  deleteUpcomingInstance: (userId,eventId,startTime) => ipcRenderer.invoke('delete-future-instance',{userId,eventId,startTime}),
  updateInstanceContinue: (userId, eventId, startTime, shouldContinue)=> ipcRenderer.invoke('update-instance-continue',{userId, eventId, startTime, shouldContinue}),
  getMonthEvent: (userId,year,month) => ipcRenderer.invoke('get-month-event',{userId,year,month}),
  exportDB : async (userId) => {return await ipcRenderer.invoke('export-user-db',{userId})},
});
