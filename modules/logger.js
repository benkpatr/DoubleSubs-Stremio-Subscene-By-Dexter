const cons = require('console');
const { json } = require('express');
const fs = require('fs');
const { isString } = require('util');

const logsPath = process.cwd() + '/logs';
const logger = {
    empty(){
        fs.writeFileSync(logsPath + '/app.logs', '');
    },
    log(message, ...optionParams){
        if(!isString(message)) message = JSON.stringify(message, null, 2);
        if(optionParams) optionParams.forEach(param => { message += " " + (isString(param) ? param : JSON.stringify(param, null, 2)) })
        cons.log(message);
        const file = logsPath + '/app.logs';
        if(fs.statSync(file).size/1024/1024 >= 2) this.empty();
        fs.appendFileSync(file, message + '\n');
    },
    emptyError(){
        fs.writeFileSync(logsPath + '/error.logs', '');
    },
    error(message, ...optionParams){
        if(message && !isString(message)) message = JSON.stringify(message, null, 2);
        if(optionParams?.length) optionParams.forEach(param => { message += " " + (isString(param) ? param : JSON.stringify(param, null, 2)) })
        cons.log(message);
        const file = logsPath + '/error.logs';
        if(fs.statSync(file).size/1024/1024 >= 5) this.emptyError();
        fs.appendFileSync(file, message + '\n');
    },
    read(){
        const data = fs.readFileSync(logsPath + '/app.logs');
        return data;
    },
    readError(){
        const data = fs.readFileSync(logsPath + '/error.logs');
        return data;
    }
}

module.exports = logger;