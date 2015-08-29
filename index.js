
/******************************************************************** Initialization *********************************************************************************/

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
var xlsx = require('node-xlsx'); // parses excel files 
var pushbots = require('pushbots');
var Pushbots = new pushbots.api({
    id:'55b1994f177959f7648b4567',
    secret:'d82fefd5afc386d42938cf3641863331'
});



//models
var User = require("./Models/user");
var Course = require("./Models/course");
var Location = require("./Models/location");

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

/******************************************************************** Router *********************************************************************************/
app.get("/", function(req, res){
	res.json(200);
});

app.post("/login", function(req, res){
	console.log("Login hit");
	var pass = req.body.password;
	var email = lowCase(req.body.email);

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
	var first = capCase(req.body.first);
	var last = capCase(req.body.last); 
	var email = lowCase(req.body.email);
	var pass = req.body.password;

	// try to create an account 
	User.create(first, last, email, pass, function(err, user){
		if(err){
			errHandle.signupErrors(res, err);
		}else if(user){
			console.log("User id: " + user._id);
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
	res.json(meetingLocations);
});




/******************************************************************** On Start Up *********************************************************************************/

// create a map to store available tutors in each course (eventually implement redis cache)
var broadcastingTutors = {};
// a map to store tutors that have been grappled by course 
var grappledTutors = {}; 
var allCourses = [];
var meetingLocations = [];
var futureBroadcasters = []; // track all the users are soon to be broadcasting 
	
broadcastingTutors[ALL_COURSES] = []; // makes sure we can track all the available tutors at once 


// get the meeting spot locations 
readLocs();

// load all the broadcasters then set the future broadcasters, sort them, and run an interval check 
async.series([
	loadBroadcasters(),
	setFutureBroadcasters(),
	timeSortTutors(futureBroadcasters),
	availabilityInterval(0)
]);



function readLocs(){
	var xlData = xlsx.parse('Locations.xlsx');
	var locList = xlData[0].data;

	for(var i = 0; i < locList.length; i++){
		var loc = locList[i];
		var locObj = new Location({
			name: loc[0],
			address: loc[1],
			lat: loc[2],
			lon: loc[3]
		});

		console.log(JSON.stringify(locObj));
		meetingLocations.push(locObj);

		// at the end sort the locations by name 
		if(i == locList.length - 1){
			async.series([
				alphaSortLocs(),
				console.log(JSON.stringify(meetingLocations))
			]);
		}
	}
}


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



function setFutureBroadcasters(){
	// go through all the tutors and see which ones are future broadcasters
	for(var i = 0; i < broadcastingTutors[ALL_COURSES].length; i++){
		var tutor = broadcastingTutors[ALL_COURSES][i];
		if(new Date().getTime() < tutor.tutorSession.startTime){
			futureBroadcasters.push(tutor);
			console.log("Future Broadcaster Added");
		}
	}
}

// sets the interval at which to run an availability check for future broadcasters
function availabilityInterval(pos){
	if(futureBroadcasters.length > 0){
		console.log("Starting Interval Check..");
		// figure out how long from now latest broadcaster is scheduled 
		var diff = futureBroadcasters[pos].tutorSession.startTime - new Date().getTime();
		// run the check at that time, if the value is negative, we run the check now 
		var interval = (diff > 0) ? diff : 0;  
		console.log("Interval is: " + interval);
		setTimeout(availabilityCheck, interval); 
	}
}


// checks if a future broadcaster has become available, notifying their phone if they have 
function availabilityCheck(){
		// check availbility of futureBroadcasters every minute
		console.log(futureBroadcasters.length +  " in future pool");
		console.log("Checking Broadcaster Availability...");
		for(var i = 0; i < futureBroadcasters.length; i++){
			var bcaster = futureBroadcasters[i];
			if(new Date().getTime() > bcaster.tutorSession.startTime){
				// if the current time is greater than broadcaster time, the tutor should be broadcasting, so notify them
				console.log(bcaster.firstName + " is ready to Broadcast");
				console.log("Notifying: " + bcaster.deviceID);
				futureBroadcasters.splice(i,1);  // removes tutor from list 
				Pushbots.setMessage("You are now broadcasting" , 1);
				Pushbots.customFields({ "nextActivity": "com.mamba.grapple.Main",
										"selectedCourses": bcaster.tutorSession.courses,
										"meetingSpots": bcaster.tutorSession.meetingSpots,
										"hrRate": bcaster.tutorSession.price
									});
				Pushbots.pushOne(bcaster.deviceID, function(response){
				    console.log(response.code);
				   	console.log(futureBroadcasters.length +  " in future pool"); // see if splice worked
				});
			}else if(new Date().getTime() < futureBroadcasters[i].tutorSession.startTime){
				// the first tutor we run into that isn't ready to broadcast will the time diff of our new interval check 
				availabilityInterval(i);
				return; 
			}
		}
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
	var connectedUser;			// other user in connection 
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
			tutorCourses = currentUser.tutorSession.courses;
			console.log("joining room: " + currentUser.id);
			socket.join(currentUser.id);   // join room based on id 
		}

	});

	// retrieves the id of connected users device 
	socket.on('deviceID', function(data){
		console.log("Updating Device ID..");
		currentUser.deviceID = data;
		currentUser.save(function(err,user){
			if(err){
				console.log(err);
			}else if(user){
				console.log("User Device ID Updated.");
				currentUser = user; 
			}
		});
	});
 

	// initiate a grappl to tutor  by sending an emit along with data 
	socket.on('grapple', function(data){
		console.log("Grapple data: " + JSON.stringify(data)); 
		connectedUser = data.id;  // get the tutors socketID and use it to join the same room as / broadcast to the tutor socket 
		console.log("emitting response to room: " + connectedUser);

		if(tutorExists(broadcastingTutors[ALL_COURSES], connectedUser)){
			// emit to tutor 
			io.to(connectedUser).emit('grapple', {user: currentUser.clientAccountData(), place: data.place});
		}else{
			console.log("Grappl failed");
			socket.emit('grapplFail');
		}
	}); 

	// relay the grapplSuccess to the connected user
	socket.on('grapplSuccess', function(data){
		console.log("Grappl Succeeded..");
		connectedUser = data.id;
		io.to(connectedUser).emit('grapplSuccess');
	});

	// notify the connected user and remove the connection
	socket.on('cancelGrappl', function(data){
		io.to(connectedUser).emit('grapplEnded');
		connectedUser = null; 
	});

	// sets a tutor as available to tutor a class 
	socket.on('setAvailable', function(data){
		var meetingSpots = [];
		var asyncTasks = [];

		// do the current user reload and meeting spot parsing in parallel 
		asyncTasks.push(function(callback){
			User.reload(currentUser.id, function(user){
				if(user){
					currentUser = user;
					callback();
				}
			});
		});


		asyncTasks.push(function(callback){
			// convert the meeting spots to JSON
			for(var i =0; i < data.meetingSpots.length; i++){ 
				console.log("meetingspots: " + JSON.stringify(data.meetingSpots));
				if(typeof data.meetingSpots[i] != 'object'){
					meetingSpots.push(JSON.parse(data.meetingSpots[i]));
				}else{
					meetingSpots.push(data.meetingSpots[i]);
				}
				
				if(i == data.meetingSpots.length - 1){
					callback();
				}
			}
		});
		

		async.parallel(asyncTasks, function(){
		  	// All tasks are done now	
			updateSession();		  	
		});

		
		// stores latest session data and acknowledges 
		function updateSession(){ 
			// save the tutor broadcast settings 
			currentUser.updateTutorSession(data.startTime, data.period, data.courses, meetingSpots, data.price, data.lat, data.lon, function(tutor){

				// check if future broadcast 
				if(new Date().getTime() < tutor.tutorSession.startTime){
					console.log("Adding future broadcaster..");
					futureBroadcasters.push(tutor);
					timeSortTutors(futureBroadcasters);
					if(futureBroadcasters.length == 1){
						// if it's the only tutor, kickstart the interval checking 
						availabilityInterval(0);
					}
				}

				socket.emit('sessionUpdated', {session: currentUser.getSessionData()});
				currentUser = tutor; // update our version of currUser so it's same as DB 
				tutorCourses = data.courses; // updates tutors current course list   
		

				// add the tutor to the available list for all courses if they don't exist 
				if(!tutorExists(broadcastingTutors[ALL_COURSES], currentUser)){
					broadcastingTutors[ALL_COURSES].push(currentUser);	
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


	// removes a tutor from the availability pool for all their courses (triggered by user)
	socket.on('removeAvailable', function(data){
		console.log(broadcastingTutors[ALL_COURSES].length + " in pool");
		console.log("Triggered tutor removal initiated..");

		// remove tutor from pool of all 
		removeTutor(broadcastingTutors[ALL_COURSES]);

		// remove from future broadcasting 
		removeTutor(futureBroadcasters);

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
			console.log(broadcastingTutors[ALL_COURSES].length + " in pool");
			socket.emit('removeAvailableDone', {responseType: "removeAvailableDone"});
		});

		function removeTutor(tutors){
			for(var i =0; i < tutors.length; i++){
				if(tutors[i].id == currentUser.id){
					tutors[i].setUnavailable();
					tutors.splice(i,1);  // removes tutor from list 
				}
			}

		}

	});
	
	// when account pic gets changed 
	socket.on('updateProfilePic', function(data){
		currentUser.updateProfilePic(data.ref, function(user){
			if(user){
				// get the latest version of current user
				currentUser = user; 
				// update the client side model 
				console.log("Profile Pic Updated");
				socket.emit('updatedPic', {profilePic: currentUser.profilePic});
			}
		});
	});

	// relay meetup acceptance to connected user 
	socket.on('startMeetup', function(data){
		io.to(connectedUser).emit('startMeetup');
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

	socket.on('endSession', function(data){
		console.log(currentUser.name + " ended session");
		console.log("Notifying " + connectedUser.name);
		io.to(connectedUser).emit('sessionEnded', {time: data.time});
	})
	;

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
	  	User.findOne({_id:connectedUser}, function(err, user){
	  	 	if(err){
	  	 		console.log(err);
	  	 	}
	  	 	if(user){
	  	 		console.log("Is user tutor? " + data.isTutor);
	  	 		console.log("Session rating: " + data.rating);
	  	 		if(data.isTutor){
	  	 			user.updateTutorRating(data.rating);
	  	 		}else{
	  	 			user.updateStudentRating(data.rating);
	  	 		}
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
		console.log(currentUser.firstName + " Disconnected");
		stopBroadcasting();
		io.to(connectedUser).emit('connectionLost');
	});



	 // broadcasting removal triggered by disconnect  
	function stopBroadcasting(){
		// remove tutor from pool of all 
		removeTutor(broadcastingTutors[ALL_COURSES]);


		async.each(tutorCourses, function(course, callback){

			// remove tutor from every course they are in 
			removeTutor( broadcastingTutors[course]);

			// update the db
			var courseObj = findCourse(course);
			if(courseObj){courseObj.save();}
			

			callback();

		}, function(){ // callback after done going through tutors list 
			tutorCourses = []; //empty the list of tutorCourses 
			console.log("Remove Available Complete");
			console.log(broadcastingTutors[ALL_COURSES].length + " in pool");
			socket.emit('removeAvailableDone', {responseType: "removeAvailableDone"});
		});

		function removeTutor(tutors){
			for(var i =0; i < tutors.length; i++){
				if(tutors[i].id == currentUser.id){
					tutors[i].setUnavailable();
					tutors.splice(i,1);  // removes tutor from list 
				}
			}

		}
	}

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

function alphaSortLocs(){
	meetingLocations.sort(function(a,b){ 
		var locA = a.name.toLowerCase();
		var locB = b.name.toLowerCase();
		return (locA < locB) ? -1 : (locA > locB) ? 1 : 0;
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

// capitalize the first letter in a string
function capCase(txt){
    return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
}

//lowercase a whole string
function lowCase(txt){
	return txt.toLowerCase();
}