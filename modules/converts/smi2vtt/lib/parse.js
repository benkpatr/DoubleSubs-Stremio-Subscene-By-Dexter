
const htmlparser = require('htmlparser2')


/**
 * generate time-text from milliseconds
 * @param  {String} time
 * @return {String}
 */
function generateTime( time ){
  return new Date( time*1 ).toISOString().slice(11, -1)
}


/**
 * try parse
 * @param  {String} smiText
 * @return {Parser}
 */
function parse( smiText ){
  let vttText = 'WEBVTT\n'
  let type = null

  const caption = {
    start: 0,
    end: 0,
    text: ''
  }

  const parser = new htmlparser.Parser({

    onopentag: (name, attribs) => {
      switch( name ){
        // comment
        case 'title':
          type = 'comment'
          vttText += '\nNOTE\n'
        break

        // text
        case 'sync':
          type = 'caption'

          // start
          if( !caption.text ){
            caption.start = generateTime( attribs.start )
          }
          // end
          else {
            const time = generateTime( attribs.start )
            caption.end = time
            vttText += `${caption.start} --> ${caption.end}\n`
            vttText += caption.text + '\n\n'

            caption.start = time
            caption.text = ''
          }
        break

        // br
        case 'br':
          caption.text += '\n'
        break
      }
    },

    onclosetag: text => {
      switch( type ){
        case 'comment':
          vttText += '\n\n'
          type = null
        break
      }
    },

    ontext: text => {
      switch( type ){
        case 'comment':
          vttText += text.trim()
        break

        case 'caption':
          caption.text += text.trim()
        break
      }
    },

  }, {decodeEntities: true})
  parser.write(smiText)
  parser.end()

  return vttText
}


module.exports = parse
