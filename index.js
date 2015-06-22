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


console.log("Launching server at.. " + new Date());

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
	console.log("Sign up hit");
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


// return nearby broadcasting tutors
app.get('/tutors', function(req, res){

	var course = req.query.course;

	// coordinates of the requester 
	var reqLat = req.query.lat;
	var reqLon = req.query.lon;

	console.log("Getting broadcasting tutors for " + course + "at :(" +  reqLat + "," + reqLon +")");
	var tutors = broadcastingTutors[course];
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

			//sort then return 
			async.series([
				timeSortTutors(nearbyTutors),
				res.json(nearbyTutors)
			]);
			
		});

	}else{
		console.log("no ones broadcasting");
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
var broadcastingTutors = {};
// a map to store tutors that have been grappled by course 
var grappledTutors = {}; 
var allCourses = [];


broadcastingTutors[ALL_COURSES] = []; // makes sure we can track all the available tutors at once 

loadBroadcasters();


function loadBroadcasters(){
	// loads all the broadcasting tutors for each course 
	Course.getAll(function(courses){
		allCourses = courses; 

		//retrieve tutors for each course 
		allCourses.forEach(function(course){
			console.log("Loading tutors for " + course.name + "..");

			// sets the tutor list per course 
			var tutors = course.tutors;
			broadcastingTutors[course.name] = tutors;
			console.log(course.name + "'s tutors: " + JSON.stringify(tutors));

			// goes through all tutors, if tutor doesnt exist in broadcasting list, add them
			tutors.forEach(function(tutor){
				if(!tutorExists(broadcastingTutors[ALL_COURSES], tutor)){
					broadcastingTutors[ALL_COURSES].push(tutor);
				}
			});
		});

		// if(COURSE_LIST.length != allCourses.length){
		// 	// populates the courses based on the course list 
		// 	for(var i = 0; i < COURSE_LIST.length; i++){

		// 		var courseName = COURSE_LIST[i];
		// 		var course = new Course({name: courseName});

		// 		console.log("Adding course: " + courseName );
		// 		course.save(function(err){
		// 			if(err){
		// 				console.log(err);
		// 			}
		// 		});

		// 		broadcastingTutors[courseName] = [];
		// 	}

		// }
	});
}


function wipeBroadcasters(){
	console.log("Wiping Broadcasters..");
	var bcastCourses = Object.keys(broadcastingTutors);
	Course.getAll(function(courses){
		courses.forEach(function(course){
			course.tutors = [];
			broadcastingTutors[course.name] = [];
			course.save();
		});
	});
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
			tutorCourses = currentUser.tutorCourses;
			console.log("joining room: " + currentUser.id);
			socket.join(currentUser.id);   // join room based on id 
		}

	});
 

	// initiate a grappl to tutor  by sending an emit along with data 
	socket.on('grapple', function(data){
		console.log("Grapple data: " + JSON.stringify(data)); 
		connectedUser = data.id;  // get the tutors socketID and use it to join the same room as / broadcast to the tutor socket 
		console.log("emitting response to room: " + connectedUser);

		console.log("Broadcasting tutors: " + broadcastingTutors[ALL_COURSES]);

		if(tutorExists(broadcastingTutors[ALL_COURSES], connectedUser)){
			// emit to tutor 
			io.to(connectedUser).emit('grapple', {id: currentUser.clientAccountData()});
		}else{
			socket.emit('grapplFail');
		}
		

	}); 

	// sets a tutor as available to tutor a class 
	socket.on('setAvailable', function(data){
		var meetingSpots = [];

		// convert the meeting spots to JSON
		for(var i =0; i < data.meetingSpots.length; i++){
			meetingSpots.push(JSON.parse(data.meetingSpots[i]));

			if(i == data.meetingSpots.length - 1){
				updateSession();
			}
		}
		

		function updateSession(){
			// save the tutor broadcast settings 
			currentUser.updateTutorSession(data.startTime, data.period, meetingSpots, data.price, data.lat, data.lon, function(tutor){

				currentUser = tutor; // update our version of currUser so it's same as DB 
				tutorCourses = data.courses; // updates tutors current course list   
				currentUser.tutorCourses = tutorCourses; 
				currentUser.save();

				// add the tutor to the available list for all courses if they don't exist 
				if(!tutorExists(broadcastingTutors[ALL_COURSES], currentUser)){
					broadcastingTutors[ALL_COURSES].push(currentUser);	
					console.log("Broadcasting Tutors: " + broadcastingTutors[ALL_COURSES]);
				}

				// add the tutor to the available list for appropriate courses 
				for(var i = 0; i < tutorCourses.length; i++){

					var tutors = broadcastingTutors[tutorCourses[i]];
					

					if(!tutorExists(tutors, currentUser)){
						tutors.push(currentUser);
						console.log(currentUser.firstName +  " added to course " + tutorCourses[i]);

						// store to db 
						var course = findCourse(tutorCourses[i]);
						if(course){
							course.save(function(err){
								if(err){
									console.log(err);
								}
							});
						}

					}
				}

			});		 
		}
	});


	// removes a tutor from the availability pool for all their courses
	socket.on('removeAvailable', function(data){

		// remove tutor from pool of all 
		removeTutor(broadcastingTutors[ALL_COURSES]);

		async.each(tutorCourses, function(course, callback){

			// remove tutor from every course they are in 
			removeTutor( broadcastingTutors[course]);

			// update the db
			var courseObj = findCourse(course);
			courseObj.save();

			callback();

		}, function(){ // callback after done going through tutors list 
			tutorCourses = []; //empty the list of tutorCourses 
			console.log("Remove Available Complete");
			console.log("Broadcasting tutors: " + broadcastingTutors[ALL_COURSES]);
			socket.emit('removeAvailableDone', {responseType: "removeAvailableDone"});
		});

		function removeTutor(tutors){
			for(var i =0; i < tutors.length; i++){
				console.log("tutorID:" + tutors[i].id);
				console.log("userID:" + currentUser.id);
				if(tutors[i].id == currentUser.id){
					tutors[i].setUnavailable();
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
		io.to(data.recipID).emit('message', data);
		console.log("Relaying back to sender..");
		socket.emit('message', data);
	});


	// if disconnect handle appropriate case if in a session or in grapple 
	socket.on('disconnect', function(){
		console.log("Socket Disconnected");
		io.to(connectedUser).emit('connectionLost');
	});




});  // socket code ends 


/****************************************************** Helpers ******************************************************/

// returns true if tutor exists in list of tutors
function tutorExists(tutors, currTutor){
	for( var i = 0; i < tutors.length; i++){
		if(tutors[i].id === currTutor.id){
			console.log("Tutor exists");
			return true;
		}
		if(i == tutors.length-1){
			return false; 
		}
	}
}

// returns true if tutor exists in list of tutors based on ID
function tutorExists(tutors, tutorID){
	for( var i = 0; i < tutors.length; i++){
		if(tutors[i].id === tutorID){
			console.log("Tutor exists");
			return true;
		}
		if(i == tutors.length-1){
			return false; 
		}
	}
}



function timeSortTutors(tutors){
	if(tutors.length < 1){
		return;
	}

	tutors.sort(function(a, b) { 
    	return a.startTime - b.startTime;
	});
}

// returns a course by name 
function findCourse(courseName){
	for(var i =0; i < allCourses.length; i++){
		if(allCourses[i].name == courseName){
			return allCourses[i];
		}

		if(i == allCourses.length - 1){
			console.log("Course not found");
			return null; // if course not found 
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