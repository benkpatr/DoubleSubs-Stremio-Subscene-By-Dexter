const cons = require('console');
const fs = require('fs');
const { isString } = require('util');

const logsPath = process.cwd() + '/logs';
const logger = {
    empty(){
        fs.writeFileSync(logsPath + '/app.logs', '');
    },
    log(message, ...optionParams){
        if(message && !isString(message) && Object.keys(message)?.length) message = JSON.stringify(message, null, 2);
        if(optionParams) optionParams.forEach(param => { 
            message += " " + (isString(param) ?
            param :
                (param && Object.keys(param)?.length ?
                JSON.stringify(param, null, 2) :
                param?.toString())) 
            })
        cons.log(message?.toString());
        const file = logsPath + '/app.logs';
        if(fs.statSync(file).size/1024 >= 256) this.empty(); // max 256 kb
        fs.appendFileSync(file, message?.toString() + '\n');
    },
    emptyError(){
        fs.writeFileSync(logsPath + '/error.logs', '');
    },
    error(message, ...optionParams){
        if(message && !isString(message) && Object.keys(message)?.length) message = JSON.stringify(message, null, 2);
        if(optionParams) optionParams.forEach(param => { 
            message += " " + (isString(param) ?
            param :
                (param && Object.keys(param)?.length ?
                JSON.stringify(param, null, 2) :
                param?.toString())) 
            })
        const file = logsPath + '/error.logs';
        if(fs.statSync(file).size/1024 >= 256) this.emptyError();
        if(message?.stack) {
            this.log(message.stack);
            fs.appendFileSync(file, message.stack + '\n\n');
        } else {
            this.log(message?.toString());
            fs.appendFileSync(file, message?.toString() + '\n');
        }

    },
    emptyWarn(){
        fs.writeFileSync(logsPath + '/warn.logs', '');
    },
    warn(message, ...optionParams){
        if(message && !isString(message) && Object.keys(message)?.length) message = JSON.stringify(message, null, 2);
        if(optionParams) optionParams.forEach(param => { 
            message += " " + (isString(param) ?
            param :
                (param && Object.keys(param)?.length ?
                JSON.stringify(param, null, 2) :
                param?.toString())) 
            })
        const file = logsPath + '/warn.logs';
        if(fs.statSync(file).size/1024 >= 256) this.emptyError();
        if(message?.stack) {
            this.log(message.stack);
            fs.appendFileSync(file, message.stack + '\n\n');
        } else {
            this.log(message?.toString());
            fs.appendFileSync(file, message?.toString() + '\n');
        }

    },
    read(){
        const data = fs.readFileSync(logsPath + '/app.logs');
        return data;
    },
    readError(){
        const data = fs.readFileSync(logsPath + '/error.logs');
        return data;
    },
    readWarn(){
        const data = fs.readFileSync(logsPath + '/warn.logs');
        return data;
    },
}

module.exports = logger;