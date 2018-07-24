#!/usr/bin/env node

var R = require('ramda');
var express = require('express');
var AWS = require('aws-sdk');
var argv = require('minimist')(process.argv.slice(2));
var path = require('path');
var escapeStringRegexp = require('escape-string-regexp');
var fs = require('fs');
var http = require('http');
var https = require('https');
var Mustache = require('mustache');

// Load the list html
var listHtmlFile = path.resolve(__dirname, '../lib/list.html');
var listHtml = fs.readFileSync(listHtmlFile).toString();
Mustache.parse(listHtml);

var endpoint = argv.endpoint || process.env.S3_SERVER_ENDPOINT;
var bucket = argv.bucket || process.env.S3_SERVER_BUCKET;
var key = argv.key || process.env.AWS_ACCESS_KEY_ID;
var secret = argv.secret || process.env.AWS_SECRET_ACCESS_KEY;
var port = argv.p || argv.port || process.env.S3_SERVER_PORT || 3010;
var securePort = argv.securePort || process.env.S3_SERVER_SECURE_PORT || 3020;
var securePassphrase = argv.securePassphrase || process.env.S3_SERVER_SECURE_PASSPHRASE;

var privateKey, certificate;
if (process.env.S3_SERVER_SECURE_KEY_FILE || argv.secureKey) {
  privateKey  = fs.readFileSync(argv.secureKey || process.env.S3_SERVER_SECURE_KEY_FILE, 'utf8');
  certificate = fs.readFileSync(argv.secureCert || process.env.S3_SERVER_SECURE_CERT_FILE, 'utf8');
}

const prefix = argv.prefix || process.env.S3_KEY_PREFIX || "";

console.log('Serving ' + bucket + ' on port ' + port);

if (key) {
  AWS.config.update({
    accessKeyId: key,
    secretAccessKey: secret
  });
}

var s3 = new AWS.S3({endpoint: endpoint});

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

function createBreadcrumbs(bucket, path) {
  let fullPath = [];
  var result = R.flatten([bucket, path.replace(/\/$/, '').split('/')]).map(p => {
    fullPath.push(p);
    var href = fullPath.length > 1 ? `/${R.drop(1, fullPath).join('/')}/` : '/';
    return {
      Href: href,
      Name: p,
    };
  });
  if (result.length > 0) {
    result[result.length-1].last = true;
  }
  return result;
}

function serveList(path, files, subdirectories, res){
  files.forEach((f) =>
    f.Name = f.Key.replace(new RegExp(`^${escapeStringRegexp(path)}`), ''));
  subdirectories.forEach((f) =>
    f.Name = f.Prefix.replace(new RegExp(`^${escapeStringRegexp(path)}`), ''));
  res.write(Mustache.render(listHtml, {
    breadcrumbs: createBreadcrumbs(bucket, path),
    files: files,
    subdirectories: subdirectories,
    s3Bucket: bucket,
    path: path,
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
          serveList(path, data.Contents, data.CommonPrefixes, res);
        }
      } else {
        serveList(path, [], data.CommonPrefixes, res);
      }
    });
  } else {
    serve(path, res);
  }
});

http.createServer(app).listen(port);

if (privateKey) {
  var credentials = {key: privateKey, cert: certificate};
  if (securePassphrase) {
    credentials.passphrase = securePassphrase;
  }

  https.createServer(credentials, app).listen(securePort);
}
