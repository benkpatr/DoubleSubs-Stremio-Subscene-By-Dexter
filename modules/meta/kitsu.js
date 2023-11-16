const got = require('got-scraping').gotScraping;
const BaseURL = require('../../configs/config').kitsuURL;

async function request(url) {
    return await got.get(url, {
        retry: { limit: 3},
        headers: {
            'Accept': 'application/vnd.api+json',
            'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0'
        }
    }).json().catch(err => { console.error(`Kitsu: failed to get meta from ${url}`)});
}


async function getMeta(id) {
    //let url = `${BaseURL}/anime?filter[text]=${encodeURIComponent(slug)}`
    let url = `${BaseURL}/anime/${id}`
    let res = await request(url);
    if(!res) return;
    let attributes = res.data.attributes;
    if(!attributes) return;
    return {
        title: attributes.titles,
        year: attributes.startDate.split("-")[0],
        slug: attributes.slug
    }
}

//getMeta("1").then(meta => (console.log(meta)))
module.exports = getMeta;