const { app, BrowserWindow, ipcMain,dialog} = require('electron');
const path = require('node:path');
const fs = require('fs');
const CourseManager = require('./modules/coursemanager');
const ChatManagerClass = require('./modules/chatmanager');
const ChatManager = new ChatManagerClass("http://localhost:8000");
// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, '../frontend/home.html'));

  // Open the DevTools.
  mainWindow.webContents.openDevTools();
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  createWindow();

  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.

ipcMain.handle('get-courses', () => CourseManager.getCourses());
ipcMain.handle('create-course', (e, data) => CourseManager.createCourse(data));
ipcMain.handle('delete-course',(e,courseId) => CourseManager.deleteCourse(courseId));
ipcMain.handle('create-topic', async (e, { courseId, topicTitle }) => {result = CourseManager.createTopic(courseId, topicTitle);console.log(result); return result;});
ipcMain.handle('delete-topic',(e,{courseId,topicId})=> CourseManager.deleteTopic(courseId,topicId));
ipcMain.handle('get-topics', (e, courseId) => CourseManager.getTopics(courseId));
ipcMain.handle('rename-topic',(e,{courseId,topicId,topicTitle})=>CourseManager.renameTopic(courseId,topicId,topicTitle));
ipcMain.handle('get-notes', (e, { courseId, topicId }) => CourseManager.getNotes(courseId, topicId));
ipcMain.handle('save-notes', (e, { courseId, topicId, noteId,content}) => CourseManager.saveNotes(courseId, topicId, noteId,content));
ipcMain.handle('get-documents',(e,{courseId,topicId}) => CourseManager.getDocuments(courseId,topicId));
ipcMain.handle('upload-documents',(e,{courseId,topicId,files}) => CourseManager.uploadDocument(courseId,topicId,files));
ipcMain.handle('delete-document',(e,{courseId,topicId,fileid}) => CourseManager.deleteDocument(courseId,topicId,fileid));
ipcMain.handle('rename-document',(e,{courseId,topicId,documentId,newTitle})=>CourseManager.renameDocument(courseId,topicId,documentId,newTitle));

ipcMain.handle('load-session',(e,{userId,courseId,topicId})=> ChatManager.loadSession(userId,courseId,topicId));
ipcMain.on('ChatManager:sendRequest',async(e,prompt)=>{
  try{
    for await (const chunk of ChatManager.sendRequest(prompt)){
      e.sender.send("ChatManager:stream",chunk);
    }
    e.sender.send('ChatManager:stream:end');
  }catch(err){
    e.sender.send("ChatManager:error",err.message);
  }
});
ipcMain.handle('load-history',()=>ChatManager.loadChatHistory());
ipcMain.handle('save-chat',(e,{message,sender})=>ChatManager.saveMessage(message,sender));
ipcMain.handle('chat-file-upload',(e,{files,immediate})=>ChatManager.uploadFile(files,immediate));
ipcMain.handle('chat-file-delete',(e,{ids,types})=>ChatManager.deleteFile(ids,types));
ipcMain.handle('delete-session',(e,{userId,courseId,topicId})=>ChatManager.deleteSession(userId,courseId,topicId));