#!/usr/bin/env node

var knox = require('knox');
var express = require('express');

var argv = require('minimist')(process.argv.slice(2));

var bucket = argv.bucket || process.env.S3_SERVER_BUCKET;
var key = argv.key || process.env.AWS_ACCESS_KEY_ID;
var secret = argv.secret || process.env.AWS_SECRET_ACCESS_KEY;
var port = argv.p || argv.port || process.env.S3_SERVER_PORT || 3010;

console.log('Serving ' + bucket + ' on port ' + port);

var client = knox.createClient({
  key: key,
  secret: secret,
  bucket: bucket
});

var app = express();

app.use(function(req, res, next){
  client.get(req.path).on('response', function(awsRes){
    res.set(awsRes.headers);

    res.status(awsRes.statusCode);
    
    //awsRes.setEncoding('utf8');
    awsRes.on('data', function(chunk){
      res.write(chunk);
    });

    res.on('end', function(){
      res.end();
    });

    res.on('error', function(err){
      console.error(req.path, err);
    });
  }).end();
});

app.listen(port);