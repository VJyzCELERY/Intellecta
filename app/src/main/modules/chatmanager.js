const { session } = require("electron");
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');
const userid = 'testuser'
const USER_DIR = config.USER_DIR;
const CHAT_FILE = 'chat_history.json';

class ChatManager{
    constructor(server_address){
        this.server_address = server_address;
        this.local_storage = path.join(USER_DIR,userid);
        this.course_dir =path.join(this.local_storage,'courses');
    }

    setActiveUser(userId){
        this.local_storage = path.join(USER_DIR,userId);
        this.course_dir = path.join(this.local_storage,'courses');
    }
    
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

    async deleteFile(ids,types){
        await fetch(`${this.server_address}/delete`,{
            method:"POST",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify({ids,types}),
        });
    }

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

    async loadScheduleSession(userId){

    }

    changeServer(serverAddress){
        this.server_address=serverAddress;
    }

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