var express = require("express");
var mongoose = require("mongoose");
var http = require('http');
var jwt = require('jsonwebtoken');
var socketioJwt = require('socketio-jwt');

var database = process.env.MONGOLAB_URI || 
               process.env.MONGOHQ_URL  ||
               "mongodb://localhost:27017/grappl_dev";

var port = process.env.PORT || 4000;
var io = require('socket.io');
var app = express();
var bodyParser = require('body-parser');
var multer = require('multer'); 
var async = require('async');


//models
var User = require("./Models/user");
var Course = require("./Models/course");

//controllers
var Account = require("./Controllers/account");

//helpers
var errHandle = require("./Helpers/errorHandler");

// set up socket listener 
io = io.listen(http.createServer(app).listen(port));


// establish db connection
mongoose.connect(database, function(err, res){
  if(err){console.log('ERROR connecting to: ' + database + ': ' + err );}
  else{ console.log("Connection to " + database + " successful!" ); }
});

// configure express middleware 
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data


// build dictionary store of tutors on load 
var COURSE_LIST = ["Chemistry 103", "Comp Sci 302", "French 4", "Math 234", "Physics 202"];

var ALL_COURSES = "All";  // signifies index for all the courses 

////////////////////////////////////////////// Router ////////////////////////////////////////////////////////////
app.get("/", function(req, res){
	res.json(200);
});

app.post("/login", function(req, res){
	console.log("Login hit");
	var pass = req.body.password;
	var email = req.body.email;

	User.login(email, pass, function(err, user){
		if(err){
			console.log("Login error")
			errHandle.loginErrors(res, err);
		}else if(user){
			// we are sending the profile in the token
			var token = jwt.sign(user._id, jwtSecret);
		  	res.json({token: token, user: user.clientAccountData()});
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
			var token = jwt.sign(user._id, jwtSecret);
		  	res.json({token: token, user: user.clientAccountData()});
		}
	});
});


// return nearby available tutors
app.get('/tutors', function(req, res){

	var course = req.query.course;

	// coordinates of the requester 
	var reqLat = req.query.lat;
	var reqLon = req.query.lon;

	console.log("Getting available tutors for " + course + "at :(" +  reqLat + "," + reqLon +")");
	var tutors = availableTutors[course];
	var nearbyTutors = [];

	if(tutors){
		async.each(tutors, function(tutor, callback){
		var tutorLat = tutor.location.lat;
		var tutorLon = tutor.location.lon;

		console.log("Tutor Location: (" + tutorLat + "," + tutorLon + ")");
		getDistance(reqLat, reqLon, tutorLat, tutorLon, function(distance){
			// return relevant tutor data
			tutor.clientTutorData(distance, function(tutorData){
				nearbyTutors.push(tutorData);
				callback();
			});
		});

		}, function(){ // callback after done going through tutors list 
			console.log("Tutors nearby: " + nearbyTutors);
			res.json(nearbyTutors);
		});

	}else{
		res.json(nearbyTutors);
	}

});

// return the course list 
app.get('/courses', function(req, res){
	res.json(COURSE_LIST);
});


app.get('/locations', function(req, res){
	
});



///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// create a map to store available tutors in each course (eventually implement redis cache)
var availableTutors = {};
// a map to store 
var grappledTutors = {};


availableTutors[ALL_COURSES] = []; // makes sure we can track all the available tutors at once 

// populates the courses based on the course list 
for(var i = 0; i < COURSE_LIST.length; i++){

	var courseName = COURSE_LIST[i];
	var course = new Course({name: courseName});

	console.log("Adding course: " + courseName );
	course.save(function(err){
		if(err){
			console.log(err);
		}
	});

	availableTutors[courseName] = [];
}


/**************************************************************************** Socket Code ************************************************************************************/

// authorize the socket connection based on passed in token 
io.use(socketioJwt.authorize({
  secret: 't3stk3y',
  handshake: true
}));


