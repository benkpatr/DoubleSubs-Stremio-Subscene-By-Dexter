const got = require('../got-scraping');
const BaseURL = require('../../configs/config').kitsuURL;

async function request(url) {
    return await got().get(url, {
        headers: {
            'Accept': 'application/vnd.api+json'
        }
    }).catch(err => { console.error(`Kitsu: failed to get meta from ${url}`)});
}


async function getMeta(id) {
    //let url = `${BaseURL}/anime?filter[text]=${encodeURIComponent(slug)}`
    let url = `${BaseURL}/anime/${id}`
    let res = await request(url);
    if(!res) return;
    res = JSON.parse(res.body);
    let attributes = res.data.attributes;
    if(!attributes) return;
    //remove (tv) (movie) in some anime
    let year = attributes.startDate.split("-")[0];
    let title = attributes.titles['en_jp'] || attributes.titles['canonicalTitle'];
    title = title.replace(/\(tv\)|\(movie\)/i, '').trim();
    title = title.replace(new RegExp(`\\(${year}\\)`, 'i'), '').trim();
    //remove Season x
    title = title.replace(new RegExp('season \\d', 'i'), '').trim();
    
    let slug = attributes.slug;
    slug = slug.replace(/-tv$|-movie$/, '');
    return {
        title: title,
        year: year,
        slug: slug
    }
}

//getMeta("1").then(meta => (console.log(meta)))
module.exports = getMeta;