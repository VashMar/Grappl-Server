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
		var tutorLat = tutor.location.xPos;
		var tutorLon = tutor.location.yPos;

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
	res.JSON(COURSE_LIST);
});


///////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////

// create a map to store available tutors in each course (eventually implement redis cache)
var availableTutors = {};

var currentCourses;

// populate 
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


Course.getAll(function(courses){

	console.log("Currently offering " +  courses.length + " courses" );
	currentCourses = courses; 


});

// Course.getAll(function(courses){
// 	if(courses.length > 0){	
// 		courses.forEach(function(course){
// 			console.log("Adding course... : " + course.name);
// 			availableTutors[course.name] = [];
// 			for(var i =0; i < course.tutors.length; i++){
// 				var tutor = course.tutors[i];
// 				if(tutor.tutorSession.available){
// 					availableTutors[course.name].push(tutor); // add the tutor if they are available
// 				}
// 			}
// 		});
// 	}else{

// 		// create a placeholder course
// 		var course = new Course({name: 'CS302'});

// 		// Lets fill in some dummy data
// 		var user1 = new User({firstName: 'Eric', lastName: 'Cartman', email: 'ericCartman@test.com', password: 'test123', tutor: true, approved: true}),
// 			user2 = new User({firstName: 'Kyle', lastName: 'Broflovski', email: 'kyleBrof@test.com', password: 'test123', tutor: true, approved: true}),
// 			user3 = new User({firstName: 'Stan', lastName: 'Marsh', email: 'stanMarsh@test.com', password: 'test123', tutor: true, approved: true}),
// 			user4 = new User({firstName: 'Kenny', lastName: 'McCormick', email: 'kennyMccormick@test.com', password: 'test123', tutor: true, approved: true});


// 		var tutorList = [];

// 		var saveUser = function(err, user, callback){
// 			if(err){
// 				callback(err);
// 			}else{
// 				tutorList.push(user);
// 				callback();
// 			}
// 		}

// 		// save all the dummy tutors with unique locations and add them to the course 
// 		async.parallel([
// 			function(callback){
// 				user1.tutorSession.available = true;
// 				// college library 
// 				user1.location.xPos = 43.0767057;
// 				user1.location.yPos = -89.4010609;
// 				user1.save(function(err, user){
// 					saveUser(err, user, callback);
// 				});
// 			},
// 			function(callback){
// 				user2.tutorSession.available = true;
// 				// union south 
// 				user2.location.xPos = 43.0719139;
// 				user2.location.yPos = -89.4081352;
// 				user2.save(function(err, user){
// 					saveUser(err, user, callback);
// 				});

// 			},
// 			function(callback){
// 				user3.tutorSession.available = true;
// 				// grainger hall 
// 				user3.location.xPos = 43.0726811;
// 				user3.location.yPos = -89.40169209999999;
// 				user3.save(function(err, user){
// 					saveUser(err, user, callback);
// 				});

// 			}, 
// 			function(callback){
// 				user4.tutorSession.available = true;
// 				// east campus mall
// 				user4.location.xPos = 43.0724282;
// 				user4.location.yPos = -89.3985619;
// 				user4.save(function(err, user){
// 					saveUser(err, user, callback);
// 				});
// 			}

// 		], function(err){
// 			if(err){
// 				console.log(err);
// 			}else{
// 				console.log("New tutors saved");
// 				// loop through saved tutors  
// 				for(var i = 0; i < tutorList.length; i++){
// 					// add each to course,
// 					var tutor = tutorList[i];
// 					course.tutors.push(tutor)

// 					if(i == tutorList.length-1){
// 						// save course
// 						course.save(function(err, course){
// 							if(err){
// 								console.log(err);
// 								return;
// 							}

// 							// add the course and tutors to the available tutor list
// 							availableTutors[course.name] = tutorList; 
// 						});
// 					}
// 				}
// 			}
// 		});

// 	}
// });


/////////////////////////////////////////////////////////////////////////////////////////////////


io.use(socketioJwt.authorize({
  secret: 't3stk3y',
  handshake: true
}));

io.on('connection', function (socket){
  console.log("Socket Connected! " + socket.decoded_token.firstName);

  // the user for this socket connection 
  var currentUser = socket.decoded_token;   
  var socketID = socket.id
  var token; 

  // if a tutor gets grappled remove them from the available tutors cache and add them to a grappled cache
  socket.on('grapple', function(data){
  	var tutorSocketID = data.id;  // get the tutors socketID and use it to join the same room as / broadcast to the tutor socket 
	  	
  });


  // sets a tutor as available to tutor a class 
  socket.on('setAvailable', function(data){
  		console.log("Setting " + currentUser.firstName + " as available..");
  		
  		// // save the tutor broadcast settings 
  		currentUser.updateTutorSession(data.time, data.distance, data.price, function(tutor){

  			currentUser = tutor; // update our version of currUser so it's same as DB 

  			// add the tutor to the avaiable list for appropriate courses 
  			for(var i = 0; i < data.courses.length; i++){
  				availableTutors[data.course[i]].push(currentUser);
  				console.log(currentUser.name +  " added to course " + data.course[i]);
  				console.log("Available Tutors: " + availableTutors[data.course[i]]);

  			}
  		});
  });


  // socket.on("message")

  // 	socket.emit('message')
  //       socket.on("message", message);
  //       socket.on("locationUpdate", locationUpdate);
  //       socket.on("meetingSuggestion", meetingSuggestion);
  //       socket.on("startSessionRequest", startSessionRequest);
  //       socket.on("grapple", grapple);




});





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