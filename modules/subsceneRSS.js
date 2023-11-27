const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
const cheerio = require("cheerio");
const languages = require('../configs/convertLanguages.json');
const db = require('./bettersqlite3');
const config = require('../configs/config')
const {Cache} = require('../subscene');

const MINUTES = 60 * 1000;
const baseURL = process.env.RSS_URL || 'https://subscene.com/browse/latest/';

const lastFetch = {
    movie: [],
    series: []
}

async function fetchRSS(url) {

    const type = url.split('/').pop();

    let currentFetch = [];

    const res = await got.get(url, {
        retry: {
            limit: 2
        }
    }).catch(err => console.error('RSS Fail to get:', url));

    if(res?.body) {
        if(url.includes('subscene.com')) {
            const $ = cheerio.load(res.body);
            $('tbody tr').each(async (idx, element) => {
                const rowinfo = $(element).find('td:first-child');
                const dlpath = $(rowinfo).find('a').attr('href');
                const path = dlpath.split('/').slice(0,3).join('/');
                let lang = $(rowinfo).find('span:first-child').text().trim();
                lang = languages[lang];

                currentFetch.push({
                    lang: lang,
                    path: path,
                    dlpath: dlpath
                });
                
            })
        }
        else {
            currentFetch = JSON.parse(res.body);
        }
    }

    switch(type) {
        case 'film': {
            await updateSQL(currentFetch, lastFetch.movie);
            lastFetch.movie = currentFetch;
        } break;
        case 'series': {
            await updateSQL(currentFetch, lastFetch.series);
            lastFetch.series = currentFetch;
        }
    }
}

async function updateSQL(fetch = Array, lastFetch = Array) {
    for(const item of fetch) {
        const { lang, path, dlpath } = item;

        const duplicate = lastFetch.find(x => x.path == dlpath);

        if(!duplicate) {
            const tbl_search_id = db.get(db.Tables.Search, ['path'], [path])?.id;
            if(tbl_search_id) {
                const test = db.get(db.Tables.Subtitles, ['id', 'path'], [tbl_search_id, dlpath]);
                console.log(test ? 'skip' : 'insert', tbl_search_id, dlpath);
                if(!test) {
                    const res1 = await got.get(config.BaseURL + dlpath, {
                        retry: {
                            limit: 2
                        }
                    }).catch(err => console.error('RSS1 Fail to get:', url));

                    if(res1?.body) {
                        let titles = [];
                        const $ = cheerio.load(res1.body);
                        $('.release div').each((idx, div) => {
                            titles.push($(div).text().trim());
                        });

                        const dlpath1 = config.BaseURL + $('#downloadButton').attr('href');
                        db.set(db.Tables.Subtitles, ['id', 'lang', 'title', 'path', 'dlpath'], [tbl_search_id, lang, titles.join('\n'), dlpath, dlpath1]);

                        //Force remove cache
                        const cacheKey = Cache.keys.find(key => key.startsWith(tbl_search_id));
                        if(cacheKey) Cache.del(cacheKey);
                    }
                }
            }
        }
    }
}

setInterval(async function(){
    await fetchRSS(baseURL + 'series');
    setTimeout(async ()  => await fetchRSS(baseURL + 'film'), 1*MINUTES);
}, 10*MINUTES)

const getLastFetch = () => lastFetch;

module.exports = getLastFetch;