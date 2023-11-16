function exactlyEpisodeRegex(episode) {
    let episodeText = 'S(eason)?[^\\w\\d]?\\d?\\d(.*?)E(P|pisode)?[^\\w\\d]?0?' + episode + '([^\\w\\d]|$)';
    episodeText += '|[-x]\\s?(E(P|pisode)?[^\\w\\d]?)?0?' + episode + '([^a-z\\d]|$)';
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
      '(s(eason)?',
      'h[^\\w\\d]?', '[ .-]x', 'ddp?\\d?', 'aac\\d?',
      'mpeg',
      'ion', 'track\\d?'
    ];
    const excludeAfterEP = [
      'hd'
    ];
    let episodeText = `(?<!${excludeBeforeEP.join('|')})[^\\w\\d]?|\\d)0?` + episode + `(?!(?=${excludeAfterEP.join('|')}))` + `([^p\\d]|$)`;
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