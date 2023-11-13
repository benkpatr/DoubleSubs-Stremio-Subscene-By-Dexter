const tmdb = require('./tmdb');
// const cinemeta = require('./cinemeta');
const kitsu = require('./kitsu');
const subscene = require('./subsceneAPI');
const config = require('./config');
const languages = require('./languages.json');
const NodeCache = require("node-cache");
const sub2vtt = require('./modules/sub2vtt');

const Cache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });
const MetaCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });
const KitsuCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });
const filesCache =  new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });

const subsceneCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });
const searchCache = new NodeCache({ stdTTL: (4 * 60 * 60), checkperiod: (1 * 60 * 60) });

async function subtitles(type, id, lang, extras) {
  if (id.match(/tt[0-9]/)){
    let tmdb = await (TMDB(type, id, lang, extras)).catch(error => { throw error });
    if(tmdb == null && type != 'series') tmdb = await (TMDB(type, id, lang, extras, true)).catch(error => { throw error });
    return tmdb ||  [];

  }	else if (id.match(/kitsu:[0-9]/)){
    return await (Kitsu(type, id, lang)) 
  }
}
async function Kitsu(type, id, lang) {
  try {
    console.log(type, id, lang);
    let metaid = id.split(':')[1];
    let meta = KitsuCache.get(metaid);
    if (!meta) {
        meta = await kitsu(metaid);
        if (meta) {
            KitsuCache.set(metaid, meta);
        }
    }
    if(meta){
      //console.log(meta)
      const episode = id.split(':')[2];
      const searchID = `kitisu_${metaid}_${id.split(':')[1]}`;
      let search = searchCache.get(searchID);
      let slug = `${meta.title["en_jp"]} (${meta.title["en"]}) (${meta.year})`;
      var moviePath = '';
      console.log('slug',slug)
      console.log('title',meta.title["en_jp"])
      if (!search) {
          search = await subscene.search(`${encodeURIComponent(meta.title["en_jp"])}`);
          if (search) {
              searchCache.set(searchID, search);
          }
      }
      if(search) {
        for(let i = 0; i<search.length;i++){
          if(search[i].title.includes(meta.title["en_jp"])){
              moviePath = search[i].path
              break
          }
        }
        //let moviePath = search[0].path;
        console.log(moviePath)
        return getsubtitles(moviePath, meta.slug.replace('-','_'), lang, episode)
      } else {
        console.log("not found search kitsu!");
        return [];
      }
    } else return [];
  } catch(e) {
    console.error(e);
  }
}

async function TMDB(type, id, lang, extras, searchMovie=false) {
  try {
    let metaid = id.split(':')[0];
    let meta = MetaCache.get(metaid);
    if (!meta) {
        meta = await tmdb(type, metaid);
        if (meta) {
            MetaCache.set(metaid, meta);
        }
    }
    if(meta){
      console.log("meta",meta)
      if (type == "movie") {
        if(!searchMovie) {
          let moviePath = `/subtitles/${meta.slug}`;
          return await getsubtitles(moviePath, id , lang, null, meta.year, extras, true).catch(error => { throw error });
        }
        else {
          const searchID = id;
          let search = searchCache.get(searchID);
          if(!search?.length) {
            search = await subscene.search(`${meta.title} ${`(${meta.year})` || ''}`).catch(error => { throw error });
            if(search?.length) 
              searchCache.set(searchID, search);
          }
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
              console.log(findMovie.path);
              return await getsubtitles(findMovie.path, id, lang, null, meta.year, extras).catch(error => { throw error });
            } else {
              console.log("filtered search movie is empty!");
              return [];
            }
          } else {
            console.log("not found search movie!");
            return [];
          }
        }
      }
      else if (type == "series") {
        const season = parseInt(id.split(':')[1]);
        const season_text = ordinalInWord(season);
        const episode = id.split(':')[2];
        const searchID = `${metaid}_${season}_${episode}`;
        let search = searchCache.get(searchID);
        if (!search?.length) {
          search = await subscene.search(`${meta.title} ${season_text} Season`).catch(error => { throw error });
          if(search?.length) 
            searchCache.set(searchID, search);
        }

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
              `${meta.title}(.*?)(${season_text}|${season}${oi})(.*?)Season|` +
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
            return await getsubtitles(findSeries.path, metaid + '_season_' + season + '_episode_' + episode, lang, episode).catch(error => { throw error });
          }
          else{
            console.log("filtered search series is empty!");
            let moviePath = `/subtitles/${meta.slug}`;
            return await getsubtitles(moviePath, metaid + '_season_' + season + '_episode_' + episode, lang, episode).catch(error => { throw error });
          }
        } else {
          console.log("not found search series!");
          return [];
        }
      } else throw `Type ${type} are not supported!`;
    } else throw "Meta is empty";
  } catch(e) {
    console.error(e);
  }
}


