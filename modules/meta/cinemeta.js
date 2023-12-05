//const got = require('got-scraping').gotScraping;
const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
var slugify = require('slugify');
const { CineV3 } = require('../../configs/config');

async function request(url, header) {
    return await got.get(url, {
        retry: { limit: 3}
    }).catch(err => { console.error(`CineMeta: failed to get meta from ${url}`) });
}

async function getMeta(type, id) {
    if (type == "movie") {
        let url = `${CineV3}/movie/${id}.json`
        let res = await request(url);
        if(!res) return;
        res = JSON.parse(res.body);
        let title = res.meta?.name //res.data.original_title.match(/[\u3400-\u9FBF]/) ? res.data.title : res.data.original_title;  //match japanese char as slug ?
        if(!title) return;
        let year = res.meta.year?.split("-")[0] || res.meta.releaseInfo?.split('\u2013')[0]
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    } else if (type == "series") {
        let url = `${CineV3}/series/${id.split(':')[0]}.json`
        let res = await request(url);
        if(!res) return;
        res = JSON.parse(res.body);
        let title = res.meta?.name;//res.data.tv_results[0].original_name.match(/[\u3400-\u9FBF]/) ? res.data.tv_results[0].name : res.data.tv_results[0].original_name;
        if(!title) return;
        let year = res.meta.year?.split("-")[0];
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        let alterName = res.meta.country; //temp save for country info
        let videos = res.meta.videos;
        let seasons = [];
        videos?.forEach(video => {
            if(!seasons.find(season => season.season == video.season))
            seasons.push({
                season: video.season,
                year: video.released?.split('-')[0] //video.firstAired?.split('-')[0] || 
            })
        })
        return { title: title, slug: slug, year: year, seasons: seasons, alterName: alterName }
    }
}

//getMeta("series", 'tt0903747').then(meta => (console.log(meta)))
module.exports = getMeta;