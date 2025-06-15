const { session } = require("electron");
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');
const USER_DIR = config.USER_DIR;
const CHAT_FILE = 'chat_history.json';
const http = require('http');

/**
 * Manages chat history, file uploads, session handling, and communication with a Python backend server.
 */
class ChatManager{
    /**
     * Initializes a ChatManager instance with a given backend server address.
     * @param {string} server_address - The address of the backend server.
     */
    constructor(server_address){
        this.server_address = server_address;
    }
    /**
     * Sets the active user context, initializing the user-specific and course-specific directories.
     * @param {string} userId - The ID of the currently active user.
     */
    setActiveUser(userId){
        this.local_storage = path.join(USER_DIR,userId);
        this.course_dir = path.join(this.local_storage,'courses');
    }
    /**
     * Uploads a SQLite database file buffer to the backend server for the specified user.
     * @param {string} userId - The ID of the user.
     * @param {Buffer} dbBuffer - The database file buffer.
     */    
    async exportDB(userId,dbBuffer){
        const formData = new FormData();
        formData.append('userId', userId);
        formData.append('dbFile', new Blob([dbBuffer]), 'schedule.db');
        await fetch(`${this.server_address}/import-db`, {
            method: 'POST',
            body: formData
        });
    
    }
    /**
     * Repeatedly checks the server's health endpoint until it responds with HTTP 200 or fails after retries.
     * @param {number} retries - Maximum number of retries (default: 180).
     * @param {number} interval - Time between retries in ms (default: 1000).
     * @returns {Promise<void>}
     */
    waitForHealthCheck(retries = 180, interval = 1000) {
        return new Promise((resolve, reject) => {
            const check = () => {
            http.get(`${this.server_address}/health`, (res) => {
                if (res.statusCode === 200) {
                    resolve();
                } else {
                    retry();
                }
            }).on('error', retry);
            };

            const retry = () => {
            if (retries <= 0) return reject(new Error('Python backend failed to start'));
            retries--;
            setTimeout(check, interval);
            };

            check();
        });
    }
    /**
     * Sends a prompt to the backend server and yields streaming responses using async generator.
     * @param {string} prompt - Prompt text to send.
     * @param {string} mode - Mode for generation ('chat' by default).
     * @yields {string} - Partial streamed response.
     */
    async *sendRequest(prompt=" ",mode='chat'){
        const response = await fetch(`${this.server_address}/generate`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({prompt,mode}),
        });

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let {value,done} = await reader.read();
        while(!done){
            yield decoder.decode(value,{stream:true});
            ({ value, done } = await reader.read());
        }
    }
    /**
     * Sends a delete request to remove files or resources by ID and type.
     * @param {string[]} ids - Array of resource IDs to delete.
     * @param {string[]} types - Corresponding types of the resources to delete.
     */
    async deleteFile(ids,types){
        await fetch(`${this.server_address}/delete`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ids,types}),
        });
    }
    /**
     * Uploads one or more files to the backend for processing.
     * @param {FileList|Array} files - Files to upload.
     * @param {boolean} immediate - Whether to process files immediately after upload.
     * @returns {Promise<string|undefined>} - Success message from server or undefined on failure.
     */
    async uploadFile(files,immediate){
        if(!immediate){
            immediate=false;
        }
        if(files.length === 0){
            alert("Please at least upload one file");
            return;
        }
        console.log('file uploaded : ',files);
        try {
            // Convert files to ArrayBuffer format
            const filesData = await Promise.all(Array.from(files).map(async (file) => {
                const arrayBuffer = file.arrayBuffer;
                return {
                    id:file.id,
                    name: file.name,
                    arrayBuffer: Array.from(new Uint8Array(arrayBuffer))
                };
            }));

            // Prepare request with additional parameters
            const requestData = {
                files: filesData,
                IMMEDIATE_PROCESS:immediate
            };

            const response = await fetch(`${this.server_address}/upload/`, {
                method: "POST",
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            if(!response.ok){
                console.error("Upload failed", await response.text());
                return;
            }
            
            const data = await response.json();
            return data.message;
        } catch(error) {
            console.error("Upload failed: ", error);
        }
    }
    /**
     * Loads a chat session from the backend server using user, course, and topic identifiers.
     * @param {string} userId - User ID.
     * @param {string} courseId - Course ID.
     * @param {string} topicId - Topic ID.
     */
    async loadSession(userId,courseId,topicId){
        const sessionId = path.join(userId,courseId,topicId);
        
        const response = await fetch(`${this.server_address}/loadSession`,{
            method:"POST",
            headers:{"Content-Type":"text/plain"},
            body:sessionId,
        })

        if(!response.ok){
            console.error("Failed loading session");
        }
    }
    /**
     * Changes the backend server address.
     * @param {string} serverAddress - New server address.
     */
    changeServer(serverAddress){
        this.server_address=serverAddress;
    }
    /**
     * Deletes a session file or directory based on course and topic.
     * @param {string} userId - User ID.
     * @param {string} courseId - Course ID.
     * @param {string|null} topicId - Topic ID (optional).
     */
    async deleteSession(userId,courseId,topicId=null){
        let sessionId;
        if (topicId){
            sessionId = path.join(userId,courseId,topicId);
        }else{
            sessionId = path.join(userId,courseId);
        }
        console.log(`Deleting ${sessionId}`);
        const response = await fetch(`${this.server_address}/delete-session`,{
            method:"POST",
            headers:{"Content-Type":"text/plain"},
            body:sessionId,
        })

        if(!response.ok){
            console.error("Failed deleting session");
        }
    }
    /**
     * Loads chat history from the local file system for the specified course and topic.
     * @param {string} courseId - Course ID.
     * @param {string} topicId - Topic ID.
     * @returns {Promise<Array>} - Chat history array.
     */
    async loadChatHistory(courseId,topicId){
        // Ensure the directory exists
        // console.log(`${userId},${courseId},${topicId}`);
        const chatDirectory=path.join(this.course_dir,courseId,topicId);
        const historyDir=path.join(chatDirectory,CHAT_FILE);
        console.log(`Loading from ${historyDir}`);
        if (!fs.existsSync(chatDirectory)) {
            fs.mkdirSync(chatDirectory, { recursive: true }); // Create directory if it doesn't exist
        }

        // Check if chatFile exists and is a file before reading
        if (fs.existsSync(historyDir)) {
            return JSON.parse(fs.readFileSync(historyDir));
        }

        return []; // Return an empty array if no chat history exists
    }
    /**
     * Saves a message to local chat history for a given course and topic.
     * @param {string} message - The message content.
     * @param {string} sender - Sender's name or ID.
     * @param {string} courseId - Course ID.
     * @param {string} topicId - Topic ID.
     */
    async saveMessage(message,sender,courseId,topicId){
        const chatDirectory=this.local_storage;
        const historyDir=path.join(chatDirectory,CHAT_FILE);
        console.log(`Saving to ${historyDir}`);
        if(!fs.existsSync(chatDirectory)){
            fs.mkdirSync(chatDirectory,{recursive:true});
        }
        const history = await this.loadChatHistory(courseId,topicId);
        history.push({sender:sender,message:message});
        fs.writeFileSync(historyDir,JSON.stringify(history,null,2));


    }
}

module.exports = ChatManager;