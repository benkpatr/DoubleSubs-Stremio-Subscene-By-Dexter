const tmdb = require('./modules/meta/tmdb');
const kitsu = require('./modules/meta/kitsu');
const subscene = require('./subsceneAPI');
const config = require('./configs/config');
const languages = require('./configs/languages.json');
const NodeCache = require("node-cache");
//const sub2vtt = require('./modules/sub2vtt');
const { exactlyEpisodeRegex, estimateEpisodeRegex } = require('./modules/episodeRegex');
const db = require('./modules/bettersqlite3');
const { DateTime } = require('luxon');

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

const Cache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //sub list
const filesCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) })

async function subtitlesV2(type, id, lang, extras) {
  console.log(type, id, lang);
  let meta, primid = id, season, episode;
  const ids = id.split(':');
  if(type == 'series'){
    episode = ids.pop();
    primid = ids.join(':');
    if(ids[0] != 'kitsu') season = ids[1];
  }

  //######################
  const cacheID = `${id}_${lang}`;
  const subtitles = Cache.get(primid) || Cache.get(cacheID);
  if(subtitles) {
    console.log('cached main', cacheID);
    if(extras?.filename && subtitles.length > 1) {
      return sortMovieByFilename(subtitles, extras.filename);
    }
    return subtitles;
  }
  else {
    //try to get data from sqlite
    const sqlFoundPath = db.get(db.Tables.Search, ['id'], [primid])?.path;
    if(sqlFoundPath) {
      let subtitles  = getSubtitlesFromSQL(primid, lang);
      console.log('From SQL:', subtitles?.length);
      if(subtitles.length) {
        subtitles = subscene.sortByLang(subtitles);
        if(subtitles[lang]) subtitles = filterSub(subtitles[lang], lang, null, episode, extras.filename);
        Cache.set(cacheID, subtitles);
      }
      return subtitles;
    }
  }
  //######################

  meta = db.get(db.Tables.Meta, ['id'], [primid]);
  if(!meta) {
    if(ids[0] != 'kitsu') {
      meta = await tmdb(type, ids[0]);
      if(meta) {
        if(season) {
          meta.year = meta.seasons.find(x => x.season == season)?.year;
          const insert = [];
          meta.seasons.forEach(x => {
            if(x.year) insert.push([ids[0] + ':' + x.season, meta.title, meta.alterName, meta.slug, x.year]);
          });
          db.InsertMany(db.Tables.Meta, ['id', 'title', 'altername', 'slug', 'year'], insert);
        }
        else {
          db.set(db.Tables.Meta, ['id', 'title', 'altername', 'slug', 'year'], [primid, meta.title, meta.alterName || null, meta.slug, meta.year]);
        }
      }
    }
    else {
      meta = await kitsu(ids[1]);
      if(meta) {
        db.set(db.Tables.Meta, ['id', 'title', 'altername', 'slug', 'year'], [primid, meta.title, meta.alterName || null, meta.slug, meta.year]);
      }
    }
  }

  if(meta)  {
    console.log(meta);

    const search = await subscene.searchV2(meta.title);

    if(search?.length) {
      //find by name
      const re_title = meta.title.replace(/[^a-zA-Z0-9]+/g, '(.*?)');
      const reg = new RegExp(`${re_title}(.*?)${meta.year}`, 'i');
      console.log(reg);
      let finds = search.filter(x => reg.test(x.title));
      //console.log(finds)
      if(finds.length) {
        if(finds.length > 1) {
          let filters = [];
          if(meta.alterName && meta.alterName != meta.title) {
            filters = finds.filter(x => x.title.includes(meta.alterName));
          }
          if(!filters.length && season) {
            const season_text = ordinalInWord(season);
            filters = finds.filter(x => x.title.includes(season_text) || x.title.includes(`Season ${season}`));
          }
          if(filters.length) finds = filters;
        }

        let subtitles = [];
        for(const found of finds) {
          subtitles = await getsubtitles(found.path, primid, lang, season, episode, meta.year, extras);
          if(subtitles) return subtitles;
        }

        Cache.set(primid, []);
        return [];
      }
      else {
        console.log('search filter not found any')
        Cache.set(primid, []);
        return [];
      }
    } else throw `SearchV2 return empty page!`
  } else throw `SubtitlesV2 empty meta!`
}

function getSubtitlesFromSQL(id, lang) {
  let subtitles;
  subtitles = db.getAll(db.Tables.Subtitles, ['id', 'lang'], [id, lang]);
  return subtitles;
}

async function getsubtitles(moviePath, id, lang, season, episode, year, extras) {
  try {
    const cacheID = id + (episode ? ':' + episode : '') + '_' + lang;
    //console.log(cacheID)
    //[]: PageNotFound or No subs or Not match ID,Year
    var subtitles = await getSubtitlesWithYear(moviePath, id, episode, year);

    console.log('Scrapted:', subtitles?.length);

    if(!subtitles) return;

    subtitles = subscene.sortByLang(subtitles);
    
    if (subtitles[lang]) {
      subtitles = subtitles[lang];
      console.log('subtitles matched lang : ',subtitles.length);
      subtitles = filterSub(subtitles, lang, season, episode, extras?.filename);
      //############################
      //Save result to cache
      let cached = Cache.set(cacheID, subtitles);
      console.log("cached", cached);

      return subtitles;
    }
    else {
      console.log(`not matched any subs by language`);
      Cache.set(cacheID, []);
      return [];
    }
  }
  catch (e) {
    console.error(e);
  }
}

