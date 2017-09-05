#!/usr/bin/env node

var express = require('express');
var AWS = require('aws-sdk');
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var fs = require('fs');
var Mustache = require('mustache');

// Load the list html
var listHtmlFile = path.resolve(__dirname, '../lib/list.html');
var listHtml = fs.readFileSync(listHtmlFile).toString();
Mustache.parse(listHtml);

var bucket = argv.bucket || process.env.S3_SERVER_BUCKET;
var key = argv.key || process.env.AWS_ACCESS_KEY_ID;
var secret = argv.secret || process.env.AWS_SECRET_ACCESS_KEY;
var port = argv.p || argv.port || process.env.S3_SERVER_PORT || 3010;
const prefix = argv.prefix || process.env.S3_KEY_PREFIX || "";

console.log('Serving ' + bucket + ' on port ' + port);

if (key) {
  AWS.config.update({
    accessKeyId: key,
    secretAccessKey: secret
  });
}

var s3 = new AWS.S3();

var app = express();

function loadPrefixes(prefix, callback){
  s3.listObjects({
    Bucket: bucket,
    Delimiter: '/',
    EncodingType: 'url',
    Prefix: prefix
  }, callback);
}


function serve(path, res){
  s3.getObject({ Bucket: bucket, Key: path }, function(err, data){
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
  res.write(Mustache.render(listHtml, {
    prefixes: prefixes,
    s3Bucket: bucket
  }));
  res.end();
}

app.use(function(req, res, next){
  var path = prefix + req.path.substr(1);

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
          serveList(data.CommonPrefixes, res);
        }
      } else {
        serveList(data.CommonPrefixes, res);
      }
    });
  } else {
    serve(path, res);
  }
});

app.listen(port);
