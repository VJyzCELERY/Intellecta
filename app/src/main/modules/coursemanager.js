// courseManager.js
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { v4: uuidv4 } = require('uuid');
const USER_DIR = config.USER_DIR;

class CourseManager {
  setActiveUser(userId){
    global.user.id = userId;
    this.course_dir = path.join(USER_DIR,userId,'courses');
  }

  createCourse({ title, description }) {
    const id = uuidv4();
    const courseDir = path.join(this.course_dir, id);
    fs.mkdirSync(courseDir, { recursive: true });

    const metadata = { id, title, description, createdAt: new Date() };
    fs.writeFileSync(path.join(courseDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    return metadata;
  }
  deleteCourse(id){
    const courseDir = path.join(this.course_dir,id);
    try{
      fs.rmSync(courseDir,{recursive:true,force:true});

    }catch (e){
      console.log("Failed deleting directory : ",e);
    }
  }
  getCourses() {
    fs.mkdirSync(this.course_dir,{recursive:true});
    const dirs = fs.readdirSync(this.course_dir);
    return dirs.map(dir => {
      const metaPath = path.join(this.course_dir, dir, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath));
      }
      return null;
    }).filter(Boolean);
  }

  createTopic(courseId, topicTitle) {
    const topicId = `topic_${Date.now()}`;
    const topicDir = path.join(this.course_dir, courseId, topicId);
    fs.mkdirSync(topicDir, { recursive: true });
    console.log(topicTitle);
    const metadata = {
      id: topicId,
      title: topicTitle,
      createdAt: new Date()
    };
    console.log(metadata);
    console.log(metadata.title)
    fs.writeFileSync(path.join(topicDir, 'metadata.json'), JSON.stringify(metadata, null, 2));
    fs.mkdirSync(path.join(topicDir, 'documents'));

    return metadata;
  }

  deleteTopic(courseId,topicId){
    const topicDir = path.join(this.course_dir,courseId,topicId);
    fs.rmSync(topicDir,{recursive:true,force:true});
  }
  

  getTopics(courseId) {
    const coursePath = path.join(this.course_dir, courseId);
    const dirs = fs.readdirSync(coursePath).filter(f => f.startsWith('topic_'));

    return dirs.map(dir => {
      const metaPath = path.join(coursePath, dir, 'metadata.json');
      if (fs.existsSync(metaPath)) {
        return JSON.parse(fs.readFileSync(metaPath));
      }
      return null;
    }).filter(Boolean);
  }

  renameTopic(courseId,topicId,topicTitle){
    const coursePath = path.join(this.course_dir, courseId);
    const topicDir = path.join(coursePath,topicId);
    if(!fs.existsSync(topicDir)){
      return;
    }
    const metadata=this.loadMetadata(topicDir);
    if(!metadata){
      return;
    }
    metadata.title=topicTitle;
    this.saveMetadata(topicDir,metadata);

  }

  renameDocument(courseId,topicId,documentId,newTitle){
    const documentPath = path.join(this.course_dir, courseId, topicId, 'documents');
    let metadata = this.loadMetadata(documentPath);
    if(!metadata){
      return;
    }
    const index = metadata.findIndex(data=>data.fileid===documentId);
    let doc = metadata.splice(index, 1)[0];
    doc.name = `${newTitle}.${doc.type}`;
    metadata.splice(index,0,doc);
    this.saveMetadata(documentPath,metadata);
  }

  loadMetadata(basepath){
    const metadataFile = path.join(basepath, 'metadata.json')
    let metadata=[]
    if (fs.existsSync(metadataFile)) {
      try {
        metadata = JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
      } catch (err) {
        console.error("Failed to parse existing metadata:", err);
      }
    }
    return metadata;
  }

  saveMetadata(basepath,metadata){
    const metadataFile = path.join(basepath, 'metadata.json')
    try {
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2));
    } catch (err) {
      console.error("Failed to write metadata:", err);
    }
  }

  saveNotes(courseId,topicId,notesId,content){
    const documentPath = path.join(this.course_dir, courseId, topicId, 'documents');
    let metadata = this.loadMetadata(documentPath);
    if(!metadata){
      return;
    }
    const note = metadata.find(data => data.fileid===notesId);

    fs.writeFileSync(note.path,content,'utf-8');
  }

  getDocuments(courseId,topicId){
    const documentPath = path.join(this.course_dir, courseId, topicId, 'documents');
    if (!fs.existsSync(documentPath)) {
      fs.mkdirSync(documentPath);
    }
    let metadata = this.loadMetadata(documentPath);
    if(!metadata){
      return [];
    }
    let documents = [];
    for (const data of metadata){
      const filePath = path.join(data.path);
      let buffer = null;
      if(data.type ==='notes') buffer=fs.readFileSync(filePath,'utf-8');
      else buffer = fs.readFileSync(filePath);
      documents.push({
        id:data.fileid,
        name:data.name,
        type:data.type,
        buffer:buffer
      })
    }
    return documents;

  }

  uploadDocument(courseId,topicId,files){
    const documentPath = path.join(this.course_dir, courseId, topicId, 'documents');
    if (!fs.existsSync(documentPath)) fs.mkdirSync(documentPath, { recursive: true });
    let metadata = this.loadMetadata(documentPath);

    // Load existing metadata if it exists
    
    files.forEach(file =>{
      const id = file.id;
      const type = file.name.split('.').pop();
      const destPath = path.join(documentPath,`${id}.${type}`);
      let buffer = null;
      if (type === 'notes'){
        buffer = file.content;
      }else{
        buffer = Buffer.from(file.arrayBuffer);
      }
      console.log(buffer);
      try {
        if(type === 'notes') fs.writeFileSync(destPath,buffer,'utf-8');
        else fs.writeFileSync(destPath,buffer);
        metadata.push({
          fileid : id,
          name: file.name,
          path: destPath,
          type:type,
          uploadedAt: new Date().toISOString()
        });
      } catch (err) {
        console.error(err);
      }

    })
    this.saveMetadata(documentPath,metadata);
    return true;
  }
  deleteDocument(courseId,topicId,fileid){
    const documentPath = path.join(this.course_dir, courseId, topicId, 'documents');
    let metadata=this.loadMetadata(documentPath);
    const index = metadata.findIndex(data=>data.fileid===fileid);
    const doc = metadata.splice(index, 1)[0];
    if(doc){
      const filepath = doc.path;
      if(fs.existsSync(filepath)){
        fs.rmSync(filepath,{recursive:true,force:true});
      }
    }
    this.saveMetadata(documentPath,metadata);
  }
  

}

module.exports = CourseManager;
