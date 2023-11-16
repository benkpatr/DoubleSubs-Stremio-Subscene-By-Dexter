const tmdb = require('./tmdb');
const kitsu = require('./kitsu');
const subscene = require('./subsceneAPI');
const config = require('./config');
const languages = require('./languages.json');
const NodeCache = require("node-cache");
const sub2vtt = require('./modules/sub2vtt');

const Cache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //sub list
const MetaCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //meta from tmdb or cinemeta
const KitsuCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });
const filesCache =  new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //download url

const subsceneCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) }); //subtitles page => update sub every 4 hours
const searchFound = new NodeCache( { stdTTL: (12 * 60 * 60), checkperiod: (1 * 60 * 60)});

async function subtitles(type, id, lang, extras) {
  console.log(type, id, lang);
  if (id.match(/tt[0-9]/)){
    let tmdb = await (TMDB(type, id, lang, extras)).catch(error => { throw error });
    if(tmdb == null && type != 'series') tmdb = await (TMDB(type, id, lang, extras, true)).catch(error => { throw error });
    return tmdb;

  }	else if (id.match(/kitsu:[0-9]/)){
    return await Kitsu(type, id, lang, extras);
  }
}
async function Kitsu(type, id, lang, extras) {
  try {
    const episode = id.split(':')[2];

    let metaid = id.split(':')[1];
    let meta = KitsuCache.get(metaid);
    if (!meta) {
        meta = await kitsu(metaid);
        if (meta) {
            KitsuCache.set(metaid, meta);
        }
    }
    if(meta){
      let season;
      const cacheID = `${id}_${lang}`
      const subtitles = Cache.get(cacheID);
      if(subtitles) {
        console.log('kitsu cached main', cacheID);
        if(extras?.filename && subtitles.length > 1) {
          return sortMovieByFilename(subtitles, extras.filename)
        }
        return subtitles;
      }
      //######################

      //######################
      //try to get url has been searced from cache first (to skip search);
      const pathFound = searchFound.get(id);
      if(pathFound == '') return [];
      if(pathFound) return await getsubtitles(pathFound, cacheID, lang, null, episode, meta.year, extras).catch(error => { throw error });
      //######################

      //console.log(meta)
      let slug = `${meta.title["en_jp"]} (${meta.year})`;
      console.log('Slug:',slug)
      let search = await subscene.search(`${encodeURIComponent(meta.title["en_jp"])} (${meta.year})`);
      if(search?.length) {
        //remove (tv) in some anime
        let metaTitle = meta.title['en_jp'].replace(/\(tv\)/i, '').trim();
        let metaSlug = meta.slug.replace(/-tv$/, '');

        //filter by slug
        let find = search.find(x => x.path.split('/subtitles/')[1] == metaSlug);

        //filter by Name
        if(!find) {
          let re_title = metaTitle.replace(/[^a-zA-Z0-9]+/g, '(.*?)');
          const reg = new RegExp(`${re_title}(.*?)${meta.year}`, 'i');
          console.log(reg);
          find = search.find(x => reg.test(x.title));

          //some anime have the title like series
          //https://subscene.com/subtitles/jujutsu-kaisen-second-season
          if(!find) {
            const RegSeason = /(.*?)(?:Season\s?(\d{1,3})|(\d{1,3})(?:st|nd|th)\s?Season)/i;
            if(RegSeason.test(metaTitle)) {
              const r = RegSeason.exec(metaTitle);
              let animeName = r[1];
              season = r[2];
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
          searchFound.set(id, find.path);
          return await getsubtitles(find.path, cacheID, lang, season, episode, meta.year, extras).catch(error => { throw error });
        }
      } else {
        console.log("not found search kitsu!");
        Cache.set(cacheID, []);
        return [];
      }
    } else throw 'meta is empty!';
  } catch(e) {
    console.error(e);
  }
}

async function TMDB(type, id, lang, extras, searchMovie=false) {
  try {
    let metaid = id.split(':')[0];
    let season, episode;
    if(type == 'series') {
      season = parseInt(id.split(':')[1]);
      episode = id.split(':')[2];
    }
    let meta = MetaCache.get(metaid);
    if (!meta) {
        meta = await tmdb(type, metaid);
        if (meta) {
            MetaCache.set(metaid, meta);
        }
    }
    if(meta){
      console.log("meta",meta)
      //######################
      //try to get results from cache first (to skip search);
      let cacheID = `${id}_${lang}`;
      const subtitles = Cache.get(cacheID);
      if(subtitles) {
        console.log('cached main', cacheID);
        if(extras?.filename && subtitles.length > 1) {
          return sortMovieByFilename(subtitles, extras.filename)
        }
        return subtitles;
      }
      //######################

      //######################
      //try to get url has been searced from cache first (to skip search);
      if(searchMovie  || type == 'series') {
        const pathFound = searchFound.get(id);
        if(pathFound == '') return [];
        if(pathFound) return await getsubtitles(pathFound, cacheID, lang, season, episode, meta.year, extras).catch(error => { throw error });
      }

      //######################
      if (type == "movie") {
        if(!searchMovie) {
          let moviePath = `/subtitles/${meta.slug}`;
          return await getsubtitles(moviePath, cacheID , lang, null, null, meta.year, extras).catch(error => { throw error });
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
              searchFound.set(id, findMovie.path);
              return await getsubtitles(findMovie.path, cacheID, lang, null, null, meta.year, extras, false).catch(error => { throw error });
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
          let oi = season == 1 ? 'st' : season == 2 ? 'nd' : 'th'; //ordinal indicators
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
            searchFound.set(id, findSeries.path);
            return await getsubtitles(findSeries.path, cacheID, lang, season, episode, null, extras).catch(error => { throw error });
          } else {
            searchFound.set(id, '');
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


async function getsubtitles(moviePath, id, lang, season, episode, year, extras, movieLvlYear=true) {
  try {
    let breakTitle = moviePath.match(/[a-z]+/gi)
    //console.log("breakTitle : " , breakTitle)
    let subs = [];
    var subtitles = subsceneCache.get(moviePath);
    if (!subtitles) {
      //# Level1 #
      const subs1 = await subscene.getSubtitles(moviePath).catch(error => { throw error }) // moviepath without year
      console.log("no year scraping:", subs1 ? subs1.length : 0);
      if(subs1?.length) {
        subtitles = subscene.sortByLang(subs1); //return Object
        subsceneCache.set(moviePath, subtitles);
        if(id.split(':')[0] == 'kitsu') {
          //check year
          if(subs1[0].year != year) {
            console.log(`Kitsu year not match subscene ${subs1[0].year} - kitsu ${year}`);
            Cache.set(id, []);
            return [];
          };
        }
        else {
          let foundImdb = subs1[0].imdb_id;
          if(foundImdb) {
            if(episode) {
              let Imdb_number = id.split(':')[0].split('tt')[1];
              if(!foundImdb.includes(Imdb_number)) {
                console.log(`imdb  not match ${foundImdb} - ${Imdb_number}`);
                Cache.set(id, []);
                return [];
              }
            }
            else {
              let Imdb_number = id.split('_')[0].split('tt')[1];
              if(!foundImdb.includes(Imdb_number)) {
                if(movieLvlYear) {
                  subtitles = await movieWithYear(moviePath, year);
                }
                else {
                  console.log(`imdb  not match ${foundImdb} - ${Imdb_number}`);
                  Cache.set(id, []);
                  return [];
                }
              }
            }
          }
        }
      }
      async function movieWithYear(moviePath, year) {
        let subtitles = subsceneCache.get(`${moviePath}-${year}`);
        if(!subtitles?.length) {
          await new Promise((r) => setTimeout(r, 2000)); // prevent too many request, still finding the other way
          const subs = await subscene.getSubtitles(`${moviePath}-${year}`).catch(error => { throw error }) // moviepath with year
          console.log("with year scraping :", subs ? subs.length : 0);
          if(subs?.length) {
            subtitles = subscene.sortByLang(subs);
            subsceneCache.set(`${moviePath}-${year}`, subtitles);
          }
        }
        return subtitles;
      }

      if(!subtitles) {
        console.log("No suitable movies were found!");
        return null; //null mean => try search movie by name
      }
    }

    if (subtitles[lang]) {
      subtitles = subtitles[lang];
      console.log('subtitles matched lang : ',subtitles.length)
      let sub = [];
      let episodeText, episodeText1;
      if (episode) {
        //S1E01,S01E01, -1, -01, - 1, - 01
        //filter exactly
        episodeText = 'S(eason)?[^a-z0-9]?\\d?\\d(.*?)E(P|pisode)?[^a-z0-9]?0?' + episode + '([^a-z\\d]|$)';
        episodeText += '|[-x]\\s?(E(P|pisode)?[^a-z0-9]?)?0?' + episode + '([^a-z\\d]|$)';
        const reg = new RegExp(episodeText, 'i');
        sub = subtitles.filter(element => reg.test(element.title));
        console.log('exactly filter found:', sub.length);

        //filter Estimate
        const excludeBeforeEP = [
          '(s(eason)?',
          'h[^a-z0-9]?', '[ .-]x', 'ddp?5?', 'aac2?', 'dd5',
          'mpeg',
          'ion'
        ];
        const excludeAfterEP = [
          'hd'
        ];
        episodeText1 = `(?<!${excludeBeforeEP.join('|')})[^a-z0-9]?|\\d)0?` + episode + `(?!(?=${excludeAfterEP.join('|')}))` + `([^p\\d]|$)`;
        if(!sub.length) {
          const reg = new RegExp(episodeText1, 'i');
          sub = subtitles.filter(element => reg.test(element.title));
          console.log('Estimate filter found:', sub.length);
        }

        //if not found, return the subtitles for multiple ep
        if(!sub.length) {
          let excludeEpisodeText = episodeText1.replace(new RegExp('(?<!ddp\\?)' + episode, 'g'), `\\d{1,4}`);
          const reg = new RegExp(excludeEpisodeText, 'i');
          const regFromTo = /(?:E(pisode)?)?[^a-z0-9]?(\d{1,4})\s?(-|~|to)\s?(?:E(pisode)?)?[^a-z0-9]?(\d{1,4})/i;
          const regSeason = new RegExp(
            's(eason)?[^a-z0-9]?0?' + season + '(\\D|$)',
            'i'
          );

          //filterEP
          const filterEP = subtitles.filter(element => !reg.test(element.title));

          if(filterEP?.length) {
            //exclude another episode
            sub = filterEP.filter(element => {
              const title = element.title;
              if(season && regSeason.test(title)) return true;
              if(regFromTo.test(title)) {
                const r = regFromTo.exec(title);
                const fromEP = r[2];
                const toEP = r[5];
                if(parseInt(fromEP) <= parseInt(episode) && parseInt(episode) <= parseInt(toEP)) return true;
                return false;
              }
            });
            console.log('Multiple EP filter found:', sub.length);

            //return all if no filter ...
            if(!sub.length) {
              sub = filterEP;
              console.log('Another without EP found:', sub.length);
            }
          }
        }

        subtitles = [...new Set(sub)];
      }
      console.log("filtered subs:", subtitles.length);


      //------------------
      // sort movie by extra filename
      if(extras?.filename && subtitles.length > 1) {
        subtitles = sortMovieByFilename(subtitles, extras.filename)
      }
      //-----------------

      for (let i = 0; i < (subtitles.length); i++) {
        let value = subtitles[i];
        let simpleTitle = subtitles[i].title;
        breakTitle.forEach(el => {
        var regEx = new RegExp(el, "ig");
          simpleTitle = simpleTitle.replace(regEx,"")
        })
        simpleTitle = simpleTitle.replace(/\W/gi,"") // kasih gambaran di stremio
        if (value) {
            let path = config.BaseURL + value.path;
            let url;
            if (episode) {
              url = config.local+"/sub.vtt?"+`lang=${lang}&title=${encodeURIComponent(subtitles[i].title)}&episode=${encodeURIComponent(episodeText1)}`+"&"+sub2vtt.gerenateUrl(path, {});
            } else {
              url = config.local+"/sub.vtt?"+`lang=${lang}&title=${encodeURIComponent(subtitles[i].title)}&` + sub2vtt.gerenateUrl(path, {});
            }
            
            subs.push({
                lang: languages[lang].iso || languages[lang].id,
                //id: "subscn_"+episode?`${cachID}_ep${episode}_${i}`:`${cachID}_${i}`,
                title:subtitles[i].title,
                id: "s."+`${i}`+"."+ simpleTitle,
                url: url
            });
        }
      }
      //############################
      //Save result to cache
      let cached = Cache.set(id, subs);
      console.log("cached", cached)
      return subs;
    }
    else {
      console.log(`not matched any subs by language`);
      Cache.set(id, []);
      return [];
    }
  }
  catch (e) {
    console.error(e);
  }
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
        for(i = 1; i < strs.length; i++)  {
          inList = sortByKey(inList, strs[i]);
          notList = sortByKey(notList, strs[i]);
        }
      }
      
      return inList.concat(notList);
    }
}

async function downloadUrl(path, episode) {
  let cachID = episode ? path + '_' + episode : path;
  let cached = filesCache.get(cachID);
  if (cached) {
    console.log('File already cached', cachID);
    return cached
  } else {
    return await subscene.downloadUrl(path).then(async url => {
      let cached = filesCache.set(cachID, url);
      console.log("Caching File", cached)
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


module.exports = { subtitles, downloadUrl };
