function exactlyEpisodeRegex(episode) {
    let episodeText = 'S(eason)?[^\\w\\d]?\\d?\\d(.*?)E(P|pisode)?[^\\w\\d]?0?' + episode + '([^\\w\\d]|$)';
    episodeText += '|[-x]\\s?(E(P|pisode)?[^\\w\\d]?)?0?' + episode + '([^-a-z\\d]|$)';
    return {
      include: function() {
        return new RegExp(episodeText, 'i');
      },
      exclude: function() {
        let excludeEpisodeText = episodeText.replace(new RegExp(episode, 'g'), `\\d{1,4}`);
        return new RegExp(excludeEpisodeText, 'i');
      }
    }
  }
  
  function estimateEpisodeRegex(episode) {
    const excludeBeforeEP = [
      's(eason)?', '[\\w\\d]',
      'aa?c\\d\\.?', '[ \\.-](h|x)[\\.-]?'
      // 's(eason)?'
      //'h[^\\w\\d]?', '[ .-]x', 'ddp?\\d?', 'aa?c\\d?', 'dvd[^\\w\\d]?r?2?',
      //'mpeg',
      //'ion', 'track\\d?'
    ];
    const excludeAfterEP = [
      //'hd'
      '[\\w\\d]'
    ];
    //let episodeText = `(?<!${excludeBeforeEP.join('|')})[^\\w\\d]?|\\d)0?` + episode + `(?!(?=${excludeAfterEP.join('|')}))` + `([^p\\d]|$)`;
    let episodeText = `(?<!${excludeBeforeEP.join('|')})` +
    `([\\s\\.\\[\\]]?|e(pisode)?)0?` + episode + `[\\s\\.\\[\\]]?` +
    `(?!(?=${excludeAfterEP.join('|')}))`
    return {
      include: function(){
        return new RegExp(episodeText, 'i');
      },
      exclude: function() {
        let excludeEpisodeText = episodeText.replace(new RegExp(episode, 'g'), `\\d{1,4}`);
        return new RegExp(excludeEpisodeText, 'i');
      }
    }
  }

  module.exports = { exactlyEpisodeRegex, estimateEpisodeRegex }