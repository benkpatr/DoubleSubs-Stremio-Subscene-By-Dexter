const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
const cheerio = require("cheerio");
const languages = require('../configs/convertLanguages.json');
const db = require('./bettersqlite3');
const config = require('../configs/config')

const MINUTES = 60 * 1000;
const baseURL = 'https://subscene.com/browse/latest/';

let lastFetch = [];

async function fetchRSS(url) {
    let currentFetch = [];

    const res = await got.get(url, {
        retry: {
            limit: 2
        }
    }).catch(err => console.error('RSS Fail to get:', url));

    if(res?.body) {
        if(url.includes('subscene.com')) {
            const subtitles = [];
            const $ = cheerio.load(res.body);
            $('tbody tr').each(async (idx, element) => {
                const rowinfo = $(element).find('td:first-child');
                const dlpath = $(rowinfo).find('a').attr('href');
                const path = dlpath.split('/').slice(0,3).join('/');
                let lang = $(rowinfo).find('span:first-child').text().trim();
                lang = languages[lang];

                currentFetch.push(dlpath);
                const duplicate = lastFetch.find(x => x == dlpath);

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
                            }
                        }
                    }
                }
            })
        }
        else {
            const subtitles = JSON.parse(res.body);
        }
    }

    lastFetch = currentFetch;
}

setInterval(async function(){
    await fetchRSS(baseURL + 'series');
    setTimeout(async ()  => await fetchRSS(baseURL + 'film'), 5*MINUTES);
}, 10*MINUTES)