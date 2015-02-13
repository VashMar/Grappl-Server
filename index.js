var express = require("express");
var mongoose = require("mongoose");
var http = require('http');


var database = process.env.MONGOLAB_URI || 
               process.env.MONGOHQ_URL  ||
               "mongodb://localhost:27017/tuber_dev";


var port = process.env.PORT || 4000;

var io = require('socket.io');

var User = require("./Models/user");

var app = express();

io = io.listen(http.createServer(app).listen(port));

// db connection
mongoose.connect(database, function(err, res){
  if(err){console.log('ERROR connecting to: ' + database + ': ' + err + "in ");}

  else{
    console.log("Connection to " + database + " successful!" );
  }
});


/* User.removeUsers(creation);


function creation(){
	User.create("Tom", "Tom@tom.com", function(user){
	console.log(user.name +  "found!");
	});
} */




// Router //////

app.get("/", function(req, res){
	console.log("hit");
	res.json(200);
});

app.get("/login", function(req, res){
	var username = req.query.username;
	var email = req.query.email;

	User.login(username, email, function(user){
		if(user){
			console.log(user);
		}else{
			console.log("could not create account");
		}
	});

});


app.get("/signup", function(req, res){

});


app.post("/login", function(req, res){
	console.log("post hit");
});




/////////////////



io.on('connection', function (socket) {
  console.log("Connected to: " + socket);
  socket.emit('news', { hello: 'world' });
});