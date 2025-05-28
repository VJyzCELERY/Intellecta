const fs = require('fs');
const path = require('path');
const {app} = require('electron');

const isDev = !app.isPackaged;
const basePath = isDev? app.getAppPath() : path.join(process.resourcesPath);

const config={
    COURSES_DIR : path.join(basePath, 'userdata', 'courses'),

}

module.exports = config;