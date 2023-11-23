const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
const api_server = 'https://api.ipify.org'

async function getIP() {
    return got.get(api_server).then(result => {
        return result.body;
    }).catch(err => { throw "failed to get current ip" });
}

module.exports = getIP;