io.on('connection', function (socket){
	console.log("Socket Connected! " + socket.decoded_token);

	var currentUser;				// tracks the user on this socket 
	var socketID = socket.id;		// id of this socket 
	var tutorCourses = [];		// if it's user is a tutor keep track of courses 
	var connectedUser;			// whomever this user may be 
	var inSession = false;  		// tracks whether the user on this socket is in a session
	var clientSessionTime;			// captures time left in session (ms)
	var serverSessionTime;		// tracks session from server side 
 
	// retrieve the user object for this socket connection 
	User.findOne({_id: socket.decoded_token}, function(err, user){

		if(err){
			console.log(err);
		}
 
		if(user){
			console.log("Found User: " + JSON.stringify(user));
			currentUser = user; 
			console.log("joining room: " + currentUser.id);
			socket.join(currentUser.id);   // join room based on id 
		}

	});
 

	// if a tutor gets grappled remove them from the available tutors cache and add them to a grappled cache
	socket.on('grapple', function(data){
		console.log("Grapple data: " + JSON.stringify(data)); 
		connectedUser = data.id;  // get the tutors socketID and use it to join the same room as / broadcast to the tutor socket 
		console.log("emitting response to room: " + connectedUser);

		// check to see if tutor is in the available list 


		// return the user object who initated the grapple 
		io.to(connectedUser).emit('grapple', {id: currentUser.clientAccountData()});

	}); 


	// sets a tutor as available to tutor a class 
	socket.on('setAvailable', function(data){
		console.log("Setting " + currentUser.firstName + " as available..");

		console.log("Meeting Spots:" + data.meetingSpots[0]);

		// // save the tutor broadcast settings 
		currentUser.updateTutorSession(data.time, data.distance, data.price, data.lat, data.lon, function(tutor){

			currentUser = tutor; // update our version of currUser so it's same as DB 
			tutorCourses = data.courses; // updates tutors current course list   

			// add the tutor to the available list for all courses if they don't exist 
			if(!tutorExists(availableTutors[ALL_COURSES], currentUser)){
				availableTutors[ALL_COURSES].push(currentUser);	
			}

			// add the tutor to the available list for appropriate courses 
			for(var i = 0; i < tutorCourses.length; i++){

				var tutors = availableTutors[tutorCourses[i]];
				if(!tutorExists(tutors, currentUser)){
					tutors.push(currentUser);
					console.log(currentUser.firstName +  " added to course " + tutorCourses[i]);
					console.log("Available Tutors: " + availableTutors[tutorCourses[i]]);
				}
			}
		});
	});


	// removes a tutor from the availability pool for all their courses
	socket.on('removeAvailable', function(data){

			// remove tutor from pool of all 
			var tutors = availableTutors[ALL_COURSES];
			removeTutor(tutors);

			async.each(tutorCourses, function(course, callback){

			tutors = availableTutors[course];
				removeTutor(tutors);
				callback();

		}, function(){ // callback after done going through tutors list 
			console.log("Remove Available Complete");
			socket.emit('removeAvailableDone', {responseType: "removeAvailableDone"});
		});

			function removeTutor(tutors){
				for(var i =0; i < tutors.length; i++){
					if(tutors[i]._id == currentUser._id){
						tutors.splice(i,1);  // removes tutor from list 
					}
				}

			}

	});


	// send request to start a session 
	socket.on('sessionRequest', function(data){
		io.to(connectedUser).emit('sessionRequest');
	});

	// start timer sync for both phones 
	socket.on('sessionAccept', function(data){	 
		io.to(connectedUser).emit('startSession');
		socket.emit('startSession');
	});

	// register that a session has started (meant for socket that sent request)
	socket.on('sessionStarted', function(data){
		serverSessionTime = data.sessionTime; 
		inSession = true;
		// start tracking session time
		setInterval(function(){
			serverSessionTime = serverSessionTime - 10000;	
		}, 10000);

	
	});

	// stores session time heartbeat 
	socket.on('sessionTime', function(data){
		console.log("Server Time: "  + serverSessionTime);
		console.log("Client Time: " + serverSessionTime);
		clientSessionTime = data.sessionTime; 
	});

	// when a session is completed clear the stored data
	socket.on('sessionComplete', function(){
		inSession = false; 
		connectedUser = null; 

	});


	// updates connected user on distance from meeting point (param is distance from meeting point in miles)
	socket.on('updateDistance', function(data){
		io.to(connectedUser).emit('distanceUpdate', {distance: data.distance});
	});


	// updates the rating of other user 
	socket.on('updateRating', function(data){
			console.log("Updating tutor rating..");
	  	User.find({_id:data.id}, function(err, user){
	  	 	if(err){
	  	 		console.log(err);
	  	 	}
	  	 	if(user){
	  	 		console.log("Updating tutor rating");
	  	 		user.updateTutorRating(data.rating);
	  	 	}
	  	});
	});


	// relay chat messages 
	socket.on('message', function(data){
		console.log("Relaying Message..");
		console.log(data);
		io.to(data.recipID).emit('message', {messageData: data});
		console.log("Relaying back to sender..");
		socket.emit('message', data);
	});


	// if disconnect handle appropriate case if in a session or in grapple 
	socket.on('disconnect', function(){
		io.to(connectedUser).emit('connectionLost');
	});


});  // socket code ends 


/****************************************************** Helpers ******************************************************/

// returns true if tutor exists in list of tutors
function tutorExists(tutors, currTutor){
	for( var i = 0; i < tutors.length; i++){
		if(tutors[i]._id === currTutor._id){
			console.log("Tutor already exists");
			return true;
		}
		if(i == tutors.length-1){
			return false; 
		}
	}
}


function getDistance(lat1, lon1, lat2, lon2, next){
	console.log("Finding distance between (" + lat1 + "," + lon1 + ") and (" + lat2 + "," + lon2 + ")" );
	var R = 6371; // Radius of the earth in km
  	var dLat = deg2rad(lat2-lat1);  // deg2rad below
  	var dLon = deg2rad(lon2-lon1); 
  	var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);


  	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  	var distance = R * c * 0.62137; // distance in mi
  	console.log("Distance: " + distance + "miles");
  	next(distance);
}

function deg2rad(deg){
  return deg * (Math.PI/180)
}