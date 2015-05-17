var mongoose = require('mongoose'),
    validate = require('mongoose-validator'),
	bcrypt 	 = require('bcrypt'),
	SALT_WORK_FACTOR = 9;
  

var Schema = mongoose.Schema,
	ObjectId = Schema.Types.ObjectId;

// validatons on object attributes 
var isEmail = validate({
                validator: 'isEmail',
                message: "This is not a valid email address"
              });


var userSchema = new Schema({
	firstName: {type:String},
	lastName: {type:String},
	email: {type: String, unique: true, required: true, validate: isEmail},
	password: {type: String},
	studentRating: {type: Number},
	tutorRating: {type: Number},
	location:{
		lat: {type:Number}, 
		lon:{type:Number}
	},
	profilePic:{type:String},
	tutor: {type:Boolean},
	approved: {type:Boolean, default: false},
	studentCourses: [{type: ObjectId, ref: 'Course'}],
	tutorCourses: [{type: ObjectId, ref: 'Course'}],
	messages: {type: ObjectId, ref: 'Message'},
	tutorSession:{			// the information the tutor will set per broadcasted session
		available: {type: Boolean, default: false},
		price: {type: Number, default: 15.00},
		travelDistance: {type: Number},
		period: {type: Number, default: 45}	// availibility period in minutes 
	}
});


userSchema.pre('save', function(next){
    var user = this;
 
    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();

    // generate a salt
    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt){
        if (err) return next(err);

        // hash the password along with our new salt
        bcrypt.hash(user.password, salt, function(err, hash){
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});


userSchema.statics.create = function(first, last, email, password, next){
	var user = new User({firstName:first, lastName:last, email:email, password:password});
	user.save(function(err, user){
		console.log("Saving new user: " + first+ " " + last + " (" + email + ")");
		if(err){
			console.log(err);
			next(err);
		}else if(user){
			next("", user);
		}
	});
}

userSchema.statics.login = function(email, password, next){
	var User = this;

	 User.findOne({email:email}, function(err, user){
	 	var loginErr = {status: 400, message: "The email or password you entered is incorrect"};
	 	if(err){
	 		return next(err);
	 	}else if(user){
	 		 //authorize 
	  		user.comparePassword(password, function(err, isMatch){
		        if(!isMatch || err){ 
		  		  if(err){ return next(err);}
		  		  return next(loginErr);
		        }else{
		          return next("", user); // return the user
		        }
	      	});
	 	}else{
	 		next(loginErr); // no user found 
	 	}
	 });
}


userSchema.statics.lookUp = function(name, next){
	this.findOne({name: name}, function(err, user){
		if(err){
			console.log(err);
		}else if(user){
			next(user);
		}
	});
}


userSchema.statics.removeUsers = function(next){
	this.find({}, function(err, users){
		for(var i =0; i< users.length; i++){
			var user = users[i];
			user.remove();
		}
		next();
	 });
}


// compares user submitted pass to saved salted one
userSchema.methods.comparePassword = function(sentPassword, callback){
    bcrypt.compare(sentPassword, this.password, function(err, isMatch){
        if (err) return cb(err);
        callback(null, isMatch);
    });
};

// returns a hash for client for current user Data 
userSchema.methods.clientAccountData = function(){
	var accountData = {};

	accountData.id = this.id;          
	accountData.firstName = this.firstName;
	accountData.lastName = this.lastName;
	accountData.email = this.email;
	accountData.profilePic = this.profilePic;
	accountData.rating = this.studentRating; 

	return accountData;

}


// returns a hash for client with relevant tutor information 
userSchema.methods.clientTutorData = function(distance, next){
	var tutorData = {};

	tutorData.id = this.id;          
	tutorData.firstName = this.firstName;
	tutorData.lastName = this.lastName;
	tutorData.session = this.tutorSession;
	tutorData.rating = this.rating;
	tutorData.location = this.location;
	tutorData.profilePic = this.profilePic;
	tutorData.distance = distance.toFixed(2); // distance from client 

	next(tutorData);
}


// adds session info and returns the tutor 
userSchema.methods.updateTutorSession = function(time, distance, price, lat, lon, next){
	this.tutorSession.available = time;
	this.tutorSession.distance = distance;
	this.tutorSession.price = price;
	this.location.lat = lat;
	this.location.lon = lon;
	this.save();

	next(this);
}


userSchema.methods.updateStudentRating = function(rating, next){
	this.studentRating = rating;
	this.save(function(err, user){
		if(err){console.log(err);}
	});
}


// averages newly sent rating with old rating to get updated rating 
userSchema.methods.updateTutorRating = function(rating, next){
	this.tutorRating =  (this.tutoRating + rating)/2 ; 
	this.save(function(err, user){
		console.log("Updating tutor rating..");
		if(err){console.log(err);}
	});
	next(this);
}

userSchema.methods.updateLocation = function(lat, lon, next){
	this.location.lat = lat;
	this.location.lon = lon; 
	this.save();
}

userSchema.methods.updateStudentCourses = function(courses, next){
	
}

userSchema.methods.updateTutorCourses = function(courses, next){

}

userSchema.methods.setApproved = function(){
	
}


User = mongoose.model('User', userSchema);
module.exports = User;
