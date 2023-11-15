const got = require('got-scraping').gotScraping;
var slugify = require('slugify');
const { CineV3 } = require('../config');

async function request(url, header) {
    return await got.get(url, {
        retry: { limit: 3}
    }).json().catch(err => { console.error(`CineMeta: failed to get meta from ${url}`) });
}

async function getMeta(type, id) {
    if (type == "movie") {
        let url = `${CineV3}/movie/${id}.json`
        let res = await request(url);
        if(!res) return;
        let title = res.meta.name //res.data.original_title.match(/[\u3400-\u9FBF]/) ? res.data.title : res.data.original_title;  //match japanese char as slug ?
        if(!title) throw `not found any meta from cinemeta`;
        let year = res.meta.year?.split("-")[0] || res.meta.releaseInfo?.split('\u2013')[0]
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    } else if (type == "series") {
        let url = `${CineV3}/series/${id.split(':')[0]}.json`
        let res = await request(url);
        let title = res.meta.name;//res.data.tv_results[0].original_name.match(/[\u3400-\u9FBF]/) ? res.data.tv_results[0].name : res.data.tv_results[0].original_name;
        if(!title) throw `not found any meta from cinemeta`
        let year = res.meta.year?.split("-")[0];
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    }
}

//getMeta("series", 'tt0903747').then(meta => (console.log(meta)))
module.exports = getMeta;