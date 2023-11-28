const tmdb = require('./modules/meta/tmdb');
const kitsu = require('./modules/meta/kitsu');
const subscene = require('./subsceneAPI');
const config = require('./configs/config');
const languages = require('./configs/languages.json');
const NodeCache = require("node-cache");
//const sub2vtt = require('./modules/sub2vtt');
const { exactlyEpisodeRegex, estimateEpisodeRegex } = require('./modules/episodeRegex');
const db = require('./modules/bettersqlite3');

const Cache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //sub list

async function subtitles(type, id, lang, extras) {
  console.log(type, id, lang);
  if (id.match(/tt[0-9]/)) {
    let tmdb = await (TMDB(type, id, lang, extras)).catch(error => { throw error });
    if(tmdb == null && type != 'series')
      tmdb = await (TMDB(type, id, lang, extras, true)).catch(error => { throw error });
    return tmdb;
  }
  else if (id.match(/kitsu:[0-9]/)) {
    return await Kitsu(type, id, lang, extras);
  }
}
async function Kitsu(type, id, lang, extras) {
  try {
    const episode = id.split(':')[2];
    const metaid = id.split(':')[1];
    const kitsuID = 'kitsu:' + metaid;

    //######################
    const cacheID = `${id}_${lang}`;
    const subtitles = Cache.get(cacheID);
    if(subtitles) {
      console.log('kitsu cached main', cacheID);
      if(extras?.filename && subtitles.length > 1) {
        return sortMovieByFilename(subtitles, extras.filename);
      }
      return subtitles;
    }
    else {
      //try to get data from sqlite
      const sqlFoundPath = db.get(db.Tables.Search, ['id'], [kitsuID])?.path;
      if(sqlFoundPath) {
        let subtitles  = getSubtitlesFromSQL(kitsuID, lang);
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

    //let meta = KitsuCache.get(metaid);
    let meta = db.get(db.Tables.Meta, ['id'], [kitsuID]);
    if (!meta) {
        meta = await kitsu(metaid);
        if(meta) {
          //remove (tv) (movie) in some anime
          meta.title = meta.title['en_jp'] || meta.title['canonicalTitle'];
          meta.title = meta.title.replace(/\(tv\)|\(movie\)/i, '').trim();
          meta.title = meta.title.replace(new RegExp(`\\(${meta.year}\\)`, 'i'), '').trim();
          meta.slug = meta.slug.replace(/-tv$/, '');
          db.set(db.Tables.Meta, ['id', 'title', 'slug', 'year'], [kitsuID, meta.title, meta.slug,  meta.year]);
        }
    }

    if(meta){
      //console.log(meta)
      console.log('Slug:', meta.title, `(${meta.year})`);
      //######################
      //try to get url has been searced from cache first (to skip search);
      //const pathFound = searchFound.get(kitsuID);
      const pathFound = db.get(db.Tables.Search, ['id'], [kitsuID])?.path;
      if(pathFound) return getsubtitles(pathFound, kitsuID, lang, null, episode, meta.year, extras);
      //######################

      let search = await subscene.search(`${encodeURIComponent(meta.title)}`);
      if(search?.length) {
        //filter by slug
        let find = search.find(x => x.path.split('/subtitles/')[1].startsWith(meta.slug));

        //filter by Name
        if(!find) {
          let re_title = meta.title.replace(/[^a-zA-Z0-9]+/g, '(.*?)');
          const reg = new RegExp(`${re_title}(.*?)${meta.year}`, 'i');
          console.log(reg);
          find = search.find(x => reg.test(x.title));

          //some anime have the title like series
          //https://subscene.com/subtitles/jujutsu-kaisen-second-season
          if(!find) {
            const RegSeason = /(.*?)(?:Season\s?(\d{1,3})|(\d{1,3})(?:st|nd|rd|th)\s?Season)/i;
            if(RegSeason.test(meta.title)) {
              const r = RegSeason.exec(meta.title);
              let animeName = r[1];
              const season = r[2];
              animeName = animeName.replace(/[^a-zA-Z0-9]+/g, '(.*?)');
              let season_text = ordinalInWord(season);
              const reg = new RegExp(`${animeName}${season_text}\\s?Season`, 'i');
              console.log(reg);
              find = search.find(x => reg.test(x.title));
            }
          }
        }
        
        if(find?.path){
          console.log('found:', find.path);
          //searchFound.set(kitsuID, find.path);
          //db.set(db.Tables.Search, ['id', 'path'], [kitsuID, find.path]);
          return await getsubtitles(find.path, kitsuID, lang, null, episode, meta.year, extras).catch(error => { throw error });
        }
        else {
          console.log("kitsu, search filter not found!");
          Cache.set(cacheID, []);
          return [];
        }
      } else throw `Search return empty page!`
    } else throw 'Kitsu meta is empty!';
  } catch(e) {
    console.error(e);
  }
}

async function TMDB(type, id, lang, extras, searchMovie=false) {
  try {
    const metaid = id.split(':')[0];
    let season, episode;
    if(type == 'series') {
      season = parseInt(id.split(':')[1]);
      episode = id.split(':')[2];
    }
    const foundID = metaid + (season ? ':' + season : '');
    const cacheID = `${id}_${lang}`;
    //######################
    //try to get results from cache first (to skip search);
    let subtitles = Cache.get(cacheID);
    if(subtitles) {
      console.log('cached main', cacheID);
      if(extras?.filename && subtitles.length > 1) {
        return sortMovieByFilename(subtitles, extras.filename)
      }
      return subtitles;
    }
    else {
      //try to get data from sqlite
      const sqlFoundPath = db.get(db.Tables.Search, ['id'], [foundID])?.path;
      if(sqlFoundPath) {
        let subtitles  = getSubtitlesFromSQL(foundID, lang);
        console.log('From SQL:', subtitles?.length);
        if(subtitles.length) {
          subtitles = subscene.sortByLang(subtitles);
          if(subtitles[lang]) subtitles = filterSub(subtitles[lang], lang, season, episode, extras.filename);
          Cache.set(cacheID, subtitles);
        }
        return subtitles;
      }
    }
    //######################

    //let meta = MetaCache.get(metaid);
    let meta = db.get(db.Tables.Meta, ['id'], [metaid]);
    if (!meta) {
        meta = await tmdb(type, metaid);
        if(meta) {
          db.set(db.Tables.Meta, ['id', 'title', 'slug', 'year'], [metaid, meta.title, meta.slug, meta.year]);
        }
    }
    if(meta){
      if(!searchMovie) console.log("meta",meta)

      //######################
      //try to get url has been searced from cache first (to skip search);
      if(searchMovie  || type == 'series') {
        //const pathFound = searchFound.get(foundID);
        const pathFound = db.get(db.Tables.Search, ['id'], [foundID])?.path;
        if(pathFound) return getsubtitles(pathFound, foundID, lang, season, episode, meta.year, extras).catch(error => { throw error });
      }

      //######################
      if (type == "movie") {
        if(!searchMovie) {
          let moviePath = `/subtitles/${meta.slug}`;
          return await getsubtitles(moviePath, foundID , lang, null, null, meta.year, extras).catch(error => { throw error });
        }
        else {
          let search = await subscene.search(`${meta.title} ${`(${meta.year})` || ''}`).catch(error => { throw error });
          if(search?.length) {
            const reg = new RegExp(`^${meta.slug.replace(/-/g, '--?')}(.*?)(${meta.year || ''})?`.trim(), 'i');
            console.log(reg);
            let findMovie = search.find(x => reg.test(x.path.split('/subtitles/')[1]));

            //filter by Name
            if(!findMovie) {
              const reg2 = new  RegExp(
                `${meta.title}(.*?)${meta.year}`
              , 'i');
              console.log(reg2);
              findMovie = search.find(x => reg2.test(x.title))
            }

            if(findMovie?.path) {
              console.log('found:', findMovie.path);
              //searchFound.set(foundID, findMovie.path);
              //db.set(db.Tables.Search, ['id', 'path'], [foundID, findMovie.path]);
              return await getsubtitles(findMovie.path, foundID, lang, null, null, meta.year, extras, false).catch(error => { throw error });
            } else {
              console.log('search filter not found any movie');
              Cache.set(cacheID, []);
              return [];
            }
          } else throw "search returning empty page!";
        }
      }
      else if (type == "series") {
        const season_text = ordinalInWord(season);
        let search = await subscene.search(`${meta.title} ${season_text} Season`).catch(error => { throw error });
        if (search?.length) {
          //https://subscene.com/subtitles/spy-wars-s01
          //https://subscene.com/subtitles/spy-first-season
          //https://subscene.com/subtitles/spy-kyoushitsu-2nd-season-spy-classroom-season-2
          //https://subscene.com/subtitles/kami-tachi-ni-hirowareta-otoko-2nd-season
          //https://subscene.com/subtitles/shameless-us-seventh-season-2017
          let oi = season == 1 ? 'st' : season == 2 ? 'nd' : season == 3 ? 'rd' : 'th'; //ordinal indicators
          let fillSeason = 0 <= season.length <= 9 ? '0' + season : season;

          //#filter lvl1
          const reg = new RegExp(
            `^${meta.slug}-(.*?)(${season_text.toLowerCase()}|${season}${oi})-season|` +
            `${meta.slug}-(.*?)season-${season}|`+
            `${meta.slug}-(.*?)s${fillSeason}`
          , 'i');
          console.log(reg);
          let findSeries = search.find(x => reg.test(x.path.split('/subtitles/')[1]));

          //filter by Name
          if(!findSeries) {
            const reg1 = new  RegExp(
              `^${meta.title}(.*?)(${season_text}|${season}${oi})(.*?)Season|` +
              `${meta.title}(.*?)Season(.*?)${season}|` +
              `${meta.title}(.*?)s${fillSeason}`
            , 'i');
            console.log(reg1);
            findSeries = search.find(x => reg1.test(x.title))
          }

          //#filter lvl2
          if(!findSeries) {
            const reg2 = new RegExp(`^${meta.slug}`, 'i');
            const reg3 = new RegExp(meta.slug, 'i');
            console.log(reg2, reg3);
            findSeries = search.find(x => reg2.test(x.path.split('/subtitles/')[1])) || search.find(x => reg3.test(x.path));
          }
          
          //filter lvl3
          const slug_child = meta.slug.split('-');
          if(!findSeries && slug_child.length >= 2) {
            const slug1 = slug_child.slice(1).join('-');
            const reg4 = new RegExp(
              `^${slug1}-(.*?)(${season_text.toLowerCase()}|${season}${oi})-season|` +
              `${slug1}-(.*?)season-${season}|`+
              `${slug1}-(.*?)s${fillSeason}`
              , 'i');
              console.log(reg4);
              findSeries = search.find(x => reg4.test(x.path.split('/subtitles/')[1]))
          }

          if(findSeries?.path){
            console.log(findSeries.path);
            //searchFound.set(foundID, findSeries.path);
            //db.set(db.Tables.Search, ['id', 'path'], [foundID, findSeries.path]);
            return await getsubtitles(findSeries.path, foundID, lang, season, episode, null, extras).catch(error => { throw error });
          } else {
            console.log('search filter not found any series');
            Cache.set(cacheID, []);
            return [];
          }
        } else throw "search returning empty page!";
      } else throw `Type ${type} are not supported!`;
    } else throw "Meta is empty";
  } catch(e) {
    console.error(e);
  }
}

function getSubtitlesFromSQL(id, lang) {
  let subtitles;
  subtitles = db.getAll(db.Tables.Subtitles, ['id', 'lang'], [id, lang]);
  return subtitles;
}

async function getsubtitles(moviePath, id, lang, season, episode, year, extras, withYear=true) {
  try {
    const cacheID = id + (episode ? ':' + episode : '') + '_' + lang;
    //console.log(cacheID)
    //[]: PageNotFound or No subs or Not match ID,Year
    var subtitles = await getSubtitlesWithYear(moviePath, id, episode, year);
    if(!subtitles?.length && !episode && withYear) {
      subtitles = await getSubtitlesWithYear(moviePath, id, episode, year, withYear);
    }

    if(!episode && !subtitles?.length)
    return null; //null mean => try search movie by name

    console.log('Scrapted:', subtitles?.length);

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
    }
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
    let simpleTitle = value.path.split('/').reverse()[0];
    // let simpleTitle = subtitles[i].title;
    // breakTitle.forEach(el => {
    // var regEx = new RegExp(el, "ig");
    //   simpleTitle = simpleTitle.replace(regEx,"")
    // })
    // simpleTitle = simpleTitle.replace(/\W/gi,"") // kasih gambaran di stremio
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
            //id: "subscn_"+episode?`${cachID}_ep${episode}_${i}`:`${cachID}_${i}`,
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
  let cached = db.get(db.Tables.Subtitles, ['path'], [path])?.dlpath;
  if (cached) {
    console.log('File already cached', path.split('/').pop());
    return cached
  } else {
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


module.exports = { subtitles, downloadUrl, Cache };
