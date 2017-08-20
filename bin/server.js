#!/usr/bin/env node

var express = require('express');
var AWS = require('aws-sdk');
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var fs = require('fs');
const leftPad = require('left-pad');
const https = require('https');
const http = require('http');


var Mustache = require('mustache');

// Load the list html
var listHtmlFile = path.resolve(__dirname, '../lib/list.html');
var listHtml = fs.readFileSync(listHtmlFile).toString();
Mustache.parse(listHtml);

var bucket = argv.bucket || process.env.S3_SERVER_BUCKET;
var key = argv.key || process.env.AWS_ACCESS_KEY_ID;
var secret = argv.secret || process.env.AWS_SECRET_ACCESS_KEY;
var endpoint = argv.endpoint || process.env.AWS_ENDPOINT;
var port = argv.p || argv.port || process.env.S3_SERVER_PORT || 3010;

let options = {};

try {
  options = {
    privateKey: fs.readFileSync(argv.privateKey, 'utf8'),
    certificate: fs.readFileSync(argv.certificate, 'utf8')
  };
} catch (e) {
  // nothing
}

var s3 = new AWS.S3({
  accessKeyId: key,
  secretAccessKey: secret,
  // The endpoint must be s3.scality.test, else SSL will not work
  endpoint: endpoint,
  sslEnabled: true,
  // With this setup, you must use path-style bucket access
  s3ForcePathStyle: true,
});

var app = express();

function loadPrefixes(prefix, callback){
  s3.listObjects({
    Bucket: bucket,
    Delimiter: '/',
    EncodingType: 'url',
    Prefix: prefix,
  }, callback);
}

function serve(path, res){
  s3.getObject({
    Bucket: bucket,
    Key: path,
  }, function(err, data){
    if(err){
      res.status(err.statusCode);
      res.end();
      return;
    } else {
      res.status(200);
    }

    res.set({
      'Content-Length': data.ContentLength,
      'Last-Modified': data.LastModified,
      'Expiration': data.Expiration,
      'Etag': data.ETag,
      'Content-Encoding': data.ContentEncoding,
      'Content-Type': data.ContentType,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET',
      'Access-Control-Allow-Headers': 'Host,Content-*',
      'Access-Control-Max-Age': '3000'
    });

    res.write(data.Body);
    res.end();
  });
}

function serveList(prefixes, res){
  const out = prefixes.map((i) => {
    const a = i.LastModified;
    let key = i.Key;
    let spaces = '';
    if (key.length >= 50) {
      key = key.slice(0,47)+'..>';
    } else {
      key = i.Key
      spaces = Array(50-i.Key.length).fill(' ').join('');
    }
    return {
      Url: i.Key,
      Key: key,
      Spaces: spaces,
      LastModified: `${leftPad(a.getDate(), 2, '0')}-${leftPad(a.getMonth(), 2, '0')}-${a.getFullYear()} ${leftPad(a.getHours(), 2, '0')}:${leftPad(a.getMinutes(), 2, '0')}`,
      Size: Array(20-(""+i.Size).length).fill(' ').join('')+i.Size
    };
  });
  res.write(Mustache.render(listHtml, {
    prefixes: out,
    s3Bucket: bucket
  }));
  res.end();
}

app.use(function(req, res, next){
  var path = req.path.substr(1);

  if(path === '' || path.slice(-1) === '/'){
    loadPrefixes(path, function(err, data){
      if(err) {
        console.error(err);
        res.status(err.statusCode);
        res.write(err);
        res.end();
        return;
      };

      if(data.Contents.length){
        var indexPath;
        data.Contents.some(function(obj){
          if (obj.Key.indexOf('index.html') !== -1){
            indexPath = obj.Key;
            return true;
          }
        });

        if(indexPath) {
          serve(indexPath, res);
        } else {
          serveList(data.Contents, res);
        }
      } else {
        serveList(data.Contents, res);
      }
    });
  } else {
    serve(path, res);
  }
});

let httpServer = null;
if (options.privateKey) {
  httpServer = https.createServer(options, app);
  console.log(`Listen on: https ${port}`);
} else {
  httpServer = http.createServer(app);
  console.log(`Listen on: http ${port}`);
}
httpServer.listen(port);
