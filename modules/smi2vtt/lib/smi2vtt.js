
const parse = require('./parse.js')

const fs = require('fs')
const jschardet = require('jschardet')
const iconv = require('iconv-lite')


/**
 * read file and convert UTF-8
 * @param  {String}   file
 * @return {Promise}
 */
function readFile( file ){
  return new Promise( (resolve, reject) => {
    fs.readFile( file, (err, data) => {
      if(err) reject(err)
      else{
        const { encoding } = jschardet.detect(data)
        const encodedData = ( encoding != 'utf-8' )
          ? iconv.decode(data, encoding)
          : data

        resolve( encodedData )
      }
    })
  })
}


/**
 * convert smi(file) to vtt(string)
 * @param  {String} smiFile
 * @param  {Promise}
 */
function smi2vtt( smiFile ){
  return new Promise( (resolve, reject) => {
    readFile( smiFile )
    .then( data => {
      resolve( parse(data) )
    })
    .catch( err => reject(err) )
  })
}

module.exports = smi2vtt
