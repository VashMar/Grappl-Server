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
var bodyParser = require('body-parser');
var multer = require('multer'); 

//models
var User = require("./Models/user");

//controllers
var Account = require("./Controllers/account");

//helpers
var errHandle = require("./Helpers/errorHandler");

// set up socket listener 
io = io.listen(http.createServer(app).listen(port));

// establish db connection
mongoose.connect(database, function(err, res){
  if(err){console.log('ERROR connecting to: ' + database + ': ' + err + "in ");}

  else{
    console.log("Connection to " + database + " successful!" );
  }
});


// configure express middleware 
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data




// Router //////

app.get("/", function(req, res){
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
			var token = jwt.sign(user, jwtSecret);
		  	res.json({token: token});
		}
	});
});

var jwtSecret = "t3stk3y";


app.post("/signup", function(req, res){
	// take in credentials 
	var first = req.body.first;
	var last = req.body.last; 
	var email = req.body.email;
	var pass = req.body.password;

	// try to create an account 
	User.create(first, last, email, pass, function(err, user){
		if(err){
			errHandle.signupErrors(res, err);
		}else if(user){
			// we are sending the profile in the token
			var token = jwt.sign(user, jwtSecret);
		  	res.json({token: token});
		}
	});
});



/////////////////


io.use(socketioJwt.authorize({
  secret: jwtSecret,
  handshake: true
}));



io.on('connection', function (socket){
  console.log("Connected to: " + socket.id);
  console.log("Token: " + socket.decoded_token);

  // returns tutors 
  socket.on('grapple', function(data){
  	console.log(data);
  });

});