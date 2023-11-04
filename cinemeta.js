const axios = require('axios').default;
var slugify = require('slugify');
const { CineV3 } = require('./config');
const BaseURL = require('./config').APIURL;
require('dotenv').config();

async function request(url, header) {

    return await axios
        .get(url, header, { timeout: 5000 })
        .then(res => {
            return res;
        })
        .catch(error => {
            if (error.response) {
                console.error('error on cinemeta.js request:', error.response.status, error.response.statusText, error.config.url);
            } else {
                console.error(error);
            }
        });

}

async function getMeta(type, id) {
    if (type == "movie") {
        let url = `${CineV3}/movie/${id}.json`
        let res = await request(url);
        console.log(res.data.meta.name)
        let title = res.data.meta.name //res.data.original_title.match(/[\u3400-\u9FBF]/) ? res.data.title : res.data.original_title;  //match japanese char as slug ?
        let year = res.data.meta.year.split("-")[0]
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    } else if (type == "series") {
        let url = `${CineV3}/series/${id}.json`
        let res = await request(url);
        let title = res.data.meta.name;//res.data.tv_results[0].original_name.match(/[\u3400-\u9FBF]/) ? res.data.tv_results[0].name : res.data.tv_results[0].original_name;
        let year = res.data.meta.year.split("-")[0];
        var slug = slugify(title, { replacement: '-', remove: undefined, lower: true, strict: true, trim: true });
        return { title: title, slug: slug, year: year }
    }
}

//getMeta("series", 'tt0903747').then(meta => (console.log(meta)))
module.exports = getMeta;