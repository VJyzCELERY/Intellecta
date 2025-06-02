global.user = {
  id : 'testuser',
  name : 'Some User'
}
const { app, BrowserWindow, ipcMain,dialog} = require('electron');
const path = require('node:path');
const fs = require('fs');
const { spawn,execFile  } = require('child_process');
const EventManagerClass = require('./modules/eventmanager');
const EventManager = new EventManagerClass();
const CourseManagerClass = require('./modules/coursemanager');
const CourseManager = new CourseManagerClass();
const ChatManagerClass = require('./modules/chatmanager');
const ChatManager = new ChatManagerClass("http://localhost:8000");

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}
let llmProcess = null;
const isDev = !app.isPackaged;
const resourcePath = app.isPackaged
  ? process.resourcesPath
  : path.join(__dirname, '../../');

const pythonPath = path.join(resourcePath, 'python');
const pythonScriptPath = path.join(resourcePath, 'main.py');

const pythonExecutable = process.platform === 'win32'
  ? path.join(pythonPath, 'python.exe')
  : path.join(pythonPath, 'python');

console.log('Resource paths:', {
  resourcePath,
  pythonPath,
  pythonScriptPath,
  pythonExecutable,
  isDev,
  execPath: process.execPath
});

function activateUser(user){
  ChatManager.setActiveUser(user.id);
  CourseManager.setActiveUser(user.id);
}
activateUser(global.user);

function serverHealthCheck(){
  return ChatManager.waitForHealthCheck();
}

function startLLMServer() {
  console.log('Starting LLM server...');
  
  // Check if Python executable exists
  if (!fs.existsSync(pythonExecutable)) {
    console.error('Python executable not found at:', pythonExecutable);
    dialog.showErrorBox('Python Error', `Python executable not found at: ${pythonExecutable}`);
    app.quit();
    return;
  }

  // Check if Python script exists
  if (!fs.existsSync(pythonScriptPath)) {
    console.error('Python script not found at:', pythonScriptPath);
    dialog.showErrorBox('Script Error', `Python script not found at: ${pythonScriptPath}`);
    app.quit();
    return;
  }
  try {
    console.log('Spawning : ',pythonExecutable, [pythonScriptPath]);
    llmProcess = execFile(pythonExecutable, [pythonScriptPath], {
      cwd: resourcePath, // Set working directory
      stdio: ['ignore', 'pipe', 'pipe']
    });

    llmProcess.stdout.on('data', (data) => {
      console.log(`[Python stdout] ${data.toString()}`);
    });

    llmProcess.stderr.on('data', (data) => {
      console.error(`[Python stderr] ${data.toString()}`);
    });

    llmProcess.on('error', (error) => {
      console.error('Failed to start Python process:', error);
      dialog.showErrorBox('Process Error', `Failed to start Python process: ${error.message}`);
      app.quit();
    });

    llmProcess.on('exit', (code, signal) => {
      console.warn(`Python process exited with code ${code}, signal ${signal}`);
      if (code !== 0 && code !== null) {
        dialog.showErrorBox('Python Process Error', `Python process exited unexpectedly with code ${code}`);
      }
    });

    // Wait for server health before opening window
    console.log('Waiting for server health check...');
    serverHealthCheck()
      .then(() => {
        console.log('Server health check passed, creating window...');
        createWindow();
      })
      .catch((err) => {
        console.error('Server health check failed:', err);
        dialog.showErrorBox('Server Error', `Server health check failed: ${err.message}`);
        app.quit();
      });
  } catch (error) {
    console.error('Error starting LLM server:', error);
    dialog.showErrorBox('Startup Error', `Failed to start LLM server: ${error.message}`);
    app.quit();
  }
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      webSecurity: true,
      nodeIntegration: false,
      sandbox: false,
      zoomFactor: 1.0,
      deviceScaleFactor: 1.0
    }
  });

  // and load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, '../frontend/schedule.html'));

  // Open the DevTools.
  // mainWindow.webContents.openDevTools();


  mainWindow.webContents.on('context-menu', (e) => {
    e.preventDefault(); // Disable right-click context menu
  });

  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (
      input.control && input.shift && input.key.toLowerCase() === 'i' || // Ctrl+Shift+I
      input.key === 'F12'                                               // F12
    ) {
      event.preventDefault(); // Disable DevTools shortcuts
    }
  });
};

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  if(isDev){
    startLLMServer();
    
    // // On OS X it's common to re-create a window in the app when the
    // // dock icon is clicked and there are no other windows open.
    // app.on('activate', () => {
    //   if (BrowserWindow.getAllWindows().length === 0) {
    //     createWindow();
    //   }
    // });
  }else{
    startLLMServer();
  }
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  if (llmProcess) llmProcess.kill();
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
ipcMain.on('ChatManager:sendRequest',async(e,{prompt,mode})=>{
  try{
    for await (const chunk of ChatManager.sendRequest(prompt,mode)){
      e.sender.send("ChatManager:stream",chunk);
    }
    e.sender.send('ChatManager:stream:end');
  }catch(err){
    e.sender.send("ChatManager:error",err.message);
  }
});
ipcMain.handle('load-history',(e,{courseId,topicId})=>ChatManager.loadChatHistory(courseId,topicId));
ipcMain.handle('save-chat',(e,{message,sender,courseId,topicId})=>ChatManager.saveMessage(message,sender,courseId,topicId));
ipcMain.handle('chat-file-upload',(e,{files,immediate})=>ChatManager.uploadFile(files,immediate));
ipcMain.handle('chat-file-delete',(e,{ids,types})=>ChatManager.deleteFile(ids,types));
ipcMain.handle('delete-session',(e,{userId,courseId,topicId})=>ChatManager.deleteSession(userId,courseId,topicId));