async function getSubtitlesWithYear(moviePath, id, episode, year, withYear = false) {
  if(withYear) moviePath += '-' + year;
  let subtitles = await subscene.getSubtitles(moviePath).catch(error => { throw error })
  let filter = [];
  if(subtitles?.length) {
    if(validID(subtitles[0], id, episode, year)) {
      //remove duplicate title by lang
      subtitles = subtitles.filter((sub, idx, self) => idx === self.findIndex(x => x.lang == sub.lang && x.title == sub.title));
      subtitles.forEach((sub, index) => {
        sub.title = sub.title.trim();
        const findIndex = filter.findIndex(x => x.path == sub.path);
        if(findIndex == -1) {
          filter.push(sub);
        }
        else {
          filter[findIndex].title += '\n' + sub.title;
        }
      });
      
      //save to db
      db.set(db.Tables.Search, ['id', 'path'], [id, moviePath]);
      const insert = filter.map(sub => [id, sub.lang, sub.title, sub.path]);
      db.InsertMany(db.Tables.Subtitles, ['id', 'lang', 'title', 'path'], insert);
    } else throw `They are different!`;
  }

  return filter;
}

function validID(resSub, id, episode, year) {
  if(id.split(':')[0] == 'kitsu') {
    if(year && resSub.year != year) {
      console.log(`KITSU year not match s:${resSub.year} - k:${year}`);
      return false
    }
  }
  else {
    let foundImdb = resSub.imdb_id;
    if(foundImdb) {
      if(episode) {
        let Imdb_number = id.split(':')[0].replace('tt', '');
        if(!foundImdb.includes(Imdb_number)) {
          console.log(`IMDB series not match ${foundImdb} - ${Imdb_number}`);
          return false
        }
      }
      else {
        let Imdb_number = id.split('_')[0].replace('tt', '');
        if(!foundImdb.includes(Imdb_number)) {
          console.log(`IMDB movie not match ${foundImdb} - ${Imdb_number}`);
          return false
        }
      }
    }
  }

  //default
  return true;
}

function filterSub(subtitles = Array, lang, season, episode, filename) {
  let subs = [];
  let sub = [];
  if (episode) {
    //filter exactly
    const reg = exactlyEpisodeRegex(episode).include();
    sub = subtitles.filter(element => reg.test(element.title));
    console.log('exactly filter found:', sub.length);

    //filter Estimate
    if(!sub.length) {
      const reg = estimateEpisodeRegex(episode).include();
      sub = subtitles.filter(element => reg.test(element.title));
      console.log('Estimate filter found:', sub.length);
    }

    //if not found, return the subtitles for multiple ep
    if(!sub.length) {
      //exclude exactly ep first
      const reg = exactlyEpisodeRegex(episode).exclude();
      const regFromTo = /(?:E(pisode)?)?[^a-z0-9]?(\d{1,4})\s?(-|~|to)\s?(?:E(pisode)?)?[^a-z0-9]?(\d{1,4})/i;
      const re_Season = 's(eason)?[^a-z\\d]?0?' + season + '(\\D|$)|' + season + '(st|nd|th)[^a-z\\d]season';
      const regSeason = new RegExp(re_Season, 'i');

      sub = subtitles.filter(element => {
        const title = element.title;
        if(regFromTo.test(title)) {
          const r = regFromTo.exec(title);
          const fromEP = r[2];
          const toEP = r[5];
          if(parseInt(fromEP) <= parseInt(episode) && parseInt(episode) <= parseInt(toEP)) return true;
          return false;
        }
        else if(season && regSeason.test(title) && !reg.test(title)) return true;
      });
      console.log('Multiple EP filter found:', sub.length);

      //if not found, return all(without estimate ep, multi ep) ...
      //this way like really take long time ~~
      if(!sub.length) {
        const reg = estimateEpisodeRegex(episode).exclude();
        const exSS = re_Season.replace(new RegExp(season, 'g'), '\\d{1,3}');
        const excludeRegSeason = new RegExp(exSS, 'i');
        //console.log(reg)
        sub = subtitles.filter(element => 
          !reg.test(element.title)
          && !regFromTo.test(element.title)
          && !excludeRegSeason.test(element.title)
        );
        console.log('Another without (EP, MultiEP) found:', sub.length);
      }
    }

    //subtitles = [...new Set(sub)];
    subtitles = sub;
  }
  //remove duplicate title (duplicate id, path)
  //subtitles = subtitles.filter((x, index, self) => index === self.findIndex(y => y.path === x.path || y.title === x.title));
  console.log("filtered subs:", subtitles.length);

  //------------------
  // sort movie by extra filename
  if(filename && subtitles.length > 1) {
    subtitles = sortMovieByFilename(subtitles, filename)
  }
  //-----------------

  for (let i = 0; i < (subtitles.length); i++) {
    let value = subtitles[i];
    let simpleTitle = value.path.split('/').pop();
    if (value) {
        //let path = config.BaseURL + value.path;
        let url;
        if (episode) {
          url = config.local+"/sub.vtt?"+`lang=${lang}&title=${encodeURIComponent(subtitles[i].title)}&episode=${episode}&from=${value.path}` // + sub2vtt.gerenateUrl(path, {});
        } else {
          url = config.local+"/sub.vtt?"+`lang=${lang}&title=${encodeURIComponent(subtitles[i].title)}&from=${value.path}` // + sub2vtt.gerenateUrl(path, {});
        }
        
        subs.push({
            lang: languages[lang].iso || languages[lang].id,
            title: subtitles[i].title,
            id: "subscene."+`${i}`+"."+ simpleTitle,
            url: url
        });
    }
  }

  return subs;
}

