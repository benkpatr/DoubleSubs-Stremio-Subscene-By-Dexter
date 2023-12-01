const got = {
    get: async (...args) => (await import('got-scraping')).gotScraping.get(...args)
}
const cheerio = require("cheerio");
const languages = require('../configs/convertLanguages.json');
const db = require('./bettersqlite3');
const config = require('../configs/config')
const {getCache} = require('../subscene');

const MINUTES = 60 * 1000;
const baseURL = process.env.RSS_URL || 'https://subscene.com/browse/latest/';

const lastFetch = {
    movie: [],
    series: []
}

async function fetchRSS(url) {

    try {
        const type = url.split('/').pop();

        let currentFetch = [];

        const res = await got.get(url, {
            retry: {
                limit: 2,
                calculateDelay: ({attemptCount, retryOptions, error}) => {
                    if(attemptCount >= retryOptions.limit) return 0;
                    if(error.statusCode == 429) return 1000;
                    else if(error.statusCode == 404) return 0;
                    else return 500;
                }
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

                if(currentFetch.length) {
                    //save to db
                    const insert_many = [];
                    currentFetch.forEach(item => insert_many.push(Object.values(item)));
                    db.InsertMany(db.Tables.RSS, ['lang', 'path', 'dlpath'], insert_many);
                }
            }
            else {
                currentFetch = JSON.parse(res.body);
            }
        }

        if(currentFetch.length) {
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
    }
    catch(err) {
        console.error(err);
    }
}

fetchRSS('https://subscene.com/browse/latest/film')
async function updateSQL(fetch = Array, lastFetch = Array) {
    try {
        for(const item of fetch) {
            const { lang, path, dlpath } = item;
    
            const duplicate = lastFetch.find(x => x.dlpath == dlpath);
    
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
                            const reg = new RegExp(tbl_search_id + '(.*?)' + lang);
                            const cacheKey = getCache().keys().find(key => reg.test(key));
                            if(cacheKey) {
                                console.log(`Deleting Cache:`, cacheKey);
                                getCache().del(cacheKey);
                            }
                        }
                    }
                }
            }
        }
    }
    catch(err) {
        console.error(err);
    }
}

setInterval(async function(){
   try {
    await fetchRSS(baseURL + 'series');
    setTimeout(async ()  => await fetchRSS(baseURL + 'film'), 1*MINUTES);
   }
   catch(err){
    console.error(err);
   }
}, 5*MINUTES)

const getLastFetch = () => lastFetch;

module.exports = { getLastFetch, updateSQL };