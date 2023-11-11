const axios = require('axios');

const api_server = 'https://api.ipify.org'

async function getIP() {
    return axios.get(api_server).then(result => {
        return result.data;
    }).catch(err => { throw "failed to get current ip" });
}

module.exports = getIP;