ipcMain.handle('get-upcoming-event',(e,{userId,fromDateISO,maxInstances})=>EventManager.getUpcomingEvents(userId,fromDateISO,maxInstances));
ipcMain.handle('create-event',(e,{userId,eventData})=>EventManager.createEventForUser(userId,eventData));
ipcMain.handle('delete-event',(e,{userId,eventId})=>EventManager.deleteEvent(userId,eventId));
ipcMain.handle('delete-instance',(e,{userId,eventId,startTime})=>EventManager.deleteSingleInstanceSmart(userId,eventId,startTime));
ipcMain.handle('delete-future-instance',(e,{userId,eventId,startTime})=>EventManager.deleteFutureInstanceSmart(userId,eventId,startTime));
ipcMain.handle('update-instance-continue',(e,{userId, eventId, startTime, shouldContinue})=>EventManager.updateInstanceContinue(userId, eventId, startTime, shouldContinue));
ipcMain.handle('get-month-event',(e,{userId,year,month})=> EventManager.getEventsForMonth(userId,year,month));
ipcMain.handle('export-user-db', (e, {userId}) => {
    const dbBuffer = EventManager.getUserDatabaseFile(userId);
    if (!dbBuffer) {
      throw new Error('Database not found');
    }
    ChatManager.exportDB(userId,dbBuffer);
});

ipcMain.handle('get-userdata',()=>{
  return global.user;
});
ipcMain.handle('set-userdata',(e,{newUser})=>{
  global.user={...global.user,...newUser};
  activateUser(global.user);
});

ipcMain.handle('register',async (e,{ email, username, contact, password })=>{
  const response=await fetch(`${ChatManager.server_address}/register`,{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body:JSON.stringify({ email, username, contact, password })
  })
  const data = await response.json();
    if (response.ok) {
    return 'Register Successful';
  } else {
    return `Register failed with error : ${data.detail}`;
  }
})

ipcMain.handle('login',async (e,{username,password })=>{
  const response = await fetch(`${ChatManager.server_address}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
  });
  const data = await response.json();
  if (data.success) {
      console.log("Login success:", data.success);
      return true;
  } else {
      console.log("Login failed:", data.message);
      return false;
  }
})