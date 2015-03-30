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
  if(err){console.log('ERROR connecting to: ' + database + ': ' + err + "in ");}
  else{ console.log("Connection to " + database + " successful!" ); }
});

// configure express middleware 
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded
app.use(multer()); // for parsing multipart/form-data

// create a map to store available tutors in each course (eventually implement redis cache)
var availableTutors = {};


// Router //////
app.get("/", function(req, res){
	res.json(200);
});

app.get("/login", function(req, res){
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
	var reqLat = req.query.locX;
	var reqLon = req.query.locY;

	var tutors = availableTutors[course];

	var nearbyTutors = [];


	async.each(tutors, function(tutor, callback){
		var tutorLat = tutor.location.xPos;
		var tutorLon = tutor.location.yPos;


		getDistance(reqLat, reqLon, tutorLat, tutorLon, function(distance){
			// show all tutors within 2 miles 
			if(distance < 2){
				nearbyTutors.push(tutor);
			}

			callback();
		});



	}, function(){ // callback after done going through tutors list 
		console.log("Tutors nearby: " + nearbyTutors);

	});

});

///////////////////////////////////////////////////////////////////////////////////////////

// build dictionary store of tutors on load 
Course.getAll(function(courses){
	if(courses.length > 0){
		courses.forEach(function(course){
			availableTutors[course.name] = [];
			for(var i =0; i < course.tutors.length; i++){
				var tutor = course.tutors[i];
				if(tutor.tutorSession.available){
					availableTutors[course.name].push(tutor); // add the tutor if they are available
				}
			}
		});
	}else{

		// create a placeholder course
		var course = new Course({name: 'CS302'});

		// Lets fill in some dummy data
		var user1 = new User({firstName: 'Eric', lastName: 'Cartman', email: 'ericCartman@test.com', password: 'test123', tutor: true, approved: true}),
			user2 = new User({firstName: 'Kyle', lastName: 'Broflovski', email: 'kyleBrof@test.com', password: 'test123', tutor: true, approved: true}),
			user3 = new User({firstName: 'Stan', lastName: 'Marsh', email: 'stanMarsh@test.com', password: 'test123', tutor: true, approved: true}),
			user4 = new User({firstName: 'Kenny', lastName: 'McCormick', email: 'kennyMccormick@test.com', password: 'test123', tutor: true, approved: true});


		var tutorList = [];

		var saveUser = function(err, user, callback){
			if(err){
				callback(err);
			}else{
				tutorList.push(user);
				callback();
			}
		}

		// save all the dummy tutors with unique locations and add them to the course 
		async.parallel([
			function(callback){
				user1.tutorSession.available = true;
				// college library 
				user1.location.xPos = 43.0767057;
				user1.location.yPos = -89.4010609;
				user1.save(function(err, user){
					saveUser(err, user, callback);
				});
			},
			function(callback){
				user2.tutorSession.available = true;
				// union south 
				user2.location.xPos = 43.0719139;
				user2.location.yPos = -89.4081352;
				user2.save(function(err, user){
					saveUser(err, user, callback);
				});

			},
			function(callback){
				user3.tutorSession.available = true;
				// grainger hall 
				user3.location.xPos = 43.0726811;
				user3.location.yPos = -89.40169209999999;
				user3.save(function(err, user){
					saveUser(err, user, callback);
				});

			}, 
			function(callback){
				user4.tutorSession.available = true;
				// east campus mall
				user4.location.xPos = 43.0724282;
				user4.location.yPos = -89.3985619;
				user4.save(function(err, user){
					saveUser(err, user, callback);
				});
			}

		], function(err){
			if(err){
				console.log(err);
			}else{
				// loop through saved tutors  
				for(var i = 0; i < tutorList.length; i++){
					// add each to course,
					var tutor = tutorList[i];
					course.tutors.push(tutor)

					if(i == tutorList.length-1){
						// save course
						course.save(function(err, course){
							// add the course and tutors to the available tutor list
							availableTutors[course.name] = tutorList; 
						});
					}
				}
			}
		});


	}
});


////////////////////////////////////////////////////////////////////////////////////////////


io.on('connection', function (socket){
  // the user for this socket connection 
  var currentUser;
  var token; 

  // returns tutors for a given course
  socket.on('grapple', function(data){
  	socket.emit('tutorsAvailable', availableTutors[data.course]);
  });

  // sets a tutor as available to tutor a class 
  socket.on('setAvailable', function(data){
  	if(currentUser.tutor && currentUser.approved){
  		availableTutors[data.course].push(currentUser);
  	}
  });

  socket.on(){

  }

});





function getDistance(lat1, lon2, lat2, lon2, next){
	var R = 6371; // Radius of the earth in km
  	var dLat = deg2rad(lat2-lat1);  // deg2rad below
  	var dLon = deg2rad(lon2-lon1); 
  	var a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);


  	var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  	var distance = R * c * 0.62137; // distance in mi
  	next(distance);
}

function deg2rad(deg){
  return deg * (Math.PI/180)
}