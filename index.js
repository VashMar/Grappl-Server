var express = require("express");
var mongoose = require("mongoose");
var http = require('http');
var jwt = require('jsonwebtoken');
var socketioJwt = require('socketio-jwt');

var database = process.env.MONGOLAB_URI || 
               process.env.MONGOHQ_URL  ||
               "mongodb://localhost:27017/tuber_dev";


var port = process.env.PORT || 4000;
var io = require('socket.io');
var app = express();

//models
var User = require("./Models/user");

//controllers
var Account = require("./Controllers/account");

//helpers
var errHandle = require("./Helpers/errorHandler");

io = io.listen(http.createServer(app).listen(port));

// db connection
mongoose.connect(database, function(err, res){
  if(err){console.log('ERROR connecting to: ' + database + ': ' + err + "in ");}

  else{
    console.log("Connection to " + database + " successful!" );
  }
});


// Router //////

app.get("/", function(req, res){
	console.log("hit");
	res.json(200);
});


app.get("/login", function(req, res){
	console.log("Login hit");
	var pass = req.query.password;
	var email = req.query.email;


	User.login(email, pass, function(err, user){
		if(err){
			errHandle.loginErrors(res, err);
		}else if(user){
			// we are sending the profile in the token
			var token = jwt.sign(user, 't3stk3y');
		  	res.json({token: token});
		}
	});
});


app.post("/signup", function(req, res){
	// take in credentials 
	var first = req.query.first;
	var last = req.query.last; 
	var email = req.query.email;
	var pass = req.query.password;


	// try to create an account 
	User.create(first, last, email, pass, function(err, user){
		if(err){
			errHandle.signupErrors(res, err);
		}else if(user){
			// we are sending the profile in the token
			var token = jwt.sign(user, 't3stk3y');
		  	res.json({token: token});
		}
	});
});



/////////////////

io.set('authorization', socketioJwt.authorize({
  secret: 't3stk3y',
  handshake: true
}));


io.on('connection', function (socket) {
  console.log("Connected to: " + socket.id);

  socket.on('Login', function(data){
  	console.log("Login data: " + data);
  	console.log(JSON.stringify(data));
  	console.log("Responding with hello..");
  	socket.emit('Hello', { hello: 'world' });
  });

});