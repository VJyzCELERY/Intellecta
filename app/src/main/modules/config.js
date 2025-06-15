const fs = require('fs');
const path = require('path');
const {app} = require('electron');

const isDev = !app.isPackaged;
// const isDev = true;
const basePath = isDev? app.getAppPath() : path.join(process.resourcesPath);

const config={
    USER_DIR : path.join(basePath,'userdata'),

}

module.exports = config;