async function getsubtitles(moviePath, id, lang, episode, year, extras, lvl2 = false) {
  try {
    let breakTitle = moviePath.match(/[a-z]+/gi)
    //console.log("breakTitle : " , breakTitle)
    console.log(moviePath, id, lang, year, episode)
    const cachID = `${id}_${lang}`;
    let cached = Cache.get(cachID);
    if (cached) {
      console.log('cached main', cachID);
      if(extras?.filename && cached.length > 1) {
        cached = sortMovieByFilename(cached, extras.filename)
      }
      return cached
    } else {
      let subs = [];
      var subtitles = subsceneCache.get(moviePath);
      if (!subtitles) {
        //# Level1 #
        const subs1 = await subscene.getSubtitles(moviePath).catch(error => { throw error }) // moviepath without year
        console.log("no year scraping :", subs1 ? subs1.length : 0);
        if(subs1?.length) {
          subtitles = subscene.sortByLang(subs1); //return Object
          subsceneCache.set(moviePath, subtitles);
          if(subs1[0].imdb_id != id.split('_')[0] && !episode) { // if the id is not match, find by year
            //# LEVEL2 if the movie id not match
            subtitles = await movieWithYear(moviePath, year);
            //# Disable lvl2
            lvl2 = false;
          }
        }

        
        //# LEVEL2 #
        if(!subtitles && lvl2 && !episode)
          subtitles = await movieWithYear(moviePath, year);

        async function movieWithYear(moviePath, year) {
          let subtitles = subsceneCache.get(`${moviePath}-${year}`);
          if(!subtitles?.length) {
            await new Promise((r) => setTimeout(r, 2000)); // prevent too many request, still finding the other way
            const subs2 = await subscene.getSubtitles(`${moviePath}-${year}`).catch(error => { throw error }) // moviepath with year
            console.log("with year scraping :", subs2 ? subs2.length : 0);
            if(subs2?.length) {
              subtitles = subscene.sortByLang(subs2);
              subsceneCache.set(`${moviePath}-${year}`, subtitles);
            }
          }
          return subtitles;
        }

        if(!subtitles) {
          console.log("No suitable movies were found!");
          return null; //null mean lvl1 is failed => try search movie by name
        }
      }

      if (subtitles[lang]) {
        subtitles = subtitles[lang];
        console.log('subtitles matched lang : ',subtitles.length)
        let sub = [];
        let episodeText, episodeText1;
        if (episode) {
          episodeText = (episode.length == 1) ? ('0' + episode) : episode;
          episodeText = 'E' + episodeText

          //S1E01,S01E01, -1, -01, - 1, - 01
          episodeText1 = 'S(eason(\\s|\\.)?)?\\d?\\d(.*?)E(P|pisode)?(\\s|\\.)?0?' + episode + '([-\\]\\s\\.]|$)';
          episodeText1 += '|-\\s?(E(P|pisode)?)?\\s?0?' + episode + '([-\\]\\s\\.]|$)';
          episodeText1 += '|x0?' + episode + '([-\\]\\s\\.]|$)';
          episodeText1 += '|Tập(.*?)0?' + episode;
          const reg = new RegExp(episodeText1, 'i');
          console.log('include', reg);
          
          //filter by episode
          subtitles.forEach(element => {
            if(reg.test(element.title.trim())) {
              console.log(element.title);
              sub.push(element);
            }
          })

          //if not found, return the subtitles for multiple ep
          if(!sub.length) {
            excludeEpisodeText = episodeText1.replace(new RegExp(episode, 'g'), (episode <= 9 ? '\\d' : '\\d\\d'));
            const reg2 = new RegExp(excludeEpisodeText);
            console.log('exclude', reg2);
            subtitles.forEach(element => {
              if(!reg2.test(element.title.trim())) {
                console.log(element.title);
                sub.push(element);
              }
            })
          }

          subtitles = [...new Set(sub)];
        }
        console.log("filtered subs ", subtitles.length);


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
                url = config.local+"/sub.vtt?"+`title=${encodeURIComponent(subtitles[i].title)}&episode=${encodeURIComponent(episodeText1)}`+"&"+sub2vtt.gerenateUrl(path, {});
              } else {
                url = config.local+"/sub.vtt?"+`title=${encodeURIComponent(subtitles[i].title)}&` + sub2vtt.gerenateUrl(path, {});
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
        let cached = Cache.set(cachID, subs);
        console.log("cached", cached)
        return subs;
      }else{
        return [];
      }
    }
  }
  catch (e) {
    console.error(e);
  }
}

function sortMovieByFilename(subtitles, filename) {
    const qualitys = [ "480p", "720p", "1080p", "1440p", "2160p" ];
    const sources = [ /(web)(-dl|rip)?/, /blu-?ray/, /a?hdtv/, /dvd(rip)?/, /brrip/ ];
    const vcodexs = [ /(h.?|x)264/, /(h.?|x)265/];

    let quality = qualitys.findIndex(quality => filename.toLowerCase().match(quality));
    let source = sources.findIndex(source => filename.toLowerCase().match(source));
    let vcodex = vcodexs.findIndex(vcodec => filename.toLowerCase().match(vcodec));

    console.log(qualitys[quality], sources[source], vcodexs[vcodex]);

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
