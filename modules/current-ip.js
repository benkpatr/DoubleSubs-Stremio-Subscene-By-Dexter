const axios = require('axios');
const api_server = 'https://api.ipify.org'

async function getIP() {
    return await axios.get(api_server).then(res => {
        return res.data;
    }).catch(err => { throw "failed to get current ip" });
}

module.exports = getIP;