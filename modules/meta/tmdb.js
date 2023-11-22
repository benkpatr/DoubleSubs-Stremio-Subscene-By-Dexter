//const got = require('got-scraping').gotScraping;
const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
var slugify = require('slugify');
const BaseURL = require('../../configs/config').APIURL;
const cinemeta = require('./cinemeta.js')

async function request(url, header) {
    return await got.get(url, {
        retry: { limit: 3 }
    }).catch(err => { console.error(`TMDB: failed to get meta from ${url}`) });
}

async function getMeta(type, id) {
    if (type == "movie") {
        let url = `${BaseURL}/movie/${id}?language=en-US&api_key=${process.env.API_KEY}`
        let res = await request(url);
        if(!res) return;
        res = JSON.parse(res.body);
        let title = res.title || res.original_title; //res.data.original_title.match(/[\u3400-\u9FBF]/) ? res.data.title : res.data.original_title;  //match japanese char as slug ?
        if(!title) return cinemeta(type, id);
        let year = res.release_date?.split("-")[0]
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    } else if (type == "series") {
        let url = `${BaseURL}/find/${id.split(':')[0]}?language=en-US&api_key=${process.env.API_KEY}&external_source=imdb_id`;
        let res = await request(url);
        if(!res) return;
        res = JSON.parse(res.body);
        let title = res.tv_results[0]?.name || res.tv_results[0]?.original_name; //res.data.tv_results[0].original_name.match(/[\u3400-\u9FBF]/) ? res.data.tv_results[0].name : res.data.tv_results[0].original_name;
        if(!title) return cinemeta(type, id);
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug }
    }
}

module.exports = getMeta;