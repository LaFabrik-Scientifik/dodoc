var path = require('path');
var fs = require('fs-extra');
var slugg = require('slugg');
var moment = require('moment');
var parsedown = require('dodoc-parsedown');

var dodoc  = require('../dodoc');
var dev = require('./dev-log');

var dodocAPI = (function() {

  const API = {
    getCurrentDate      : (f = dodoc.metaDateFormat)  => { return getCurrentDate(f) },
    getFolderPath       : (slugFolderName = '')       => { return getFolderPath(slugFolderName) },
    getProjectPath      : (slugFolderName, slugProjectName) => { return getProjectPath(slugFolderName, slugProjectName) },
    parseData           : (d)                         => { return parseData(d) },
    storeData           : (mpath, d, e)               => { return storeData(mpath, d, e) },
    readMetaFile        : (metaFile)                  => { return readMetaFile(metaFile) },
    getUserPath         : ()                          => { return getUserPath() },
    findFirstFilenameNotTaken: (fileName, currentPath, fileext = '') => { return findFirstFilenameNotTaken(fileName, currentPath, fileext) },
    eventAndContent     : (sendEvent, objectJson) => { return eventAndContent(sendEvent, objectJson) },
    sendEventWithContent: (sendEvent, objectContent, io, socket) => { return sendEventWithContent(sendEvent, objectContent, io, socket) },
    decodeBase64Image   : (dataString) =>   { return decodeBase64Image(dataString) },
    writeMediaDataToDisk: (pathToFile, fileExtension, dataURL) => { return writeMediaDataToDisk(pathToFile, fileExtension, dataURL) },
    listAllTemplates    : () =>             { return listAllTemplates() },
    makeFolderAtPath    : (fname,fpath) =>  { return makeFolderAtPath(fname,fpath) },
  };

  function getCurrentDate(f) {
    return moment().format(f);
  }
  function getFolderPath(slugFolderName) {
    dev.logverbose( "COMMON — getFolderPath : " + slugFolderName);
    return path.join(getUserPath(), dodoc.contentDirname, slugFolderName);
  }
  function getProjectPath( slugFolderName, slugProjectName) {
    dev.logverbose( "COMMON — getProjectPath, slugFolderName:" + slugFolderName + " slugProjectName: " + slugProjectName);
    return path.join(getFolderPath(slugFolderName), slugProjectName);
  }
  function getUserPath() {
    return global.pathToUserContent;
  }

  function parseData(d) {
    var parsed = parsedown.parse(d);
  // the fav field is a boolean, so let's convert it
    if( parsed.hasOwnProperty('fav'))
      parsed.fav = (parsed.fav === 'true');
    return parsed;
  }

  function storeData(mpath, d, e) {
    return new Promise(function(resolve, reject) {
      dev.logverbose('Will store data');
      var textd = parsedown.textify(d);
      if( e === "create") {
        fs.appendFile( mpath, textd, function(err) {
          if (err) {
            dev.error('Couldn’t update file: ' + err);
            reject( err);
          }
          resolve(parseData(textd));
        });
      }
      if( e === "update") {
        fs.writeFile( mpath, textd, function(err) {
          if (err) {
            dev.error('Couldn’t update file: ' + err);
            reject( err);
          }
          resolve(parseData(textd));
        });
      }
    });
  }

  function readMetaFile(metaFile){
    var metaFileContent = fs.readFileSync( metaFile, 'utf8');
    var metaFileContentParsed = parseData( metaFileContent);
    return metaFileContentParsed;
  }

  function findFirstFilenameNotTaken( fileName, currentPath, fileext) {
    // no fileext = search for folder
    try {
      var newFileName = fileName;
      var index = 0;
      var newPathToFile = path.join( currentPath, newFileName);
      while( !fs.accessSync( newPathToFile + fileext, fs.F_OK)){
        dev.logverbose("- - following path is already taken : " + newPathToFile);
        index++;
        newFileName = fileName + "-" + index;
        newPathToFile = path.join( currentPath, newFileName);
      }
    } catch( err) {
      // no file of this name has been found
    }
    dev.logverbose( "- - this filename is not taken : " + newFileName);
    return newFileName;
  }

  function eventAndContent(sendEvent, objectJson) {
    var eventContentJSON =
    {
      "socketevent" : sendEvent,
      "content" : objectJson
    };
    return eventContentJSON;
  }

  function sendEventWithContent(sendEvent, objectContent, io, socket) {
    var eventAndContentJson = eventAndContent( sendEvent, objectContent);
    dev.logpackets("eventAndContentJson " + JSON.stringify( eventAndContentJson, null, 4));
    if(socket)
      // content sent only to one user
      socket.emit( eventAndContentJson["socketevent"], eventAndContentJson["content"]);
    else
      // content broadcasted to all connected users
      io.sockets.emit( eventAndContentJson["socketevent"], eventAndContentJson["content"]);
    dev.logpackets("packet sent");
  }

  // Décode les images en base64
  // http://stackoverflow.com/a/20272545
  function decodeBase64Image(dataString) {
    dev.logverbose("Decoding base 64 image");
    var matches = dataString.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/),
    response = {};
    if (matches.length !== 3) {
      return new Error('Invalid input string');
    }
    response.type = matches[1];
    response.data = new Buffer(matches[2], 'base64');
    return response;
  }

  function writeMediaDataToDisk(pathToFile, fileExtension, dataURL) {
    return new Promise(function(resolve, reject) {
      if(dataURL === undefined) {
        dev.log('No media data content gotten for '+pathToFile+fileExtension);
        reject('No media sent');
      }
      dataURL = dataURL.split(',').pop();
      dev.logverbose( 'Will save the video at path : ' + pathToFile + fileExtension);

      var fileBuffer = new Buffer(dataURL, 'base64');
      fs.writeFile( pathToFile + fileExtension, fileBuffer, function(err) {
        if (err) reject( err);
        resolve();
      });
    });
  }

  function listAllTemplates() {
    return new Promise(function(resolve, reject) {
      dev.logfunction( "COMMON — listAllTemplates");
      var templateFolderPath = path.join( getUserPath(), dodoc.publicationTemplateDirname);
      fs.readdir( templateFolderPath, function (err, filenames) {
        if (err) reject( dev.error('Couldn\'t read content dir : ' + err));
        var folders = filenames.filter(function(slugPubliName){
          // only get folders that don't start with "_"
          return new RegExp(dodoc.regexpMatchFolderNames, 'i').test(slugPubliName) && slugPubliName.substr(0,1) !== '_';
        });
        dev.log('Found ' + folders.length + ' templates in ' + templateFolderPath);
        resolve(folders);
      });
    });
  }

  function makeFolderAtPath(fname,fpath) {
    return new Promise(function(resolve, reject) {
      dev.logfunction("COMMON — makeFolderAtPath with name: " + fname + " and path " + fpath);
      if(fname === undefined || fpath === undefined) {
        dev.error('makeFolderAtPath : one argument is missing');
        reject('one argument is missing');
      }

      var folderPath = path.join(fpath,fname);
      fs.access(folderPath, fs.F_OK, function( err) {
        // if there's nothing at path
        if(err) {
          dev.logverbose("New folder created with name " + fname + " and path " + path);
          fs.ensureDirSync(folderPath);//write new folder in folders
          resolve(folderPath);
        } else {
          dev.logverbose("Folder already exist");
          resolve(folderPath);
        }
      });
    });
  }

  return API;
})();

module.exports = dodocAPI;