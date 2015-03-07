var mongoose = require('mongoose'),
	validate = require('mongoose-validator');

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
	password: {type: String },
	studentRating: {type: Number},
	tutorRating: {type: Number},
	location:{
		xPos: {type:Number}, 
		yPos:{type:Number}
	},
	profilePic:{type:String},
	tutor: {type:Boolean},
	approved: {type:Boolean, default: false},
	studentCourses: [{type: ObjectId, ref: 'Course'}],
	tutorCourses: [{type: ObjectId, ref: 'Course'}],
	sessionToken: [{type: String}]
});


userSchema.pre('save', function(next){
    var user = this;
 
    // only hash the password if it has been modified (or is new)
    if (!user.isModified('password')) return next();

    // generate a salt
    bcrypt.genSalt(SALT_WORK_FACTOR, function(err, salt){
        if (err) return next(err);

        // hash the password along with our new salt
        bcrypt.hash(user.password, salt, function(err, hash) {
            if (err) return next(err);

            // override the cleartext password with the hashed one
            user.password = hash;
            next();
        });
    });
});



userSchema.statics.create = function(first, last, email, password, next){
	var user = new User({firstName:first,lastName:last,email:email,password:password});
	user.save(function(err, user){
		if(err){
			next(err);
		}else if(user){
			next("", user);
		}
	});
}

userSchema.statics.login = function(name, email, next){
	var User = this;
	if(typeof(next) == "function"){
		console.log('next function recognized');
	}

	
	 User.findOne({email:email}, function(err, user){
	 	if(err){
	 		next(err);
	 	}else if(!user){
	 		// create the user
	 		User.create(name, email, function(user){
	 			next("", user);
	 		}); 
	 	}else{
	 		next("", user);
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

userSchema.methods.updateStudentRating = function(rating, next){
	this.studentRating = rating;
	this.save();
}

userSchema.methods.updateTutorRating = function(rating, next){
	this.tutorRating = rating; 
	this.save();
}

userSchema.methods.updateLocation = function(xPos, yPos, next){
	this.location.xPos = xPos;
	this.location.yPost = yPos; 
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