function sortMovieByFilename(subtitles, filename) {
    const qualitys = [ "480p", "720p", "1080p", "1440p", "2160p" ];
    const sources = [ /(web)(.?dl|rip)?/, /blu.?ray/, /a?hdtv/, /dvd(rip)?/, /brrip/ ];
    const vcodexs = [ /(h.?|x)264/, /(h.?|x)265/];

    let quality = qualitys.findIndex(quality => filename.toLowerCase().match(quality));
    let source = sources.findIndex(source => filename.toLowerCase().match(source));
    let vcodex = vcodexs.findIndex(vcodec => filename.toLowerCase().match(vcodec));
    
    console.log('sort by:', qualitys[quality], sources[source], vcodexs[vcodex]);

    subtitles = sortByKey(subtitles, qualitys[quality], sources[source], vcodexs[vcodex]);

    return subtitles;

    function sortByKey(subs, ...strs) {

      if(!strs[0]) { //check if the input filter has first value is empty
        if(strs.length != 1) {
          return sortByKey(subs, strs.slice(1));
        }
        else {
          return subs;
        }
      }

      let inList = [];
      let notList = [];

      subs.forEach(sub => {
        if(sub.title.toLowerCase().match(strs[0])) {
          inList.push(sub);
        }
        else {
          notList.push(sub);
        }
      });

      if(strs.length != 1) {
        for(let i = 1; i < strs.length; i++)  {
          inList = sortByKey(inList, strs[i]);
          notList = sortByKey(notList, strs[i]);
        }
      }
      
      return inList.concat(notList);
    }
}

async function downloadUrl(path, episode) {
  //let cachID = episode ? path + '_' + episode : path;
  //let cached = filesCache.get(cachID);
  let cached = db.get(db.Tables.Subtitles, ['path'], [path]);
  if (cached) {
    let dlpath = cached.dlpath;
    let updated_at = cached.updated_at;
    console.log('File already cached', dlpath.split('/').pop());
    
    let update_time = DateTime.fromSQL(updated_at, { zone: 'utc' });
    let current_time = DateTime.now();

    //console.log(update_time - current_time);

    if((current_time - update_time) >= DAY_IN_MS)
    return await getDownloadUrl(path)
    else
    return dlpath;
  
  } else {
    
  }

  async function getDownloadUrl(path) {
    return await subscene.downloadUrl(config.BaseURL + path).then(url => {
      let cached = db.set(db.Tables.Subtitles, ['dlpath'], [url], 'path', path);
      console.log("Caching File", cached.changes ? true : false)
      return url;
    })
    .catch(error => { console.log(error) });
  }
}


function filtered(list, key, value) {
  var filtered = [], i = list.length;
  var reg = new RegExp(value.toLowerCase(), 'gi');
  while (i--) {
  if (reg.test(list[i][key].toLowerCase())) {
      filtered.push(list[i]);
  }
  }
  return filtered;
};

function ordinalInWord(cardinal) {
  const ordinals = ["zeroth", "First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh", "Eighth", "Ninth", "Tenth", "Eleventh", "Twelfth", "Thirteenth", "Fourteenth", "Fifteenth", "Sixteenth", "Seventeenth", "Eighteenth", "Nineteenth", "Twentieth"]

  var tens = {
    20: 'twenty',
    30: 'thirty',
    40: 'forty',
    50: 'Fifty',
    60: 'Sixty',
    70: 'Seventy',
    80: 'Eighty',
    90: 'Ninety'
  };
  var ordinalTens = {
    30: 'thirtieth',
    40: 'fortieth',
    50: 'fiftieth',
    60: 'Sixtieth',
    70: 'Seventieth',
    80: 'Eightieth',
    90: 'Ninetieth'
  };

  if (cardinal <= 20) {
    return ordinals[cardinal];
  }

  if (cardinal % 10 === 0) {
    return ordinalTens[cardinal];
  }

  return tens[cardinal - (cardinal % 10)] + ordinals[cardinal % 10];
}


module.exports = { subtitlesV2, downloadUrl, Cache };
